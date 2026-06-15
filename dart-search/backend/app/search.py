"""검색: OpenSearch(nori) 주엔진 + PostgreSQL 폴백.

OpenSearch 가 떠 있으면 한국어 형태소(nori) 기반 멀티매치 + 하이라이트로 검색하고,
실패하면 Postgres(trgm/tsvector)로 폴백합니다. 두 경로 모두 같은 형태의 결과를 돌려줍니다.
"""
import re

from . import db
from .settings import OPENSEARCH_URL, OPENSEARCH_INDEX, SEARCH_BACKEND

_os_client = None


def _client():
    global _os_client
    if _os_client is None:
        from opensearchpy import OpenSearch
        _os_client = OpenSearch(hosts=[OPENSEARCH_URL])
    return _os_client


def _terms(q):
    return [t for t in (q or "").strip().split() if t]


def search(query, limit=30, year=None, corp_code=None):
    if SEARCH_BACKEND == "opensearch":
        try:
            return _search_opensearch(query, limit, year, corp_code)
        except Exception:
            pass  # OpenSearch 미가동/오류 → Postgres 폴백
    return _search_postgres(query, limit, year, corp_code)


def _search_opensearch(query, limit, year, corp_code):
    must = [{
        "multi_match": {
            "query": query,
            "fields": ["text^1.0", "section_title^1.5", "corp_name^2.0"],
            "type": "best_fields",
        }
    }] if query.strip() else [{"match_all": {}}]
    filt = []
    if year:
        filt.append({"term": {"business_year": int(year)}})
    if corp_code:
        filt.append({"term": {"corp_code": corp_code}})
    body = {
        "size": limit,
        "query": {"bool": {"must": must, "filter": filt}},
        "highlight": {"fields": {"text": {"pre_tags": ["<mark>"], "post_tags": ["</mark>"], "fragment_size": 220, "number_of_fragments": 1}}},
    }
    res = _client().search(index=OPENSEARCH_INDEX, body=body)
    out = []
    for h in res["hits"]["hits"]:
        s = h["_source"]
        snip = (h.get("highlight", {}).get("text") or [s.get("text", "")[:220]])[0]
        out.append({
            "rcept_no": s.get("rcept_no"), "corp_code": s.get("corp_code"), "corp_name": s.get("corp_name"),
            "year": s.get("business_year"), "report_nm": s.get("report_nm"), "rcept_dt": s.get("rcept_dt"),
            "section_title": s.get("section_title"), "snippet": snip, "engine": "opensearch",
        })
    return out


def _snippet(text, terms, width=220):
    low = (text or "").lower()
    pos = next((low.find(t.lower()) for t in terms if low.find(t.lower()) >= 0), -1)
    if pos < 0:
        return (text or "")[:width]
    start = max(0, pos - 70)
    s = ("…" if start > 0 else "") + text[start:start + width]
    for t in terms:
        s = re.sub(re.escape(t), lambda m: "<mark>" + m.group(0) + "</mark>", s, flags=re.IGNORECASE)
    return s


def _search_postgres(query, limit, year, corp_code):
    terms = _terms(query)
    where, params = [], []
    if year:
        where.append("c.business_year = %s"); params.append(int(year))
    if corp_code:
        where.append("c.corp_code = %s"); params.append(corp_code)
    for t in terms:
        where.append("(c.text ILIKE %s OR c.section_title ILIKE %s OR c.corp_name ILIKE %s)")
        like = "%" + t + "%"; params += [like, like, like]
    sql = (
        "SELECT c.rcept_no, c.corp_code, c.corp_name, c.business_year AS year, c.section_title, c.text, "
        "f.report_nm, f.rcept_dt "
        "FROM filing_chunks c JOIN filings f ON f.rcept_no = c.rcept_no "
        + ("WHERE " + " AND ".join(where) + " " if where else "")
        + "LIMIT %s"
    )
    rows = db.query(sql, params + [limit])
    return [{
        "rcept_no": r["rcept_no"], "corp_code": r["corp_code"], "corp_name": r["corp_name"],
        "year": r["year"], "report_nm": r["report_nm"], "rcept_dt": r["rcept_dt"],
        "section_title": r["section_title"], "snippet": _snippet(r["text"], terms), "engine": "postgres",
    } for r in rows]
