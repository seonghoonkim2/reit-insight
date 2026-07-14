# 호텔 매입 딜 — 설계 초안

> **상태: 설계 초안(게이트: deal_want 호텔 50건 도달 시 착수) / 작성일 2026-07-14 / 근거: 30일 로그 deal_want 42건 중 호텔 최다**
>
> 이 문서는 설계만 담는다. **게이트 도달 전 제품 코드 수정 금지**(`docs/STRATEGY.md` "데이터 전 선착수 금지" 원칙, 수요 파이프 게이트: "deal_want 단일 유형 4주 50건 도달 시 커버리지 착수").
> 본 문서의 모든 숫자(ADR·OCC·Cap 등)는 **예시이며 실제 시세가 아니다.**

---

## 0. 핵심 설계 결정 요약 (5줄)

1. **호텔은 새 엔진이 아니라 기존 매입 딜 엔진(`calcModel`)의 "NOI 생성 모듈" 교체다** — 부채·세금·우선주 워터폴·Exit·보유기간(3~10년)·자가검증 스탬프 전부 재사용, 연 단위 스크리닝(IC 초안) 모델.
2. **운영 구조 토글 2종**: 마스터리스(=오피스 NOI 경로 그대로, 라벨만 교체) / 위탁운영 HMC(객실수×ADR×OCC→객실매출→부대매출→GOP→위탁수수료·FF&E→NOI, OCC 1~2년차 램프업).
3. **엑셀은 기존 매입 13시트 중 04_Operating_ProForma 내부 행만 호텔식으로 교체**하고 NOI 앵커 셀(행 18)을 유지 → 05_Debt_Schedule 이후 시트 수식 무수정, 파리티 검사 좌표(09_Return_Summary E5/E6/E7/C8/C12/C13) 그대로 재사용.
4. **민감도 기본 축은 ADR×OCC(5×5)** — 호텔 고유 리스크가 운영 변수이기 때문. Exit Cap×성장률/금리는 기존 축 토글로 유지(마스터리스 모드는 기존 축 그대로).
5. **신규 계측 이벤트 0건** — `deal_select`/`deal_want`의 blob2(딜 유형) 체계에 `hotel`이 자연 편입, `/e` 수집 필드 무변경 → worker.js·trust.html 무접촉(CI 1:1 게이트 안전).

---

## 1. 현행 코드 지도 (설계 근거 — 2026-07-14, 빌드 `2026-07-13·a841bbfc04` 기준)

모든 경로는 `dart-search/web/modelter/index.html` (11,348줄). 줄번호는 이 시점 기준(구현 시 재확인).

| 구성 요소 | 위치 | 구조 요약 |
|---|---|---|
| 입력 폼 스키마 `DEALS` | L1756~1896 | 딜별 `{label, sheets[], stack, tax, groups[{h,gl,adv,f[{k,l,u,t,ph,min,max,pct,hint,adv}]}]}`. office L1757 / logistics L1791 / dev L1825 / refi L1876. `ph`(placeholder)가 곧 표준가정값(fillStandard가 채움) |
| 깊이·핵심 필드 | L1898~1935 | `CORE/TAIL`(프롬프트용), `DEPTHS`, `QUICK_CORE`, `DEEP_EXTRA`, `STD_EXCLUDE`, `QUICK_FIELDS`(⚡핵심만·모바일 위저드가 사용) |
| 준비중 타일(수요 가짜 문) | L2003 `DEAL_SOON`=[hotel, retail, rental, datacenter], L2004 `renderTabs`, L11330 `deal_want` 발화, L11331 `deal_select` | 호텔 출시 시 `DEAL_SOON`에서 hotel 제거 |
| 참고치(FIELD_REF) | L2018~2070 (`__MKTREF_START__` 마커) | **손편집 금지** — `data/market-ref.json` → `tools/gen-marketref.js`로 인라인 생성 |
| 프롬프트 시트 목록 | L2557 `sheetListFor()` | `DEALS[cur].sheets` + CORE/TAIL + 깊이 규칙으로 "생성될 시트" 텍스트 구성 |
| 예시 딜 `EXAMPLES` | L4655~4666 | 딜별 `{state:{...}, stack:{...}}` — `fillExample()` L4684가 주입·예시키 추적 |
| 화면 엔진 디스패치 | L4316 `simModel()` | office·logistics→`simDcf`(L6239에서 `_newSimDcf`로 교체됨) / dev→`simDev` / refi→`simRefi` |
| 정밀 엔진(파리티 원본) | L5855 `assumFull()` → L5863 `calcModel(V)` | 01_Assumptions 셀 주소(C7 연면적, C23/C24 평당 임대료/관리비, C25 점유율, C26 보증금배수, C34~C43 운영비·CapEx, C45~C52 부채·우선주, C58 Exit Cap, C61~C66 세금, C79 보유기간…)를 키로 하는 값 사전 V를 받아 NOI[]→부채 스케줄→우선주 워터폴→세후→IRR·EM·DSCR 산출 |
| 입력→엑셀 셀 매핑 | L5770 `assumOverrides()` | state/stackState → C셀 오버라이드. **물류가 오피스와 다른 전부가 여기 5줄**(L5808~5812): C8 임대율 0.97, C31 기타수입, C34~C38 운영비 5종, C43 CapEx 기본값 |
| NOI 직접 입력 역산 | L5813~5844 | noi1 입력 시 평당 임대료를 이분법 역산해 C23 주입(파리티 유지 장치) |
| 렌트롤 엔진(v2) | L6027 `leaseIncome`, L6047 `assumFullV2`, L6059 `leaseModelV2` | office·logistics 전용(L6185 가드) — 호텔 비대상 |
| 화면 결과 카드 | L6216 `_newSimDcf()` | `calcModel(assumFull())` 호출 → KPI·연차표·트랜치 블록·커버넌트 |
| 2변수 민감도(5×5) | L3573 `sens2Data(mode)` + L6243 `__mtSensBase` / L6255 `__mtSens2` | Exit Cap×성장률(기본)·Exit Cap×금리 토글(`sensAxis` L3630). 셀마다 엔진 재계산 25회. dev는 L3592 `devSens2` 분양률×분양가 4×5(순수 코어만 — simDevResi 셀 호출 금지 규칙) |
| 자동 판정 | L4406 `dealVerdict(r)` | office·logistics 분기 L4412: IRR vs 허들(하우스 기준 L4320~) → DSCR → Exit 스프레드(진입 Cap 대비) → 매도자 IRR 대조 → 다운사이드 한 줄(민감도 보수 코너) |
| 대주 뷰 | 매입: L5987~6014 `_covBlock` 내 "금리×공실 결합 스트레스"(최소 DSCR 4×3표) / 개발: L4193 `__setDevView`(딥링크 `&view=lender`는 dev 전용, L5425) | 매입 딜의 대주 뷰는 별도 화면이 아니라 커버넌트 접이식 블록 |
| 엑셀 템플릿 `XLTMPL` | L5529 (JSON 1줄) | **13시트**: 00_Cover · 01_Assumptions · 02_Sources_Uses · 03_Capital_Stack · 04_Operating_ProForma · 05_Debt_Schedule · 06_Tax_Disposition · 07_Equity_Waterfall · 08_Equity_Cashflow · 09_Return_Summary · 10_Sensitivity · 11_Validation_Checks · _Calc(숨김) |
| 보유기간 변형 | L6095 `holdTemplate(base,H)` | 템플릿을 복제해 연차 열을 H년 기준으로 재수식 — "생성 시 변형" 패턴(호텔이 따라야 할 모범) |
| 다운로드 디스패치 | L6740~6892 | refi→`refiTemplate`(4시트) / dev→`devTemplate`(6시트) / 그 외(매입)→`assumOverrides`+`holdTemplate(XLTMPL)`+자가검증 스탬프(L6812) |
| 파리티 도구 | `tools/parity/gen-xlsx.js`(BASE_DEALS=[office,logistics,dev,refi]+변형 3종), `check.py`(office 검증 6지표: E5 세전IRR·E6 세후IRR·E7 EM·C8 CoC·C13 minDSCR·C12 언레버드) | 헤드리스 DOM 스텁으로 앱 로드→fillExample→엑셀 바이트 캡처→python `formulas` 재계산 비교 |
| 엔진 불변식 | `tools/qa/invariants.js` (경제 단조성 17건) | 딜별 fillExample 원복 후 한 축씩 스윕 |
| CI | `tools/modelter-ci-check.js` L593 헤드리스 4딜 실행 + 마커 200+ + 성능 예산(gzip<300KB — 현재 263.5KB) | 호텔 추가 시 5딜로 |
| 계측 | `docs/METRICS.md`(단일 진실), `tools/modelter-labels.js` `DEAL_LABEL` | blob2=딜 유형. deal_want/deal_select는 유형명만 수집 |

### 물류가 오피스와 공유하는 것 / 다른 것 (호텔 재사용 경계의 준거)

- **공유(=코드 동일)**: 화면 엔진(`_newSimDcf`→`calcModel`), 엑셀 13시트 템플릿·생성 경로, 렌트롤 v2, 민감도 5×5, 자동 판정, 커버넌트·대주 뷰, 솔버 3종, 시나리오 드라이버, 티저 PPT, 파리티 검증 좌표.
- **다른 것(전부 데이터)**: ① `DEALS.logistics` 폼 정의(라벨·ph·hint), ② `EXAMPLES.logistics`, ③ `assumOverrides`의 기본값 5줄(임대율 0.97·운영비·CapEx), ④ `FIELD_REF_DEAL.logistics` 참고치, ⑤ 간이 근사치 상수(`simDcf`류 opex 헤어컷 0.35/0.15 — L3543·3556 등).
- **시사점**: 물류는 "오피스의 파라미터 변형"이라 분기 5줄로 끝났다. 호텔은 **NOI를 만드는 식 자체가 다르므로**(임대료/평 → ADR×객실×OCC) 수입 모듈 분기가 필요하지만, **NOI 배열이 나온 뒤의 모든 것은 물류와 같은 수준으로 공유**할 수 있고, 그래야 한다.

---

## 2. 원칙

1. **기존 매입 딜 엔진 최대 재사용.** 호텔은 "NOI를 만드는 방식"만 다르다. `calcModel(V)`의 NOI 생성부(현행 rent0/cam0/기타수입/보증금이자−운영비)를 딜 유형 분기로 교체하고, 이후 로직(부채 스케줄·거치/분할·보증금 승계 off·도관/비도관 세금·우선주 누적 워터폴·Exit·매각 성과보수)은 한 줄도 복제하지 않는다.
2. **스크리닝 목적의 연 단위 간이 모델.** IC 초안·입찰가 감 잡기용. 월별 시즌성·객실 믹스는 비범위(§10).
3. **파리티 불변**: 화면 수치 = 다운로드 엑셀. 호텔도 `tools/parity` 2단계(gen→check)를 통과해야 출시.
4. **단일 파일·성능 예산 준수**: gzip<300KB(현재 263.5KB, 여유 ~36KB), 새 코드는 부트 지점(첫 렌더) 뒤 블록에. 두 번째 XLTMPL 사본 금지 — 생성 시 변형(`holdTemplate` 패턴)으로.
5. **불변 규칙 유지**: 딜 수치 서버 전송 금지(deal_select는 유형명만), 테스트 훅 배포 금지, "투자 권유 아님" 문구, 숫자 예시는 샘플.
6. **NOI 직접입력 경로 재사용(안 B)은 기각**: 호텔 NOI를 화면에서 계산해 noi1 역산 경로(L5813)로 넣으면 코드는 최소지만, ① OCC 램프업(연도별 상이 성장)이 단일 `noig`로 표현 불가, ② 엑셀에 ADR·OCC 셀이 살아있지 않아 "수식이 살아있는 엑셀" 핵심 가치 위배. **가정 시트에 호텔 드라이버 셀을 실주(안 A)**.

---

## 3. 수익 모델 (위탁운영 HMC 모드)

연 단위 전개. y는 1차연도=1.

```
가용 객실야(Room-nights)  RN        = 객실수 × 365
OCC(y)                              = y=1: occ1 / y=2: occ2 / y≥3: occ(안정)   ← 램프업
ADR(y)                              = ADR × (1+adrg)^(y−1)
RevPAR(y)   [파생 표기]             = ADR(y) × OCC(y)
객실매출(y)                          = RN × ADR(y) × OCC(y)                     (원 → 백만원 환산)
부대매출(y)                          = 객실매출(y) × ancpct        (F&B·연회·기타, 객실매출 대비 %)
총매출(y)                            = 객실매출 + 부대매출
GOP(y)                               = 총매출 × gopmargin           (부문·미배분 운영비 일괄 흡수)
기본수수료(y)                        = 총매출 × basefee
인센티브수수료(y)                    = GOP × incfee
FF&E 적립(y)                         = 총매출 × ffe                 (한국 실무 3~5%)
NOI(y)                               = GOP − 기본수수료 − 인센티브 − FF&E 적립
```

- **RevPAR는 입력이 아니라 파생 표기** — 폼 힌트·결과 카드·엑셀 04시트에 `RevPAR = ADR×OCC`로 노출(용어 교육 겸).
- GOP 마진 단일 % 접근: 스크리닝에서 부문별 원가(객실/F&B 개별 마진)는 과설계. USALI 세부 분해는 비범위.
- 이후 처리(`calcModel` 재사용부): NOI(y) → 운용보수(`opfee`·`fixcost`, 기존 C76/C77) 차감은 기존 로직이 배당재원 단계에서 처리 → 부채상환 → 우선주 → 보통주. **CapEx 별도 차감은 0 고정**(FF&E 적립이 그 역할 — C43=0 오버라이드), **보증금 관련 C24/C26/C29/C74=0 고정**(HMC는 보증금·관리비 수입 없음).
- Exit: 기존과 동일 `매각가 = NOI(hold+1) ÷ Exit Cap` — hold+1년 NOI에도 램프업 규칙 적용(hold≥3이면 항상 안정 OCC 구간이므로 자연스러움).

## 4. 운영 구조 선택지 (폼 토글)

| | 마스터리스(임대차) | 위탁운영(HMC) |
|---|---|---|
| 입력 | **기존 오피스 필드 재사용**: 평당 월 임대료(라벨: "마스터리스 임대료")·관리비·보증금 배수·승계·공실률(라벨: "미임차 리스크", 기본 0)·NOI 성장률 | §3의 호텔 드라이버(객실수·ADR·OCC·부대·GOP·수수료·FF&E·ADR성장) |
| 엔진 | `calcModel` 기존 경로 그대로 (`assumOverrides` 기존 매핑) | `calcModel` 호텔 수입 모듈 분기 |
| 엑셀 | 기존 13시트 무변형 | 04시트 호텔 변형(§8) |
| 민감도 | Exit Cap×성장률/금리 (기존) | **ADR×OCC 기본** + Exit Cap×금리 토글 |
| 실무 대응 | 책임임대차·임대형 호텔(신용도 있는 운영사 장기 임차) | 위탁운영계약(GOP 연동) — 국내 호텔 매입 딜 다수 |

폼 필드 `opmode`(select: `["위탁운영(HMC)","마스터리스(임대차)"]`, 기본 위탁운영). 렌더는 기존 `noimode` 조건부 노출 패턴(임대료 산출 vs NOI 직접)과 동일하게 그룹 단위 표시 전환. 마스터리스 선택 시 사실상 "Exit Cap 참고치만 호텔인 오피스"가 되므로 추가 엔진 코드 0줄.

## 5. 부채·자본·Exit — 기존과 동일 + 호텔 참고치

- **그대로 재사용**: 선순위 LTV(감정가 기준)·금리·상환방식(만기일시/원리금/원금균등/거치후 원리금균등+거치기간)·만기, 메자닌 미반영 고지, 우선주(LTV%·목표 배당률·누적/비누적) 패스스루 워터폴, 도관/비도관 과세, 매각 수수료·중도상환수수료·매각성과보수, 하우스 허들.
- **호텔 참고치(신규, `data/market-ref.json` `deal.hotel` 블록 — 전부 "참고·예시" 표기)**:
  - Exit Cap: 참고 5.5~7.5% (오피스보다 높음 — 운영 변동성 프리미엄, 입지·등급별)
  - 선순위 금리: 참고 오피스 대비 +0.3~1.0%p 가산
  - LTV: 참고 45~60% (대주 보수적)
- **민감도 축 권고**: **기본 = ADR×OCC 5×5(레버드 IRR)**. 근거: ① 호텔 딜의 1차 논쟁점은 자본시장 변수(Cap·금리)가 아니라 운영 가정의 방어 가능성, ② 대주·IC 질문("OCC 65%로 떨어지면?")에 바로 답하는 표, ③ Exit Cap 민감도는 자동 판정의 Exit 스프레드 문장과 다운사이드 한 줄로 이미 커버. **Exit Cap×금리는 토글 2번째 축**으로 제공(기존 `sensAxis` 토글 UI 재사용, `mtTrack('sens_axis',{axis:'hotel_…'})` 형태로 기존 이벤트에 편입). 축 스텝: ADR ±10%(-10/-5/0/+5/+10%), OCC ±10%p(-10/-5/0/+5/+10%p, 0~100 클램프). 구현은 `devSens2` 규칙 준수 — 셀에서 순수 코어(`calcModel`)만 호출.
- **자동 판정(`dealVerdict`) 호텔 분기**: office 분기 로직(IRR 허들→DSCR→Exit 스프레드→매도자 IRR 대조→다운사이드 한 줄) 재사용 + 호텔 고유 1문장 추가 — **손익분기 OCC**(min DSCR=1.0 또는 배당 0이 되는 OCC를 이분법 `mtBisect` 재사용으로 역산): "OCC가 XX%까지 내려가도 이자는 갚습니다 / 가정 OCC와 여유가 N%p뿐입니다". 다운사이드 코너는 ADR −5%×OCC −5%p로 교체.
- **대주 뷰**: 매입 딜의 기존 형식(_covBlock 내 결합 스트레스 표) 유지하되 축을 **금리(+0/+0.5/+1.0/+1.5%p) × OCC(−0/−5/−10%p)**로 교체(공실 대신 OCC — 같은 4×3 최소 DSCR 표). dev식 별도 `view=lender` 딥링크는 도입하지 않음(매입 계열 일관성).

---

## 6. 입력 필드 목록 (3단 깊이)

단위·기본값(ph=표준가정)·참고 범위는 **한국 시장 상식선의 예시이며 실제 시세 아님**(전 필드 hint에 명시, 참고치는 market-ref.json 경유로 asof·출처 표기).

### ⚡핵심만 (quick — `QUICK_FIELDS.hotel`, 7개)

| 키 | 라벨 | 단위 | 기본값(ph) | 참고 범위(예시) |
|---|---|---|---|---|
| `asset` | 자산명 | — | 명동 H호텔 | |
| `price` | 매입가 | 백만원 | 70,000 | 실당 환산 힌트 병기(억·조 환산 훅 재사용) |
| `rooms` | 객실수 | 실 | 300 | 참고 비즈니스급 200~400실 |
| `adr` | ADR(평균객실단가) | 원/박 | 150,000 | 참고 서울 3~4성 12~18만 · 5성 25~45만 |
| `occ` | 안정 OCC(점유율) | % | 75 | 참고 서울 70~80% (연평균) |
| `hold` | 보유기간 | 년(range 3~10) | 5 | |
| `exitcap` | Exit Cap | % | 6.5 | 참고 호텔 5.5~7.5% |

### 표준 (standard — quick + 아래)

| 키 | 라벨 | 단위 | 기본값 | 참고 범위(예시) |
|---|---|---|---|---|
| `opmode` | 운영 구조 | select | 위탁운영(HMC) | 마스터리스 선택 시 오피스 운영수입 필드로 전환 |
| `appraisal` | 감정평가액 | 백만원 | 72,000 | LTV 산정 기준 |
| `ancpct` | 부대매출 비율 | % 객실매출 | 20 | 참고 리미티드 10~20 · 풀서비스 40~80 |
| `gopmargin` | GOP 마진 | % 총매출 | 40 | 참고 리미티드 40~50 · 풀서비스 25~35 |
| `adrg` | ADR 성장률 | %/년 | 2.0 | 참고 1~3%/년 |
| `occ1` | 1년차 OCC (램프업) | % | 72 | 안정 대비 −3~−10%p, 비우면 안정 OCC |
| `occ2` | 2년차 OCC (램프업) | % | 74 | 비우면 안정 OCC |
| `basefee` | 위탁 기본수수료 | % 총매출 | 2.0 | 참고 1~3% |
| `incfee` | 위탁 인센티브 | % GOP | 8.0 | 참고 5~10% |
| `ffe` | FF&E 적립 | % 총매출 | 4.0 | 참고 한국 실무 3~5% |
| `salefee` | 매각 수수료율 | % | 1.8 | 참고 1~2% |
| (자본구조) | 선순위·우선주·보통주 | — | 기존 `TRANCHES` UI 그대로 | 선순위 금리 ph 5.0 |

### 심층 (adv:true — 기존 오피스와 동일 키 재사용)

`acqtax`(4.6) · `acqfee`(1.5) · `opfee`(0.4) · `fixcost`(0) · `prepayfee`(0) · `dispfee`(0) · `sellerirr`(빈값) · `taxmode`/`taxrate`(도관/비도관) — 전부 기존 매핑(C15/C16/C76/C77/C71/C72/C65/C66) 무수정.

마스터리스 모드 표시 필드: `rentpp`(라벨 "마스터리스 임대료", 원/평·월)·`campp`·`gfa`·`depmult`·`depassume`·`vacancy`(기본 0)·`noig` — 기존 키 그대로라 `assumOverrides`·워크스페이스 저장·공유 링크 하위호환 자동.

폼 그룹 구성(`DEALS.hotel.groups`): ① 자산/취득(asset·rooms·price·acqtax·acqfee·appraisal) ② 호텔 운영(opmode + HMC 필드 or 마스터리스 필드) ③ 매각/보유(hold·exitcap·salefee·prepayfee·dispfee·sellerirr). `sheets`(프롬프트용): `["Hotel_Revenue_Model","Debt_Schedule","Tax_Disposition","Equity_Cashflow","Return_Summary","Sensitivity"]`, `QUICK_CORE.hotel=["Hotel_Revenue_Model","Return_Summary"]`, `stack:true, tax:true`.

---

## 7. 예시 딜 — '명동 H호텔' (EXAMPLES.hotel, 숫자는 예시·실제 시세 아님)

```
state: { asset:"명동 H호텔", opmode:"위탁운영(HMC)", rooms:"300", adr:"150,000",
         occ:"75", occ1:"72", occ2:"74", ancpct:"20", gopmargin:"40",
         adrg:"2.0", basefee:"2.0", incfee:"8.0", ffe:"4.0",
         price:"70,000", appraisal:"72,000", acqtax:"4.6", acqfee:"1.5",
         hold:"5", exitcap:"6.5", salefee:"1.8" }
stack: { senior_on:true, senior_ltv:"55", senior_rate:"5.0", mezz_on:false,
         pref_on:false, common_on:true }
```

### 손계산 검증(안정 연도 기준 — 파리티 기대값 앵커)

| 항목 | 계산 | 값 |
|---|---|---|
| 객실매출 | 300실×150,000원×75%×365 | **12,318.8백만원** |
| RevPAR | 150,000×0.75 | 112,500원 |
| 부대매출 | ×20% | 2,463.8 |
| 총매출 | | 14,782.5 |
| GOP | ×40% | 5,913.0 |
| 기본수수료 / 인센티브 / FF&E | 2%총매출 / 8%GOP / 4%총매출 | 295.7 / 473.0 / 591.3 |
| **NOI(안정)** | | **4,553.0백만원** |
| 진입 Cap / 실당 단가 | 4,553÷70,000 / 70,000÷300 | **6.50%** / 233백만원(2.3억) |
| 취득원가(Uses) | 70,000×(1+4.6%+1.5%) | 74,270 (금융수수료 별도) |
| 선순위 / 연이자 | 55%×72,000 @5.0% 만기일시 | 39,600 / 1,980 |
| **DSCR(안정)** | 4,553÷1,980 | **2.30x** |
| 자기자본 | 74,270−39,600 | 34,670 |
| 매각(6차연도 NOI÷6.5%) | 4,553×1.02⁵=5,026.9 ÷6.5% ×(1−1.8%) | 75,944.8 |
| **EM / 레버드 IRR / Y1 CoC** | 램프업·금융수수료·운용보수 제외 손계산 | **≈1.45x / ≈8.7% / ≈7.4%** |

기대 판정: IRR 8%대(통상 허들 상회, tone good~mid), DSCR 여유, Exit 스프레드 0%p(진입=Exit — "비슷한 수준" 문장). 램프업(Y1 72%·Y2 74%) 반영 시 Y1 NOI −4% 수준 → IRR 약 −0.2%p. **엔진 구현값은 운용보수(0.4%)·금융수수료(0.5%) 반영으로 손계산보다 소폭 낮게 나오는 것이 정상** — 파리티의 기준은 손계산이 아니라 "엔진=엑셀 일치"이고, 손계산은 자릿수 검증용.

---

## 8. 엑셀 시트 구성 (매입 13시트 기준 재사용/변형/신규)

| 시트 | 구분 | 내용 |
|---|---|---|
| 00_Cover | 재사용(문구) | 표제 "호텔 매입 재무모델" — 딜·버전·팀 기준·회수 링크 로직 무수정 |
| 01_Assumptions | **변형(행 추가)** | 기존 셀 좌표 보존 + 호텔 블록을 예약 행(예: C82~C92)에 추가: 객실수·ADR·OCC(안정/1년차/2년차)·부대%·GOP마진·기본수수료·인센티브·FF&E·ADR성장. `assumOverrides` hotel 분기가 주입 + 오피스 임대 셀(C23~C31) 0 고정. 출처열(F) srcTags 매핑 확장 |
| 02_Sources_Uses | 재사용 | 보증금 승계 C74=0 고정(HMC)만 |
| 03_Capital_Stack | 재사용 | 무수정 |
| 04_Operating_ProForma | **변형 — 사실상 "02_Hotel_Revenue" 역할** | 내부 행만 호텔식 재수식(`hotelTemplate(base,H)` — holdTemplate 패턴). 행 배치는 **NOI 앵커 = 행 18 유지**가 절대 조건: 5 객실매출 · 6 부대매출 · 7 (RevPAR 표기) · 8 OCC(y) · 9 총매출 · 10 (총매출−GOP) 운영비 · 11 기본수수료 · 12 인센티브 · 13 FF&E · 14~16 예비(0) · 17 공제합계 · **18 NOI** · 19 NOI마진 · 20 CapEx(0) · 21 배당가능 CF. 이렇게 하면 05/06/08/09/10/11의 `04_Operating_ProForma!x18` 참조가 전부 무수정 |
| 05_Debt_Schedule | 재사용 | 무수정 (04!18 참조 유지 덕분) |
| 06_Tax_Disposition | 재사용 | 무수정 |
| 07_Equity_Waterfall | 재사용 | 무수정 |
| 08_Equity_Cashflow | 재사용 | 무수정 |
| 09_Return_Summary | 재사용(라벨) | 검증 좌표(E5/E6/E7/C8/C12/C13) 불변 |
| 10_Sensitivity | **변형** | 축을 ADR(±10%)×OCC(±10%p)로 재수식 — 값 테이블은 생성 시 엔진 25회 계산값 고정 + 기준 셀은 수식(기존 5년 제약 관행 준수, 화면 히트맵과 동일 값) |
| 11_Validation_Checks | 재사용+행 추가 | 자가검증 스탬프(IRR·EM·minDSCR·순매각) 무수정 + 호텔 검증행: RevPAR=ADR×OCC 일치 · OCC 0~100% 범위 · 총매출=객실+부대 합산 · GOP≥NOI |
| _Calc(숨김) | 재사용 | 무수정 |

마스터리스 모드는 위 변형 전부 생략 — 기존 13시트 그대로.

### 파리티 검사 계획

- `tools/parity/gen-xlsx.js`: `BASE_DEALS`에 `'hotel'` 추가 — `dcfDriver('hotel')`가 그대로 동작(엔진 raw 필드 동일). 변형 2종 추가: `hotel_ml`(patch: `state['opmode']='마스터리스(임대차)'` — 오피스 경로 회귀 확인), `hotel_nonpass`(비도관 세후).
- `tools/parity/check.py`: `base=='hotel'` 분기 — **검증 지표 8개(≥6 충족)**:
  1. 세전 IRR(총자기자본) `09!E5` (허용 0.001)
  2. 세후 IRR `09!E6`
  3. Equity Multiple `09!E7`
  4. 평균 CoC(보통주) `09!C8`
  5. 최소 DSCR `09!C13`
  6. 언레버드 IRR `09!C12`
  7. Y1 NOI `04!C18` vs 엔진 `NOI[0]` (호텔 수입 모듈 자체 검증)
  8. Y1 객실매출 `04!C5` vs 엔진 roomRev[0] (+ RevPAR 셀 `04!C7` 파생 일치)
- 실행: `node tools/parity/gen-xlsx.js hotel && python3 tools/parity/check.py hotel` (+ `hotel_ml`, `hotel_nonpass`) — 4딜 전수 재검증 관행에 호텔 포함해 5딜 전수로.

---

## 9. 계측 — 신규 이벤트 불필요 (확인 완료)

- `deal_select` blob2='hotel': 탭 클릭 위임 핸들러(L11331)가 `dataset.k`를 그대로 보냄 — **코드 무수정으로 자연 편입**. `deal_want`의 hotel 타일은 `DEAL_SOON`에서 제거(잔여 retail·rental·datacenter 유지).
- `/e` 수집 **필드** 변화 없음(이벤트명·딜유형명뿐) → `worker.js`·`trust.html` 무접촉, CI 1:1 게이트 안전. 산출물 이벤트(`xlsx_download` 등)·퍼널(session→activate→computed→output)·`sens_axis`(axis 값에 `hotel_adr` 등 신규 문자열 — 값 확장은 additive)도 기존 체계 그대로.
- **METRICS.md 갱신 항목**(additive만, 판독 창 dedupe 코드 무접촉):
  1. §3 blob2 설명: "딜 유형(office·logistics·dev·refi)" → `hotel` 추가
  2. §4 `deal_want` 행 비고: "hotel 타일은 2026-XX 출시로 제거(잔여 3종)" — 게이트 소진 기록
  3. `sens_axis` 행 비고: axis 값에 hotel 축 추가
  4. `tools/modelter-labels.js` `DEAL_LABEL`에 `hotel:'호텔'` (누락 시 리포트에 키 원문 노출)
  5. (권고) 출시 후 2주 산출물 전환 관찰 메모 슬롯 — 호텔 수요가 실사용으로 이어지는지(deal_select 대비 xlsx_download)

---

## 10. 작업 분해 — 게이트 도달 시 실행 체크리스트

순서는 의존성 순. 각 단계 끝에 `node tools/modelter-ci-check.js` 그린 유지.

1. **엔진**: `calcModel`에 호텔 수입 모듈 분기(V의 호텔 셀 존재+`cur==='hotel'`) — NOI[] 생성만 교체, 이후 공유. `assumFull`이 01_Assumptions 호텔 행 기본값을 읽도록. *선행으로 invariants 케이스를 먼저 작성(레드→그린).*
2. **불변식**: `tools/qa/invariants.js`에 호텔 6건 추가(17→23): ADR↑→IRR↑ · OCC↑→IRR↑ · GOP마진↑→IRR↑ · 인센티브수수료↑→IRR↓ · FF&E↑→IRR↓ · Exit Cap↑→IRR↓ (+마스터리스 토글 시 오피스 동치성 1건).
3. **폼**: `DEALS.hotel`(§6 그룹 구성) + `QUICK_FIELDS/QUICK_CORE/DEEP_EXTRA/STD_EXCLUDE.hotel` + `SCEN_DRIVERS.hotel`(exitcap·adr·senior_rate) + `renderTabs`의 `DEAL_SOON`에서 hotel 제거 + `opmode` 조건부 렌더.
4. **예시**: `EXAMPLES.hotel`(§7) — 손계산 표와 화면 KPI 대조 기록.
5. **참고치**: `data/market-ref.json`에 `deal.hotel` 블록(adr·occ·ancpct·gopmargin·basefee·incfee·ffe·exitcap) → `node tools/gen-marketref.js`. **index.html FIELD_REF 손편집 금지.**
6. **엑셀**: `assumOverrides` hotel 분기(호텔 셀 주입+임대 셀 0 고정) + `hotelTemplate(base,H)` 변형(04 행 교체·10 축 교체·11 검증행·01 행 추가) — `holdTemplate`와 합성 순서 확정(hold 변형 → hotel 변형 권장), 다운로드 디스패치에 hotel 케이스.
7. **파리티**: gen-xlsx.js·check.py에 hotel(+변형 2종) 추가 → `node tools/parity/gen-xlsx.js hotel && python3 tools/parity/check.py hotel` 포함 **5딜 전수 PASS**.
8. **민감도**: `__mtSensBase`/`__mtSens2` hotel 모드(ADR×OCC) + `sens2Data` 라벨 + 축 토글(ADR×OCC ↔ Exit Cap×금리). 셀은 순수 `calcModel`만 호출(simDev 회귀 교훈).
9. **판정·대주 뷰**: `dealVerdict` hotel 분기(office 로직 재사용 + 손익분기 OCC 한 줄, 다운사이드 코너 ADR−5%×OCC−5%p), `_covBlock` 스트레스 축 금리×OCC 교체. `buildPrintSummary`(IC 원페이저)의 민감도 분기(L3489)에 hotel 포함.
10. **가이드 용어**: `guide.html`에 ADR·OCC·RevPAR·GOP·FF&E 적립·위탁운영(HMC)·마스터리스 앵커 추가 + `TERM_ANCHORS`(L4491) 정규식 등록, sitemap.xml 갱신.
11. **계측·문서**: §9의 METRICS.md·modelter-labels.js 갱신. What's new는 **v3 라벨 고정, 내용만 현행화**. `docs/STRATEGY.md`에 게이트 소진 기록.
12. **CI 마커·QA**: `tools/modelter-ci-check.js` 헤드리스 딜 목록 4→5(L593) + hotel 마커(폼·엔진·엑셀·판정 존재 검사) 추가 → `node tools/modelter-ci-check.js` + `node tools/qa/invariants.js` 그린. 딥링크 `#t=hotel` 지원(L5420 정규식에 hotel 추가).
13. **Playwright QA**: 예시 로드→KPI 표시→⚡핵심만 7필드→엑셀 다운로드→공유 링크 왕복(c:'hotel')→읽기 전용→민감도 축 토글→`#t=hotel` 착지. `grep -c "__mtCalc"` → 0 확인.
14. **배포**: 커밋(한국어 메시지) → master 푸시 → `#qa=on`으로 라이브 확인 → `node tools/modelter-ae.js`로 deal_select hotel 유입 관찰.

### 리스크

| 리스크 | 평가 · 대응 |
|---|---|
| 파일 크기(gzip<300KB) | 현재 263.5KB, 여유 ~36KB. 추정 증가: 폼·예시·참고치 +6KB raw, 엔진 분기 +3KB, 엑셀 변형 +6~8KB raw ≈ **gzip +4~6KB → 안전권**. 단 XLTMPL 복제 금지(생성 시 변형만) — 초과 시 `docs/STRATEGY.md` 에스컬레이션 사다리 |
| dev 재계산 <500ms 예산 | **무관 확인** — 예산 대상은 dev 월별 엔진. 호텔은 연 단위 `calcModel`(오피스와 동일 비용, 5×5=25회 재계산도 오피스에서 이미 수 ms) |
| 04시트 행 재배치 실수 | NOI 앵커(행 18) 이탈 시 05 이후 전 시트 참조 파손 — hotelTemplate에 앵커 assert + 파리티 지표 7·8이 즉시 검출 |
| holdTemplate×hotelTemplate 합성 순서 | 두 변형 모두 04 행을 다시 쓰므로 순서 의존 — 합성 후 hold=7 변형 파리티(`hotel_hold7`) 케이스로 고정(필요 시 변형 3종째) |
| 예시값 잔존 추적·공유 링크 | `exampleKeys`·`sharePayload`는 딜 무관 state 기반 — 자동 호환이나 QA 항목에 명시. 임차인명 이슈는 호텔에 없음(렌트롤 비대상) |
| 참고치의 시세 오인 | 전 참고치에 "예시·실제 시세 아님" + asof·출처(market-ref 체계) — ADR·Cap은 특히 변동 큼, 분기 갱신 대상에 등록 |

---

## 11. 비범위 (명시적 제외 — 스크리닝 단계 과설계)

1. **월별 시즌성**: 매입 딜 계열은 연 단위 스크리닝이 설계 원칙(월별 엔진은 dev 분양수지만). 시즌성은 연평균 OCC에 흡수되며, IC 초안 단계에서 월별 분해가 IRR에 주는 정보량은 ADR·OCC 가정 자체의 불확실성보다 작다. 도입 시 13시트 전면 개편+성능 예산 압박 — 실사(DD) 단계 도구의 영역.
2. **객실 타입 믹스**(스탠다드/디럭스/스위트별 ADR·수량): dev의 `aptrows`류 테이블 UI+전용 시트가 필요해져 코드·시트가 크게 늘지만, 스크리닝 결론은 가중평균 ADR 한 칸과 동일. 힌트에 "타입별 상이하면 가중평균 ADR 입력"으로 안내.
3. **리노베이션 캡엑스 스케줄**(연차별 대수선·객실 개보수): FF&E 적립률(총매출 %)의 정액 유보로 갈음 — 한국 실무 관행(3~5%)이며, 스크리닝에서 캡엑스 타이밍이 IRR에 주는 영향은 Exit Cap ±0.25%p보다 작다. 대규모 밸류애드(리포지셔닝) 딜은 본 유형의 대상이 아님을 폼 힌트에 고지.
4. 기타: USALI 부문별 손익 분해, OTA 수수료·세그먼트(FIT/그룹) 믹스, 브랜드 로열티 별도 항목(기본수수료에 포함 간주), 환율(외국인 수요) 시나리오 — 모두 GOP 마진·부대매출 비율 두 개 손잡이에 흡수.

---

*근거 로그: 준비중 딜 수요 투표(deal_want) 30일 42건 중 호텔 최다(최근 4일 ~29건 급증, `tools/modelter-ae.js` 집계). 게이트·가드레일 원문: `docs/STRATEGY.md` §가드레일("deal_want 단일 유형 4주 50건 도달 시 커버리지 착수"). 본 문서는 정보 제공 목적의 내부 설계 자료이며 투자 권유가 아니다.*
