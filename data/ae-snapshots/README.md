# 계기판 스냅샷 (누적 이력)

Cloudflare Analytics Engine 은 데이터를 **약 90일만** 보관합니다. 그래서 여기에
주기적으로 집계 스냅샷을 커밋해 **영구 누적 이력**으로 만듭니다.

## 쌓는 법 (주 1회 권장)

```bash
# 1) 스냅샷 저장 (최근 30일 집계를 data/ae-snapshots/<날짜>.json 으로)
CF_ACCOUNT_ID=... CF_API_TOKEN=... node tools/modelter-ae.js --days 30 --snapshot

# 2) 대시보드 생성 (스냅샷 전체를 자기완결 HTML 한 장으로)
node tools/modelter-report.js
#   → data/dashboard.html 을 브라우저로 열기

# 3) 커밋 (스냅샷을 남겨 다음에도 추세가 이어지게)
git add data/ae-snapshots/*.json && git commit -m "계기판 스냅샷 <날짜>"
```

토큰은 **Account Analytics : Read** 권한. 채팅·저장소에 토큰을 넣지 말고
환경변수(CF_ACCOUNT_ID·CF_API_TOKEN)로만 사용합니다.

## 무엇이 담기나 (수치·PII 없음)

이벤트명·딜유형·기능플래그·기기·유입호스트별 **집계 카운트만**. 매입가·임대료 같은
딜 수치와 임차인명·개인정보는 애초에 수집되지 않으므로 스냅샷에도 없습니다.

`<날짜>.json` = { endDate, days, funnel, events, deals, device, ref, feats, depth, daily }
