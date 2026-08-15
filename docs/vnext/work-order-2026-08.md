# 작업지시서 — 8월 개선 배치 (2026-08-10 판독 기반)

> [!CAUTION]
> **완료된 역사 작업지시서입니다. P1·P2a·P2b·P3a는 이미 구현됐으므로 다시 실행하지 마세요.** 현재 사실과 검증 순서는 `AGENTS.md` → 실제 코드·테스트 → `docs/STRATEGY.md` 후반 기록 → `docs/METRICS.md`를 따릅니다. P3b(호텔)는 `deal_want` 사전 게이트와 별도 승인 없이는 착수 금지입니다.
>
> 근거 데이터: `data/ae-snapshots/2026-08-10.json` (21일 창 · 방문 638 · 봇 제외).

## 0. 판독 요약 (왜 이 작업들인가)

| 신호 | 수치 (21일, 7/20~8/10) | 결론 |
|---|---|---|
| 활성화율 안정 | W30 11.9% → W31 10.6% → W32 10.9% (4주 연속 10%+) | 전환 개선은 완료 국면 — 전환 실험 추가 금지 |
| **src=seo 착지 세션 활성화 0** | 이번 창 12 + 직전 창 9 = **누적 21세션, 활성화 0·산출물 0** (구글 직접 유입은 17% 활성화) | **P1** — 착지→앱 인계가 죽어 있음 |
| depth_change 마찰 지속 | 150회 (활성화 72 대비 2배) — 7/31 안내 배포 효과는 **일별 시계열 부재로 검증 불가** | **P2a** — 계측 공백 |
| 북극성 K3 판독 불가 | act 플래그는 7/26부터 수집 중인데 **스냅샷에 산출물 act 분해가 없음** | **P2b** — 계측 공백 |
| 호텔 게이트 임박 | deal_want 55표 중 호텔 26(47%) 최다 · 누적(7/14 dedupe 이후) 추정 ~33/50 | **P3** — 게이트 카운터로 판정 자동화, 도달 시 C-7 |
| 공유 첫 신호 | share_link 10 · src=share 착지 7세션 (이전 ~0) | 개입 금지, 관찰만 |
| 검색 다변화 | 빙 16세션 38% · ntp.msn.com 6세션 33% · 네이버 계열 31세션 | 코드 작업 없음 — 사용자 액션(§P4) |

## 1. 불변 가드레일 (위반 금지)

1. **저장소 사본이 진실**: 편집 대상은 `dart-search/web/modelter/index.html`. (`/home/user/modelter` 캐노니컬은 세션에 없을 수 있음 — 있으면 cp로 동기화)
2. **배포 루트**: master 직접 푸시는 차단됨 → 브랜치 커밋 → **GitHub MCP `create_pull_request` → `merge_pull_request`(merge)**. 푸시·머지는 사용자가 사전 승인함(검증 통과 전제).
3. **릴리스 파이프라인** (매 배포, 순서 고정):
   `node tools/stamp-build.js` → `node tools/gen-verification.js`(FAIL 시 배포 중단) → `node tools/gen-pages.js` + `--check` → `node tools/modelter-ci-check.js` → `node tools/qa/invariants.js` → `grep -c "__mtCalc" dart-search/web/modelter/index.html` = **0** → `node tools/qa/smoke.js`(36+) → 커밋·PR·머지 → 라이브 `MT_BUILD` 스탬프 curl 확인(엣지 캐시 혼합 응답 유의 — 연속 일치까지 재시도)
4. **계측 불변**: `/e`는 이벤트명·딜유형·기능플래그·기기·유입호스트만(수치·임차인명·PII 금지). **이벤트 추가·변경 시 `docs/METRICS.md`를 함께 갱신해야 CI 통과**(정확 일치 강제). 이번 배치는 **신규 이벤트 0**으로 설계됨 — 그대로 유지할 것.
5. What's new 라벨 **v3 고정**(내용만 현행화), "투자 권유가 아닌 정보 제공 목적" 문구 유지, 숫자 예시는 샘플.
6. Playwright: 모듈 `/opt/node22/lib/node_modules/playwright`, 크로미움 `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, **http 서버로 서빙**(file:// 불가).
7. 검증 없이 완료 보고 금지. 실패는 실패라고 보고.

---

## P1. SEO 착지 인계 수리 — "내 숫자로 바꾸는 순간" 만들기 (최우선)

### 근거·원인 (코드로 확정됨)
- `src=seo` 누적 21세션 활성화 0. 착지 페이지(calc/*)의 CTA는 `/#t=<deal>&src=seo`.
- `#t=` 딥링크 핸들러(`index.html` ≈5475행, `tryRestoreFromURL` 내 `mT` 분기)는 이미 **탭 전환 + 예시 채움 + 빌더 스크롤**까지 한다. 즉 "못 찾아서"가 아니라, **착지 페이지에서 방금 본 것과 같은 예시가 또 보일 뿐, 자기 숫자를 넣을 이유를 아무것도 제시하지 않아서** 이탈한다.

### 구현 지침
**(a) 앱: seo 도착 맥락 안내** — `#t=` 분기에서 `&src=seo`가 함께 있을 때만:
- `.core-g`(① 핵심 입력 그룹, B-4에서 신설)에 일시 하이라이트 클래스 부여(예: `core-hi`, CSS 2~3초 페이드 — 기존 `.term:target` 애니메이션 패턴 참고).
- 기존 `toast()`로 한 줄 안내: 예) `"방금 보신 예시가 채워져 있습니다 — 매입가부터 내 딜 숫자로 바꾸면 결과가 즉시 갱신됩니다"` (문구는 실무 톤 유지, 4초+).
- 데스크톱(>920px)에서만 첫 핵심 숫자 필드에 `focus()` — **모바일은 키보드 팝업 금지 원칙**(7/14 배치에서 확립, `pick()`의 matchMedia 가드 패턴 재사용).
- **판별 조건**: `location.hash`에 `t=`와 `src=seo`가 동시에 있을 때만. `#v=`/`#e=` 공유 링크·일반 방문·`src=share` 등에는 절대 발동 금지.
- **신규 이벤트 발화 금지** — 효과는 기존 `bySrc` 퍼널(seo 세션의 activate)로 측정된다.
**(b) 착지 페이지: CTA 카피 교정** — `tools/gen-pages.js` `calcPage()`:
- 계산 예시 섹션 CTA `"이 예시로 직접 열어보기 →"` → `"내 숫자로 계산해보기 →"`, sub `"예시가 채워져 있어 매입가만 바꾸면 됩니다"` 방향으로. 상단 히어로 CTA도 같은 결로 점검.
- `soonPage()`(hotel)는 CTA 형태가 다르므로(딜 탭 없음) 건드리지 않는다.

### 검증 (신규 QA 필수 — scratchpad에 Playwright 스크립트)
1. `#t=office&src=seo` 로드 → 빌더 스크롤 + `.core-g` 하이라이트 + 토스트 문구 존재 + (뷰포트 1280) 첫 핵심 필드 포커스.
2. 모바일 뷰포트(390) 같은 URL → 하이라이트는 되되 **activeElement가 input이 아님**.
3. 비발동 케이스 3종: `/`(일반), `#t=office`(seo 없음 — 기존 동작 그대로), `#v=…` 읽기 전용 링크.
4. 하이라이트·포커스가 `__mtActivate`를 **발화시키지 않는지**(프로그램적 focus는 isTrusted=false라 안전하지만, 검사로 확인).
5. 릴리스 파이프라인 전체(§1-3). 계산·엑셀 무접촉이므로 파리티는 루틴(gen-verification)으로 충분.

### 수용 기준 / 롤백
- 위 QA 전건 + smoke 36 + CI 통과. 롤백: 해당 블록 revert(표시 전용, 상태 무접촉).
- **성공 판정(2주 후)**: `bySrc.seo.activate > 0` 전환. 다음 판독 문서에 기록.

## P2. 계측 공백 2건 — 조회 도구만 (수집 무변경 · 저위험)

### P2a. 스냅샷 일별 시계열에 마찰 이벤트 추가
- `tools/modelter-ae.js`의 daily 쿼리(이벤트 IN 목록)에 `depth_change`, `fsub_open` 추가. (`validateSnap`은 필수 키만 검사 — additive 안전 확인됨.)
- 목적: 7/31 배포한 깊이 안내(B-5)의 전후 효과를 다음 판독에서 판정. 여전히 높으면 "깊이 선택을 입력 폼에서 다운로드 영역으로 이동"을 차기 후보로 상정(이번 배치에서 구현 금지 — 데이터 먼저).

### P2b. 스냅샷에 북극성(K3) 분해 추가
- `tools/modelter-patterns.js`의 `Q.actOut` 쿼리(blob11 기준 OUTPUT_EVENTS 분해)를 참고해, `modelter-ae.js` 스냅샷에 `outputsByAct: { act: n, nonact: n, unknown: n }`(창 전체 집계) 추가. blob11=''(7/26 이전·미계측)은 unknown으로 분리 — act/nonact와 합치지 말 것.
- `docs/METRICS.md` 스냅샷 스키마 절에 additive 필드 기록(스키마 버전은 2 유지, "2026-08-xx부터 outputsByAct·일별 depth_change/fsub_open 추가" 이력 1줄).

### 검증
- 로컬엔 CF 토큰이 없다(세션 이그레스 차단). **머지 후 `modelter-snapshot.yml`을 workflow_dispatch(days=7)로 실행** → 커밋된 스냅샷 pull → 새 필드 존재·형태 assert. validateSnap 통과(자동 — 실패 시 워크플로가 exit 1).
- `--fixture` 경로가 있으면 렌더 회귀도 로컬 확인(patterns.js에 기존 픽스처 메커니즘 있음).

### 수용 기준
- 새 스냅샷 JSON에 `daily[].depth_change`·`daily[].fsub_open`·`outputsByAct` 존재, 기존 소비자(modelter-report.js·patterns.js) 무회귀(실행해 에러 0).

## P3. 호텔 게이트 판정 자동화 + (도달 시) C-7 착수

### P3a. 게이트 카운터 (지금 실행)
- 게이트: **deal_want 호텔 누적 50표, 단 2026-07-14(브라우저당 1표 dedupe 배포) 이후 집계만 유효** (`docs/METRICS.md` 계측 변경 이력 참조).
- `modelter-ae.js` 스냅샷 또는 `modelter-patterns.js` md 요약에 절대 기간 쿼리 추가: `WHERE blob1='deal_want' AND timestamp > toDateTime('2026-07-14 00:00:00')` GROUP BY blob2 → `dealWantGate: {hotel: n, retail: n, …, since: '2026-07-14'}`. 매일 아침 Actions Summary에서 "호텔 N/50"이 보이게.
- 주의: AE 데이터 보존 기간(약 90일)을 넘기면 이 절대 기간 쿼리가 과소집계된다 — 10월 초 이후엔 스냅샷 누적 방식으로 전환 필요하다는 주석을 코드에 남길 것.

### P3b. C-7 호텔 딜 구현 (게이트 50 도달 확인 후에만 · 새 세션 권장)
- **설계 문서 `docs/vnext/hotel-deal-design.md`(285줄)가 단일 진실** — 엔진은 calcModel의 NOI 생성 모듈만 교체(ADR×객실수×OCC→부대매출→GOP→수수료·FF&E→NOI), 마스터리스/위탁운영(HMC) 토글, 파리티 8지표.
- 원자적 1배치(부분 배포 금지): 엔진 → 폼(QUICK_FIELDS·핵심 입력 그룹 포함) → 예시 딜(손계산 검증값: NOI 4,553백만·DSCR 2.30x·EM 1.45x) → 엑셀(04_Operating_ProForma 행 교체, NOI 앵커 행 유지) → **파리티 하네스 등록**(gen-xlsx.js·check.py에 hotel — 현재 0건) → 민감도(ADR×OCC 5×5 기본) → 자동 판정 → `DEAL_SOON`에서 hotel 제거·`DEALS` 편입 → `/calc/hotel`을 soonPage에서 실딜 calcPage로 전환 → CI 마커("실딜 4종" 카운트 등) 갱신 → smoke 추가 → METRICS 확인(deal_select blob2='hotel' 자연 편입, 신규 이벤트 0).
- 이 문서 범위에서는 **P3a까지만 실행**하고, 50 도달이 확인되면 C-7을 별도 배치로 연다.

## P4. 코드 외 — 사용자 액션 (실행 세션은 안내만)

1. **서치콘솔·빙 웹마스터 검색어 리포트 확인** — 등록 3주 경과, 데이터가 보일 시점. 어떤 검색어로 노출·클릭되는지가 다음 착지면 투자(P1 이후)의 나침반.
2. **네이버 블로그 글(A-3)** — 네이버 계열 31세션·최고 활성화율 채널. 초안은 실행 세션이 작성해 전달 가능(게시는 사용자). 링크는 `https://modelter.com/#src=sns`.

## 5. 실행 순서·배치 구성

1. **PR ①**: P1 (앱 + gen-pages 카피) — 릴리스 파이프라인 전체
2. **PR ②**: P2a+P2b+P3a (tools+docs만, 앱 무접촉) — 머지 후 snapshot dispatch로 라이브 검증
3. P3b는 게이트 도달 시 별도 배치
4. 완료 보고에 반드시 포함: 각 QA 결과 수치, 라이브 MT_BUILD, **다음 판독일(약 2주 후)과 그때 볼 지표**(seo activate>0 · depth_change 추이 · outputsByAct 기준선 · 호텔 게이트 N/50)

## 6. 하지 말 것 (이번 배치)

- 전환(활성화) 실험 추가 — 이미 안정권, 병목은 트래픽
- 공유·회수 루프 추가 투자 — 첫 신호는 관찰만
- 모바일 인앱(링크드인) 최적화 — 구조적 저품질 확정
- 신규 계측 이벤트 — 이번 배치는 0건으로 설계됨
- 렌트롤 TI/LC, 메자닌 실계산 — 게이트 미달 유지
