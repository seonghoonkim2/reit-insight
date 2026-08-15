# 모델터 계측 사전 (METRICS)

계측의 **단일 진실**. 이벤트 이름·의미·퍼널 정의·분모 규칙·스냅샷 스키마를 여기서 정하고,
코드(`index.html`의 track/mtTrack)와 이 문서가 어긋나면 CI(`tools/modelter-ci-check.js`)가 배포를 차단한다.

- 원칙: **additive만.** 판독 창(≈2026-07-17~24) 전에는 session/activate/computed의 발화 지점·dedupe 코드 변경 금지.
- 새 이벤트 추가 절차: ① `index.html`에 발화 추가 → ② 이 문서 이벤트 표에 1행 추가 → ③ 산출물이면 `tools/modelter-labels.js`의 `OUTPUT_EVENTS`에도 추가 → ④ `/e` 수집 **필드**가 늘면 `worker.js`+`trust.html`(1:1 CI 게이트) 동기. 수치·임차인명·PII는 어떤 필드에도 금지.

## 1. 퍼널 (세션당 1회, sessionStorage/플래그 dedupe)

| 단계 | 정의 | 발화 |
|---|---|---|
| `session` | 방문 — 페이지 로드 시 1회 | 부트 시 `track('session')` |
| `activate` | 자기 숫자 첫 직접 입력(신뢰 입력 경로 + 조정 바 ± 포함) | `__mtActivate()` — `actFired` 플래그로 1회 |
| `computed` | activate 이후 자기 딜 결과 도달 | `__mtComputed()` — activate 전이면 무시 |
| output | 산출물 — 아래 표의 **산출물 12종 합산**(개별 이벤트명 `output`은 없음) | 각 산출물 이벤트 |

활성화율 = activate ÷ session. 산출물 전환율 = output ÷ session. `output > computed`는 예시값 그대로 내보내는 "구경꾼" 패턴(정상 — 버그 아님).

## 2. 분모 규칙 (2026-07-10 이후)

- **봇 제외가 기본.** worker가 UA 정규식+클라이언트 `wd`(navigator.webdriver) 신호로 `bot`(AE blob10)을 태깅하고, `modelter-ae.js`·`modelter-patterns.js`는 기본으로 `blob10 != '1'` 필터를 건다(`--include-bots`로 우회). 서버는 태깅만 — 원본 보존.
- **07-10 이전 데이터는 태깅이 없어 봇 포함 분모**(blob10='' → 필터에 걸리지 않고 포함됨). 전후 비교 시 주의.
- **운영자 QA 모드**: `modelter.com/#qa=on`을 연 기기는 `track()`이 조기 반환해 통계에서 제외(`#qa=off` 해제). 배포 확인·시연 전 필수.

## 3. /e 수집 필드 · AE 스키마

수집 필드의 사용자向 설명은 `/trust`(CI가 worker `rec`와 1:1 강제). AE(dataset `Modelter`) 매핑:

| AE | 필드 | 내용 |
|---|---|---|
| blob1 (index) | ev | 이벤트명 |
| blob2 | deal | 딜 유형(office·logistics·dev·refi). `hotel`·`retail`·`rental`·`datacenter`는 deal_want 투표값. ⚠ `reit`는 2026-07-06 제거된 옛 '리츠·펀드 운용' 탭의 잔상 — 07-06 이전 구간을 포함하는 집계 창에만 나타나며 이후 신규 발화 없음 |
| blob3 | depth | 입력 깊이(quick·standard·full) |
| blob4 | dev | 기기(desktop·mobile) |
| blob5 | ref | 유입 호스트 — 클라이언트 `dr`(진입 document.referrer 호스트) 우선, 없으면 비콘 referer |
| blob6 | cc | 국가 코드 |
| blob7 | feats | 활성 기능 플래그(쉼표 결합) |
| blob8 | axis | 민감도 축(growth·rate) |
| blob9 | src | 채널 태그(영문·숫자·_ 8자 화이트리스트) |
| blob10 | bot | 자동화 트래픽(0/1) — §2 분모 규칙 |
| double1 | rr | 렌트롤 사용(0/1) |
| double2 | featN | 활성 기능 수 |

## 4. 이벤트 사전

코드가 발화하는 전체 이벤트(track/mtTrack 리터럴)와 아래 표는 CI가 **정확 일치**(누락·유령 모두 차단)를 강제한다.
"산출물○" = `OUTPUT_EVENTS`(퍼널 output 합산 대상).

<!-- EVENTS:BEGIN -->

| 이벤트 | 의미 | 산출물 |
|---|---|---|
| `session` | 방문(로드 1회) | |
| `activate` | 자기 숫자 첫 직접 입력(세션 1회) | |
| `computed` | activate 후 자기 딜 결과 도달(세션 1회) | |
| `sample_start` | 기본 예시에서 ‘내 딜 숫자 넣기’를 누른 세션(세션 1회) | |
| `first_number_5m` | 페이지 진입 후 첫 자기 딜 결과가 5분 이내 | |
| `first_number_15m` | 페이지 진입 후 첫 자기 딜 결과가 5분 초과~15분 이내 | |
| `first_number_30m` | 페이지 진입 후 첫 자기 딜 결과가 15분 초과~30분 이내 | |
| `first_number_slow` | 페이지 진입 후 첫 자기 딜 결과가 30분 초과 | |
| `landing` | src= 채널 태그를 달고 들어온 착지 1건 | |
| `xlsx_download` | 수식 살아있는 엑셀 다운로드 | ○ |
| `teaser` | 티저(요약) 복사 | ○ |
| `ic_ppt` | IC 멀티슬라이드 PPT 다운로드 | ○ |
| `share_link` | 공유 링크 생성·복사(#v=/#e=) | ○ |
| `handoff_open` | 결과 또는 도구에서 팀 1차 검토 공유 메뉴를 연 세션(세션당 1회) | |
| `memo_copy` | 검토 메모 초안 복사 | ○ |
| `png_card` | 결과 요약 카드 PNG 저장 | ○ |
| `pipeline_copy` | 주간 파이프라인 보고 복사 | ○ |
| `inquiry_copy` | 검토 질의서 복사 | ○ |
| `slot_save` | 보관함(슬롯) 저장 | ○ |
| `prompt_copy` | AI 프롬프트 복사 | ○ |
| `pdf_export` | IC 원페이저 인쇄·PDF | ○ |
| `sample_download` | 샘플 엑셀 다운로드 | ○ |
| `deal_select` | 딜 유형 탭 선택 | |
| `deal_want` | 준비 중 딜 타일 클릭(수요 신호 — 유형명만) | |
| `depth_change` | 입력 깊이 변경(quick·standard·full) | |
| `example_fill` | 예시 딜 채우기 | |
| `fill_std` | 표준값 채우기 | |
| `sample_deal` | 예시 딜 카드 선택(key=딜 키) | |
| `wizard` | 모바일 빠른 입력 위저드(open=열림·done=완료) | |
| `fsub_open` | 세부 항목 접기(fsub) 펼침 — 복잡도 수요 신호 | |
| `rentroll_upload` | 렌트롤 붙여넣기 인식(내용 비저장) | |
| `im_quick_open` | IM 자동 인식(무키) 열기 | |
| `im_quick` | IM 자동 인식 적용 | |
| `im_open` | IM AI(BYOK) 추출 열기 | |
| `im_extract` | IM AI 추출 완료(n=인식 필드 수) | |
| `xlsx_restore` | 엑셀 라운드트립 복원 | |
| `mydef_save` | 내 기본값 저장 | |
| `mydef_apply` | 내 기본값 적용 | |
| `house_set` | 하우스 기준 설정 | |
| `house_apply` | 하우스 기준 적용(#h= 수신 포함) | |
| `house_share` | 하우스 기준 배포 링크 생성 | |
| `term_help` | KPI 라벨 옆 용어 도움말(?) 클릭 → /guide 앵커 이동 | |
| `sens_axis` | 민감도 축 전환(axis=growth·rate) | |
| `solver` | 손익분기 솔버 실행 | |
| `method` | 방법론(산식) 모달 열기 | |
| `dev_view` | 시행↔대주 관점 토글(v) | |
| `compare` | 딜 비교 열기 | |
| `cmp_copy` | 비교표 복사 | |
| `adj_open` | 즉석 조정 바 열기(수동만 — 자동 오픈은 미집계) | |
| `check_open` | 가정 적정성 점검표 열기 | |
| `im_checklist_open` | IM 체크리스트 열기 | |
| `im_checklist` | IM 체크리스트 복사 | |
| `src_tag` | src 태그 달린 읽기 전용 공유 뷰 열람(뷰당 1회) | |
| `recover_cta` | 읽기 전용 착지의 "내 딜로 계속" CTA 클릭(from=위치) | |
| `qr_open` | QR 이어가기로 열림 | |
| `rr_mask` | 공유 시 임차인명 자동 마스킹 동작 | |
| `ws_open` | 딜 보관함 패널 열기 | |
| `ws_save` | 딜로 저장(버전 기록) | |
| `ws_status` | 딜 상태 태그 변경 | |
| `ws_diff` | 두 버전 가정 diff | |
| `slot_delete` | 보관함 삭제 | |
| `coach_ok` | 코치마크 확인 | |
| `tip_next` | 산출물 다음 단계 팁 클릭 | |
| `ex_ack` | 예시값 잔존 경고 확인 | |
| `nudge_save` | 저장 넛지 노출(computed 25초 후 1회) | |

<!-- EVENTS:END -->

앱이 발화하지 않는데 데이터에 존재하는 이름: `ci_probe_live`(운영자 수집 경로 점검용 수동 비콘 — 앱 코드에 없음, 소량이라 판독 영향 없음). 구 클라이언트 캐시의 `reit` 딜 잔존도 같은 부류(자연 소멸 대기).

## 5. 스냅샷 스키마 (`data/ae-snapshots/<날짜>.json`)

`node tools/modelter-ae.js --snapshot`이 쓰기 전 검증(`validateSnap`)을 통과해야 저장된다(실패 시 exit 1).

- **v2** (2026-07-10~): `schema: 2` + `botExcluded`(이 스냅샷의 분모가 봇 제외인지) 필드 추가. 필수 키: `endDate`(YYYY-MM-DD)·`week`(YYYY-Www)·`days`·`generatedAt`·`funnel{session,activate,computed,output 숫자}`·`events`(비어 있지 않음). 그 외 `deals`·`device`·`ref`·`feats`·`depth`·`src`·`attribution`·`daily`.
- **v1** (schema 필드 부재 = 2026-07-09.json): 하위호환으로 그대로 읽는다 — **기존 스냅샷 원자료는 수정 금지.**
- **additive 필드 (2026-08-10~, schema는 2 유지 — 기존 소비자 무영향)**:
  - `outputsByAct: {act, nonact, unknown, since:'2026-07-26'}` — 북극성 K3. 산출물이 **자기 숫자 세션**(blob11=1)에서 나왔는지. `unknown`은 act 계측 개시(07-26) 이전 구간이므로 **act/nonact와 합산 금지**.
  - `teamHandoffByAct: {since:'2026-08-15', decisionDate:'2026-08-29', window:{session,activate}, handoff_open:{act,nonact,unknown}, share_link:{act,nonact,unknown}, firstNumber:{since,until,first_number_5m,first_number_15m,first_number_30m,first_number_slow}}` — 첫 숫자의 팀 전달·속도 선행지표. 팀 전달은 08-15 08:03 KST~08-29 08:03 KST, 첫 숫자 속도는 실제 계측 배포 완료 시각인 08-15 10:18:30 KST~08-29 10:18:30 KST 직전의 **각각 고정된 14일 창**만 집계한다. 두 쿼리는 `--days`의 최근 N일 조건을 적용하지 않는다. 사전 기준은 실사용 `handoff_open` 10건·`share_link` 5건·동일 창 활성화율 10% 이상, 속도 표본 n≥20일 때 15분 이내 70% 이상이다. 종료 전에는 채택·철회 판정을 내리지 않는다. 이전 `share_link`는 메뉴 열기만 한 건이 섞여 있어 합산 금지.
  - `sampleStartWindow: {since,until,session,sample_start,activate,computed}` — 예시→내 딜 첫 입력 CTA의 실제 프로덕션 배포 완료 시각(08-15 11:23:17 KST)부터 08-29 11:23:17 KST 직전까지의 고정 14일 진단 창. `--days` 조건을 적용하지 않는다. CTA를 건너뛰고 직접 입력할 수 있어 엄격한 포함 퍼널이나 성공 판정으로 쓰지 않고, CTA 발견과 실제 입력 사이 병목만 분리한다.
  - `dealWantGate: {<딜>:표수, since:'2026-07-14', target:50}` — 커버리지 착수 게이트. 조회 창(`--days`)과 무관한 **절대 기간 누적**(dedupe 배포일 이후). ⚠ AE 보존기간(약 90일) 초과 시 과소집계 — 2026-10 이후 커밋된 스냅샷 누적 합산으로 전환 필요.
  - 참고: `daily[]`에는 `depth_change`·`fsub_open`을 포함한 **전 이벤트**가 이미 들어 있다(별도 추가 불필요).

### 계측 변경 이력 (판독 시 소급 참고)

| 날짜 | 변경 | 판독 영향 |
|---|---|---|
| ~2026-07-07 | 계측 확장 배포 전 | daily에서 activate=0은 "없음"이 아니라 **미계측** |
| 2026-07-09 | activate 미계측 6경로 수정(리파이 텀시트·분양 그리드 등) | 이전 활성화율(4.3%)은 과소 — 이후와 비교 금지 |
| 2026-07-10 | `dr`(진짜 유입원)·`bot`(blob10)·사용성 v3 이벤트(fsub_open 등) 추가, 조회 기본 분모=봇 제외 | ref 채널 분해·봇 제외 분모는 이날 이후 데이터만 유효 |
| 2026-07-14 | `deal_want` 브라우저당 유형별 1회 dedupe(localStorage) | 이전 deal_want는 **클릭 수**(중복 포함), 이후는 브라우저 단위 표 수 — 커버리지 게이트(단일 유형 50건)는 07-14 이후 집계 기준으로 판정 |
| 2026-07-14 | src 채널 `pdf`(인쇄 요약 QR)·`sns`(직접 게시 링크) 추가, 엑셀 회수 링크를 01_Assumptions 시트에도 삽입 | 회수 착지(K4) 채널 분해에 pdf·sns 등장 가능 — 퍼널 4이벤트 발화는 무변경 |
| 2026-08-15 | `handoff_open` 추가, 공유 메뉴 열기를 `share_link`에서 분리 | 이전 `share_link`에는 메뉴 열기만 한 건도 포함됨. 이후부터 실제 링크 생성·복사만 산출물로 세며 전후 절대량 직접 비교 금지 |
| 2026-08-15 | src 채널 `howto` 추가 | IM 직후 첫 숫자 활용 가이드의 계산기 CTA 유입·활성화·팀 전달을 별도 판독 |
| 2026-08-15 | src 채널 `imcheck` 추가 | IM 검토 체크리스트에서 딜별 계산기로 넘어온 세션을 기존 검색 착지(`seo`)와 분리. 채널명 외 값은 미전송 |
| 2026-08-15 | src 채널 `dscr` 추가 | DSCR 용어 착지에서 계산기로 넘어온 세션의 활성화·산출물을 기존 검색 착지(`seo`)와 분리. 채널명 외 값은 미전송 |
| 2026-08-15 | 첫 숫자 속도 4구간 이벤트 추가 | `computed` 세션당 정확히 1개만 발화. 정확한 시간은 미전송. n≥20일 때 15분 이내 70% 이상을 첫 숫자 속도 기준으로 판독 |
| 2026-08-15 | `sample_start` 추가 | 기본 예시를 구경한 방문이 실제 첫 입력 의도를 보였는지 `session → sample_start → activate`로 분리 판독. 이벤트명 외 값은 미전송 |
