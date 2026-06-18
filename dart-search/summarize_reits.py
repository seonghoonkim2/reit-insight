#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
summarize_reits.py — 상장리츠에 'AI 요약(참고)'을 자동으로 붙이는 스크립트 (GoInsider 스타일)

data/reits.json (또는 web/reits-demo.js)의 리츠마다 Claude API로
  - summary    : 일반 투자자용 2~4문장 요약
  - key_points : 핵심 포인트 3개
를 만들어 web/reits.js (검색앱이 읽는 실데이터) 에 채웁니다.

준비:  pip install anthropic  +  Claude API 키(config.json anthropic_api_key 또는 env ANTHROPIC_API_KEY)
사용:
  python3 summarize_reits.py            # 실제 요약(요금 발생)
  python3 summarize_reits.py --dry-run  # 키 없이 프롬프트 미리보기(요금 0)
"""
import os
import re
import sys
import json

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "config.json")
REITS_JSON = os.path.join(HERE, "data", "reits.json")
REITS_DEMO = os.path.join(HERE, "web", "reits-demo.js")
OUT_JS = os.path.join(HERE, "web", "reits.js")

DEFAULT_MODEL = "claude-opus-4-8"

SYSTEM_PROMPT = (
    "너는 한국 상장리츠(REITs)를 일반 투자자에게 쉽게 설명하는 애널리스트다. "
    "주어진 사실(섹터·배당·포트폴리오 등)만 사용하고, 없는 숫자는 지어내지 마라. "
    "위험과 변수도 균형 있게 언급하되 과장하지 말고, 매수/매도 등 투자 권유는 절대 하지 마라. "
    "모든 출력은 한국어. 숫자는 예시일 수 있음을 감안해 단정적 표현을 피한다."
)


def load_config():
    return json.load(open(CONFIG_PATH, encoding="utf-8")) if os.path.exists(CONFIG_PATH) else {}


def load_reits():
    if os.path.exists(REITS_JSON):
        return json.load(open(REITS_JSON, encoding="utf-8")), "data/reits.json"
    if os.path.exists(REITS_DEMO):
        m = re.search(r"window\.__REITS__\s*=\s*(\[.*\]);", open(REITS_DEMO, encoding="utf-8").read(), re.S)
        if m:
            return json.loads(m.group(1)), "web/reits-demo.js"
    return [], None


def build_prompt(r):
    fields = {
        "종목명": r.get("name"), "종목코드": r.get("ticker"), "섹터": r.get("sector"),
        "배당수익률(%)": r.get("dividend_yield"), "배당주기": r.get("dividend_freq"),
        "주가/NAV": r.get("nav_ratio"), "신용등급": r.get("credit_rating"),
        "운용사": r.get("amc"), "상장일": r.get("listing_date"),
        "주요 보유자산": ", ".join(r.get("portfolio") or []),
    }
    lines = "\n".join(f"- {k}: {v}" for k, v in fields.items() if v)
    return ("다음 상장리츠의 정보를 일반 투자자가 이해하기 쉽게 정리해줘.\n"
            "요약 2~4문장과 핵심 포인트 3개(위험 포함)를 만들어줘.\n\n" + lines)


def run(cfg):
    try:
        import anthropic
        from pydantic import BaseModel
    except ImportError:
        print("⚠️  pip install anthropic 가 필요합니다."); sys.exit(1)

    api_key = cfg.get("anthropic_api_key") or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key or "여기에" in str(api_key):
        print("⚠️  Claude API 키가 없습니다 (config.json anthropic_api_key 또는 env ANTHROPIC_API_KEY)."); sys.exit(1)

    reits, src = load_reits()
    if not reits:
        print("⚠️  리츠 데이터가 없습니다."); sys.exit(1)

    class ReitInsight(BaseModel):
        summary: str
        key_points: list[str]

    client = anthropic.Anthropic(api_key=api_key)
    model = cfg.get("summary_model", DEFAULT_MODEL)
    done = 0
    for r in reits:
        if r.get("summary") and not r["summary"].startswith("(데모"):
            continue
        print(f"🤖 {r.get('name')} 요약 중...")
        try:
            resp = client.messages.parse(model=model, max_tokens=1200, system=SYSTEM_PROMPT,
                                         messages=[{"role": "user", "content": build_prompt(r)}],
                                         output_format=ReitInsight)
        except anthropic.APIError as e:
            print(f"   API 오류: {e}"); continue
        if resp.stop_reason == "refusal" or not resp.parsed_output:
            print("   건너뜀"); continue
        r["summary"] = resp.parsed_output.summary
        r["key_points"] = resp.parsed_output.key_points
        done += 1

    with open(REITS_JSON, "w", encoding="utf-8") as f:
        json.dump(reits, f, ensure_ascii=False)
    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("// summarize_reits.py 자동 생성\nwindow.__REITS__ = " + json.dumps(reits, ensure_ascii=False) + ";\n")
    print(f"\n💾 저장 완료 → web/reits.js ({done}건 새로 요약)")


def dry_run():
    reits, src = load_reits()
    if not reits:
        print("리츠 데이터 없음"); return
    print("🔎 드라이런 (실호출 없음)\n\n[시스템]\n" + SYSTEM_PROMPT + "\n\n[사용자]\n" + build_prompt(reits[0]))
    print("\n[기대 출력]")
    print(json.dumps({"summary": "2~4문장 요약", "key_points": ["포인트1", "포인트2", "포인트3"]}, ensure_ascii=False, indent=2))
    print("\n✅ 드라이런 정상.")


def main():
    cfg = load_config()
    dry_run() if "--dry-run" in sys.argv else run(cfg)


if __name__ == "__main__":
    main()
