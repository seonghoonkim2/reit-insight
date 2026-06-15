#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
db.py — 공시렌즈 SQLite 데이터 레이어

ARCHITECTURE.md 의 핵심 테이블을 SQLite 로 구현합니다(표준 라이브러리 sqlite3, 추가 설치 없음).
- companies / filings / filing_sections : 메타 + 본문
- financial_facts                        : 구조화 재무데이터(OpenDART 재무 API)
- ingestion_jobs                         : 대량/재개형 수집 작업 큐
- chunks_fts (FTS5, 가능하면 trigram)     : 한국어 부분일치 전문검색 인덱스

PostgreSQL 로 옮길 때도 같은 컬럼 구조를 쓰면 마이그레이션이 쉽습니다.

점검:  python3 db.py --selftest
"""

import os
import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS companies (
  corp_code     TEXT PRIMARY KEY,
  stock_code    TEXT,
  corp_name     TEXT NOT NULL,
  corp_eng_name TEXT,
  market        TEXT,
  modify_date   TEXT,
  updated_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_companies_stock ON companies(stock_code);
CREATE INDEX IF NOT EXISTS idx_companies_name  ON companies(corp_name);

CREATE TABLE IF NOT EXISTS filings (
  rcept_no          TEXT PRIMARY KEY,
  corp_code         TEXT NOT NULL,
  stock_code        TEXT,
  corp_name         TEXT NOT NULL,
  report_nm         TEXT NOT NULL,
  report_type       TEXT,
  business_year     INTEGER,
  rcept_dt          TEXT,
  is_amended        INTEGER DEFAULT 0,
  amendment_type    TEXT,
  is_latest_version INTEGER DEFAULT 0,
  filing_group_key  TEXT,
  dart_viewer_url   TEXT,
  char_count        INTEGER,
  parse_status      TEXT DEFAULT 'parsed',
  updated_at        TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_filings_corp   ON filings(corp_code);
CREATE INDEX IF NOT EXISTS idx_filings_stock  ON filings(stock_code);
CREATE INDEX IF NOT EXISTS idx_filings_year   ON filings(business_year);
CREATE INDEX IF NOT EXISTS idx_filings_group  ON filings(filing_group_key);
CREATE INDEX IF NOT EXISTS idx_filings_latest ON filings(is_latest_version);

CREATE TABLE IF NOT EXISTS filing_sections (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  rcept_no      TEXT NOT NULL,
  section_order INTEGER,
  section_path  TEXT,
  section_title TEXT,
  clean_text    TEXT,
  FOREIGN KEY (rcept_no) REFERENCES filings(rcept_no) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sections_rcept ON filing_sections(rcept_no);
CREATE INDEX IF NOT EXISTS idx_sections_title ON filing_sections(section_title);

CREATE TABLE IF NOT EXISTS financial_facts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  corp_code     TEXT,
  stock_code    TEXT,
  business_year INTEGER,
  fs_div        TEXT,     -- CFS(연결)/OFS(별도)
  sj_div        TEXT,     -- BS/IS/CIS/CF 등
  account_nm    TEXT,
  amount        TEXT,     -- 원문 그대로(콤마 포함) 보관
  source_rcept_no TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ff_corp_year ON financial_facts(corp_code, business_year);
CREATE INDEX IF NOT EXISTS idx_ff_account   ON financial_facts(account_nm);

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type    TEXT NOT NULL,
  ref         TEXT,                 -- 예: stock_code 또는 rcept_no
  status      TEXT NOT NULL DEFAULT 'queued',  -- queued/running/done/error
  payload     TEXT,
  error       TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON ingestion_jobs(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_unique ON ingestion_jobs(job_type, ref);
"""


# ── 연결/스키마 ──────────────────────────────────────────────────────────────
def connect(path):
    if path != ":memory:":
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    con = sqlite3.connect(path)
    con.execute("PRAGMA foreign_keys = ON")
    con.row_factory = sqlite3.Row
    return con


def init_schema(con):
    con.executescript(SCHEMA)
    ensure_fts(con)
    con.commit()


# ── 전문검색 FTS5 (가능하면 trigram = 한국어 부분일치) ───────────────────────
def detect_fts(con):
    """이 SQLite 빌드가 지원하는 FTS 토크나이저를 알아낸다: 'trigram' / 'unicode61' / None."""
    for tok in ("trigram", "unicode61"):
        try:
            con.execute("CREATE VIRTUAL TABLE temp.__fts_probe USING fts5(x, tokenize='%s')" % tok)
            con.execute("DROP TABLE temp.__fts_probe")
            return tok
        except sqlite3.OperationalError:
            continue
    return None


def ensure_fts(con):
    """chunks_fts 가상테이블을 만든다(가능할 때만). 사용한 토크나이저를 돌려준다."""
    tok = detect_fts(con)
    if not tok:
        return None
    con.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5("
        "rcept_no UNINDEXED, corp_code UNINDEXED, year UNINDEXED, "
        "section_title, text, tokenize='%s')" % tok
    )
    return tok


def fts_enabled(con):
    row = con.execute("SELECT 1 FROM sqlite_master WHERE name='chunks_fts'").fetchone()
    return row is not None


def index_report_fts(con, report):
    if not fts_enabled(con):
        return
    con.execute("DELETE FROM chunks_fts WHERE rcept_no = ?", (report["rcept_no"],))
    for s in report.get("sections", []):
        con.execute(
            "INSERT INTO chunks_fts (rcept_no, corp_code, year, section_title, text) VALUES (?,?,?,?,?)",
            (report["rcept_no"], report.get("corp_code"), str(report.get("year", "")),
             s.get("title") or "", s.get("text") or ""),
        )


# ── 업서트 ──────────────────────────────────────────────────────────────────
def upsert_company(con, c):
    con.execute(
        """INSERT INTO companies (corp_code, stock_code, corp_name, corp_eng_name, market, modify_date)
           VALUES (:corp_code, :stock_code, :corp_name, :corp_eng_name, :market, :modify_date)
           ON CONFLICT(corp_code) DO UPDATE SET
             stock_code=excluded.stock_code, corp_name=excluded.corp_name,
             corp_eng_name=excluded.corp_eng_name, market=excluded.market,
             modify_date=excluded.modify_date, updated_at=datetime('now')""",
        {"corp_code": c.get("corp_code"), "stock_code": c.get("stock_code"),
         "corp_name": c.get("corp_name"), "corp_eng_name": c.get("corp_eng_name"),
         "market": c.get("market"), "modify_date": c.get("modify_date")},
    )


def upsert_filing(con, f):
    con.execute(
        """INSERT INTO filings
             (rcept_no, corp_code, stock_code, corp_name, report_nm, report_type,
              business_year, rcept_dt, is_amended, amendment_type, is_latest_version,
              filing_group_key, dart_viewer_url, char_count, parse_status)
           VALUES
             (:rcept_no, :corp_code, :stock_code, :corp_name, :report_nm, :report_type,
              :business_year, :rcept_dt, :is_amended, :amendment_type, :is_latest_version,
              :filing_group_key, :dart_viewer_url, :char_count, :parse_status)
           ON CONFLICT(rcept_no) DO UPDATE SET
             corp_name=excluded.corp_name, report_nm=excluded.report_nm,
             is_amended=excluded.is_amended, amendment_type=excluded.amendment_type,
             is_latest_version=excluded.is_latest_version, char_count=excluded.char_count,
             updated_at=datetime('now')""",
        {"rcept_no": f.get("rcept_no"), "corp_code": f.get("corp_code"),
         "stock_code": f.get("stock_code"), "corp_name": f.get("corp_name"),
         "report_nm": f.get("report_nm"), "report_type": f.get("report_type", "사업보고서"),
         "business_year": int(f["year"]) if str(f.get("year", "")).isdigit() else None,
         "rcept_dt": f.get("rcept_dt"), "is_amended": 1 if f.get("is_amended") else 0,
         "amendment_type": f.get("amendment_type"),
         "is_latest_version": 1 if f.get("is_latest_version") else 0,
         "filing_group_key": f.get("filing_group_key"), "dart_viewer_url": f.get("dart_url"),
         "char_count": f.get("char_count"), "parse_status": f.get("parse_status", "parsed")},
    )


def replace_sections(con, rcept_no, sections):
    con.execute("DELETE FROM filing_sections WHERE rcept_no = ?", (rcept_no,))
    for i, s in enumerate(sections):
        con.execute(
            "INSERT INTO filing_sections (rcept_no, section_order, section_path, section_title, clean_text) VALUES (?,?,?,?,?)",
            (rcept_no, i, s.get("section_path") or s.get("title"), s.get("title"), s.get("text")),
        )


def filing_exists(con, rcept_no):
    return con.execute("SELECT 1 FROM filings WHERE rcept_no = ?", (rcept_no,)).fetchone() is not None


def get_group_versions(con, group_key):
    """같은 정정 그룹(filing_group_key)의 모든 버전을 접수일 순으로 돌려준다(정정 이력)."""
    rows = con.execute(
        "SELECT rcept_no, report_nm, rcept_dt, is_amended, amendment_type, is_latest_version "
        "FROM filings WHERE filing_group_key = ? ORDER BY rcept_dt", (group_key,)
    ).fetchall()
    return [dict(r) for r in rows]


def get_sections(con, rcept_no):
    rows = con.execute(
        "SELECT section_order, section_path, section_title, clean_text FROM filing_sections "
        "WHERE rcept_no = ? ORDER BY section_order", (rcept_no,)
    ).fetchall()
    return [dict(r) for r in rows]


def get_filing(con, rcept_no):
    row = con.execute("SELECT * FROM filings WHERE rcept_no = ?", (rcept_no,)).fetchone()
    return dict(row) if row else None


def sections_for_diff(con, rcept_no):
    """diff.compare 가 기대하는 {title,text} 형식으로 섹션을 돌려준다."""
    return [{"title": s["section_title"], "text": s["clean_text"]} for s in get_sections(con, rcept_no)]


def save_report(con, report):
    upsert_company(con, {"corp_code": report.get("corp_code"), "stock_code": report.get("stock_code"),
                         "corp_name": report.get("corp_name"), "market": report.get("market")})
    upsert_filing(con, report)
    replace_sections(con, report["rcept_no"], report.get("sections", []))
    index_report_fts(con, report)
    con.commit()


# ── 재무 구조화 ──────────────────────────────────────────────────────────────
def replace_financial_facts(con, rcept_no, facts):
    con.execute("DELETE FROM financial_facts WHERE source_rcept_no = ?", (rcept_no,))
    for f in facts:
        con.execute(
            """INSERT INTO financial_facts
               (corp_code, stock_code, business_year, fs_div, sj_div, account_nm, amount, source_rcept_no)
               VALUES (?,?,?,?,?,?,?,?)""",
            (f.get("corp_code"), f.get("stock_code"), f.get("business_year"), f.get("fs_div"),
             f.get("sj_div"), f.get("account_nm"), f.get("amount"), rcept_no),
        )
    con.commit()


# ── 작업 큐 (대량/재개형 수집) ───────────────────────────────────────────────
def enqueue_job(con, job_type, ref, payload=None):
    """이미 같은 (job_type, ref) 작업이 있으면 무시(중복 방지)."""
    con.execute(
        "INSERT OR IGNORE INTO ingestion_jobs (job_type, ref, payload) VALUES (?,?,?)",
        (job_type, ref, payload),
    )
    con.commit()


def claim_job(con, job_type):
    """queued 작업 하나를 running 으로 바꿔 가져온다(없으면 None)."""
    row = con.execute(
        "SELECT * FROM ingestion_jobs WHERE job_type=? AND status='queued' ORDER BY id LIMIT 1",
        (job_type,),
    ).fetchone()
    if not row:
        return None
    con.execute("UPDATE ingestion_jobs SET status='running', updated_at=datetime('now') WHERE id=?", (row["id"],))
    con.commit()
    return row


def finish_job(con, job_id, status="done", error=None):
    con.execute(
        "UPDATE ingestion_jobs SET status=?, error=?, retry_count=retry_count+(CASE WHEN ?='error' THEN 1 ELSE 0 END), updated_at=datetime('now') WHERE id=?",
        (status, error, status, job_id),
    )
    con.commit()


def job_counts(con):
    rows = con.execute("SELECT status, COUNT(*) n FROM ingestion_jobs GROUP BY status").fetchall()
    return {r["status"]: r["n"] for r in rows}


# ── 자체 점검 ────────────────────────────────────────────────────────────────
def run_selftest():
    print("🔧 db.py 자체 점검 (in-memory SQLite)")
    con = connect(":memory:")
    tok = ensure_fts(con)  # detect before init for message
    init_schema(con)
    print("  ℹ FTS 토크나이저:", tok or "없음(LIKE 폴백)")

    sample = {
        "corp_code": "00126380", "stock_code": "005930", "corp_name": "샘플전자", "market": "KOSPI",
        "rcept_no": "20260318000123", "report_nm": "사업보고서 (2025.12)", "report_type": "사업보고서",
        "year": "2025", "rcept_dt": "20260318", "is_amended": False, "is_latest_version": True,
        "filing_group_key": "00126380_사업보고서_2025",
        "dart_url": "https://dart.fss.or.kr", "char_count": 120,
        "sections": [
            {"title": "I. 회사의 개요", "section_path": "I. 회사의 개요", "text": "당사는 반도체 기업입니다."},
            {"title": "III. 재무에 관한 사항", "section_path": "III. 재무 > 우발부채", "text": "우발부채 300억원과 약정사항."},
        ],
    }
    save_report(con, sample)
    save_report(con, sample)  # 중복 저장 → 갱신만

    ok = True
    n = (con.execute("SELECT COUNT(*) FROM companies").fetchone()[0],
         con.execute("SELECT COUNT(*) FROM filings").fetchone()[0],
         con.execute("SELECT COUNT(*) FROM filing_sections WHERE rcept_no=?", (sample["rcept_no"],)).fetchone()[0])
    if n != (1, 1, 2):
        print("  ❌ 행 수:", n); ok = False
    else:
        print("  ✅ 업서트 정상(중복 없음):", n)

    # FTS 한국어 부분일치 검색 ('우발부채'가 본문에 있는 섹션이 잡혀야 함)
    if fts_enabled(con) and tok == "trigram":
        rows = con.execute(
            "SELECT section_title, text FROM chunks_fts WHERE chunks_fts MATCH ?", ('"우발부채"',)
        ).fetchall()
        if rows and "우발부채" in (rows[0]["text"] or ""):
            print("  ✅ FTS 한국어 부분일치 검색 정상:", rows[0]["section_title"])
        else:
            print("  ❌ FTS 검색 결과 없음"); ok = False
    else:
        print("  ⚠ trigram FTS 미지원 → search.py 가 LIKE 폴백 사용")

    # 작업 큐
    enqueue_job(con, "report", "005930")
    enqueue_job(con, "report", "005930")  # 중복 무시
    j = claim_job(con, "report"); finish_job(con, j["id"], "done")
    counts = job_counts(con)
    if counts.get("done") == 1 and con.execute("SELECT COUNT(*) FROM ingestion_jobs").fetchone()[0] == 1:
        print("  ✅ 작업 큐(중복방지/claim/finish) 정상:", counts)
    else:
        print("  ❌ 작업 큐 이상:", counts); ok = False

    # 재무 구조화
    replace_financial_facts(con, sample["rcept_no"], [
        {"corp_code": "00126380", "business_year": 2025, "fs_div": "CFS", "sj_div": "IS", "account_nm": "매출액", "amount": "300,000"},
    ])
    if con.execute("SELECT COUNT(*) FROM financial_facts").fetchone()[0] == 1:
        print("  ✅ financial_facts 저장 정상")
    else:
        print("  ❌ financial_facts 이상"); ok = False

    print("\n🎉 db.py 점검 통과!" if ok else "\n점검 실패.")
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    import sys
    if "--selftest" in sys.argv:
        run_selftest()
    else:
        print("이 파일은 다른 스크립트가 import 해서 사용합니다. 점검: python3 db.py --selftest")
