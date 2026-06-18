#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
load.py — 보고서 데이터를 PostgreSQL + OpenSearch 에 적재

데이터 소스 우선순위:
  1) 환경변수 GONGSILENS_SOURCE 경로(.json)
  2) /data/reports.json   (docker-compose 가 ../data 를 /data 로 마운트)
  3) /app/demo-data.js    (이미지에 포함된 데모)

실행(컨테이너):  docker compose run --rm backend python load.py
"""
import os
import re
import json
import time

import psycopg
from psycopg.types.json import Json
from opensearchpy import OpenSearch, helpers

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://gongsi:gongsi@postgres:5432/gongsilens")
OPENSEARCH_URL = os.environ.get("OPENSEARCH_URL", "http://opensearch:9200")
OPENSEARCH_INDEX = os.environ.get("OPENSEARCH_INDEX", "chunks")
INDEX_DEF = os.path.join(os.path.dirname(os.path.abspath(__file__)), "opensearch", "index.json")


def load_reports():
    src = os.environ.get("GONGSILENS_SOURCE")
    for path in [src, "/data/reports.json"]:
        if path and os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f).get("reports", []), path
    demo = os.path.join(os.path.dirname(os.path.abspath(__file__)), "demo-data.js")
    if os.path.exists(demo):
        m = re.search(r"window\.__DART_DATA__\s*=\s*(\{.*\});", open(demo, encoding="utf-8").read(), re.S)
        if m:
            return json.loads(m.group(1)).get("reports", []), demo
    return [], None


def load_js_array(var):
    """이미지/마운트에서 reits-demo.js / bonds-demo.js 의 배열을 읽는다."""
    base = os.path.dirname(os.path.abspath(__file__))
    fname = {"window.__REITS__": "reits-demo.js", "window.__BONDS__": "bonds-demo.js"}[var]
    for path in [os.path.join("/data", fname), os.path.join(base, fname)]:
        if os.path.exists(path):
            txt = open(path, encoding="utf-8").read()
            m = re.search(re.escape(var) + r"\s*=\s*(\[.*\]);", txt, re.S)
            if m:
                return json.loads(m.group(1))
    return []


def load_reits_bonds(con):
    cur = con.cursor()
    reits = load_js_array("window.__REITS__")
    for r in reits:
        cur.execute(
            "INSERT INTO reits (ticker, name, sector, market, price, market_cap, dividend_yield, "
            "dividend_freq, nav_ratio, amc, listing_date, credit_rating, portfolio, summary, key_points, "
            "corp_code, homepage, pay_months, week52_high, week52_low, foreign_ratio) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
            "ON CONFLICT (ticker) DO UPDATE SET name=EXCLUDED.name, dividend_yield=EXCLUDED.dividend_yield, "
            "portfolio=EXCLUDED.portfolio, summary=EXCLUDED.summary, key_points=EXCLUDED.key_points, "
            "pay_months=EXCLUDED.pay_months, week52_high=EXCLUDED.week52_high, "
            "week52_low=EXCLUDED.week52_low, foreign_ratio=EXCLUDED.foreign_ratio",
            (r.get("ticker"), r.get("name"), r.get("sector"), r.get("market"), r.get("price"),
             r.get("market_cap"), r.get("dividend_yield"), r.get("dividend_freq"), r.get("nav_ratio"),
             r.get("amc"), r.get("listing_date"), r.get("credit_rating"), Json(r.get("portfolio") or []),
             r.get("summary"), Json(r.get("key_points") or []), r.get("corp_code"), r.get("homepage"),
             Json(r.get("pay_months") or []), r.get("week52_high"), r.get("week52_low"), r.get("foreign_ratio")))
    bonds = load_js_array("window.__BONDS__")
    for b in bonds:
        cur.execute(
            "INSERT INTO bonds (isin, bond_name, issuer, issuer_code, bond_type, coupon_rate, interest_type, "
            "coupon_freq, issue_date, maturity_date, issue_amount, outstanding, seniority, guaranteed, "
            "credit_rating, listed, summary, key_points, source_url) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
            "ON CONFLICT (isin) DO UPDATE SET bond_name=EXCLUDED.bond_name, summary=EXCLUDED.summary, "
            "key_points=EXCLUDED.key_points",
            (b.get("isin"), b.get("bond_name"), b.get("issuer"), b.get("issuer_code"), b.get("bond_type"),
             b.get("coupon_rate"), b.get("interest_type"), b.get("coupon_freq"), b.get("issue_date"),
             b.get("maturity_date"), b.get("issue_amount"), b.get("outstanding"), b.get("seniority"),
             b.get("guaranteed"), b.get("credit_rating"), b.get("listed"), b.get("summary"),
             Json(b.get("key_points") or []), b.get("source_url")))
    con.commit()
    cur.close()
    return len(reits), len(bonds)


def split_chunks(text):
    parts = [p.strip() for p in re.split(r"\n{2,}", text or "") if p.strip()]
    if not parts and (text or "").strip():
        parts = [text.strip()]
    out = []
    for p in parts:
        if len(p) <= 700:
            out.append(p)
        else:
            out += [p[i:i + 700] for i in range(0, len(p), 700)]
    return out


def wait_for(fn, what, tries=60):
    for _ in range(tries):
        try:
            fn(); return
        except Exception as e:
            print(f"  {what} 대기... ({e})"); time.sleep(2)
    raise RuntimeError(f"{what} 연결 실패")


def ensure_index(os_client):
    if not os_client.indices.exists(OPENSEARCH_INDEX):
        with open(INDEX_DEF, encoding="utf-8") as f:
            os_client.indices.create(OPENSEARCH_INDEX, body=json.load(f))
        print(f"  OpenSearch 인덱스 생성: {OPENSEARCH_INDEX}")


def main():
    reports, src = load_reports()
    if not reports:
        print("⚠️  데이터 없음(reports.json/demo-data.js)"); return
    print(f"소스: {src} · 보고서 {len(reports)}건")

    os_client = OpenSearch(hosts=[OPENSEARCH_URL])
    wait_for(lambda: os_client.cluster.health(), "OpenSearch")
    ensure_index(os_client)

    wait_for(lambda: psycopg.connect(DATABASE_URL).close(), "PostgreSQL")
    con = psycopg.connect(DATABASE_URL)
    cur = con.cursor()

    actions = []
    for r in reports:
        cur.execute(
            "INSERT INTO companies (corp_code, stock_code, corp_name, market) VALUES (%s,%s,%s,%s) "
            "ON CONFLICT (corp_code) DO UPDATE SET corp_name=EXCLUDED.corp_name, market=EXCLUDED.market",
            (r["corp_code"], r.get("stock_code"), r["corp_name"], r.get("market")))
        year = int(r["year"]) if str(r.get("year", "")).isdigit() else None
        cur.execute(
            "INSERT INTO filings (rcept_no, corp_code, stock_code, corp_name, report_nm, report_type, "
            "business_year, rcept_dt, is_amended, amendment_type, is_latest_version, filing_group_key, "
            "dart_viewer_url, char_count) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
            "ON CONFLICT (rcept_no) DO UPDATE SET report_nm=EXCLUDED.report_nm",
            (r["rcept_no"], r["corp_code"], r.get("stock_code"), r["corp_name"], r.get("report_nm"),
             r.get("report_type", "사업보고서"), year, r.get("rcept_dt"), bool(r.get("is_amended")),
             r.get("amendment_type"), r.get("is_latest_version", True), r.get("filing_group_key"),
             r.get("dart_url"), r.get("char_count")))
        cur.execute("DELETE FROM filing_sections WHERE rcept_no=%s", (r["rcept_no"],))
        cur.execute("DELETE FROM filing_chunks WHERE rcept_no=%s", (r["rcept_no"],))
        for i, s in enumerate(r.get("sections", [])):
            cur.execute(
                "INSERT INTO filing_sections (rcept_no, section_order, section_path, section_title, clean_text) "
                "VALUES (%s,%s,%s,%s,%s)",
                (r["rcept_no"], i, s.get("section_path") or s.get("title"), s.get("title"), s.get("text")))
            for j, chunk in enumerate(split_chunks(s.get("text", ""))):
                has_num = bool(re.search(r"\d", chunk))
                cur.execute(
                    "INSERT INTO filing_chunks (rcept_no, corp_code, corp_name, business_year, section_title, "
                    "section_path, chunk_order, text, has_number) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    (r["rcept_no"], r["corp_code"], r["corp_name"], year, s.get("title"),
                     s.get("section_path"), j, chunk, has_num))
                actions.append({
                    "_index": OPENSEARCH_INDEX,
                    "_source": {
                        "rcept_no": r["rcept_no"], "corp_code": r["corp_code"], "stock_code": r.get("stock_code"),
                        "corp_name": r["corp_name"], "business_year": year, "section_title": s.get("title"),
                        "section_path": s.get("section_path"), "report_nm": r.get("report_nm"),
                        "rcept_dt": r.get("rcept_dt"), "is_latest_version": r.get("is_latest_version", True),
                        "has_number": has_num, "text": chunk,
                    },
                })
    con.commit()
    cur.close()
    n_reits, n_bonds = load_reits_bonds(con)  # 리츠/채권 적재
    con.close()

    if actions:
        helpers.bulk(os_client, actions)
        os_client.indices.refresh(OPENSEARCH_INDEX)
    print(f"✅ 적재 완료: 리츠 {n_reits} · 채권 {n_bonds} · 공시 문단 {len(actions)}개(OpenSearch)")


if __name__ == "__main__":
    main()
