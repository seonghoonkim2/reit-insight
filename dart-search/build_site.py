#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_site.py — 공시렌즈 SEO 정적 사이트 생성기 (SSG)

검색엔진이 잘 읽도록 회사/보고서/키워드 페이지를 **서버 없는 정적 HTML**로 미리 발행합니다.
(SPA index.html 은 사용자용 검색 UI, 이 스크립트는 SEO/색인용 정적 페이지를 만듭니다.)

만드는 것:
  dist/
  ├─ index.html                       # 홈(회사·토픽 링크 모음)
  ├─ company/<corp_code>.html         # 회사 페이지(연도별 보고서, AI 요약)
  ├─ filing/<rcept_no>.html           # 보고서 페이지(섹션 원문, 요약, DART 링크, canonical)
  ├─ topic/<keyword>.html             # 키워드 페이지(등장 회사·빈도)
  ├─ sitemap.xml                      # 색인할 페이지 목록
  └─ robots.txt

데이터 소스 우선순위: data/reports.json → (없으면) web/demo-data.js
표준 라이브러리만 사용. 출력물 dist/ 는 .gitignore 로 제외됩니다.

사용:
  python3 build_site.py
  python3 build_site.py --base-url https://gongsilens.kr   # sitemap 절대경로용(선택)
"""

import os
import re
import sys
import json
import html
import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_JSON = os.path.join(HERE, "data", "reports.json")
DEMO_JS = os.path.join(HERE, "web", "demo-data.js")
DIST = os.path.join(HERE, "dist")

POPULAR = ["우발부채", "PF", "배당정책", "재고자산", "계속기업 불확실성",
           "소송", "특수관계자 거래", "영업권 손상", "책임준공", "미분양"]

DISCLAIMER = ("본 서비스는 금융감독원 전자공시시스템(DART)의 공식 서비스가 아닙니다. "
              "공시 원문 출처: DART · 정보 제공 목적이며 투자 권유가 아닙니다.")

CSS = """body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Malgun Gothic',sans-serif;
color:#111827;max-width:880px;margin:0 auto;padding:16px 16px 64px;line-height:1.65}
a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}
h1{font-size:22px;margin:10px 0 4px}h2{font-size:16px;margin:22px 0 8px;color:#0f172a}
.kv{color:#6b7280;font-size:13px}.crumb{color:#6b7280;font-size:13px;margin:8px 0}
.card{border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin:10px 0;box-shadow:0 1px 3px rgba(15,23,42,.06)}
.row{display:block;padding:8px 0;border-bottom:1px solid #e5e7eb}.row:last-child{border-bottom:0}
.badge{font-size:11px;border-radius:999px;padding:1px 7px;margin-left:6px}
.latest{background:#ecfdf5;color:#047857;border:1px solid #6ee7b7}
.amend{background:#fef2f2;color:#b91c1c;border:1px solid #fca5a5}
.chip{display:inline-block;font-size:13px;padding:5px 11px;border:1px solid #e5e7eb;border-radius:999px;background:#f8fafc;margin:3px}
.sec{border-top:1px solid #e5e7eb;padding:12px 0}.sec h3{margin:0 0 4px;font-size:15px}
.spath{font-size:11px;color:#6b7280}.body{white-space:pre-wrap;font-size:14px;color:#374151}
.vbox{background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:12px;margin:10px 0}
footer{color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;margin-top:32px;padding-top:14px}
table.km{border-collapse:collapse;font-size:13px}table.km th{text-align:left;color:#6b7280;padding:2px 10px 2px 0}
"""


def esc(s):
    return html.escape(str(s or ""))


def _load_js_array(filename, var):
    for path in [os.path.join(HERE, "data", filename.replace("-demo.js", ".json")),
                 os.path.join(HERE, "web", filename)]:
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                txt = f.read()
            m = re.search(re.escape(var) + r"\s*=\s*(\[.*\]);", txt, re.S)
            if m:
                return json.loads(m.group(1))
            try:
                return json.loads(txt)  # .json 파일이면
            except Exception:
                pass
    return []


def load_reits_bonds():
    return (_load_js_array("reits-demo.js", "window.__REITS__"),
            _load_js_array("bonds-demo.js", "window.__BONDS__"))


def _kv(pairs):
    rows = "".join(f"<tr><th style='text-align:left;color:#6b7280;padding:2px 12px 2px 0'>{esc(k)}</th><td>{esc(v)}</td></tr>"
                   for k, v in pairs if v)
    return f"<table class='km'>{rows}</table>"


def _points(items):
    return "<ul>" + "".join(f"<li>{esc(p)}</li>" for p in (items or [])) + "</ul>" if items else ""


def load_reports():
    if os.path.exists(DATA_JSON):
        with open(DATA_JSON, "r", encoding="utf-8") as f:
            return json.load(f).get("reports", []), False
    if os.path.exists(DEMO_JS):
        with open(DEMO_JS, "r", encoding="utf-8") as f:
            txt = f.read()
        m = re.search(r"window\.__DART_DATA__\s*=\s*(\{.*\});", txt, re.S)
        if m:
            return json.loads(m.group(1)).get("reports", []), True
    return [], False


def page(title, body, description="", canonical="", jsonld=None, og_type="website", robots="index"):
    robots_meta = "<meta name='robots' content='noindex,follow'>" if robots == "noindex" else ""
    og = (
        f"<meta property='og:title' content='{esc(title)}'>"
        f"<meta property='og:description' content='{esc(description)}'>"
        f"<meta property='og:type' content='{esc(og_type)}'>"
        "<meta property='og:site_name' content='공시렌즈'>"
        + (f"<meta property='og:url' content='{esc(canonical)}'>" if canonical else "")
        + "<meta name='twitter:card' content='summary'>"
    )
    ld = ""
    if jsonld:
        ld = "<script type='application/ld+json'>" + json.dumps(jsonld, ensure_ascii=False) + "</script>"
    head = (
        "<!DOCTYPE html><html lang='ko'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        f"<title>{esc(title)}</title>"
        f"<meta name='description' content='{esc(description)}'>"
        + (f"<link rel='canonical' href='{esc(canonical)}'>" if canonical else "")
        + robots_meta + og + ld
        + f"<style>{CSS}</style></head><body>"
    )
    foot = f"<footer>⚠️ {esc(DISCLAIMER)}</footer></body></html>"
    return head + body + foot


def _breadcrumb(items):
    """items: [(name, url), ...] → schema.org BreadcrumbList"""
    return {
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": n, **({"item": u} if u else {})}
            for i, (n, u) in enumerate(items)
        ],
    }


def km_html(km):
    if not km:
        return ""
    out = ""
    if km.get("business"):
        out += f"<div>🏢 {esc(km['business'])}</div>"
    fin = [("매출액", km.get("revenue")), ("영업이익", km.get("operating_profit")), ("당기순이익", km.get("net_profit"))]
    fin = [(a, b) for a, b in fin if b]
    if fin:
        out += "<table class='km'>" + "".join(f"<tr><th>{esc(a)}</th><td>{esc(b)}</td></tr>" for a, b in fin) + "</table>"
    if km.get("key_points"):
        out += "<ul>" + "".join(f"<li>{esc(p)}</li>" for p in km["key_points"]) + "</ul>"
    return out


def write(path, content):
    full = os.path.join(DIST, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(content)


def build(base_url=""):
    reports, is_demo = load_reports()
    if not reports:
        print("⚠️  데이터가 없습니다. collect.py 로 수집하거나 web/demo-data.js 를 둔 뒤 실행하세요.")
        sys.exit(1)

    # 인덱스
    by_code, by_rcept = {}, {}
    for r in reports:
        by_rcept[r["rcept_no"]] = r
        by_code.setdefault(r["corp_code"], {"name": r["corp_name"], "stock": r.get("stock_code"),
                                            "market": r.get("market"), "reports": []})
        by_code[r["corp_code"]]["reports"].append(r)
    for c in by_code.values():
        c["reports"].sort(key=lambda r: r.get("year", ""), reverse=True)

    urls = []  # sitemap 용 상대경로

    # ── 회사 페이지 ──
    for code, co in by_code.items():
        latest = co["reports"][0]
        body = "<div class='crumb'><a href='../index.html'>공시렌즈</a> › 회사</div>"
        body += f"<h1>{esc(co['name'])} 사업보고서</h1>"
        body += f"<div class='kv'>종목코드 {esc(co['stock'] or '-')}" + (f" · {esc(co['market'])}" if co.get("market") else "") + f" · 보고서 {len(co['reports'])}건</div>"
        if latest.get("summary"):
            body += f"<h2>최신 사업보고서({esc(latest['year'])}) 요약</h2><div class='vbox'>{esc(latest['summary'])}{km_html(latest.get('key_metrics'))}</div>"
        body += "<h2>연도별 사업보고서</h2><div class='card'>"
        for r in co["reports"]:
            body += f"<a class='row' href='../filing/{esc(r['rcept_no'])}.html'>{esc(r['year'])} 사업보고서{_badges(r)}<div class='kv'>접수일 {esc(r.get('rcept_dt'))}</div></a>"
        body += "</div>"
        title = f"{co['name']} 사업보고서 | 공시렌즈"
        desc = f"{co['name']}의 DART 사업보고서를 연도별로 검색·비교. 최신 {latest['year']} 사업보고서 요약 포함."
        canon = _abs(base_url, f"company/{code}.html")
        jsonld = [
            {"@context": "https://schema.org", "@type": "Organization", "name": co["name"],
             **({"tickerSymbol": co["stock"]} if co.get("stock") else {}), **({"url": canon} if canon else {})},
            _breadcrumb([("공시렌즈", _abs(base_url, "index.html")), (co["name"], canon)]),
        ]
        write(f"company/{code}.html", page(title, body, desc, canon, jsonld, "profile"))
        urls.append(f"company/{code}.html")

    # 정정 그룹별 최신본 매핑(구버전 페이지의 canonical/noindex 처리에 사용)
    group_latest = {}
    for r in reports:
        if r.get("is_latest_version") is not False:
            group_latest[r.get("filing_group_key")] = r["rcept_no"]

    # ── 보고서 페이지 ──
    for r in reports:
        body = f"<div class='crumb'><a href='../index.html'>공시렌즈</a> › <a href='../company/{esc(r['corp_code'])}.html'>{esc(r['corp_name'])}</a> › 보고서</div>"
        body += f"<h1>{esc(r['corp_name'])} {esc(r['year'])} 사업보고서{_badges(r)}</h1>"
        body += f"<div class='kv'>접수일 {esc(r.get('rcept_dt'))} · 접수번호 {esc(r['rcept_no'])} · <a href='{esc(r.get('dart_url') or '#')}' target='_blank' rel='noopener nofollow'>DART 원문 보기</a></div>"
        if r.get("summary"):
            body += f"<h2>AI 요약</h2><div class='vbox'>{esc(r['summary'])}{km_html(r.get('key_metrics'))}</div>"
        body += "<h2>본문</h2>"
        for s in r.get("sections", []):
            body += "<div class='sec'><h3>" + esc(s.get("title")) + "</h3>"
            if s.get("section_path") and s["section_path"] != s.get("title"):
                body += f"<div class='spath'>{esc(s['section_path'])}</div>"
            body += f"<div class='body'>{esc(s.get('text'))}</div></div>"
        title = f"{r['corp_name']} {r['year']} 사업보고서 | 공시렌즈"
        desc = f"{r['corp_name']} {r['year']} 사업보고서 전문 · 섹션별 원문과 요약, DART 원문 링크."
        # 구버전(정정 이전)은 noindex + 최신본으로 canonical
        is_latest = r.get("is_latest_version") is not False
        robots = "index" if is_latest else "noindex"
        lat = group_latest.get(r.get("filing_group_key"))
        canon = _abs(base_url, f"filing/{(r['rcept_no'] if is_latest or not lat else lat)}.html")
        rdt = r.get("rcept_dt", "")
        iso = (rdt[:4] + "-" + rdt[4:6] + "-" + rdt[6:8]) if len(rdt) == 8 else None
        jsonld = [
            {"@context": "https://schema.org", "@type": "Article",
             "headline": f"{r['corp_name']} {r['year']} 사업보고서", "inLanguage": "ko",
             **({"datePublished": iso} if iso else {}),
             "author": {"@type": "Organization", "name": r["corp_name"]},
             "publisher": {"@type": "Organization", "name": "공시렌즈"},
             **({"mainEntityOfPage": canon} if canon else {})},
            _breadcrumb([("공시렌즈", _abs(base_url, "index.html")),
                         (r["corp_name"], _abs(base_url, f"company/{r['corp_code']}.html")),
                         (f"{r['year']} 사업보고서", canon)]),
        ]
        write(f"filing/{r['rcept_no']}.html", page(title, body, desc, canon, jsonld, "article", robots))
        if r.get("is_latest_version") is not False:
            urls.append(f"filing/{r['rcept_no']}.html")

    # ── 토픽 페이지 ──
    topics = list(POPULAR)
    for kw in topics:
        low = kw.lower()
        co_count, fil = {}, set()
        for r in reports:
            if r.get("is_latest_version") is False:
                continue
            hit = sum(1 for s in r.get("sections", []) if low in (s.get("text", "") + " " + s.get("title", "")).lower())
            if hit:
                co_count[r["corp_code"]] = co_count.get(r["corp_code"], 0) + hit
                fil.add(r["rcept_no"])
        body = "<div class='crumb'><a href='../index.html'>공시렌즈</a> › 키워드</div>"
        body += f"<h1>'{esc(kw)}'가 언급된 사업보고서</h1>"
        if not fil:
            body += "<p>아직 언급이 없습니다.</p>"
        else:
            body += f"<div class='kv'>총 {len(fil)}개 보고서 · {len(co_count)}개 회사에서 발견</div>"
            body += "<h2>상위 언급 기업</h2><div class='card'>"
            for i, (code, n) in enumerate(sorted(co_count.items(), key=lambda x: -x[1])[:15], 1):
                body += f"<a class='row' href='../company/{esc(code)}.html'>{i}. {esc(by_code[code]['name'])}<div class='kv'>{n}회 언급</div></a>"
            body += "</div>"
        slug = _slug(kw)
        title = f"{kw} 사업보고서 | 공시렌즈"
        desc = f"'{kw}'가 언급된 DART 사업보고서를 모아 회사별 빈도와 함께 정리."
        write(f"topic/{slug}.html", page(title, body, desc, _abs(base_url, f"topic/{slug}.html")))
        urls.append(f"topic/{slug}.html")

    # ── 상장리츠(메인) / 리츠 발행 채권 ──
    reits, bonds = load_reits_bonds()
    bonds_by_issuer = {}
    for b in bonds:
        bonds_by_issuer.setdefault(b.get("issuer_code"), []).append(b)
    sectors = sorted({r.get("sector") for r in reits if r.get("sector")})

    def reit_row(r):
        return (f"<a class='row' href='../reit/{esc(r['ticker'])}.html'>{esc(r['name'])} "
                f"<span class='kv'>[{esc(r.get('sector'))}]</span><div class='kv'>{esc(r['ticker'])} · "
                f"배당수익률 {esc(r.get('dividend_yield'))}% · {esc(r.get('dividend_freq'))} 배당 · NAV {esc(r.get('nav_ratio'))}</div></a>")

    def bond_row(b):
        return (f"<a class='row' href='../bond/{esc(b['isin'])}.html'>{esc(b['bond_name'])} "
                f"{_badge(b.get('credit_rating'))}<div class='kv'>{esc(b.get('issuer'))} · 표면 {esc(b.get('coupon_rate'))} · 만기 {esc(b.get('maturity_date'))}</div></a>")

    for r in reits:
        body = "<div class='crumb'><a href='../index.html'>리츠인사이트</a> › <a href='../reits.html'>상장리츠</a></div>"
        body += f"<h1>{esc(r['name'])} <span class='kv'>[{esc(r.get('sector'))}]</span></h1>"
        body += f"<div class='kv'>종목코드 {esc(r['ticker'])}" + (f" · {esc(r.get('market'))}" if r.get("market") else "") + \
                (f" · <a href='{esc(r.get('homepage'))}' rel='noopener'>홈페이지</a>" if r.get("homepage") else "") + "</div>"
        body += "<h2>핵심 지표 (숫자는 예시)</h2><div class='vbox'>" + _kv([
            ("주가", r.get("price")), ("시가총액", r.get("market_cap")),
            ("배당수익률", (r.get("dividend_yield") + "%") if r.get("dividend_yield") else ""),
            ("배당주기", r.get("dividend_freq")), ("주가/NAV", r.get("nav_ratio")),
            ("신용등급", r.get("credit_rating")), ("상장일", r.get("listing_date")),
            ("자산관리회사(AMC)", r.get("amc")),
        ]) + "</div>"
        if r.get("summary"):
            body += f"<h2>AI 요약 (참고)</h2><div class='vbox'>{esc(r['summary'])}{_points(r.get('key_points'))}</div>"
        if r.get("portfolio"):
            body += "<h2>주요 보유자산</h2><div class='card'>" + "".join(f"<div class='row'>{esc(p)}</div>" for p in r["portfolio"]) + "</div>"
        mine = bonds_by_issuer.get(r["ticker"], [])
        if mine:
            body += "<h2>이 리츠가 발행한 채권</h2><div class='card'>" + "".join(bond_row(b) for b in mine) + "</div>"
        title = f"{r['name']} ({r['ticker']}) 배당·NAV·포트폴리오 | 리츠인사이트"
        desc = f"{r['name']}의 배당수익률·NAV·보유자산·신용등급과 AI 요약, 발행 채권 정보."
        canon = _abs(base_url, f"reit/{r['ticker']}.html")
        jsonld = [{"@context": "https://schema.org", "@type": "Organization", "name": r["name"],
                   "tickerSymbol": r["ticker"], **({"url": canon} if canon else {})},
                  _breadcrumb([("리츠인사이트", _abs(base_url, "index.html")), ("상장리츠", _abs(base_url, "reits.html")), (r["name"], canon)])]
        write(f"reit/{r['ticker']}.html", page(title, body, desc, canon, jsonld, "profile"))
        urls.append(f"reit/{r['ticker']}.html")

    for b in bonds:
        body = "<div class='crumb'><a href='../index.html'>리츠인사이트</a> › <a href='../bonds.html'>리츠 발행 채권</a></div>"
        body += f"<h1>{esc(b['bond_name'])} {_badge(b.get('credit_rating'))}</h1>"
        issuer = (f"<a href='../reit/{esc(b['issuer_code'])}.html'>{esc(b.get('issuer'))}</a>"
                  if b.get("issuer_code") else esc(b.get("issuer")))
        body += f"<div class='kv'>ISIN {esc(b['isin'])} · 발행 {issuer}</div>"
        body += "<h2>발행 정보 (숫자는 예시)</h2><div class='vbox'>" + _kv([
            ("채권 종류", b.get("bond_type")), ("표면금리", b.get("coupon_rate")), ("금리 유형", b.get("interest_type")),
            ("이자지급주기", b.get("coupon_freq")), ("발행일", b.get("issue_date")), ("만기일", b.get("maturity_date")),
            ("발행액", b.get("issue_amount")), ("잔존액", b.get("outstanding")),
            ("변제순위", b.get("seniority")), ("보증여부", b.get("guaranteed")),
            ("신용등급", b.get("credit_rating")), ("상장여부", b.get("listed")),
        ]) + "</div>"
        if b.get("summary"):
            body += f"<h2>AI 요약 (참고)</h2><div class='vbox'>{esc(b['summary'])}{_points(b.get('key_points'))}</div>"
        title = f"{b['bond_name']} ({b['isin']}) | 리츠인사이트"
        desc = f"{b.get('issuer')} 발행 채권 — 표면금리·만기·신용등급·조건과 AI 요약."
        canon = _abs(base_url, f"bond/{b['isin']}.html")
        jsonld = [{"@context": "https://schema.org", "@type": "FinancialProduct", "name": b["bond_name"],
                   "category": b.get("bond_type"), **({"url": canon} if canon else {})}]
        write(f"bond/{b['isin']}.html", page(title, body, desc, canon, jsonld, "product"))
        urls.append(f"bond/{b['isin']}.html")

    # 리츠/채권 인덱스
    rbody = "<div class='crumb'><a href='index.html'>리츠인사이트</a> › 상장리츠</div><h1>상장리츠 (REITs)</h1>"
    rbody += "<div>" + "".join(f"<span class='chip'>{esc(s)}</span>" for s in sectors) + "</div>"
    rbody += "<div class='card'>" + "".join(reit_row(r).replace("../reit/", "reit/") for r in sorted(reits, key=lambda x: x["name"])) + "</div>"
    write("reits.html", page("상장리츠(REITs) | 리츠인사이트", rbody, "한국 상장리츠를 섹터별로 검색·비교.", _abs(base_url, "reits.html")))
    urls.append("reits.html")

    bbody = "<div class='crumb'><a href='index.html'>리츠인사이트</a> › 리츠 발행 채권</div><h1>리츠 발행 채권</h1>"
    bbody += "<div class='card'>" + "".join(bond_row(b).replace("../bond/", "bond/") for b in bonds) + "</div>"
    write("bonds.html", page("리츠 발행 채권 | 리츠인사이트", bbody, "상장리츠가 발행한 채권을 ISIN별로 정리.", _abs(base_url, "bonds.html")))
    urls.append("bonds.html")

    # ── 홈 (리츠 중심) ──
    body = "<h1>리츠인사이트 — 상장리츠(REITs) 정보</h1>"
    body += "<p class='kv'>상장리츠를 핵심지표·배당·포트폴리오·AI 요약으로. 공시·발행 채권까지 연결. (숫자는 예시)</p>"
    body += "<h2>상장리츠 <a style='font-size:13px' href='reits.html'>전체 →</a></h2><div class='card'>"
    for r in sorted(reits, key=lambda x: x["name"]):
        body += reit_row(r).replace("../reit/", "reit/")
    body += "</div>"
    body += "<h2>리츠 발행 채권 <a style='font-size:13px' href='bonds.html'>전체 →</a></h2><div class='card'>"
    for b in bonds[:6]:
        body += bond_row(b).replace("../bond/", "bond/")
    body += "</div>"
    body += "<h2>공시(DART) 검색</h2><div>" + "".join(f"<a class='chip' href='topic/{_slug(k)}.html'>{esc(k)}</a>" for k in topics) + "</div>"
    write("index.html", page("리츠인사이트 | 상장리츠(REITs) 정보·배당·공시·발행채권", body,
                             "한국 상장리츠(REITs)를 핵심지표·배당·포트폴리오·AI 요약으로. 공시 전문검색과 발행 채권까지.",
                             _abs(base_url, "index.html")))
    urls.insert(0, "index.html")

    # ── sitemap.xml / robots.txt ──
    today = datetime.date.today().isoformat()
    locs = "".join(f"<url><loc>{esc(_abs(base_url, u) or u)}</loc><lastmod>{today}</lastmod></url>" for u in urls)
    write("sitemap.xml", f"<?xml version='1.0' encoding='UTF-8'?>\n<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>{locs}</urlset>\n")
    robots = "User-agent: *\nAllow: /\n"
    if base_url:
        robots += f"Sitemap: {base_url.rstrip('/')}/sitemap.xml\n"
    write("robots.txt", robots)

    print(f"✅ 생성 완료 → {DIST}")
    print(f"   페이지 {len(urls)}개 (회사 {len(by_code)}, 보고서 {len(reports)}, 토픽 {len(topics)}) + sitemap.xml + robots.txt"
          + ("  [데모 데이터 기준]" if is_demo else ""))


def _badges(r):
    b = ""
    if r.get("is_latest_version") is not False:
        b += "<span class='badge latest'>최신본</span>"
    if r.get("is_amended"):
        b += f"<span class='badge amend'>{esc(r.get('amendment_type') or '정정')}</span>"
    return b


def _badge(rating):
    if not rating:
        return ""
    cls = "latest" if (str(rating).startswith("A") or "국채" in str(rating)) else ("amend" if str(rating).startswith("B") and not str(rating).startswith("BBB") else "")
    return f"<span class='badge {cls}'>{esc(rating)}</span>"


def _slug(kw):
    return re.sub(r"\s+", "-", kw.strip())


def _abs(base_url, rel):
    return (base_url.rstrip("/") + "/" + rel) if base_url else ""


def main():
    base = ""
    if "--base-url" in sys.argv:
        i = sys.argv.index("--base-url")
        if i + 1 < len(sys.argv):
            base = sys.argv[i + 1]
    build(base)


if __name__ == "__main__":
    main()
