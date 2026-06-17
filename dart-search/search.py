#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
search.py — 공시렌즈 검색 엔진 (SQLite FTS5)

SQLite 의 FTS5(가능하면 trigram = 한국어 부분일치)로 문단 단위 전문검색을 합니다.
- 모든 검색어가 3글자 이상이고 trigram 이 지원되면 FTS 빠른 경로(BM25 랭킹) 사용
- 그 외(짧은 영문 키워드 'PF' 등 포함)는 LIKE 폴백(항상 정확)

함수:  search(con, query, limit=30, year=None, corp_code=None) -> [dict, ...]
CLI :  python3 search.py 우발부채 --year 2025
"""

import os
import re
import sys

import db

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "gongsilens.db")


def _terms(q):
    return [t for t in (q or "").strip().split() if t]


def _snippet(text, terms, width=220):
    low = (text or "").lower()
    pos = -1
    for t in terms:
        p = low.find(t.lower())
        if p >= 0:
            pos = p
            break
    if pos < 0:
        return (text or "")[:width]
    start = max(0, pos - 70)
    s = ("…" if start > 0 else "") + text[start:start + width]
    return s + ("…" if len(text) > start + width else "")


def search(con, query, limit=30, year=None, corp_code=None, sort="relevance"):
    terms = _terms(query)
    tok = db.detect_fts(con)
    use_fts = bool(terms) and db.fts_enabled(con) and tok == "trigram" and all(len(t) >= 3 for t in terms)

    where, params = [], []
    if year:
        where.append("f.business_year = ?")
        params.append(int(year))
    if corp_code:
        where.append("f.corp_code = ?")
        params.append(corp_code)

    # 정렬: relevance(기본) / recent(접수일↓) / company(회사명)
    fts_order = {"recent": "f.rcept_dt DESC", "company": "f.corp_name"}.get(sort, "rank")
    like_order = {"recent": "f.rcept_dt DESC", "company": "f.corp_name"}.get(sort, "f.rcept_dt DESC")

    rows = []
    if use_fts:
        match = " ".join('"%s"' % t.replace('"', '""') for t in terms)
        sql = (
            "SELECT cf.rcept_no, f.corp_code, f.corp_name, f.business_year AS year, "
            "f.report_nm, f.rcept_dt, cf.section_title, cf.text, "
            "snippet(chunks_fts, 4, '<mark>', '</mark>', '…', 12) AS snip, bm25(chunks_fts) AS rank "
            "FROM chunks_fts cf JOIN filings f ON f.rcept_no = cf.rcept_no "
            "WHERE chunks_fts MATCH ? "
            + ("AND " + " AND ".join(where) + " " if where else "")
            + "ORDER BY " + fts_order + " LIMIT ?"
        )
        rows = con.execute(sql, [match] + params + [limit]).fetchall()
        out = []
        for r in rows:
            out.append({
                "rcept_no": r["rcept_no"], "corp_code": r["corp_code"], "corp_name": r["corp_name"],
                "year": r["year"], "report_nm": r["report_nm"], "rcept_dt": r["rcept_dt"],
                "section_title": r["section_title"], "snippet": r["snip"], "engine": "fts",
            })
        return out

    # ── LIKE 폴백 ──
    cond = list(where)
    for t in terms:
        cond.append("(s.clean_text LIKE ? OR s.section_title LIKE ? OR f.corp_name LIKE ?)")
        like = "%" + t + "%"
        params += [like, like, like]
    sql = (
        "SELECT s.rcept_no, f.corp_code, f.corp_name, f.business_year AS year, f.report_nm, f.rcept_dt, "
        "s.section_title, s.clean_text "
        "FROM filing_sections s JOIN filings f ON f.rcept_no = s.rcept_no "
        + ("WHERE " + " AND ".join(cond) + " " if cond else "")
        + "ORDER BY " + like_order + " LIMIT ?"
    )
    rows = con.execute(sql, params + [limit]).fetchall()
    out = []
    for r in rows:
        snip = _snippet(r["clean_text"], terms)
        for t in terms:  # 간단 하이라이트
            snip = re.sub(re.escape(t), lambda m: "<mark>" + m.group(0) + "</mark>", snip, flags=re.IGNORECASE)
        out.append({
            "rcept_no": r["rcept_no"], "corp_code": r["corp_code"], "corp_name": r["corp_name"],
            "year": r["year"], "report_nm": r["report_nm"], "rcept_dt": r["rcept_dt"],
            "section_title": r["section_title"], "snippet": snip, "engine": "like",
        })
    return out


def _cli():
    argv = sys.argv[1:]
    year, terms, i = None, [], 0
    while i < len(argv):
        if argv[i] == "--year" and i + 1 < len(argv):
            year = argv[i + 1]; i += 2; continue
        if argv[i].startswith("--"):
            i += 1; continue
        terms.append(argv[i]); i += 1
    q = " ".join(terms)
    if not q:
        print("사용법: python3 search.py <검색어> [--year 2025]")
        sys.exit(1)
    if not os.path.exists(DB_PATH):
        print("⚠️  DB 가 없습니다. 먼저 'python3 seed.py' 또는 'python3 collect.py' 를 실행하세요.")
        sys.exit(1)
    con = db.connect(DB_PATH)
    res = search(con, q, year=year)
    print(f"🔎 '{q}'{(' · '+year) if year else ''} — {len(res)}건 (engine={res[0]['engine'] if res else '-'})\n")
    for r in res:
        snip = re.sub(r"</?mark>", "", r["snippet"])
        print(f"· {r['corp_name']} {r['year']} | {r['section_title']}")
        print(f"  {snip}")
        print(f"  rcept_no={r['rcept_no']}\n")


if __name__ == "__main__":
    _cli()
