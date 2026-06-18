#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
collect_reits.py — 네이버 금융 기준 상장리츠 실데이터 수집기 (API 키 불필요)

네이버 모바일 금융 공개 API(m.stock.naver.com)에서 주가·시가총액·배당수익률을 가져오고,
잘 변하지 않는 정보(섹터·운용사·상장일·포트폴리오·홈페이지)는 아래 REIT_META 로 보강해
하나의 리츠 레코드로 만든 뒤 web/reits.js / data/reits.json / SQLite 에 저장합니다.

- 출처: 네이버 금융 (https://m.stock.naver.com)  — 인증키 불필요
- AI 요약은 이후 summarize_reits.py 로 채웁니다.

사용:
  python3 collect_reits.py            # 실제 수집(인터넷 필요)
  python3 collect_reits.py --selftest # 네트워크 없이 파서만 점검
"""
import os
import sys
import json
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
OUT_JS = os.path.join(HERE, "web", "reits.js")
OUT_JSON = os.path.join(DATA_DIR, "reits.json")
DB_PATH = os.path.join(DATA_DIR, "gongsilens.db")
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"

try:
    import db
except Exception:
    db = None

# 큐레이션 정적 메타(네이버에 없는 리츠 고유 정보). 종목명·코드는 실제.
REIT_META = {
    "330590": {"name": "롯데리츠", "sector": "리테일", "dividend_freq": "반기", "amc": "롯데에이엠씨",
               "listing_date": "2019-10-30", "homepage": "https://www.lottereit.co.kr",
               "portfolio": ["롯데백화점 강남점", "롯데마트 다수 점포", "롯데아울렛", "롯데물류센터"]},
    "395400": {"name": "SK리츠", "sector": "복합/인프라", "dividend_freq": "분기", "amc": "SK리츠운용",
               "listing_date": "2021-09-14", "homepage": "https://www.skreits.com",
               "portfolio": ["SK서린빌딩", "전국 SK 주유소", "데이터센터"]},
    "365550": {"name": "ESR켄달스퀘어리츠", "sector": "물류", "dividend_freq": "반기", "amc": "켄달스퀘어자산운용",
               "listing_date": "2020-12-23", "homepage": "https://www.esrkendallsquarereit.com",
               "portfolio": ["부천·고양·안성·이천 물류센터"]},
    "293940": {"name": "신한알파리츠", "sector": "오피스", "dividend_freq": "반기", "amc": "신한리츠운용",
               "listing_date": "2018-08-27", "homepage": "https://www.shalphareit.com",
               "portfolio": ["판교 크래프톤타워", "용산 더프라임타워", "트윈시티 남산"]},
    "348950": {"name": "제이알글로벌리츠", "sector": "해외오피스", "dividend_freq": "반기", "amc": "제이알투자운용",
               "listing_date": "2020-08-07", "homepage": "https://www.jrglobalreit.com",
               "portfolio": ["벨기에 브뤼셀 파이낸스타워"]},
    "357250": {"name": "코람코라이프인프라리츠", "sector": "인프라", "dividend_freq": "반기", "amc": "코람코자산신탁",
               "listing_date": "2018-06-27", "homepage": "https://www.koramcolifeinfra.co.kr",
               "portfolio": ["전국 주유소", "물류·인프라 자산"]},
    "357430": {"name": "미래에셋맵스리츠", "sector": "리테일", "dividend_freq": "반기", "amc": "미래에셋자산운용",
               "listing_date": "2020-08-05", "homepage": "https://www.maps-reit.com",
               "portfolio": ["광교 센트럴푸르지오시티 상업시설", "분당스퀘어"]},
    "404990": {"name": "신한서부티엔디리츠", "sector": "복합(호텔/리테일)", "dividend_freq": "반기", "amc": "신한리츠운용",
               "listing_date": "2021-12-10", "homepage": "https://www.shsbtndreit.com",
               "portfolio": ["그랜드머큐어 앰배서더 호텔 용산", "스퀘어원(인천)"]},
}


def _get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://m.stock.naver.com/"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))


def fetch_naver(code):
    integration = _get_json(f"https://m.stock.naver.com/api/stock/{code}/integration")
    try:
        basic = _get_json(f"https://m.stock.naver.com/api/stock/{code}/basic")
    except Exception:
        basic = {}
    return integration, basic


def _from_total(infos, *needles):
    """totalInfos(예: [{code,key,value}, ...]) 에서 key/code 에 needle 이 포함된 항목의 value."""
    for it in infos or []:
        tag = (str(it.get("key", "")) + " " + str(it.get("code", ""))).lower()
        if any(n.lower() in tag for n in needles):
            return it.get("value")
    return None


def _str_field(v):
    """네이버 값이 문자열/숫자/딕셔너리 어느 형태로 와도 표시용 문자열로 강제."""
    if v is None:
        return ""
    if isinstance(v, dict):
        for k in ("name", "text", "value", "code"):
            if v.get(k):
                return str(v[k])
        return ""
    return str(v)


def parse_naver(code, integration, basic, meta):
    integration = integration or {}
    basic = basic or {}
    infos = integration.get("totalInfos") or integration.get("totalInfo") or []
    name = _str_field(integration.get("stockName") or basic.get("stockName")) or meta.get("name")
    price = _str_field(basic.get("closePrice") or integration.get("closePrice"))
    if not price:
        dti = integration.get("dealTrendInfos") or []
        if dti:
            price = _str_field(dti[0].get("closePrice"))
    market_cap = _str_field(_from_total(infos, "시가총액", "marketvalue", "marketsum"))
    dy = _str_field(_from_total(infos, "배당수익률", "dividendyield"))
    market = (_str_field(integration.get("stockExchangeType"))
              or _str_field(basic.get("stockExchangeType")) or meta.get("market") or "KOSPI")

    out = dict(meta)
    out.update({"ticker": code, "name": name or code, "market": market,
                "summary": "", "key_points": []})
    if price:
        out["price"] = price.replace("원", "") + "원"
    if market_cap:
        out["market_cap"] = market_cap
    if dy:
        out["dividend_yield"] = dy.replace("%", "").strip()
    return out


def save(reits):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(reits, f, ensure_ascii=False)
    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("// collect_reits.py 자동 생성 (네이버 금융 기준)\nwindow.__REITS__ = " +
                json.dumps(reits, ensure_ascii=False) + ";\n")
    if db is not None:
        try:
            con = db.connect(DB_PATH)
            db.init_schema(con)
            for r in reits:
                db.upsert_reit(con, r)
        except Exception as e:
            print(f"(SQLite 저장 경고: {e})")


def run():
    tickers = list(REIT_META.keys())
    reits = []
    for code in tickers:
        meta = REIT_META[code]
        print(f"· {meta['name']}({code}) 네이버에서 수집...")
        try:
            integration, basic = fetch_naver(code)
            r = parse_naver(code, integration, basic, meta)
        except Exception as e:
            print(f"  실패: {e} — 메타만 저장")
            r = dict(meta); r.update({"ticker": code, "summary": "", "key_points": []})
        reits.append(r)
        time.sleep(0.4)
    save(reits)
    print(f"\n💾 저장 완료 → web/reits.js ({len(reits)}개 리츠, 출처: 네이버 금융)")
    print("   다음: python3 summarize_reits.py (AI 요약, 키 필요) · python3 build_site.py (SEO)")


# ── 자체 점검(네트워크 없이 파서) ────────────────────────────────────────────
SAMPLE_INTEGRATION = {
    "stockName": "롯데리츠",
    "stockExchangeType": {"name": "KOSPI"},
    "totalInfos": [
        {"code": "marketValue", "key": "시가총액", "value": "1조 2,345억"},
        {"code": "dividendYield", "key": "배당수익률", "value": "6.70%"},
        {"code": "per", "key": "PER", "value": "15.2배"},
    ],
}
SAMPLE_BASIC = {"closePrice": "3,250", "stockName": "롯데리츠"}


def run_selftest():
    print("🔧 collect_reits.py 점검 (네이버 응답 파싱)")
    r = parse_naver("330590", SAMPLE_INTEGRATION, SAMPLE_BASIC, REIT_META["330590"])
    ok = True
    checks = [
        ("name", r.get("name") == "롯데리츠"),
        ("price", r.get("price") == "3,250원"),
        ("market_cap", r.get("market_cap") == "1조 2,345억"),
        ("dividend_yield", r.get("dividend_yield") == "6.70"),
        ("market", r.get("market") == "KOSPI"),
        ("정적메타(섹터)", r.get("sector") == "리테일"),
        ("정적메타(포트폴리오)", isinstance(r.get("portfolio"), list) and r["portfolio"]),
    ]
    for name, cond in checks:
        print(("  ✅ " if cond else "  ❌ ") + name + (": " + str(r.get(name.split("(")[0].strip())) if not cond else ""))
        ok = ok and cond
    # 빈 응답도 죽지 않아야
    r2 = parse_naver("000000", {}, {}, {"name": "X", "sector": "오피스"})
    if r2.get("ticker") != "000000" or r2.get("name") != "X":
        print("  ❌ 빈 응답 처리"); ok = False
    else:
        print("  ✅ 빈 응답도 안전")
    print("\n🎉 collect_reits.py 점검 통과!" if ok else "\n실패")
    if not ok:
        sys.exit(1)


def main():
    if "--selftest" in sys.argv:
        run_selftest()
    else:
        run()


if __name__ == "__main__":
    main()
