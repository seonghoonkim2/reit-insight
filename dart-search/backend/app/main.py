"""공시렌즈 백엔드 API (FastAPI) — PostgreSQL + OpenSearch.

엔드포인트는 stdlib api.py 와 동일한 모양을 유지합니다(웹/Next.js 가 그대로 사용).
실행: uvicorn app.main:app --host 0.0.0.0 --port 8000
"""
import io
import csv
import re

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware

from . import db, search, diffutil
from .settings import CORS_ORIGINS

app = FastAPI(title="공시렌즈 API", version="0.2.0",
              description="DART 사업보고서 검색 API (비공식). 정보 제공 목적.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in CORS_ORIGINS.split(",")],
    allow_methods=["GET"], allow_headers=["*"],
)


@app.get("/healthz")
def healthz():
    try:
        n = db.query_one("SELECT COUNT(*) AS n FROM filings")["n"]
        return {"ok": True, "filings": n}
    except Exception as e:
        raise HTTPException(503, f"db_unavailable: {e}")


@app.get("/api/v1/search")
def api_search(q: str = "", year: int | None = None, corp_code: str | None = None,
               sort: str = "relevance", limit: int = Query(30, le=100)):
    res = search.search(q, limit=limit, year=year, corp_code=corp_code, sort=sort)
    return {"query": q, "count": len(res), "results": res}


@app.get("/api/v1/search.csv")
def api_search_csv(q: str = "", year: int | None = None, corp_code: str | None = None,
                   sort: str = "relevance"):
    res = search.search(q, limit=1000, year=year, corp_code=corp_code, sort=sort)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["회사명", "종목코드", "사업연도", "보고서", "접수일", "섹션", "발췌", "접수번호", "DART"])
    for r in res:
        snip = re.sub(r"</?mark>", "", r.get("snippet", ""))
        w.writerow([r.get("corp_name"), r.get("corp_code"), r.get("year"), r.get("report_nm"),
                    r.get("rcept_dt"), r.get("section_title"), snip, r.get("rcept_no"),
                    f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={r.get('rcept_no')}"])
    body = ("﻿" + buf.getvalue()).encode("utf-8")
    return Response(content=body, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="gongsilens_search.csv"'})


@app.get("/api/v1/reits")
def api_reits(q: str = "", sector: str | None = None):
    where, params = [], []
    if sector:
        where.append("sector = %s"); params.append(sector)
    for t in [x for x in q.split() if x]:
        where.append("(name ILIKE %s OR ticker ILIKE %s OR sector ILIKE %s OR amc ILIKE %s)")
        like = "%" + t + "%"; params += [like, like, like, like]
    sql = "SELECT * FROM reits " + ("WHERE " + " AND ".join(where) + " " if where else "") + "ORDER BY name"
    rows = db.query(sql, params)
    return {"count": len(rows), "reits": rows}


@app.get("/api/v1/reit/{ticker}")
def api_reit(ticker: str):
    r = db.query_one("SELECT * FROM reits WHERE ticker=%s", [ticker])
    if not r:
        raise HTTPException(404, "reit_not_found")
    r["bonds"] = db.query("SELECT * FROM bonds WHERE issuer_code=%s ORDER BY maturity_date", [ticker])
    return r


@app.get("/api/v1/bonds")
def api_bonds(q: str = ""):
    where, params = [], []
    for t in [x for x in q.split() if x]:
        where.append("(isin ILIKE %s OR bond_name ILIKE %s OR issuer ILIKE %s OR credit_rating ILIKE %s)")
        like = "%" + t + "%"; params += [like, like, like, like]
    sql = "SELECT * FROM bonds " + ("WHERE " + " AND ".join(where) + " " if where else "") + "ORDER BY maturity_date"
    rows = db.query(sql, params)
    return {"count": len(rows), "bonds": rows}


@app.get("/api/v1/bond/{isin}")
def api_bond(isin: str):
    b = db.query_one("SELECT * FROM bonds WHERE isin=%s", [isin])
    if not b:
        raise HTTPException(404, "bond_not_found")
    return b


@app.get("/api/v1/companies")
def api_companies():
    rows = db.query("SELECT corp_code, corp_name, stock_code, market FROM companies ORDER BY corp_name")
    return {"count": len(rows), "companies": rows}


@app.get("/api/v1/company/{corp_code}")
def api_company(corp_code: str):
    co = db.query_one("SELECT * FROM companies WHERE corp_code=%s", [corp_code])
    if not co:
        raise HTTPException(404, "company_not_found")
    fils = db.query(
        "SELECT rcept_no, report_nm, business_year, rcept_dt, is_amended, amendment_type, "
        "is_latest_version, dart_viewer_url FROM filings WHERE corp_code=%s "
        "ORDER BY business_year DESC, rcept_dt DESC", [corp_code])
    return {"company": co, "filings": fils}


@app.get("/api/v1/filings/{rcept_no}")
def api_filing(rcept_no: str):
    f = db.query_one("SELECT * FROM filings WHERE rcept_no=%s", [rcept_no])
    if not f:
        raise HTTPException(404, "filing_not_found")
    secs = db.query(
        "SELECT section_order, section_path, section_title, clean_text FROM filing_sections "
        "WHERE rcept_no=%s ORDER BY section_order", [rcept_no])
    facts = db.query(
        "SELECT fs_div, sj_div, account_nm, amount FROM financial_facts WHERE source_rcept_no=%s", [rcept_no])
    return {"filing": f, "sections": secs, "financial_facts": facts}


@app.get("/api/v1/group/{group_key}")
def api_group(group_key: str):
    vs = db.query(
        "SELECT rcept_no, report_nm, rcept_dt, is_amended, amendment_type, is_latest_version "
        "FROM filings WHERE filing_group_key=%s ORDER BY rcept_dt", [group_key])
    if not vs:
        raise HTTPException(404, "group_not_found")
    return {"filing_group_key": group_key, "count": len(vs), "versions": vs}


def _diff_sections(rcept_no: str):
    rows = db.query(
        "SELECT section_title AS title, clean_text AS text FROM filing_sections "
        "WHERE rcept_no=%s ORDER BY section_order", [rcept_no])
    return rows


@app.get("/api/v1/diff")
def api_diff(a: str, b: str):
    fa, fb = db.query_one("SELECT * FROM filings WHERE rcept_no=%s", [a]), \
             db.query_one("SELECT * FROM filings WHERE rcept_no=%s", [b])
    if not fa or not fb:
        raise HTTPException(404, "filing_not_found")
    d = diffutil.compare(_diff_sections(a), _diff_sections(b))
    return {"a": a, "b": b, "a_meta": fa, "b_meta": fb, "diff": d}
