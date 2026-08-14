# AGENTS.md — 모델터(modelter.com) 작업 규칙

이 저장소에서 코드를 고치는 에이전트가 **반드시** 지켜야 하는 것들입니다.
사람 안내는 `CLAUDE.md`, 전략·판독 기록은 `docs/STRATEGY.md`, 계측 사전은 `docs/METRICS.md`.

## 이게 뭐냐

한국 상업용 부동산(CRE) 재무모델 빌더. 숫자를 넣으면 IRR·DSCR이 화면에 바로 나오고,
**수식이 살아있는 Excel**을 브라우저에서 즉시 생성해 내려받습니다. 무료·회원가입 없음·1인 운영.

- 앱 전체가 **단일 HTML 파일**: `dart-search/web/modelter/index.html` (~900KB)
- **빌드 과정 없음.** 프레임워크·번들러·의존성 없음. 파일을 고치면 그게 배포본입니다
- master 푸시 → Cloudflare Worker가 modelter.com에 자동 배포

## 절대 어기면 안 되는 것 (완화 금지)

1. **딜 데이터 서버 전송 금지.** `/e` 로 보내는 건 이벤트명·딜 유형·기능 플래그·기기·유입 호스트뿐.
   **수치·임차인 실명·개인정보는 절대 금지.** 새 필드를 추가하려면 `docs/METRICS.md` 표와 `/trust` 페이지를 함께 고쳐야 하고, CI가 그 일치를 강제합니다.
2. **화면 수치 = 다운로드 엑셀 (파리티).** 화면에만 있고 엑셀에 없는 계산을 만들지 마세요.
   계산 엔진이나 엑셀 생성기를 건드렸으면 **반드시 파리티 2단계를 다시 돌립니다**(아래).
3. **단일 파일 유지.** 빌드 도구·npm 의존성·외부 CDN 도입 금지. 성능 예산 gzip < 300KB (현재 ~271KB).
4. **테스트 훅 배포 금지.** `grep -c "__mtCalc" dart-search/web/modelter/index.html` 이 **0** 이어야 합니다.
5. **What's new 라벨은 v3 고정.** 내용만 현행화하고 버전 번호는 올리지 않습니다.
6. **"투자 권유가 아닌 정보 제공 목적"** 고지 유지. 숫자 예시는 샘플이며 실제 시세 아님.
7. **렌트롤 원본 저장 금지**, 임차인 실명 기본 비저장, 공유 링크 자동 마스킹.

## 매 변경마다 돌리는 순서 (이 순서가 중요)

```bash
# 1) 빌드 스탬프 (파일 내용 해시 → MT_BUILD)
node tools/stamp-build.js

# 2) 파리티 공표 페이지 재생성 — 4딜 실패 시 exit 1 로 배포를 막습니다
node tools/gen-verification.js

# 3) 검색 착지면 38개 재생성 (sitemap lastmod 가 build.json 을 읽으므로 1) 뒤에 와야 함)
node tools/gen-pages.js
node tools/gen-pages.js --check      # 최신 여부 확인

# 4) 마커 + 헤드리스 행동 검사 (158건)
node tools/modelter-ci-check.js

# 5) 엔진 경제 단조성 불변식 17건 (의존성 없음, ~2초)
node tools/qa/invariants.js

# 6) 테스트 훅 유출 확인 → 반드시 0
grep -c "__mtCalc" dart-search/web/modelter/index.html

# 7) 실제 브라우저 스모크 49건
node tools/qa/smoke.js
```

계산·엑셀 로직을 고쳤다면 **추가로 파리티 전수**:

```bash
for d in office logistics dev refi \
         office_nopref office_nonpass office_hold7 \
         office_nodebt office_vac100 office_mezz office_mezzpik; do
  node tools/parity/gen-xlsx.js "$d"     # 헤드리스로 앱 실행 → 엑셀 바이트 + 엔진 기대값 덤프
  python3 tools/parity/check.py "$d"     # 엑셀을 파이썬 수식 엔진으로 재계산해 대조
done
```

전부 `PARITY OK` 여야 합니다. 준비물: `pip install formulas openpyxl`, Playwright + Chromium.

## 파리티가 실제로 검사하는 것

수치 대조만으로는 부족하다는 걸 실제 버그로 확인했습니다. **전 딜 공통**으로 이 3가지도 봅니다.

| 검사 | 왜 |
|---|---|
| 숫자 셀에 비유한값 없음 | `<v>null</v>`·NaN 이 들어가면 엑셀이 "손상된 파일"로 거부 |
| 엑셀 오류 토큰 0 | `#DIV/0!`·`#NUM!` 이 표지 시트까지 전파된 전례 2건 |
| 검증 시트 종합 판정 PASS | 파일이 스스로를 FAIL 이라 말하면 안 됨 (퇴화 변형 제외) |

경계 변형은 상시 게이트입니다 — `office_nodebt`(무차입, 커버리지 분모 0), `office_vac100`(공실 100%, IRR 미정의), `office_mezz`/`office_mezzpik`(중순위 현금이자/PIK).

## 코드 구조 (index.html 안에서 찾는 법)

단일 파일이라 `grep -n` 으로 찾습니다. 주요 앵커:

| 무엇 | 찾는 법 |
|---|---|
| 딜 정의·입력 필드 | `const DEALS=` |
| 자본구조 트랜치 | `const TRANCHES=` |
| 엑셀 템플릿 (JSON 13시트) | `const XLTMPL=` |
| 보유기간별 엑셀 재생성 | `function holdTemplate` |
| **핵심 계산 엔진** | `function calcModel` |
| 렌트롤 기반 엔진 | `function leaseModelV2` |
| 화면 결과 조립 | `function _newSimDcf` |
| 가정 시트 ↔ 입력 매핑 | `function assumOverrides` |
| 분양(PF) 엔진 | `function simDevResi` |
| 리파이 엔진 | `function refiSchedule` |
| 엑셀 직렬화기 | `function buildXlsx` |
| 입력 폼 렌더 | `function renderForm` |
| 계측 | `window.mtTrack` |

**엔진이 2경로**라는 점에 주의: 가정 기반(`calcModel`)과 렌트롤 기반(`leaseModelV2`)이 같은 규칙을 각각 구현합니다.
계산 규칙을 바꾸면 **양쪽 다** 고쳐야 하고, 엑셀 템플릿(`XLTMPL`)과 동적 재생성(`holdTemplate`) 양쪽도 맞춰야 합니다.

> 함정: `holdTemplate` 이 보유기간에 맞춰 수식을 **다시 씁니다**. 템플릿 상수만 고치면 그게 덮어써져서 출고분에 반영되지 않습니다. 실제로 이 함정으로 버그가 난 적 있습니다.

## 새 계산 항목을 추가할 때 (중순위 사례가 표준 절차)

1. `XLTMPL` 의 `01_Assumptions` 에 가정 행 추가 (**기본값 0** — 켜기 전엔 기존 딜 숫자가 안 움직이게)
2. `assumOverrides()` 에 화면 입력 → 가정 셀 매핑
3. `calcModel` **과** `leaseModelV2` 양쪽에 계산 추가
4. 관련 엑셀 시트 전부 (`05_Debt_Schedule`·`06_Tax_Disposition`·`07_Equity_Waterfall`·`02_Sources_Uses`·`03_Capital_Stack`·`00_Cover`·`11_Validation_Checks`)
5. `holdTemplate` 의 동적 재생성 경로에도 같은 수식
6. 화면 표시 (`_trancheBlock` 등)
7. **파리티 변형 추가** — 새 항목이 실제로 계산에 들어갔는지 *구조로* 검사 (수치만 보면 "장식으로 되돌아가는" 회귀를 못 잡습니다)
8. CI 마커 추가

## 하지 말 것

- 계산 로직을 화면과 엑셀에 **따로** 구현하기 (파리티 위반)
- 사용자에게 물어보지 않고 UI 색을 늘리기 — 색은 **경고/오류·CTA·선택 상태**에만
- 도착 시 자동 팝업 추가 (2026-08-11에 전부 제거했습니다)
- 수요 증거 없이 큰 기능 만들기 — 준비 중 딜은 "가짜 문"(클릭 수집)으로 수요를 먼저 잽니다
- 사전 판정 기준 없이 기능 추가 — 실패했는지조차 알 수 없게 됩니다

## 30일 실사용 로그 (판단 근거)

`docs/gpt-brief/02_사용-데이터.md` 에 전문. 요약:

- 방문 1,083 → 활성화 124 (11.4%) → 결과 도달 123 → 산출물 335
- 검색 유입이 직접 방문보다 2~4배 잘 전환 (구글 20% · 빙 41% · 네이버 21% vs 직접 9.3%)
- **병목은 트래픽** (주당 200~320)
- 기능 158개 중 30일 한 자릿수인 게 15개 이상 → **신규 기능 투자 동결** 중

## 커밋·배포

- 커밋 메시지는 **한국어**, 변경 의도가 드러나게
- master는 PR로만 변경하고, `Modelter CI`의 검증·11조합 파리티·브라우저 스모크를 모두 통과한 뒤 머지
- master 머지 = Cloudflare 즉시 배포. 계기판 스냅샷 자동 커밋만 저장소 규칙의 명시적 예외
- 배포 후 라이브 스탬프 확인: `curl -s https://modelter.com/ | grep -o "MT_BUILD='[^']*'"`
