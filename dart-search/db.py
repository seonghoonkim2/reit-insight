#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
db.py — 공시렌즈 SQLite 데이터 레이어 (1차)

ARCHITECTURE.md 의 핵심 테이블 중 1차분(companies / filings / filing_sections)을
SQLite 로 구현합니다. 표준 라이브러리 sqlite3 만 사용하므로 추가 설치가 필요 없습니다.

나중에 PostgreSQL 로 옮길 때도 같은 컬럼 구조를 쓰면 마이그레이션이 쉽습니다.

사용:
  from db import connect, init_schema, upsert_company, upsert_filing, replace_sections
  con = connect("data/gongsilens.db"); init_schema(con)

점검(파일 없이 메모리 DB로 스키마/업서트 검증):
  python3 db.py --selftest
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
  report_type       TEXT,                 -- 예: 사업보고서
  business_year     INTEGER,
  rcept_dt          TEXT,                 -- YYYYMMDD
  is_amended        INTEGER DEFAULT 0,    -- 정정 여부(0/1)
  amendment_type    TEXT,                 -- 기재정정/첨부정정 등
  is_latest_version INTEGER DEFAULT 0,    -- 같은 그룹 내 대표본(0/1)
  filing_group_key  TEXT,                 -- corp_code + report_type + business_year
  dart_viewer_url   TEXT,
  char_count        INTEGER,
  parse_status      TEXT DEFAULT 'parsed',
  updated_at        TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_filings_corp    ON filings(corp_code);
CREATE INDEX IF NOT EXISTS idx_filings_stock   ON filings(stock_code);
CREATE INDEX IF NOT EXISTS idx_filings_year    ON filings(business_year);
CREATE INDEX IF NOT EXISTS idx_filings_group   ON filings(filing_group_key);
CREATE INDEX IF NOT EXISTS idx_filings_latest  ON filings(is_latest_version);

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
"""


def connect(path):
    """SQLite 연결을 연다. 상위 폴더가 없으면 만든다."""
    if path != ":memory:":
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    con = sqlite3.connect(path)
    con.execute("PRAGMA foreign_keys = ON")
    con.row_factory = sqlite3.Row
    return con


def init_schema(con):
    con.executescript(SCHEMA)
    con.commit()


def upsert_company(con, c):
    con.execute(
        """INSERT INTO companies (corp_code, stock_code, corp_name, corp_eng_name, market, modify_date)
           VALUES (:corp_code, :stock_code, :corp_name, :corp_eng_name, :market, :modify_date)
           ON CONFLICT(corp_code) DO UPDATE SET
             stock_code=excluded.stock_code, corp_name=excluded.corp_name,
             corp_eng_name=excluded.corp_eng_name, market=excluded.market,
             modify_date=excluded.modify_date, updated_at=datetime('now')""",
        {
            "corp_code": c.get("corp_code"),
            "stock_code": c.get("stock_code"),
            "corp_name": c.get("corp_name"),
            "corp_eng_name": c.get("corp_eng_name"),
            "market": c.get("market"),
            "modify_date": c.get("modify_date"),
        },
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
        {
            "rcept_no": f.get("rcept_no"),
            "corp_code": f.get("corp_code"),
            "stock_code": f.get("stock_code"),
            "corp_name": f.get("corp_name"),
            "report_nm": f.get("report_nm"),
            "report_type": f.get("report_type", "사업보고서"),
            "business_year": int(f["year"]) if str(f.get("year", "")).isdigit() else None,
            "rcept_dt": f.get("rcept_dt"),
            "is_amended": 1 if f.get("is_amended") else 0,
            "amendment_type": f.get("amendment_type"),
            "is_latest_version": 1 if f.get("is_latest_version") else 0,
            "filing_group_key": f.get("filing_group_key"),
            "dart_viewer_url": f.get("dart_url"),
            "char_count": f.get("char_count"),
            "parse_status": f.get("parse_status", "parsed"),
        },
    )


def replace_sections(con, rcept_no, sections):
    """해당 보고서의 섹션을 모두 지우고 다시 넣는다(재수집 시 중복 방지)."""
    con.execute("DELETE FROM filing_sections WHERE rcept_no = ?", (rcept_no,))
    for i, s in enumerate(sections):
        con.execute(
            """INSERT INTO filing_sections (rcept_no, section_order, section_path, section_title, clean_text)
               VALUES (?, ?, ?, ?, ?)""",
            (rcept_no, i, s.get("section_path") or s.get("title"), s.get("title"), s.get("text")),
        )


def filing_exists(con, rcept_no):
    """이미 저장된 보고서인지(증분 수집 시 건너뛰기용)."""
    row = con.execute("SELECT 1 FROM filings WHERE rcept_no = ?", (rcept_no,)).fetchone()
    return row is not None


def save_report(con, report):
    """report dict(컬렉터가 만든 형식) 한 건을 companies/filings/filing_sections 에 저장."""
    upsert_company(con, {
        "corp_code": report.get("corp_code"),
        "stock_code": report.get("stock_code"),
        "corp_name": report.get("corp_name"),
        "market": report.get("market"),
    })
    upsert_filing(con, report)
    replace_sections(con, report["rcept_no"], report.get("sections", []))
    con.commit()


# ── 자체 점검 (파일/네트워크 없이 메모리 DB로 검증) ──────────────────────────
def run_selftest():
    print("🔧 db.py 자체 점검 (in-memory SQLite)")
    con = connect(":memory:")
    init_schema(con)
    sample = {
        "corp_code": "00126380", "stock_code": "005930", "corp_name": "샘플전자",
        "rcept_no": "20260318000123", "report_nm": "사업보고서 (2025.12)",
        "report_type": "사업보고서", "year": "2025", "rcept_dt": "20260318",
        "is_amended": False, "amendment_type": None, "is_latest_version": True,
        "filing_group_key": "00126380_사업보고서_2025",
        "dart_url": "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260318000123",
        "char_count": 120,
        "sections": [
            {"title": "I. 회사의 개요", "section_path": "I. 회사의 개요", "text": "당사는 반도체 기업입니다."},
            {"title": "III. 재무에 관한 사항", "section_path": "III. 재무에 관한 사항 > 우발부채", "text": "우발부채 300억원."},
        ],
    }
    save_report(con, sample)
    save_report(con, sample)  # 두 번 저장해도 중복 없이 갱신되는지 확인

    ok = True
    n_comp = con.execute("SELECT COUNT(*) FROM companies").fetchone()[0]
    n_fil = con.execute("SELECT COUNT(*) FROM filings").fetchone()[0]
    n_sec = con.execute("SELECT COUNT(*) FROM filing_sections WHERE rcept_no=?",
                        (sample["rcept_no"],)).fetchone()[0]
    if (n_comp, n_fil, n_sec) != (1, 1, 2):
        print(f"  ❌ 행 수 불일치: companies={n_comp}, filings={n_fil}, sections={n_sec}")
        ok = False
    else:
        print(f"  ✅ 업서트 정상(중복 없음): companies={n_comp}, filings={n_fil}, sections={n_sec}")

    row = con.execute("SELECT business_year, is_latest_version, filing_group_key FROM filings").fetchone()
    if row["business_year"] != 2025 or row["is_latest_version"] != 1:
        print(f"  ❌ 필드 변환 오류: {dict(row)}")
        ok = False
    else:
        print(f"  ✅ 필드 변환 정상: year={row['business_year']}, latest={row['is_latest_version']}, group={row['filing_group_key']}")

    print("\n🎉 db.py 점검 통과!" if ok else "\n점검 실패.")
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    import sys
    if "--selftest" in sys.argv:
        run_selftest()
    else:
        print("이 파일은 collect.py 가 import 해서 사용합니다. 점검: python3 db.py --selftest")
