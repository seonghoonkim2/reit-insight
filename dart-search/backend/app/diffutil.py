"""보고서 비교(전년대비/정정 전후) — dart-search/diff.py 와 동일 로직(백엔드 독립용)."""
import re
import difflib

DEFAULT_KEYWORDS = ["우발부채", "PF", "책임준공", "재고자산", "배당", "소송", "계속기업", "영업권"]


def _sec_map(sections):
    return {s.get("title"): (s.get("text") or "") for s in (sections or [])}


def _count(text, kw):
    return len(re.findall(re.escape(kw), text or "", flags=re.IGNORECASE))


def compare(a_sections, b_sections, keywords=None):
    keywords = keywords or DEFAULT_KEYWORDS
    sa, sb = _sec_map(a_sections), _sec_map(b_sections)
    new_sections = [t for t in sa if t not in sb]
    removed_sections = [t for t in sb if t not in sa]
    changed = []
    for title in sa:
        if title in sb and sa[title] != sb[title]:
            ratio = difflib.SequenceMatcher(None, sb[title], sa[title]).ratio()
            changed.append({"title": title, "similarity": round(ratio, 3), "change_pct": round((1 - ratio) * 100, 1)})
    changed.sort(key=lambda x: x["change_pct"], reverse=True)
    ta, tb = " ".join(sa.values()), " ".join(sb.values())
    kd = []
    for kw in keywords:
        na, nb = _count(ta, kw), _count(tb, kw)
        if na or nb:
            kd.append({"keyword": kw, "before": nb, "after": na, "delta": na - nb})
    kd.sort(key=lambda x: x["delta"], reverse=True)
    return {"new_sections": new_sections, "removed_sections": removed_sections,
            "changed_sections": changed, "keyword_delta": kd}
