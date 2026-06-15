"""공시렌즈 백엔드 API (FastAPI) — PostgreSQL + OpenSearch.

엔드포인트는 stdlib api.py 와 동일한 모양을 유지합니다(웹/Next.js 가 그대로 사용).
실행: uvicorn app.main:app --host 0.0.0.0 --port 8000
"""
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import db, search
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
               limit: int = Query(30, le=100)):
    res = search.search(q, limit=limit, year=year, corp_code=corp_code)
    return {"query": q, "count": len(res), "results": res}


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
