# 계기판 스냅샷 (누적 이력)

Cloudflare Analytics Engine 은 데이터를 **약 90일만** 보관합니다. 그래서 여기에
주기적으로 집계 스냅샷을 커밋해 **영구 누적 이력**으로 만듭니다.

## 쌓는 법 A — 자동 (권장, 손 안 대도 매주 누적)

`.github/workflows/modelter-snapshot.yml` 이 **매주 월요일** 스냅샷을 저장소에 자동 커밋합니다.
한 번만 준비하면 됩니다:

1. 저장소 **Settings → Secrets and variables → Actions** 에 시크릿 2개 추가
   - `CF_ACCOUNT_ID` = Cloudflare 계정 ID
   - `CF_API_TOKEN` = **Account Analytics : Read** 권한 토큰
2. 끝. (시크릿이 없으면 워크플로우는 조용히 건너뜁니다 — 빨간불 안 뜸)

수동으로 지금 한 번 돌리려면 **Actions 탭 → "Modelter snapshot" → Run workflow.**

## 쌓는 법 B — 수동 (로컬에서 직접)

```bash
# 1) 스냅샷 저장 (최근 30일 집계를 data/ae-snapshots/<날짜>.json 으로)
CF_ACCOUNT_ID=... CF_API_TOKEN=... node tools/modelter-ae.js --days 30 --snapshot

# 2) 대시보드 생성 (스냅샷 전체를 자기완결 HTML 한 장으로)
node tools/modelter-report.js
#   → data/dashboard.html 을 브라우저로 열기

# 2b) 사용 패턴 보고서 (누가·언제·어떻게 — 주간 모멘텀·기기·딜×산출물·시간대)
node tools/modelter-patterns.js
#   → data/patterns.html 을 브라우저로 열기

# 3) 커밋 (스냅샷을 남겨 다음에도 추세가 이어지게)
git add data/ae-snapshots/*.json && git commit -m "계기판 스냅샷 <날짜>"
```

토큰은 **Account Analytics : Read** 권한. 채팅·저장소에 토큰을 넣지 말고
환경변수(CF_ACCOUNT_ID·CF_API_TOKEN) 또는 GitHub Actions 시크릿으로만 사용합니다.

> 대시보드(`data/dashboard.html`)는 생성물이라 git에 커밋하지 않습니다(gitignore).
> 트래픽 지표라 공개 배포도 하지 않습니다. `git pull` 후 위 2)를 돌려 로컬에서 엽니다.

## 무엇이 담기나 (수치·PII 없음)

이벤트명·딜유형·기능플래그·기기·유입호스트별 **집계 카운트만**. 매입가·임대료 같은
딜 수치와 임차인명·개인정보는 애초에 수집되지 않으므로 스냅샷에도 없습니다.

`<날짜>.json` = { endDate, days, funnel, events, deals, device, ref, feats, depth, daily }
