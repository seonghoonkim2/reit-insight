# 모델터 파리티 하네스 — "화면 = 다운로드 엑셀" 검증

모델터의 핵심 약속은 **화면 결과와 다운로드 엑셀이 같은 계산식**이라는 것입니다.
이 폴더의 두 스크립트가 그 약속을 기계적으로 검증합니다.

## 언제 돌리나

- `dart-search/web/modelter/index.html`의 **계산 엔진**(simDcf/calcModel, devResiCompute, refiSchedule 등)을 고쳤을 때
- **엑셀 생성기**(XLTMPL/holdTemplate, devTemplate, refiTemplate, assumOverrides)를 고쳤을 때
- 릴리스 전 최종 점검

CI(`tools/modelter-ci-check.js`)는 구조·행동 검사까지만 하므로,
숫자 일치는 이 하네스가 최종 보증합니다.

## 사용법 (2단계)

```bash
# 1) 생성 — 배포 index.html을 헤드리스로 실행해 엑셀 + 엔진 기대값 덤프
node tools/parity/gen-xlsx.js office      # 오피스 13시트
node tools/parity/gen-xlsx.js logistics   # 물류 13시트
node tools/parity/gen-xlsx.js dev         # 분양수지 6시트
node tools/parity/gen-xlsx.js refi        # 리파이낸싱 4시트 (생성·수식 존재 확인용)

# 2) 검증 — 엑셀을 python 수식 엔진으로 재계산해 화면 값과 비교
python3 tools/parity/check.py office
python3 tools/parity/check.py logistics
python3 tools/parity/check.py dev
```

모두 `PARITY OK`가 나와야 배포 안전. 출력물은 `out/`에 쌓이며 git에는 올라가지 않습니다.

## 준비물

- Node 18+
- Python 3 + `pip install formulas` (엑셀 수식을 실제로 재계산하는 라이브러리)

## 검증 항목

| 딜 | 시트 | 비교 셀 |
|---|---|---|
| office/logistics | 09_Return_Summary | E5 세전 IRR · E6 세후 IRR · E7 EM (총자기자본), C8 CoC(보통주), C12 언레버드, C13 최소 DSCR |
| dev | 04_PROFITABILITY | C5 분양수입 · C14 이자 · C16 본PF 한도 · C21 이익 · C22 이익률 · C26 미상환 · C28 EM · C29 IRR |
| refi | — | 생성 단계에서 엔진 결과(3안·minDSCR)·블롭 캡처 확인, PMT/INDEX 수식은 CI 스모크가 확인 |

주의: 시트 구조(셀 위치)를 바꾸면 `check.py`의 셀 맵도 함께 갱신해야 합니다.
09_Return_Summary는 C=보통주 · D=우선주 · E=총자기자본 열 구조입니다.
