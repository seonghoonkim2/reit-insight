#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
collect.py — OpenDART 사업보고서 자동 수집 스크립트 (개념증명/POC)

이 스크립트가 하는 일 (순서대로):
  ① 기업 고유번호 목록 받기 (OpenDART corpCode)  → 종목코드 → 고유번호(corp_code) 변환표 만들기
  ② 각 기업의 '사업보고서' 접수번호(rcept_no) 찾기 (공시검색 list.json)
  ③ 사업보고서 원문파일(document.xml, ZIP) 다운로드
  ④ 본문 텍스트 추출 + 섹션(목차) 정리
  ⑤ 검색 화면이 읽을 데이터 파일(web/data.js)로 저장

추가 설치(pip) 없이 파이썬 표준 라이브러리만 사용합니다.

사용법:
  1) OpenDART 인증키 발급:  https://opendart.fss.or.kr  →  '인증키 신청/관리'
  2) config.example.json 을 config.json 으로 복사한 뒤, api_key 에 발급받은 키를 붙여넣기
  3) python3 collect.py            # 실제 수집 (인증키 필요)
     python3 collect.py --selftest # 인증키 없이 텍스트 추출 로직만 자체 점검
"""

import sys
import os
import io
import re
import json
import html
import time
import zipfile
import datetime
import urllib.parse
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET

# ── 경로 설정 ────────────────────────────────────────────────────────────────
HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "config.json")
DATA_DIR = os.path.join(HERE, "data")
WEB_DIR = os.path.join(HERE, "web")
CORP_CACHE_PATH = os.path.join(DATA_DIR, "corpcode_cache.json")

API_BASE = "https://opendart.fss.or.kr/api"

# OpenDART 가 돌려주는 상태코드 → 사람이 읽을 수 있는 한국어 메시지
STATUS_MESSAGES = {
    "000": "정상",
    "010": "등록되지 않은 인증키입니다. config.json 의 api_key 를 확인하세요.",
    "011": "사용할 수 없는 인증키입니다(키 발급 직후라면 잠시 뒤 다시 시도).",
    "012": "접근할 수 없는 IP 입니다.",
    "013": "조회된 데이터가 없습니다.",
    "014": "파일이 존재하지 않습니다.",
    "020": "요청 제한을 초과했습니다(하루 호출 한도 초과). 내일 다시 시도하세요.",
    "021": "조회 가능한 회사 개수가 초과했습니다.",
    "100": "필드의 부적절한 값입니다.",
    "101": "부적절한 접근입니다.",
    "800": "시스템 점검으로 서비스가 중지 중입니다.",
    "900": "정의되지 않은 오류가 발생했습니다.",
    "901": "사용자 계정의 개인정보 보유기간이 만료되었습니다.",
}


# ── 작은 도우미들 ────────────────────────────────────────────────────────────
def log(msg):
    print(msg, flush=True)


def http_get_bytes(path, params, timeout=30):
    """OpenDART API 를 호출해 응답을 bytes 로 돌려준다. (네트워크 오류 시 몇 번 재시도)"""
    url = API_BASE + path + "?" + urllib.parse.urlencode(params)
    # 일부 서버가 비브라우저 요청을 막는 경우를 대비해 브라우저처럼 보이는 헤더 사용
    headers = {
        "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"),
        "Accept": "*/*",
    }
    last_err = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = e
            wait = 2 ** attempt  # 2초, 4초, 8초...
            log(f"   네트워크 오류, {wait}초 후 재시도... ({e})")
            time.sleep(wait)
    raise RuntimeError(f"네트워크 요청 실패: {url}\n{last_err}")


def http_get_json(path, params):
    raw = http_get_bytes(path, params)
    data = json.loads(raw.decode("utf-8"))
    status = data.get("status", "?")
    if status != "000":
        nice = STATUS_MESSAGES.get(status, "알 수 없는 상태")
        raise DartApiError(status, f"[{status}] {nice} (원문: {data.get('message')})")
    return data


class DartApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


# ── 텍스트 추출 (핵심 로직: 자체 점검 가능) ──────────────────────────────────
def decode_best(raw_bytes):
    """DART 원문 XML 은 UTF-8 또는 EUC-KR(cp949) 로 올 수 있어 둘 다 시도한다."""
    for enc in ("utf-8", "cp949", "euc-kr"):
        try:
            return raw_bytes.decode(enc)
        except UnicodeDecodeError:
            continue
    # 그래도 안 되면 깨진 글자는 무시하고 디코딩
    return raw_bytes.decode("utf-8", errors="ignore")


def strip_tags(s):
    """XML/HTML 태그를 제거하고 보기 좋은 평문으로 정리한다."""
    s = re.sub(r"<[^>]+>", " ", s)        # 태그 제거
    s = html.unescape(s)                   # &amp; 같은 특수문자 복원
    s = s.replace(" ", " ")           # 줄바꿈 없는 공백 → 일반 공백
    s = re.sub(r"[ \t]+", " ", s)          # 연속 공백 압축
    s = re.sub(r"[ \t]*\n[ \t]*", "\n", s) # 줄 앞뒤 공백 정리
    s = re.sub(r"\n{3,}", "\n\n", s)       # 빈 줄 3개 이상 → 2개
    return s.strip()


def parse_report_text(raw_xml, max_total_chars=1_000_000):
    """
    DART 원문 XML 에서
      - sections: [{title, text}, ...]  (목차 단위로 쪼갠 본문)
      - full_text: 전체 평문
    을 만들어 돌려준다. (정밀 파싱이 아니라 POC 수준의 견고한 근사치)
    """
    # <TITLE ...>제목</TITLE> 위치를 모두 찾아 섹션 경계로 사용
    title_pattern = re.compile(r"<TITLE\b[^>]*>(.*?)</TITLE>", re.IGNORECASE | re.DOTALL)
    matches = list(title_pattern.finditer(raw_xml))

    sections = []
    if matches:
        for i, m in enumerate(matches):
            title = strip_tags(m.group(1))
            if not title:
                continue
            body_start = m.end()
            body_end = matches[i + 1].start() if i + 1 < len(matches) else len(raw_xml)
            text = strip_tags(raw_xml[body_start:body_end])
            # 너무 짧은(목차 표시만 있는) 섹션은 건너뜀
            if len(title) > 100:
                title = title[:100] + "…"
            sections.append({"title": title, "text": text})

    full_text = strip_tags(raw_xml)
    truncated = False
    if len(full_text) > max_total_chars:
        full_text = full_text[:max_total_chars]
        truncated = True

    return sections, full_text, truncated


# ── ① 기업 고유번호 변환표 ───────────────────────────────────────────────────
def load_corp_map(api_key, max_age_days=7):
    """종목코드(6자리) → (corp_code, corp_name) 변환표. 큰 파일이라 캐시해 둔다."""
    if os.path.exists(CORP_CACHE_PATH):
        age = time.time() - os.path.getmtime(CORP_CACHE_PATH)
        if age < max_age_days * 86400:
            with open(CORP_CACHE_PATH, "r", encoding="utf-8") as f:
                log("① 기업 목록: 캐시 사용")
                return json.load(f)

    log("① 기업 목록 내려받는 중 (corpCode.xml, 최초 1회만 다소 느림)...")
    raw = http_get_bytes("/corpCode.xml", {"crtfc_key": api_key})
    if not raw.startswith(b"PK"):  # ZIP 이 아니면 보통 에러 XML/JSON
        text = decode_best(raw)
        raise RuntimeError(f"기업 목록 응답이 ZIP 이 아닙니다. 인증키를 확인하세요.\n{text[:300]}")

    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        xml_name = next(n for n in zf.namelist() if n.lower().endswith(".xml"))
        xml_bytes = zf.read(xml_name)

    root = ET.fromstring(decode_best(xml_bytes))
    corp_map = {}
    for item in root.findall("list"):
        stock = (item.findtext("stock_code") or "").strip()
        if not stock:  # 비상장(종목코드 없음)은 건너뜀
            continue
        corp_map[stock] = {
            "corp_code": (item.findtext("corp_code") or "").strip(),
            "corp_name": (item.findtext("corp_name") or "").strip(),
            "stock_code": stock,
        }

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(CORP_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(corp_map, f, ensure_ascii=False)
    log(f"   상장기업 {len(corp_map):,}곳 확인")
    return corp_map


# ── ② 사업보고서 접수번호 찾기 ───────────────────────────────────────────────
def find_business_report(api_key, corp_code, years_back=3):
    """해당 기업의 가장 최근 '사업보고서' 공시 1건을 찾는다."""
    today = datetime.date.today()
    bgn = (today - datetime.timedelta(days=365 * years_back + 30)).strftime("%Y%m%d")
    end = today.strftime("%Y%m%d")
    try:
        data = http_get_json("/list.json", {
            "crtfc_key": api_key,
            "corp_code": corp_code,
            "bgn_de": bgn,
            "end_de": end,
            "pblntf_ty": "A",     # A = 정기공시
            "page_count": "100",
        })
    except DartApiError as e:
        if e.status == "013":     # 데이터 없음
            return None
        raise

    candidates = []
    for row in data.get("list", []):
        name = row.get("report_nm", "")
        # '사업보고서' 이면서 분기/반기 보고서는 제외
        if "사업보고서" in name and "분기" not in name and "반기" not in name:
            candidates.append(row)

    if not candidates:
        return None
    # 접수일(rcept_dt) 기준 가장 최근 것
    candidates.sort(key=lambda r: r.get("rcept_dt", ""), reverse=True)
    return candidates[0]


# ── ③④ 원문 다운로드 + 텍스트 추출 ──────────────────────────────────────────
def download_document_text(api_key, rcept_no):
    raw = http_get_bytes("/document.xml", {"crtfc_key": api_key, "rcept_no": rcept_no})
    if not raw.startswith(b"PK"):
        text = decode_best(raw)
        raise RuntimeError(f"원문 응답이 ZIP 이 아닙니다.\n{text[:300]}")
    parts = []
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        for name in zf.namelist():
            if name.lower().endswith(".xml"):
                parts.append(decode_best(zf.read(name)))
    return "\n".join(parts)


# ── 설정 읽기 ────────────────────────────────────────────────────────────────
def load_config():
    if not os.path.exists(CONFIG_PATH):
        log("⚠️  config.json 이 없습니다.")
        log("   config.example.json 을 config.json 으로 복사하고, api_key 를 채워주세요.")
        log("   (인증키 발급:  https://opendart.fss.or.kr  →  인증키 신청/관리)")
        sys.exit(1)
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    if not cfg.get("api_key") or "여기에" in cfg.get("api_key", ""):
        log("⚠️  config.json 의 api_key 가 아직 비어 있습니다. 발급받은 인증키를 넣어주세요.")
        sys.exit(1)
    return cfg


# ── 저장: 검색 화면이 읽을 web/data.js ───────────────────────────────────────
def write_outputs(reports, is_demo=False):
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(WEB_DIR, exist_ok=True)
    payload = {
        "generated_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "is_demo": is_demo,
        "count": len(reports),
        "reports": reports,
    }
    # 1) 원본 데이터 (재가공용)
    with open(os.path.join(DATA_DIR, "reports.json"), "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)
    # 2) 검색 화면이 <script> 로 바로 읽는 파일 (로컬 더블클릭에서도 동작)
    js = "// 이 파일은 collect.py 가 자동 생성합니다. 직접 수정하지 마세요.\n"
    js += "window.__DART_DATA__ = " + json.dumps(payload, ensure_ascii=False) + ";\n"
    with open(os.path.join(WEB_DIR, "data.js"), "w", encoding="utf-8") as f:
        f.write(js)
    log(f"\n💾 저장 완료 → web/data.js  (보고서 {len(reports)}건)")
    log("   web/index.html 을 브라우저로 열면 검색 화면이 나옵니다.")


# ── 메인 ────────────────────────────────────────────────────────────────────
def run_collect():
    cfg = load_config()
    api_key = cfg["api_key"]
    stock_codes = [str(c).zfill(6) for c in cfg.get("stock_codes", [])]
    years_back = int(cfg.get("years_back", 3))
    if not stock_codes:
        log("⚠️  config.json 의 stock_codes 가 비어 있습니다. 예: [\"005930\", \"000660\"]")
        sys.exit(1)

    corp_map = load_corp_map(api_key)

    reports = []
    for code in stock_codes:
        info = corp_map.get(code)
        if not info:
            log(f"② [{code}] 상장기업 목록에서 종목코드를 찾지 못했습니다. 건너뜀.")
            continue
        log(f"② [{code}] {info['corp_name']} 사업보고서 찾는 중...")
        try:
            row = find_business_report(api_key, info["corp_code"], years_back)
        except DartApiError as e:
            log(f"   API 오류: {e}")
            continue
        if not row:
            log(f"   최근 {years_back}년 내 사업보고서를 찾지 못했습니다. 건너뜀.")
            continue

        rcept_no = row["rcept_no"]
        log(f"③ 원문 내려받는 중... (접수번호 {rcept_no})")
        try:
            raw_xml = download_document_text(api_key, rcept_no)
        except Exception as e:
            log(f"   원문 다운로드 실패: {e}")
            continue

        log("④ 텍스트 추출/정리...")
        sections, full_text, truncated = parse_report_text(raw_xml)

        # 사업연도 추정 (보고서명에 보통 (YYYY.MM) 형태로 들어있음)
        m = re.search(r"\((\d{4})\.\d{2}\)", row.get("report_nm", ""))
        year = m.group(1) if m else row.get("rcept_dt", "")[:4]

        reports.append({
            "corp_code": info["corp_code"],
            "corp_name": info["corp_name"],
            "stock_code": code,
            "rcept_no": rcept_no,
            "report_nm": row.get("report_nm", "").strip(),
            "rcept_dt": row.get("rcept_dt", ""),
            "year": year,
            "dart_url": f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={rcept_no}",
            "sections": sections,
            "full_text": full_text,
            "char_count": len(full_text),
            "truncated": truncated,
            # ↓ 부가가치 자리 (다음 단계에서 자동 채움: 예) Claude API 요약, 재무지표 추출)
            "summary": "",
            "key_metrics": {},
        })
        log(f"   완료: 본문 {len(full_text):,}자, 섹션 {len(sections)}개")
        time.sleep(0.5)  # API 에 부담 주지 않도록 잠깐 쉼

    if not reports:
        log("\n수집된 보고서가 없습니다. 종목코드/인증키를 확인하세요.")
        sys.exit(1)
    write_outputs(reports, is_demo=False)


# ── 자체 점검 (인증키/네트워크 없이 텍스트 추출 로직만 확인) ──────────────────
SELFTEST_XML = """<?xml version="1.0" encoding="utf-8"?>
<DOCUMENT>
  <BODY>
    <TITLE>I. 회사의 개요</TITLE>
    <P>당사는 1969년 설립된 전자제품 제조 &amp; 판매 기업입니다.</P>
    <TITLE>II. 사업의 내용</TITLE>
    <P>주요 제품은 반도체, 디스플레이입니다.</P>
    <TABLE><TR><TD>매출액</TD><TD>300조원</TD></TR></TABLE>
    <TITLE>III. 재무에 관한 사항</TITLE>
    <P>당기순이익은 전년 대비 증가하였습니다.</P>
  </BODY>
</DOCUMENT>"""


def run_selftest():
    log("🔧 자체 점검: 텍스트 추출 로직 확인")
    sections, full_text, truncated = parse_report_text(SELFTEST_XML)
    titles = [s["title"] for s in sections]
    ok = True

    expect_titles = ["I. 회사의 개요", "II. 사업의 내용", "III. 재무에 관한 사항"]
    if titles != expect_titles:
        log(f"  ❌ 섹션 제목 불일치: {titles}")
        ok = False
    else:
        log(f"  ✅ 섹션 {len(sections)}개 제목 정상: {titles}")

    if "전자제품 제조 & 판매" not in full_text:
        log("  ❌ 특수문자(&) 복원 실패")
        ok = False
    else:
        log("  ✅ 특수문자(&amp; → &) 복원 정상")

    if "반도체, 디스플레이" not in sections[1]["text"]:
        log("  ❌ 섹션 본문 추출 실패")
        ok = False
    else:
        log("  ✅ 섹션 본문 추출 정상")

    if "<" in full_text or ">" in full_text:
        log("  ❌ 태그가 남아 있음")
        ok = False
    else:
        log("  ✅ 태그 제거 정상")

    if ok:
        log("\n🎉 자체 점검 통과! 인증키만 넣으면 실제 수집을 시작할 수 있어요.")
    else:
        log("\n자체 점검 실패. 위 항목을 확인하세요.")
        sys.exit(1)


def main():
    if "--selftest" in sys.argv:
        run_selftest()
    else:
        run_collect()


if __name__ == "__main__":
    main()
