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
7. **배포 안전** — `__mtCalc` 테스트 훅 부재, guide.html·og.png 존재

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
