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
node tools/parity/gen-xlsx.js refi        # 리파이낸싱 4시트

# 1-b) 자본구조·경계 매트릭스 — 예시 딜 1케이스 편향을 깨는 오피스 변형 7종
node tools/parity/gen-xlsx.js office_nopref    # 우선주 끔
node tools/parity/gen-xlsx.js office_nonpass   # 비도관(법인세 적용)
node tools/parity/gen-xlsx.js office_hold7     # 보유기간 7년
node tools/parity/gen-xlsx.js office_nodebt    # 무차입(LTV 0) — 커버리지 분모 0 경계
node tools/parity/gen-xlsx.js office_vac100    # 공실 100% — 수입 0, IRR 미정의 경계
node tools/parity/gen-xlsx.js office_mezz      # 중순위(메자닌) 현금이자형 — 4단 자본구조
node tools/parity/gen-xlsx.js office_mezzpik   # 중순위 이자누적(PIK)형

# 2) 검증 — 엑셀을 python 수식 엔진으로 재계산해 화면 값과 비교
python3 tools/parity/check.py office
python3 tools/parity/check.py logistics
python3 tools/parity/check.py dev
python3 tools/parity/check.py refi
python3 tools/parity/check.py office_nopref    # 변형도 같은 방식 + 변형별 추가 확인
python3 tools/parity/check.py office_nonpass
python3 tools/parity/check.py office_hold7
python3 tools/parity/check.py office_nodebt
python3 tools/parity/check.py office_vac100
python3 tools/parity/check.py office_mezz
python3 tools/parity/check.py office_mezzpik
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
| refi | 02_Term_Sheets C/D/E열 | 대안 1~3 × (대출금·1차년 DSCR·최소 DSCR·총이자·만기잔액) 15지표 재계산 대조 |
| office_nopref (변형) | 09_Return_Summary | office와 동일 6지표 + 우선주 D열(D5·D6·D7)에 숫자가 남지 않음(0·빈 값·#NUM!/#DIV/0! 허용 — CF 전부 0) |
| office_nonpass (변형) | 09_Return_Summary | office와 동일 6지표 + 세후 IRR(E6)이 세전(E5)과 달라야 함 — 엑셀·엔진 양쪽 확인 |
| office_hold7 (변형) | 09_Return_Summary | office와 동일 6지표를 보유 7년 상태로 대조 (IRR 범위 재지정 검증) |
| office_nodebt (변형) | 09_Return_Summary + 전 시트 | 무차입 경계 — 최소 DSCR 공란(0 오독 금지) |
| office_mezz / office_mezzpik (변형) | 09_Return_Summary + 05_Debt_Schedule | 중순위 4단 구조 — 6지표 대조 + 구조 검사: 금액>0, 스케줄 기초잔액=가정 금액, 현금이자형(이자>0·잔액 불변·총 DS>선순위)과 PIK형(현금이자 0·잔액 증가·총 DS=선순위), 총 DSCR ≤ 선순위 단독 DSCR |
| office_vac100 (변형) | 전 시트 | 공실 100% 경계 — IRR이 존재하지 않는 딜. 화면이 '—'이므로 엑셀도 공란이어야 함(09_Return_Summary!C5·E5, 00_Cover!C25·G25). 수치 대조는 성립하지 않아 건너뜀 |

### 전 딜 공통 구조 검사

수치가 맞아도 파일이 깨지거나 스스로 실패를 선언하면 배포할 수 없습니다. 아래 3건은 **모든 딜·변형**에 적용됩니다.

| 검사 | 왜 |
|---|---|
| 숫자 셀에 비유한값 없음 | `<v>null</v>`·NaN·Infinity가 들어가면 엑셀이 "손상된 파일"로 거부 |
| 엑셀 오류 토큰 0 | `#DIV/0!`·`#NUM!` 등이 09_Return_Summary를 거쳐 00_Cover 표지까지 전파된 전례 |
| 검증 시트 종합 판정 PASS | 조달 합계에서 승계 보증금이 빠져 모든 오피스·물류 다운로드가 `Uses=Sources FAIL`·`종합 판정 FAIL(9/10)`을 달고 나가던 결함을 잡은 검사 (퇴화 변형 제외 — 공실 100%처럼 경제적으로 실제 실패하는 딜은 FAIL이 정답) |

변형 케이스는 예시 딜 1개 상태만 검증하던 편향을 깨는 자본구조 매트릭스입니다.
생성 단계(gen-xlsx.js)가 fillExample() 뒤 state/stackState를 패치하고, 패치 전후
simModel() 결과가 실제로 달라졌는지(sig 가드) 확인한 다음 엑셀을 캡처합니다.
현재는 도구 레벨 검증이며, 공표(`gen-verification.js`)는 기존 4딜 그대로입니다.

주의: 시트 구조(셀 위치)를 바꾸면 `check.py`의 셀 맵도 함께 갱신해야 합니다.
09_Return_Summary는 C=보통주 · D=우선주 · E=총자기자본 열 구조입니다.
