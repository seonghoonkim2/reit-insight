#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
diff.py — 보고서 비교 (전년 대비 / 정정 전후)

두 보고서(report dict)의 섹션을 제목 기준으로 맞춰 변화를 정리합니다.
- 새로 생긴 섹션 / 사라진 섹션
- 같은 섹션의 본문 변경 정도(difflib 유사도)와 키워드 증감

함수:  compare(a, b, keywords=None) -> dict
점검:  python3 diff.py --selftest
"""

import re
import difflib

DEFAULT_KEYWORDS = ["우발부채", "PF", "책임준공", "재고자산", "배당", "소송", "계속기업", "영업권"]


def _sec_map(report):
    return {s.get("title"): (s.get("text") or "") for s in (report.get("sections") or [])}


def _count(text, kw):
    return len(re.findall(re.escape(kw), text or "", flags=re.IGNORECASE))


def compare(a, b, keywords=None):
    """a=새 보고서(예: 2025/정정후), b=비교대상(예: 2024/정정전)."""
    keywords = keywords or DEFAULT_KEYWORDS
    sa, sb = _sec_map(a), _sec_map(b)
    new_sections = [t for t in sa if t not in sb]
    removed_sections = [t for t in sb if t not in sa]

    changed = []
    for title in sa:
        if title in sb and sa[title] != sb[title]:
            ratio = difflib.SequenceMatcher(None, sb[title], sa[title]).ratio()
            changed.append({"title": title, "similarity": round(ratio, 3),
                            "change_pct": round((1 - ratio) * 100, 1)})
    changed.sort(key=lambda x: x["change_pct"], reverse=True)

    ta = " ".join(sa.values())
    tb = " ".join(sb.values())
    keyword_delta = []
    for kw in keywords:
        na, nb = _count(ta, kw), _count(tb, kw)
        if na or nb:
            keyword_delta.append({"keyword": kw, "before": nb, "after": na, "delta": na - nb})
    keyword_delta.sort(key=lambda x: x["delta"], reverse=True)

    return {
        "new_sections": new_sections,
        "removed_sections": removed_sections,
        "changed_sections": changed,
        "keyword_delta": keyword_delta,
    }


def run_selftest():
    print("🔧 diff.py 점검")
    b = {"sections": [
        {"title": "I. 회사의 개요", "text": "전자회사. 우발부채 약간."},
        {"title": "III. 재무", "text": "재고자산 보통."},
    ]}
    a = {"sections": [
        {"title": "I. 회사의 개요", "text": "전자회사. 우발부채 크게 증가. 우발부채 관련 PF 우발채무 추가."},
        {"title": "II. 사업의 내용", "text": "신규 섹션."},
        {"title": "III. 재무", "text": "재고자산 보통."},
    ]}
    d = compare(a, b)
    ok = True
    if d["new_sections"] != ["II. 사업의 내용"]:
        print("  ❌ 새 섹션:", d["new_sections"]); ok = False
    else:
        print("  ✅ 새 섹션 감지:", d["new_sections"])
    chg = [c["title"] for c in d["changed_sections"]]
    if "I. 회사의 개요" not in chg or "III. 재무" in chg:
        print("  ❌ 변경 섹션 오류:", d["changed_sections"]); ok = False
    else:
        print("  ✅ 변경 섹션 감지:", d["changed_sections"][0])
    kd = {x["keyword"]: x["delta"] for x in d["keyword_delta"]}
    if kd.get("우발부채", 0) <= 0 or kd.get("PF", 0) <= 0:
        print("  ❌ 키워드 증감 오류:", kd); ok = False
    else:
        print("  ✅ 키워드 증감 감지:", {k: v for k, v in kd.items() if v})
    print("\n🎉 diff.py 점검 통과!" if ok else "\n실패")
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    import sys
    if "--selftest" in sys.argv:
        run_selftest()
    else:
        print("compare(a,b) 함수를 import 해서 사용합니다. 점검: python3 diff.py --selftest")
