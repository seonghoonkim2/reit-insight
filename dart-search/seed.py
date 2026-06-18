#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
seed.py — 키/네트워크 없이 로컬 풀스택을 체험하기 위한 시드 스크립트

web/demo-data.js (또는 data/reports.json) 의 보고서를 SQLite(data/gongsilens.db)에 넣고
FTS 인덱스까지 만들어 둡니다. 그러면 search.py / api.py 를 바로 돌려볼 수 있습니다.

사용:
  python3 seed.py            # 데모 데이터로 DB 생성
  python3 seed.py --reset    # 기존 DB 삭제 후 다시 생성
"""

import os
import re
import sys
import json

import db

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_JSON = os.path.join(HERE, "data", "reports.json")
DEMO_JS = os.path.join(HERE, "web", "demo-data.js")
REITS_JS = os.path.join(HERE, "web", "reits-demo.js")
BONDS_JS = os.path.join(HERE, "web", "bonds-demo.js")
DB_PATH = os.path.join(HERE, "data", "gongsilens.db")


def _load_js_array(path, var):
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        txt = f.read()
    m = re.search(re.escape(var) + r"\s*=\s*(\[.*\]);", txt, re.S)
    return json.loads(m.group(1)) if m else []


def load_reports():
    if os.path.exists(DATA_JSON):
        with open(DATA_JSON, "r", encoding="utf-8") as f:
            return json.load(f).get("reports", []), "data/reports.json"
    if os.path.exists(DEMO_JS):
        txt = open(DEMO_JS, "r", encoding="utf-8").read()
        m = re.search(r"window\.__DART_DATA__\s*=\s*(\{.*\});", txt, re.S)
        if m:
            return json.loads(m.group(1)).get("reports", []), "web/demo-data.js"
    return [], None


def main():
    if "--reset" in sys.argv and os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    reports, src = load_reports()
    if not reports:
        print("⚠️  데이터가 없습니다. collect.py 로 수집하거나 web/demo-data.js 를 두세요.")
        sys.exit(1)
    con = db.connect(DB_PATH)
    db.init_schema(con)
    for r in reports:
        db.save_report(con, r)
    for rt in _load_js_array(REITS_JS, "window.__REITS__"):
        db.upsert_reit(con, rt)
    for b in _load_js_array(BONDS_JS, "window.__BONDS__"):
        db.upsert_bond(con, b)
    n_f = con.execute("SELECT COUNT(*) FROM filings").fetchone()[0]
    print(f"✅ 시드 완료 ({src}) → {DB_PATH}")
    print(f"   리츠 {db.reits_count(con)} · 채권 {db.bonds_count(con)} · 보고서 {n_f} · FTS={'on' if db.fts_enabled(con) else 'off'}")
    print("   다음:  python3 api.py  (http://127.0.0.1:8765/api/v1/reits)")


if __name__ == "__main__":
    main()
