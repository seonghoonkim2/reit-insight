#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
api.py — 공시렌즈 읽기 전용 JSON API (표준 라이브러리만 사용, 서버 설치 불필요)

SQLite(data/gongsilens.db)를 그대로 읽어 JSON 으로 돌려주는 작은 API 서버입니다.
'API 상품'(ARCHITECTURE.md 13.4)의 로컬 MVP 이자, 프런트와 백엔드를 분리하는 첫걸음입니다.

엔드포인트(GET):
  /healthz
  /api/v1/search?q=우발부채&year=2025&corp_code=&limit=30
  /api/v1/companies
  /api/v1/company/<corp_code>
  /api/v1/filings/<rcept_no>

실행:
  python3 seed.py        # (한 번) 데모 DB 생성
  python3 api.py         # http://127.0.0.1:8765
환경변수: GONGSILENS_DB(기본 data/gongsilens.db), GONGSILENS_PORT(기본 8765)
"""

import os
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

import db
import search
import diff as diffmod

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("GONGSILENS_DB", os.path.join(HERE, "data", "gongsilens.db"))
PORT = int(os.environ.get("GONGSILENS_PORT", "8765"))


def open_con():
    con = db.connect(DB_PATH)
    return con


def company_payload(con, corp_code):
    co = con.execute("SELECT * FROM companies WHERE corp_code=?", (corp_code,)).fetchone()
    if not co:
        return None
    fils = con.execute(
        "SELECT rcept_no, report_nm, business_year, rcept_dt, is_amended, amendment_type, is_latest_version, dart_viewer_url "
        "FROM filings WHERE corp_code=? ORDER BY business_year DESC, rcept_dt DESC", (corp_code,)
    ).fetchall()
    return {"company": dict(co), "filings": [dict(r) for r in fils]}


def filing_payload(con, rcept_no):
    f = con.execute("SELECT * FROM filings WHERE rcept_no=?", (rcept_no,)).fetchone()
    if not f:
        return None
    secs = con.execute(
        "SELECT section_order, section_path, section_title, clean_text FROM filing_sections WHERE rcept_no=? ORDER BY section_order",
        (rcept_no,)
    ).fetchall()
    facts = con.execute(
        "SELECT fs_div, sj_div, account_nm, amount FROM financial_facts WHERE source_rcept_no=?", (rcept_no,)
    ).fetchall()
    return {"filing": dict(f), "sections": [dict(s) for s in secs], "financial_facts": [dict(x) for x in facts]}


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass  # 조용히

    def do_GET(self):
        u = urlparse(self.path)
        parts = [unquote(p) for p in u.path.strip("/").split("/") if p]
        qs = parse_qs(u.query)

        try:
            if u.path == "/healthz":
                con = open_con()
                n = con.execute("SELECT COUNT(*) FROM filings").fetchone()[0]
                return self._send(200, {"ok": True, "db": DB_PATH, "filings": n, "fts": db.fts_enabled(con)})

            if parts[:3] == ["api", "v1", "search"]:
                con = open_con()
                q = (qs.get("q") or [""])[0]
                year = (qs.get("year") or [None])[0]
                corp = (qs.get("corp_code") or [None])[0]
                limit = int((qs.get("limit") or ["30"])[0])
                res = search.search(con, q, limit=min(limit, 100), year=year, corp_code=corp)
                return self._send(200, {"query": q, "count": len(res), "results": res})

            if parts[:3] == ["api", "v1", "companies"] and len(parts) == 3:
                con = open_con()
                rows = con.execute("SELECT corp_code, corp_name, stock_code, market FROM companies ORDER BY corp_name").fetchall()
                return self._send(200, {"count": len(rows), "companies": [dict(r) for r in rows]})

            if parts[:3] == ["api", "v1", "company"] and len(parts) == 4:
                con = open_con()
                p = company_payload(con, parts[3])
                return self._send(200, p) if p else self._send(404, {"error": "company_not_found"})

            if parts[:3] == ["api", "v1", "filings"] and len(parts) == 4:
                con = open_con()
                p = filing_payload(con, parts[3])
                return self._send(200, p) if p else self._send(404, {"error": "filing_not_found"})

            # 정정 그룹의 버전 목록
            if parts[:3] == ["api", "v1", "group"] and len(parts) == 4:
                con = open_con()
                vs = db.get_group_versions(con, parts[3])
                return self._send(200, {"filing_group_key": parts[3], "count": len(vs), "versions": vs}) if vs \
                    else self._send(404, {"error": "group_not_found"})

            # 정정 전후 / 전년 대비 비교: a(새), b(비교대상) 접수번호
            if parts[:3] == ["api", "v1", "diff"] and len(parts) == 3:
                con = open_con()
                a, b = (qs.get("a") or [""])[0], (qs.get("b") or [""])[0]
                fa, fb = db.get_filing(con, a), db.get_filing(con, b)
                if not fa or not fb:
                    return self._send(404, {"error": "filing_not_found"})
                d = diffmod.compare(
                    {"sections": db.sections_for_diff(con, a)},
                    {"sections": db.sections_for_diff(con, b)},
                )
                return self._send(200, {"a": a, "b": b, "a_meta": fa, "b_meta": fb, "diff": d})

            return self._send(404, {"error": "not_found", "path": u.path})
        except FileNotFoundError:
            return self._send(503, {"error": "db_missing", "hint": "python3 seed.py 또는 collect.py 먼저 실행"})
        except Exception as e:  # 마지막 안전망
            return self._send(500, {"error": "internal", "detail": str(e)})


def main():
    if not os.path.exists(DB_PATH):
        print(f"⚠️  DB 없음: {DB_PATH}\n   먼저 'python3 seed.py'(데모) 또는 'python3 collect.py'(실데이터)를 실행하세요.")
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"🚀 공시렌즈 API → http://127.0.0.1:{PORT}  (Ctrl+C 종료)")
    print(f"   예) http://127.0.0.1:{PORT}/api/v1/search?q=우발부채")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        srv.shutdown()


if __name__ == "__main__":
    main()
