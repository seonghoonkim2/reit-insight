# 모델터 스모크 QA — 실제 브라우저 회귀 검사

`smoke.js` 하나가 배포 파일(`dart-search/web/modelter/`)을 내장 http 서버로 띄우고
Chromium(Playwright)으로 핵심 사용자 경로 49가지를 검사합니다.

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

## 다운로드 서식과 복원 링크

`node tools/qa/excel-format.js`는 20개 조건에서 실제 생성한 XLSX를 검사합니다.
긴 임차인명·자산명·줄바꿈이 많은 텍스트의 행높이는 409pt 이하로 제한하고,
원문과 전체 내용 확인 안내가 보존되는지 확인합니다. 복원 URL이 너무 길면
가정이 없는 링크로 대체하지 않고 원본 파일 복원 안내를 표시해야 합니다.
정상 링크, 링크 제외 선택, 임차인명 마스킹과 숨김 복원 데이터도 함께 검사합니다.
엑셀 재저장 파일의 복원은 지원 범위에 포함하지 않습니다.
