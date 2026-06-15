#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
bulk.py — 대량/재개형 사업보고서 수집 (작업 큐 기반)

collect.py 가 '몇 개 종목'을 받는다면, bulk.py 는 '상장사 전체(또는 다수)'를 받습니다.
SQLite 작업 큐(ingestion_jobs)에 종목을 넣고, 하루 한도(daily_limit)만큼만 처리합니다.
중단되어도 큐가 남아 있어 다음 실행에서 이어서 진행하며, 이미 받은 보고서는 건너뜁니다.

설정(config.json):
  "bulk": { "daily_limit": 200, "rate_seconds": 0.6, "max_companies": 0, "with_financials": false }
  - daily_limit  : 이번 실행에서 처리할 최대 건수(OpenDART 하루 한도 보호)
  - max_companies: 큐에 넣을 상장사 수 제한(0 = 전체)
  - with_financials: 재무 구조화(financial_facts)도 함께 수집

실행:
  python3 bulk.py            # 큐 채우고 daily_limit 만큼 처리(이어하기 가능)
  python3 bulk.py --status   # 큐 현황만 출력
점검:
  python3 bulk.py --selftest # 가짜 수집기로 큐/재개/중복방지 로직만 검증(네트워크 불필요)
"""

import os
import sys
import time

import db
import collect
import financials

DB_PATH = collect.DB_PATH


# ── 큐 채우기 / 처리 ─────────────────────────────────────────────────────────
def enqueue_companies(con, codes):
    n = 0
    for code in codes:
        before = con.execute("SELECT COUNT(*) FROM ingestion_jobs").fetchone()[0]
        db.enqueue_job(con, "report", code)
        after = con.execute("SELECT COUNT(*) FROM ingestion_jobs").fetchone()[0]
        n += (after - before)
    return n


def run_queue(con, fetch_report, limit, rate=0.5):
    """fetch_report(code) -> report dict | None | {'skipped':True,...}. 큐를 limit 만큼 처리."""
    processed = 0
    while processed < limit:
        job = db.claim_job(con, "report")
        if not job:
            break
        code = job["ref"]
        try:
            rep = fetch_report(code)
            if rep is None:
                db.finish_job(con, job["id"], "done", "no_report")
            elif rep.get("skipped"):
                db.finish_job(con, job["id"], "done", "skipped")
            else:
                db.save_report(con, rep)
                if rep.get("financials"):
                    db.replace_financial_facts(con, rep["rcept_no"], rep["financials"])
                db.finish_job(con, job["id"], "done")
        except Exception as e:
            db.finish_job(con, job["id"], "error", str(e))
        processed += 1
        if rate:
            time.sleep(rate)
    return processed


# ── 실제 수집기 (네트워크 필요) ──────────────────────────────────────────────
def build_report_fetcher(api_key, corp_map, years_back, con, with_financials=False):
    def fetch(code):
        info = corp_map.get(code)
        if not info:
            return None
        found = collect.find_business_report(api_key, info["corp_code"], years_back)
        if not found:
            return None
        row = found["row"]
        rcept_no = row["rcept_no"]
        if db.filing_exists(con, rcept_no):
            return {"skipped": True, "rcept_no": rcept_no}
        raw = collect.download_document_text(api_key, rcept_no)
        sections, full_text, truncated = collect.parse_report_text(raw)
        year = found["business_year"]
        rep = {
            "corp_code": info["corp_code"], "corp_name": info["corp_name"], "stock_code": code,
            "market": info.get("market", ""), "rcept_no": rcept_no,
            "report_nm": row.get("report_nm", "").strip(), "report_type": "사업보고서",
            "rcept_dt": row.get("rcept_dt", ""), "year": year,
            "filing_group_key": f"{info['corp_code']}_사업보고서_{year}",
            "is_latest_version": True, "is_amended": found["is_amended"],
            "amendment_type": found["amendment_type"], "version_count": found["version_count"],
            "dart_url": f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={rcept_no}",
            "sections": sections, "full_text": full_text, "char_count": len(full_text),
            "truncated": truncated, "summary": "", "key_metrics": {},
        }
        if with_financials:
            try:
                rep["financials"] = financials.fetch_financials(api_key, info["corp_code"], code, year)
            except Exception:
                pass
        return rep
    return fetch


def run_main():
    cfg = collect.load_config()
    bulk = cfg.get("bulk", {})
    daily_limit = int(bulk.get("daily_limit", 200))
    rate = float(bulk.get("rate_seconds", 0.6))
    max_companies = int(bulk.get("max_companies", 0))
    with_fin = bool(bulk.get("with_financials", False))
    years_back = int(cfg.get("years_back", 3))

    con = db.connect(DB_PATH)
    db.init_schema(con)

    corp_map = collect.load_corp_map(cfg["api_key"])
    codes = sorted(corp_map.keys())  # 상장사(종목코드 보유)만
    if max_companies:
        codes = codes[:max_companies]
    added = enqueue_companies(con, codes)
    print(f"큐에 새로 추가: {added}건 (상장사 {len(codes)} 중) · 현재 큐: {db.job_counts(con)}")

    fetch = build_report_fetcher(cfg["api_key"], corp_map, years_back, con, with_fin)
    print(f"이번 실행 처리 한도: {daily_limit}건 (rate {rate}s)")
    done = run_queue(con, fetch, daily_limit, rate)
    print(f"✅ {done}건 처리 · 큐 현황: {db.job_counts(con)}")
    print("   남은 작업은 다음에 다시 실행하면 이어집니다.")
    # 검색 화면용 데이터도 갱신하려면 build_site.py / data.js 생성 단계 별도 실행


def show_status():
    if not os.path.exists(DB_PATH):
        print("DB 없음. 먼저 bulk.py 또는 collect.py 실행."); return
    con = db.connect(DB_PATH)
    db.init_schema(con)
    print("작업 큐 현황:", db.job_counts(con))
    print("수집된 보고서:", con.execute("SELECT COUNT(*) FROM filings").fetchone()[0])


# ── 자체 점검 (가짜 수집기) ──────────────────────────────────────────────────
def run_selftest():
    print("🔧 bulk.py 점검 (in-memory, 가짜 수집기)")
    con = db.connect(":memory:")
    db.init_schema(con)

    def fake_fetch(code):
        if code in ("000404", "000405"):
            return None  # 보고서 없음
        if code == "000999":
            return {"skipped": True, "rcept_no": "20990101000999"}
        return {
            "corp_code": "00" + code, "corp_name": "회사" + code, "stock_code": code, "market": "KOSPI",
            "rcept_no": "2026" + code + "0001", "report_nm": "사업보고서 (2025.12)", "report_type": "사업보고서",
            "rcept_dt": "20260318", "year": "2025", "filing_group_key": "g" + code,
            "is_latest_version": True, "is_amended": False, "dart_url": "u", "char_count": 10,
            "sections": [{"title": "I. 회사의 개요", "section_path": "I", "text": "본문 " + code}],
        }

    codes = ["000001", "000002", "000404", "000999"]
    added = enqueue_companies(con, codes)
    added2 = enqueue_companies(con, codes)  # 중복 재시도
    processed = run_queue(con, fake_fetch, limit=100, rate=0)

    ok = True
    nf = con.execute("SELECT COUNT(*) FROM filings").fetchone()[0]
    counts = db.job_counts(con)
    if added != 4 or added2 != 0:
        print(f"  ❌ 큐 중복방지 실패: added={added}, added2={added2}"); ok = False
    else:
        print(f"  ✅ 큐 추가/중복방지 정상: 최초 {added}건, 재시도 {added2}건")
    if not (nf == 2 and processed == 4 and counts.get("done") == 4):
        print(f"  ❌ 처리 결과 이상: filings={nf}, processed={processed}, counts={counts}"); ok = False
    else:
        print(f"  ✅ 처리 정상: 저장 {nf}건(보고서있는 2건), 처리 {processed}건, 큐 {counts}")

    # 재개(이어하기) 시뮬: 새 작업 추가 후 다시 처리
    enqueue_companies(con, ["000003"])
    run_queue(con, fake_fetch, limit=100, rate=0)
    if con.execute("SELECT COUNT(*) FROM filings").fetchone()[0] == 3:
        print("  ✅ 이어하기(재개) 정상: 보고서 3건")
    else:
        print("  ❌ 재개 실패"); ok = False

    print("\n🎉 bulk.py 점검 통과!" if ok else "\n실패")
    if not ok:
        raise SystemExit(1)


def main():
    if "--selftest" in sys.argv:
        run_selftest()
    elif "--status" in sys.argv:
        show_status()
    else:
        run_main()


if __name__ == "__main__":
    main()
