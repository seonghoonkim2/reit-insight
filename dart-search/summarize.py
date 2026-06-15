#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
summarize.py — 수집된 사업보고서에 'AI 부가가치'를 자동으로 붙이는 스크립트

하는 일:
  1) collect.py 가 만든 data/reports.json 을 읽어
  2) 각 보고서 본문을 Claude API 로 보내서
       - summary     : 일반 투자자용 3~5문장 요약
       - key_metrics : 한 줄 사업 설명 + 핵심 포인트 + (찾으면) 매출/영업이익/순이익
     을 만들고
  3) 결과를 reports.json 과 web/data.js 에 다시 저장합니다.

→ 이게 '원문만 복사'가 아니라 우리만의 가치를 더하는 부분 (애드센스/검색 유입의 핵심).

준비물:
  - 파이썬 패키지 설치:  pip install anthropic
  - Claude(Anthropic) API 키:  https://console.anthropic.com  →  API Keys
    config.json 의 "anthropic_api_key" 에 넣거나 환경변수 ANTHROPIC_API_KEY 로 설정

사용법:
  python3 summarize.py            # 실제 요약 (API 키 필요, 비용 발생)
  python3 summarize.py --dry-run  # 키 없이: 실제로 보낼 프롬프트만 미리보기 (요금 0)
"""

import os
import sys
import json
import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "config.json")
DATA_DIR = os.path.join(HERE, "data")
WEB_DIR = os.path.join(HERE, "web")
REPORTS_JSON = os.path.join(DATA_DIR, "reports.json")

DEFAULT_MODEL = "claude-opus-4-8"   # 비용을 줄이려면 config 에서 claude-haiku-4-5 등으로 변경 가능
DEFAULT_MAX_CHARS = 40000           # 보고서 본문은 매우 길어, 앞부분 N자만 보내 비용을 통제

SYSTEM_PROMPT = (
    "너는 한국 상장기업의 DART 사업보고서를 일반 투자자가 쉽게 이해하도록 정리하는 애널리스트다. "
    "반드시 보고서 본문에 실제로 있는 내용만 사용하고, 없는 숫자는 지어내지 마라. "
    "어려운 회계·공시 용어는 쉬운 말로 풀어 설명하되 과장하지 말고, 투자 권유나 매수/매도 의견은 절대 쓰지 마라. "
    "모든 출력은 한국어로 작성한다."
)


def log(msg):
    print(msg, flush=True)


def load_config():
    cfg = {}
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    return cfg


def build_user_prompt(report, max_chars):
    """보고서 1건 → Claude 에게 보낼 사용자 프롬프트 문자열."""
    text = (report.get("full_text") or "")[:max_chars]
    return (
        f"다음은 '{report.get('corp_name','')}'(종목코드 {report.get('stock_code','')})의 "
        f"{report.get('report_nm','사업보고서')} 본문 일부다. 이 내용을 바탕으로 정리해줘.\n\n"
        f"--- 보고서 본문 시작 ---\n{text}\n--- 보고서 본문 끝 ---"
    )


# ── 실제 요약 (anthropic SDK 사용) ───────────────────────────────────────────
def run_summarize(cfg):
    try:
        import anthropic
    except ImportError:
        log("⚠️  'anthropic' 패키지가 없습니다. 먼저 설치하세요:  pip install anthropic")
        sys.exit(1)

    from pydantic import BaseModel  # anthropic 설치 시 함께 들어옴

    api_key = cfg.get("anthropic_api_key") or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key or "여기에" in str(api_key):
        log("⚠️  Claude API 키가 없습니다.")
        log("   config.json 의 anthropic_api_key 에 넣거나 환경변수 ANTHROPIC_API_KEY 로 설정하세요.")
        log("   (발급: https://console.anthropic.com → API Keys)")
        sys.exit(1)

    if not os.path.exists(REPORTS_JSON):
        log("⚠️  data/reports.json 이 없습니다. 먼저 collect.py 로 보고서를 수집하세요.")
        sys.exit(1)

    model = cfg.get("summary_model", DEFAULT_MODEL)
    max_chars = int(cfg.get("summary_max_chars", DEFAULT_MAX_CHARS))

    # 구조화 출력 스키마 (Claude 가 이 형식의 JSON 으로만 답하도록 강제)
    class Metrics(BaseModel):
        revenue: str           # 매출액 (찾으면 값, 없으면 "정보 없음")
        operating_profit: str  # 영업이익
        net_profit: str        # 당기순이익

    class Insight(BaseModel):
        summary: str           # 3~5문장 요약
        business: str          # 한 줄 사업 설명
        key_points: list[str]  # 핵심 포인트 3~5개
        metrics: Metrics

    client = anthropic.Anthropic(api_key=api_key)

    with open(REPORTS_JSON, "r", encoding="utf-8") as f:
        payload = json.load(f)
    reports = payload.get("reports", [])

    done = 0
    for r in reports:
        if r.get("summary"):  # 이미 요약된 건 건너뜀 (재실행 시 비용 절약)
            continue
        log(f"🤖 [{r.get('stock_code')}] {r.get('corp_name')} 요약 중... (model={model})")
        try:
            resp = client.messages.parse(
                model=model,
                max_tokens=2000,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": build_user_prompt(r, max_chars)}],
                output_format=Insight,
            )
        except anthropic.APIError as e:
            log(f"   API 오류: {e}")
            continue

        if resp.stop_reason == "refusal":
            log("   요청이 거부되었습니다(refusal). 건너뜀.")
            continue

        ins = resp.parsed_output
        if not ins:
            log("   구조화 출력 파싱 실패. 건너뜀.")
            continue

        r["summary"] = ins.summary
        r["key_metrics"] = {
            "business": ins.business,
            "key_points": ins.key_points,
            "revenue": ins.metrics.revenue,
            "operating_profit": ins.metrics.operating_profit,
            "net_profit": ins.metrics.net_profit,
        }
        done += 1
        log("   완료")

    if done == 0:
        log("\n새로 요약할 보고서가 없습니다. (이미 모두 요약됨)")
        return

    save_outputs(payload)
    log(f"\n💾 저장 완료 → web/data.js  ({done}건 새로 요약)")


def save_outputs(payload):
    payload["summarized_at"] = datetime.datetime.now().isoformat(timespec="seconds")
    with open(REPORTS_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)
    js = "// 이 파일은 collect.py / summarize.py 가 자동 생성합니다. 직접 수정하지 마세요.\n"
    js += "window.__DART_DATA__ = " + json.dumps(payload, ensure_ascii=False) + ";\n"
    with open(os.path.join(WEB_DIR, "data.js"), "w", encoding="utf-8") as f:
        f.write(js)


# ── 드라이런 (키/네트워크 없이 프롬프트만 미리보기) ──────────────────────────
SAMPLE_REPORT = {
    "corp_name": "샘플전자",
    "stock_code": "000001",
    "report_nm": "사업보고서 (2025.12)",
    "full_text": (
        "당사는 반도체와 디스플레이를 제조·판매하는 전자기업입니다. "
        "주요 사업부문은 반도체, 디스플레이, 가전이며, 당기 매출액은 300조원, "
        "영업이익은 40조원, 당기순이익은 30조원을 기록하였습니다. "
        "신규 공장 투자와 연구개발을 확대하고 있습니다."
    ),
}


def run_dry_run(cfg):
    model = cfg.get("summary_model", DEFAULT_MODEL)
    max_chars = int(cfg.get("summary_max_chars", DEFAULT_MAX_CHARS))
    log("🔎 드라이런: 실제 호출 없이 Claude 에게 보낼 내용 미리보기\n")
    log(f"모델: {model}   (본문은 앞 {max_chars:,}자까지만 전송)")
    log("\n[시스템 프롬프트]\n" + SYSTEM_PROMPT)
    log("\n[사용자 프롬프트]\n" + build_user_prompt(SAMPLE_REPORT, max_chars))
    log("\n[기대 출력 형식(JSON)]")
    log(json.dumps({
        "summary": "이 회사가 무슨 사업을 하고 올해 무엇이 달라졌는지 3~5문장",
        "business": "한 줄 사업 설명",
        "key_points": ["핵심 포인트1", "핵심 포인트2", "핵심 포인트3"],
        "metrics": {"revenue": "매출액", "operating_profit": "영업이익", "net_profit": "당기순이익"},
    }, ensure_ascii=False, indent=2))
    log("\n✅ 드라이런 정상 동작. 실제 실행은 `pip install anthropic` 후 `python3 summarize.py`.")


def main():
    cfg = load_config()
    if "--dry-run" in sys.argv:
        run_dry_run(cfg)
    else:
        run_summarize(cfg)


if __name__ == "__main__":
    main()
