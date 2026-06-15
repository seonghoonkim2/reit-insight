#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
financials.py — OpenDART 재무 구조화 데이터 수집/파싱

OpenDART '단일회사 전체 재무제표'(fnlttSinglAcntAll) 응답을 financial_facts 행으로 변환합니다.
- fetch_financials(...) : 실제 API 호출 (인증키·네트워크 필요)
- parse_financials(...) : 응답 JSON → facts 리스트 (오프라인 점검 가능)

점검:  python3 financials.py --selftest
"""

import json
import urllib.parse
import urllib.request

API_URL = "https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json"


def parse_financials(corp_code, stock_code, year, data):
    """fnlttSinglAcntAll 응답(dict) → financial_facts 행 리스트."""
    if not isinstance(data, dict) or data.get("status") != "000":
        return []
    out = []
    for it in data.get("list", []):
        amount = (it.get("thstrm_amount") or "").strip()
        name = (it.get("account_nm") or "").strip()
        if not name:
            continue
        out.append({
            "corp_code": corp_code,
            "stock_code": stock_code,
            "business_year": int(year) if str(year).isdigit() else None,
            "fs_div": it.get("fs_div"),      # CFS(연결)/OFS(별도)
            "sj_div": it.get("sj_div"),      # BS/IS/CIS/CF/SCE
            "account_nm": name,
            "amount": amount,
        })
    return out


def fetch_financials(api_key, corp_code, stock_code, year, reprt_code="11011", fs_div="CFS"):
    """실제 OpenDART 호출. reprt_code 11011 = 사업보고서."""
    url = API_URL + "?" + urllib.parse.urlencode({
        "crtfc_key": api_key, "corp_code": corp_code, "bsns_year": str(year),
        "reprt_code": reprt_code, "fs_div": fs_div,
    })
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return parse_financials(corp_code, stock_code, year, data)


SELFTEST_RESPONSE = {
    "status": "000", "message": "정상",
    "list": [
        {"corp_code": "00126380", "bsns_year": "2025", "fs_div": "CFS", "fs_nm": "연결재무제표",
         "sj_div": "IS", "sj_nm": "손익계산서", "account_nm": "매출액", "thstrm_amount": "300,000,000"},
        {"corp_code": "00126380", "bsns_year": "2025", "fs_div": "CFS",
         "sj_div": "IS", "sj_nm": "손익계산서", "account_nm": "영업이익", "thstrm_amount": "40,000,000"},
        {"corp_code": "00126380", "bsns_year": "2025", "fs_div": "CFS",
         "sj_div": "BS", "sj_nm": "재무상태표", "account_nm": "자산총계", "thstrm_amount": "500,000,000"},
    ],
}


def run_selftest():
    print("🔧 financials.py 점검 (파싱)")
    facts = parse_financials("00126380", "005930", "2025", SELFTEST_RESPONSE)
    ok = True
    if len(facts) != 3:
        print("  ❌ 행 수:", len(facts)); ok = False
    else:
        print("  ✅ 3개 계정 파싱:", [f["account_nm"] for f in facts])
    f0 = facts[0]
    if not (f0["account_nm"] == "매출액" and f0["amount"] == "300,000,000" and f0["fs_div"] == "CFS" and f0["business_year"] == 2025):
        print("  ❌ 필드 매핑 오류:", f0); ok = False
    else:
        print("  ✅ 필드 매핑 정상:", f0["account_nm"], f0["amount"], f0["fs_div"])
    # status 비정상 → 빈 리스트
    if parse_financials("x", "y", "2025", {"status": "013"}) != []:
        print("  ❌ 오류응답 처리 실패"); ok = False
    else:
        print("  ✅ 오류응답(013)은 빈 리스트")
    print("\n🎉 financials.py 점검 통과!" if ok else "\n실패")
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    import sys
    if "--selftest" in sys.argv:
        run_selftest()
    else:
        print("collect/bulk 가 import 해서 사용합니다. 점검: python3 financials.py --selftest")
