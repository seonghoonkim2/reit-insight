# 모델터 스모크 QA — 실제 브라우저 회귀 검사

`smoke.js` 하나가 배포 파일(`dart-search/web/modelter/`)을 내장 http 서버로 띄우고
Chromium(Playwright)으로 핵심 사용자 경로를 검사합니다.

```bash
node tools/qa/smoke.js
```

## 검사 범위

1. **4개 딜 회귀** — 예시 → 결과 + 자동 판정, 공유 링크 인코딩 왕복, 한 줄 보고, KPI 용어 ? 링크, IC 원페이저 판정
2. **빈 상태** — 매입가/연면적 삭제 시 침묵 기본값 없이 빈 상태 + 누락 라벨, 예시 복원
3. **딥링크** — `#t=refi` 탭 전환 + 온보딩·What's new 억제
4. **모바일(390px)** — 가로 스크롤 0, ⚡핵심만 위저드 전체 플로우(억조 환산·완료·폼 동기화)
5. **성능 가드** — 개발·PF 키 입력당 재계산 < 500ms (민감도 셀에서 simDevResi를 다시 부르는 회귀 방지)
6. **What's new** — 도착 시 자동 팝업 없음 + 배너 진입 + v3 라벨 고정
7. **배포 안전** — `__mtCalc` 테스트 훅 부재, guide.html·첫 딜 OG 이미지 존재
8. **실제 엑셀 다운로드** — AI 깊이를 바꿔도 작업 시트 수 안내가 유지되고, 다운로드 버튼·설명·완료 토스트와 실제 파일의 6개/7개 표시 시트가 일치하는지 확인

로딩 성능은 현재 진입 경로 그대로 측정하며, 저가 모바일 근사에서 첫 결과 5초 예산을 초과하면 실패합니다.

```bash
node tools/qa/perf-load.js
```

## 준비물

- Node 18+, `playwright` 모듈(전역 설치 가능), Chromium
  - 브라우저 경로는 `PLAYWRIGHT_BROWSERS_PATH` 아래 chromium을 자동 탐색하며,
    다르면 `CHROME_BIN=/path/to/chrome node tools/qa/smoke.js`로 지정

## 순서 (배포 전 체크리스트)

```bash
node tools/modelter-ci-check.js      # 1) 마커 + 헤드리스 행동 검사
node tools/qa/smoke.js               # 2) 실제 브라우저 스모크 (이 폴더)
# 계산·엑셀 로직을 바꿨다면:
node tools/parity/gen-xlsx.js dev && python3 tools/parity/check.py dev   # 3) 파리티
```

## 작업용 엑셀 계산 회귀 검사

화면과 엑셀이 같은 오류를 공유하는 경우는 파리티만으로 잡히지 않습니다.
아래 검사는 실제 생성한 오피스 엑셀의 가정을 메모리에서 바꿔 재계산하고,
상환 완료·현금 보존·우선주 미사용 시 보통주와 총자기자본 일치 여부를 확인합니다.
민감도 표는 해당 임대료와 Exit Cap을 본 모델에 직접 입력한 결과와 대조합니다.
검증 시트에는 잘못된 잔액·배분을 메모리에서 주입해 개별 검사와 종합 판정이
실제로 FAIL로 바뀌는지도 확인합니다. 원본 파일은 저장하거나 수정하지 않습니다.

```bash
node tools/qa/financial-engine.js
node tools/parity/gen-xlsx.js office
python3 tools/parity/financial-calculations.py
# 다른 검토 파일/JSON 증거 저장이 필요한 경우:
python3 tools/parity/financial-calculations.py --xlsx /path/to/office.xlsx --report /tmp/financial-checks.json
```

준비물은 기존 파리티와 같은 `formulas`, `openpyxl`입니다. CI의 파리티 작업에서
11조합 검사 뒤에 실행하며, 계산식 오류뿐 아니라 경제적 항등식 위반도 실패합니다.
`financial-engine.js`는 별도 의존성 없이 가정 기반·렌트롤 기반 엔진을 모두 확인합니다.
매입가 1,000·대출 300·NOI 70인 단순 예시의 현금흐름을 독립적인 금액과 대조합니다.

## 렌트롤 입력 변경 회귀 검사

```bash
node tools/parity/gen-lease-live.js
python3 tools/parity/lease-live.py --report /tmp/lease-live-checks.json
```

실제 다운로드 생성 경로로 3~10년, 2·20·100개 계약의 파일을 만들고 수식을
재계산합니다. 원본 파일의 계약 임대료·면적·보증금·렌트프리·만기·상승률과
시장 임대료·성장률·재계약률·흡수기간을 메모리에서 수정해 동일 조건의 화면
결과와 대조합니다. 엑셀 파일은 저장하거나 재작성하지 않습니다.

시장 성장률 0, 빈 만기와 상승률 상속, 2.01년 만기, 25개월 렌트프리,
재계약률 0%·100%를 포함합니다. 성장과 만기가 없는 계약, 25개월 렌트프리,
소수 만기의 연도 경계는 별도 연간 현금원장과도 대조합니다. 입력을 바꾼 뒤
임대수입을 과거 값으로 고정시키는 오류를 고의 주입해 검사가 실패를 잡는지 확인합니다.

특정 조건의 원인을 조사할 때는 `--cases fractional_hold5`처럼 실행할 수 있습니다.
`--dir`로 다른 생성 폴더를 지정할 수 있으며 준비물은 기존 파리티 검사와 같습니다.

## 다운로드 서식과 복원 링크

`node tools/qa/excel-format.js`는 20개 조건에서 실제 생성한 XLSX를 검사합니다.
긴 임차인명·자산명·줄바꿈이 많은 텍스트의 행높이는 409pt 이하로 제한하고,
원문과 전체 내용 확인 안내가 보존되는지 확인합니다. 복원 URL이 너무 길면
가정이 없는 링크로 대체하지 않고 원본 파일 복원 안내를 표시해야 합니다.
정상 링크, 링크 제외 선택, 임차인명 마스킹과 숨김 복원 데이터도 함께 검사합니다.
엑셀 재저장 파일의 복원은 지원 범위에 포함하지 않습니다.

## 보유기간 편집과 개발 일정 입력

```bash
node tools/qa/editable-hold.js
python3 tools/parity/editable-hold.py
node tools/qa/input-contract.js
python3 tools/parity/input-contract.py
CHROME_BIN=/path/to/chrome node tools/qa/editable-browser.js
node tools/qa/template-compaction.js
```

`editable-hold`는 5년으로 받은 매입 엑셀의 `A&R!C79`만 바꿔 3·5·7·10년의
매각·대출·지분 현금흐름·세후 수익률·민감도를 독립 재계산합니다. 오피스·물류,
직접 NOI, 원리금균등, 중순위 PIK, 무차입을 포함하며 종료 뒤 현금흐름은 공란이어야 합니다.
3~10년 범위를 벗어난 값, 소수, 문자를 붙여넣으면 결과를 숨기고 검증에 실패해야 합니다.
임차계약을 모델에 반영한 렌트롤 파일은 기간 변경 후 웹에서 다시 받아야 합니다.
해당 파일의 고정 기간을 덮어쓰면 결과를 숨기고 재다운로드 안내와 검증 실패를
표시해야 합니다. 원래 기간으로 되돌리면 계산이 복구되는지도 확인합니다.

`input-contract`는 개발 일정의 정수·범위 검증과 준공 후 분양의 월별 원장을 확인합니다.
`editable-browser`는 Chromium에서 실제 입력·blur·다운로드를 실행해 잘못된 값이
정상 숫자로 바뀌지 않는지 검사합니다. `EDITABLE_BROWSER_OUT` 환경변수를 지정하면
물류 매입·공동주택 개발·리파이낸싱 다운로드 파일도 해당 폴더에 저장합니다.

`template-compaction`은 압축 저장한 기본 템플릿을 복원한 뒤 13개 내부 시트·1,620개
셀 전체의 수식·스타일·순서가 기존 템플릿과 같은지 확인합니다. 원본 HTML이 있으면
`--baseline /path/to/index.html`로 해시 외에 원본 객체도 직접 비교할 수 있습니다.
