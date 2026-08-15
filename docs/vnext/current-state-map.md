# 모델터 현재 구조 지도 (current-state map)

> [!CAUTION]
> **2026-07-10 시점의 역사적 감사 스냅샷입니다. 현재 사실의 기준이 아닙니다.** 이후 메자닌 실계산, 방법론 산식 대입, 변동 보유기간, 파리티 CI 등 여러 결함·공백이 해결되어 아래의 “미구현” 판정과 줄번호가 현재 코드와 다를 수 있습니다. 현재 상태는 `AGENTS.md` → 실제 코드·테스트 → `docs/STRATEGY.md` 후반 기록 → `docs/METRICS.md` 순으로 확인하고, 이 문서를 작업지시서처럼 재실행하지 마세요.

작업지시서(Modelter vNext — Institutional Underwriting Readiness) Phase 0 감사 결과.
2026-07-10, 읽기 전용 병렬 감사 8영역(코드 증거 = 당시 파일:줄번호). 지시서 1장(제품 기준선)의 당시 가정과 다른 점은 각 절 끝에 명시.

앱 본체: `dart-search/web/modelter/index.html` 단일 파일(정본 저장소 사본). 빌드 없음, 배포 = master 푸시 → Cloudflare.


## 계산 엔진 코어와 IRR

### 오피스/물류 IRR 계산 위치 — 실제 엔진은 calcModel(정밀), 간이 simDcf는 덮어써진 사장 코드

화면 디스패치는 simModel()이 하며 office/logistics는 simDcf()를 호출한다. 그런데 뒤쪽 IIFE에서 simDcf가 _newSimDcf로 재할당되어, 실제 렌더는 엑셀 파리티 엔진 calcModel(assumFull())의 결과를 쓴다. 3871줄의 원래 simDcf(간이 엔진, 자체 irr() 사용)는 덮어쓰기 이후 사장 코드다(IIFE 실패 시 폴백으로만 남음).

> 증거: dart-search/web/modelter/index.html:4293 `function simModel(){ if(cur==='office'||cur==='logistics') return simDcf(); ... }` / :6160 `var r=calcModel(assumFull());` / :6176 `try{ if(typeof simDcf==='function') simDcf=_newSimDcf; }catch(e){}`

### 오피스/물류 IRR 공식 — 연간 자기자본 현금흐름의 이분법 IRR

calcModel 내부에서 IRR=_irr([-equity].concat(dist))로 계산한다. dist는 연 단위(hold년) 자기자본 분배 배열(마지막 해에 순매각가-잔여대출-성과보수-보증금정산 포함)이므로 '연간 현금흐름 IRR'이 맞다. XIRR(일자 기반)이 아니라 기간 인덱스 t의 NPV 이분법이다. 렌트롤 업로드 시의 leaseModelV2도 동일하게 IRR=_irr([-equity].concat(dist))를 쓴다(6020줄). 엑셀 쪽은 09_Return_Summary에서 엑셀 네이티브 IRR() 함수를 08_Equity_Cashflow 연도 행에 걸어 동일 구조를 재현한다(6094-6095줄).

> 증거: dart-search/web/modelter/index.html:5846 `var IRR=_irr([-equity].concat(dist));` / :5852 `var unlev=_irr([-uses].concat(opCF...netSale]));` / :6094 `put(rs,'C5','IRR(08_Equity_Cashflow!C6:'+lc+'6)')`

### IRR 알고리즘 상세 — 브래킷 확장 + 이분법, 실패 시 null

IRR 함수가 2벌 존재한다. (1) 전역 irr()/npv() 3864-3869줄(사장된 간이 simDcf·구식 경로용, 허용오차 1e-7), (2) IIFE 스코프 _irr()/_npv() 5786-5791줄(실제 엔진용, 허용오차 1e-9). 알고리즘은 동일: lo=-0.95, hi=1에서 시작해 NPV 부호가 갈릴 때까지 hi를 1.5배씩 최대 80회(hi<1000 한도) 확장하고, 그래도 fl*fh>0이면 null 반환. 브래킷을 찾으면 이분법 200회 반복, |NPV|<허용오차면 그 값을, 200회를 다 돌면 (lo+hi)/2를 반환한다(즉 미세수렴 실패는 null이 아니라 중간값 반환). 뉴턴법 아님. 수렴 실패(브래킷 실패) 반환값은 정확히 null이며, 화면 표시는 _fp(null)→'—'(5862줄), 구 simDcf에서는 '계산 불가'(3924줄), 체크 레지스트리에서는 r.IRR==null일 때 IRR_FAILED 에러 배너를 띄운다.

> 증거: dart-search/web/modelter/index.html:5787-5791 `function _irr(cf){...lo=-0.95,hi=1...for(i=0;i<80&&fl*fh>0&&hi<1000;i++){hi*=1.5;...} if(fl*fh>0)return null; for(i=0;i<200;i++){...if(Math.abs(v)<1e-9)return m;...} return (lo+hi)/2;}` / :2797 `if(r.IRR==null) add('IRR_FAILED','error','IRR이 계산되지 않습니다...')`

### 개발(분양) 딜의 'IRR' 표기 지표 — EM^(12/T)-1 연환산이며 월별 CF IRR이 아님

devResiCompute의 irr은 `(I.E>0&&eqEnd>0&&yrs>0)?(Math.pow(eqEnd/I.E,1/yrs)-1):null` (yrs=T/12), 즉 정확히 EM^(12/사업개월)−1 형태의 연환산이다. 월별 현금흐름 배열에 NPV/이분법을 돌리는 계산이 아니다. eqEnd<=0(회수액 0 이하)이나 E=0이면 null→화면 '—'. 화면 라벨은 '연환산 IRR(자기자본)'(4211줄), 방법론 모달에도 '연환산 IRR = EM^(12/사업개월) − 1'로 명시돼 있고(1357줄), 엑셀 devTemplate의 04_PROFITABILITY C29도 같은 수식 `C28^(12/(COUNT(...)-1))-1`이며 파리티 check.py 57줄이 이를 1e-6 허용오차로 대조한다. 별도로 devResi가 아닌 벌크 개발 경로 simDevBulk에는 '간이 IRR(연환산)' = (proceeds/equity)^(1/years)-1이 있다(4281줄).

> 증거: dart-search/web/modelter/index.html:4102-4103 `var em=I.E>0?eqEnd/I.E:null, yrs=T/12; var irr=(I.E>0&&eqEnd>0&&yrs>0)?(Math.pow(eqEnd/I.E,1/yrs)-1):null;` / :6627 `f:'IFERROR(C28^(12/(COUNT('+C3+'B5:B'+le+')-1))-1,"")'` / tools/parity/check.py:57 `('연환산 IRR', cell('04_PROFITABILITY','C29'), exp['IRR'], 1e-6)`

### 개발 엔진의 월별 배열 존재 여부 — 월별 IRR 원료는 있으나 '자기자본 월별 CF 배열'은 없음

devResiCompute는 월별 엔진이 맞다: inA(월별 수입), outA(월별 지출), midIn(중도금), 월별 이자 intr(브릿지 brate → m>=K부터 본PF rate 전환), serCash(누적 순현금), serBal(월별 차입잔액)을 0..T 전 월에 대해 전개한다(4042-4095줄). 다만 '자기자본 월별 현금흐름 배열'은 명시적으로 존재하지 않는다. 자기자본은 m=0에 전액 투입(`cash=I.E`, 4083줄)되고 잉여현금은 차입 상환에만 쓰이며 회수는 사업 종료 시점 eqEnd 한 번뿐이다. 이 타이밍 가정([-E, 0, ..., +eqEnd]) 하에서는 월별 IRR을 계산해도 수학적으로 EM^(12/T)-1과 동일하다. 따라서 '월별 IRR 정밀화'가 의미를 가지려면 단순히 기존 배열에 irr()을 거는 것이 아니라, 자기자본 단계 투입(필요 시 인출)·차입 전액 상환 후 잉여현금 중간 배당 같은 equity CF 타이밍 모델링을 추가해야 한다. 원료(월별 in/out/이자/잔액)는 모두 갖춰져 있다.

> 증거: dart-search/web/modelter/index.html:4083 `var bal=0, cash=I.E, peakBr=0, peakPF=0...` / :4085-4092 `for(var m=0;m<=T;m++){ var rM=(m<K)?I.brate:I.rate; var intr=bal*rM/1200; cash+=inA[m]-outA[m]-intr; if(cash<0){ bal+=-cash; cash=0; } else if(bal>0){...}` / :4101 `var pfEnd=bal, eqEnd=cash-pfEnd-feeAmt;`

### 리파이 딜 지표 계산 위치 — refiSchedule/simRefi, IRR 없음

리파이는 refiInputs()(3935)→refiSchedule(I,a)(3954)→simRefi()(3973) 체인이다. 대안별로 연도 전개(yrs: open/intr/prin/ds/close/noi/dscr)를 하고, 총이자 totInt는 연도별 이자 합(`yrs.forEach(...totInt+=x.intr...)`, 3968줄), 최소 DSCR minD, 벌룬 balloon, 수수료 fees(중도상환+신규 취급), 순조달 net=loan-oldbal-fees, 캐시아웃 co, 부채수익률 dy=noi/loan, 기준 충족 pass(minDSCR>=dmin)를 계산한다. 리파이에는 IRR 지표가 아예 없고 mini 카드도 '추천 대안·minDSCR'를 표시한다(3987줄). 엑셀 refiTemplate은 6346줄 부근에서 같은 값을 수식으로 재현하며 '총이자(만기까지)' 라벨은 6428줄(B15)·화면 표 4555줄·비교표 7375줄에 있다.

> 증거: dart-search/web/modelter/index.html:3966-3971 `var fees=I.oldbal*I.prepay/100+loan*I.newfee/100; ... yrs.forEach(function(x){ totInt+=x.intr; ...}); return {loan:loan, yrs:yrs, fees:fees, minDSCR:minD, totInt:totInt, balloon:..., net:loan-I.oldbal-fees, co:loan-I.oldbal, dy:loan>0?I.noi/loan:null, y1:yrs[0].dscr, pass:...};`

### IRR 라벨(세전/세후·levered/unlevered)과 복수 부호전환 경고

오피스/물류는 라벨이 명확하다: 'Levered IRR (세전)'이 기본이고 비도관 선택 시 'Levered IRR (세후)'(IRRat, 감가상각 건물분 30%/40년·법인세 반영)가 추가되며 'Unlevered IRR'(unlev=_irr([-uses]...netSale))도 표시된다(6163-6167줄, 렌트롤 경로 6127-6129줄 동일). 반면 개발 딜 라벨은 '연환산 IRR(자기자본)'으로 세전/세후·levered 표기가 없다(계산상 토지 제세는 비용 반영, 법인세·양도세는 미반영이므로 사실상 세전·레버드인데 라벨에 없음). 복수 부호전환(multiple IRR) 경고는 코드 전체에 존재하지 않는다 — '부호' 검색은 솔버 브래킷 주석(3624줄)과 렌트롤 음수 임대료 경고(7800줄)뿐이고, _irr은 여러 근이 있어도 처음 잡힌 브래킷의 근 하나를 경고 없이 반환한다. 비교표의 '최고 IRR' 배지는 라벨에 '세전' 또는 'Levered IRR'이 포함된 KPI만 집계한다(3105줄) — 개발 딜의 '연환산 IRR(자기자본)'은 이 매칭에 걸리지 않는다.

> 증거: dart-search/web/modelter/index.html:6163-6164 `{l:'Levered IRR (세전)', v:_fp(r.IRR)...}; if(r.passthru===false) kpis.push({l:'Levered IRR (세후)', v:_fp(r.IRRat)...})` / :4211 `{l:'연환산 IRR(자기자본)', ...}` / :3105 `if(c.kpis[i].l.indexOf('세전')>=0||c.kpis[i].l==='Levered IRR')`

### IRR 수렴 실패의 사용자 노출 경로

브래킷 실패 시 null이 전파되어 3곳에서 노출된다: (1) 체크 레지스트리 mtChecks가 office/logistics에서 r.IRR==null이면 'IRR_FAILED' error를 추가(2797줄), (2) KPI 카드 _fp(null)='—'(5862줄), (3) 민감도 히트맵은 r.IRR==null이면 NaN 반환으로 해당 칸을 비움(3654줄 `if(!r||r.IRR==null) return NaN;`). 999 같은 센티널 값은 쓰지 않는다.

> 증거: dart-search/web/modelter/index.html:5862 `function _fp(x){ return (x==null||!isFinite(x))?'—':(x*100).toFixed(2)+'%'; }` / :3654 `if(!r||r.IRR==null) return NaN;`

### 개발 딜 민감도·솔버는 순수 코어 devResiCompute만 사용

손익분기/PF상환한계 분양률 솔버 devSolveSold는 devResiCompute를 이분법 16회로 반복 호출하고(4111-4119줄), 분양 민감도 히트맵도 'simDevResi를 셀마다 부르면 입력이 수 초씩 멈춘다'는 주석과 함께 devResiCompute만 쓴다(3571-3572줄). CLAUDE.md의 '셀에서 simDevResi 호출 금지' 규칙과 코드가 일치한다.

> 증거: dart-search/web/modelter/index.html:3571 `// 셀·베이스 모두 순수 코어(devResiCompute)만 사용 — 솔버까지 도는 simDevResi를 셀마다 부르면 입력이 수 초씩 멈춤` / :4118 `for(var i=0;i<16;i++){ var mid=(lo+hi)/2; if(test(devResiCompute(...{soldT:mid})))) hi=mid; else lo=mid; }`

**지시서 가정과 다른 점**

- 'function irr' 검색 힌트가 시사하는 단일 IRR 구현 가정과 달리, IRR 함수가 2벌 있다: 전역 irr()(index.html:3865, 허용오차 1e-7)과 IIFE 스코프 _irr()(index.html:5787, 허용오차 1e-9). 오피스/물류 화면에 실제로 쓰이는 것은 _irr이고, 전역 irr은 3871줄 간이 simDcf 전용인데 그 simDcf 자체가 6176줄에서 _newSimDcf로 덮어써져 정상 부팅 시 사장 코드다.
- 개발(분양) 딜의 'IRR'은 월별 현금흐름 IRR이 아니라 EM^(12/사업개월)−1 연환산이다(index.html:4103). 다만 화면 라벨('연환산 IRR(자기자본)')·방법론 모달(1357줄)·엑셀(6627줄 C29)·파리티(check.py:57)가 모두 같은 정의로 일관돼 있어 '숨겨진 부정확'이 아니라 '명시된 간이 정의'다.
- 'equity cash flow 월별 배열이 이미 존재하는가'에 대한 답은 '아니오에 가깝다': 월별 수입/지출/이자/차입잔액/누적현금 배열(inA·outA·intr·serBal·serCash)은 존재하지만, 자기자본 월별 CF 배열은 없다. 자기자본은 m=0 전액 투입·종료 시 일괄 회수 구조(4083·4101줄)라서, 이 타이밍 그대로 월별 IRR을 계산하면 현행 EM^(12/T)−1과 수학적으로 동일한 값이 나온다. 월별 IRR 정밀화(V3)가 값을 바꾸려면 자기자본 단계 투입·중간 배당 등 equity CF 타이밍 모델링 추가가 선행돼야 한다.
- 복수 부호전환(multiple-IRR) 경고는 어디에도 없다 — _irr은 첫 브래킷의 근 하나를 경고 없이 반환한다.
- 리파이 딜에는 IRR 지표가 아예 없다(DSCR·총이자·순조달·벌룬·부채수익률만). 작업지시서가 리파이 IRR을 전제한다면 해당 없음.
- 개발 딜 IRR에는 세전/세후·levered 라벨이 없다('연환산 IRR(자기자본)'). 또한 비교표 '최고 IRR' 배지 로직(3105줄)은 라벨에 '세전' 또는 'Levered IRR'이 있어야 집계하므로 개발 딜 IRR은 비교 배지 대상에서 빠진다.


## 지표 정의(DSCR·CoC·Exit Cap·평단가·Debt Yield)

### DSCR 계산식 — 분자

세 엔진 모두 DSCR 분자는 순수 NOI(운용보수·CapEx 차감 전)다. calcModel(오피스·물류 가정경로): DSCR.push(NOI[y]/(interest+prin)); leaseModelV2(렌트롤 경로) 동일; refiSchedule(리파이): dscr=noiY/ds. 반면 배당재원(dist)은 (NOI−CapEx)−DS−운용보수(feeY)로 별도 계산되므로 CFADS 성격의 현금흐름은 존재하나 DSCR 분자로는 쓰이지 않는다.

> 증거: /home/user/reit-insight/dart-search/web/modelter/index.html:5835 `DS.push(interest+prin);DSCR.push(NOI[y]/(interest+prin));` · :6009 동일 · :3963 `dscr:ds>0?noiY/ds:null` · :5840 `var d=opCF[y]-DS[y]-feeY;` (opCF=NOI−CapEx)

### 연도별 DSCR 존재 여부

연도별 DSCR는 3곳에 구현돼 있다: ① 매입 딜 결과 표(Y별 NOI·부채상환·자기자본CF·DSCR), ② 부채 커버넌트 표(_covBlock, Y1~YH의 DSCR·ICR·Debt Yield·내재 LTV·판정), ③ 리파이낸싱 '연도별 DSCR 전개' 테이블(대안 3개 × 만기 전 기간). minDSCR(전 기간 최소)도 별도 산출.

> 증거: /home/user/reit-insight/dart-search/web/modelter/index.html:6171 `rows.push(['Y'+(y+1), mk(r.NOI[y]), mk(r.DS[y]), mk(r.dist[y]), ...r.DSCR[y].toFixed(2)+'x'...])` · :5955 커버넌트 표 헤더 `<th>DSCR</th><th>ICR</th><th>Debt Yield</th><th>내재 LTV</th>` · :4575 `'연도별 DSCR 전개 ▾'`

### CFADS 개념 존재 여부

CFADS라는 용어는 앱 전체에서 단 1회, 엑셀 템플릿(XLTMPL) 07_Equity_Waterfall 시트의 행 라벨 '분배가능현금 (CFADS−DS)'로만 등장한다(수식은 04_Operating_ProForma!C21(NOI−CapEx) − 05_Debt_Schedule!C9 − C78(운용보수)). 화면 UI·방법론 모달·계산 변수명 어디에도 CFADS 개념·정의는 없다.

> 증거: /home/user/reit-insight/dart-search/web/modelter/index.html:5498 (XLTMPL JSON 내) `{"r":"B5","role":"lbb","s":"분배가능현금 (CFADS−DS)"},{"r":"C5","role":"vr","f":"04_Operating_ProForma!C21-05_Debt_Schedule!C9-01_Assumptions!$C$78"}` · grep -c 'CFADS' = 1

### CoC 계산식 — 분자·분모

coc = (Σ commonCF[Y1..Y(hold−1)] ÷ (hold−1)) ÷ common. 즉 분자는 우선주 배당 차감 후 '보통주' 운영기 배당의 연평균이며 매각연도(마지막 해) CF는 제외, 분모는 '초기 보통주 자기자본'(평균 아님, 총자기자본도 아님). 엑셀도 동일: Return_Summary C8 = AVERAGE(07_Equity_Waterfall!C9:Y(H−1)행)/C54(보통주 자기자본). 화면 라벨은 혼용 — 미니바는 'CoC', 한 줄 보고는 '평균 배당률', 방법론 모달은 '평균 배당수익률 = 보유 중 연 자기자본 CF ÷ 자기자본'(보통주 한정·매각연도 제외라는 실제 정의보다 느슨). 분양(dev) 딜에는 CoC 지표 자체가 없다(이익률·IRR만).

> 증거: /home/user/reit-insight/dart-search/web/modelter/index.html:5848 `var coc=(commonCF.slice(0,hold-1).reduce(...)/(hold-1))/common;` (6021 동일) · :6098 `put(rs,'C8','AVERAGE(07_Equity_Waterfall!C9:'+ci(H-1)+'9)/01_Assumptions!$C$54')` · :1411 `<span class="mini-l" id="miniCocL">CoC</span>` · :1337 모달 문구

### Exit Cap 적용 NOI 기준

본 엔진(calcModel·leaseModelV2)은 NOI 배열을 y=0..hold(총 hold+1개)로 전개하고 매각가 = NOI[hold] ÷ ExitCap — 즉 '말년+1년차(forward) NOI, 성장 1회 더 반영' 기준. 순매각가 = 매각가×(1−매각수수료). 방법론 모달(1332)과 엑셀 검증시트(D8=04!Y(H+1)열18/C58)도 forward NOI로 일치. 단, 1변수 Exit Cap 민감도(sensData)와 시나리오 노트의 '추정 매각가'는 같은 forward 개념이되 NOI를 본 엔진이 아닌 간이식(연면적×(1−35%/15%))으로 구해 본 결과와 값이 다르다.

> 증거: /home/user/reit-insight/dart-search/web/modelter/index.html:5837 `var sale=NOI[hold]/n('C58',0.045), netSale=sale-sale*n('C59',0.01);` (6010 동일) · :1332 `매각가 = 매각 다음해(forward) NOI ÷ Exit Cap` · :3535-3537 `var fwd=noi1*Math.pow(1+gg,hold); ... sale=fwd/(cap/100)`

### 손익분기 Exit Cap 솔버 수식

폐형식 수식이 아니라 수치해법이다. solveBreakEvenExitCap(mode)이 exitcap을 1~15% 범위에서 mtBisect(이분법, 최대 60회)로 반복하며 전체 엔진(computeForSnapshot 스냅숏 재계산)을 돌려 EM=1.0(허용오차 0.002) 또는 IRR=0(허용오차 0.0002)이 되는 Exit Cap을 찾는다. 결과 문구: 'EM 1.0x 기준 x.xx% · IRR 0% 기준 x.xx%'. 같은 방식으로 목표 IRR 최대매입가(solveBidPrice, 0.3~1.5×매입가)와 DSCR 1.0x 손익분기 공실률(solveBreakEvenVacancy, 0~80%)도 구현.

> 증거: /home/user/reit-insight/dart-search/web/modelter/index.html:3659-3661 `function solveBreakEvenExitCap(mode){ var fn=function(ec){ sn.s.exitcap=String(ec); ... }; return mtBisect(fn, 1, 15, mode==='em'?1.0:0, mode==='em'?0.002:0.0002, 60); }`

### 평단가·임대료 단가의 면적 기준

① 평당 매입가: GFA(연면적) 기준 — C11=매입가×100÷gfa(만원/평), 표시도 price×1e6÷gfa÷1e4. ② 평당 월 임대료·관리비(원/평·월): 계산은 '임대가능면적 × 임대율'에 곱한다 — leasable=gfa×C8(임대가능면적 비율, 오피스 기본 0.88·물류 0.97 은닉 기본값, 사용자 입력 필드 없음), rent0=C23×leasable×12×occ(occ=1−공실률). 엑셀 수식도 $C$23×$C$9(임대가능면적)×12×$C$25. ③ 반면 운영비 단가(PM/FM/수도광열 등)·기타수입·CapEx 단가는 GFA(C7) 기준. ④ 입력 힌트 텍스트는 '연면적과 곱해 월 임대료 총액을 산출합니다'라고 설명해 실제(임대가능면적×임대율)와 불일치. ⑤ 렌트롤 경로는 임대면적(GLA) 우선(전용면적은 참고 보관), ㎡는 3.3058로 평 환산.

> 증거: /home/user/reit-insight/dart-search/web/modelter/index.html:5746 `o['C11']={n:price*100/gfa}` · :5806 `var leasable=gfa*n('C8',0.88);` · :5812 `rent0=n('C23',0)*leasable*12*occ/1e6` vs `etc0=n('C31',12000)*gfa*12/1e6` · :1757 힌트 "연면적과 곱해 월 임대료 총액을 산출합니다" · 엑셀 `"f":"01_Assumptions!$C$23*01_Assumptions!$C$9*12*01_Assumptions!$C$25/1000000"` · :7650 임대면적 우선

### ICR 구현 여부

구현돼 있다. ① 커버넌트 표: icr = NOI[y] ÷ INT[y](해당 연도 이자, 잔액×금리) 연도별 표시. ② IM 제시치 대조: ICR = NOI ÷ 연이자(만기일시 가정) 간이 검증 + '원금상환 포함 DSCR은 더 낮음' 주석. ③ 리파이 1변수 민감도: 금리 스윕 × ICR(LTV 55% 가정).

> 증거: /home/user/reit-insight/dart-search/web/modelter/index.html:5901 `var icr=r.INT[y]>0?noi/r.INT[y]:null;` · :2752 `note:'ICR = NOI ÷ 연이자(만기일시 가정). 원리금 상환형 DSCR은 더 낮습니다.'` · :3544-3545

### Debt Yield 구현 여부·분모 불일치

구현돼 있으나 위치별 분모가 다르다. ① 커버넌트 표(연도별): dy = NOI[y] ÷ endBal[y] — 그 해 '기말잔액' 기준. ② 리파이 텀시트: dy = 현재 NOI ÷ 신규대출 '당초 한도'(loan). ③ IC PPT: Y1 Debt Yield = noi0 ÷ raw.loan(당초 대출). 만기일시면 세 값이 같지만 원(리)금 상환형이면 커버넌트 표의 Y1 Debt Yield(기말잔액 분모)가 나머지와 달라진다. 어느 화면에도 분모 기준(기초/기말/당초)의 명시는 없다.

> 증거: /home/user/reit-insight/dart-search/web/modelter/index.html:5902 `var dy=r.endBal[y]>0?noi/r.endBal[y]:null;` · :3970 `dy:loan>0?I.noi/loan:null` · :7326 `['Y1 Debt Yield', (noi0!=null&&raw.loan>0)?fpct(noi0/raw.loan,1):'—', 'NOI ÷ 대출']`

### 내재 LTV 구현 여부

구현돼 있다. 커버넌트 표에서 연도별 내재가치 iv = NOI[y+1](이듬해 forward NOI) ÷ ExitCap, 내재 LTV = endBal[y] ÷ iv. 만기 차환 갭 테스트(벌룬 잔액 vs 만기 내재가치×기준 LTV(없으면 60%))와 점검(check) 경고(DEBT_LTV류)에서도 같은 정의를 사용. '이듬해 NOI를 Exit Cap으로 나눠 본 값이라 참고용' 캐비앳 문구도 존재.

> 증거: /home/user/reit-insight/dart-search/web/modelter/index.html:5903-5905 `var fwd=(r.NOI[y+1]!=null)?r.NOI[y+1]:noi; var iv=(r.exitCap>0)?fwd/r.exitCap:null; var ltv=(iv&&r.endBal[y]>0)?r.endBal[y]/iv:null;` · :5917-5922 차환 갭 · :2803-2804 점검 경고

### 방법론(method) 모달 구조

정적 HTML 모달이다. #mdOverlay(1319)~ 내부에 md-sec 섹션들: 오피스·물류 레버드 DCF(총투자액·1차연도 NOI·연차별 NOI·매각가·매각 순회수·자기자본·운용보수·DSCR·IRR/EM/평균 배당수익률/언레버드), 우선주·보통주 워터폴, 세금(도관/비도관), 분양수지 ①~⑤, 리파이, 민감도, 검토 보조, 화면=엑셀 파리티. 열기 버튼은 #mdOpen(1651), 바인딩은 IIFE(11025-11033)의 open()/close() — ov.hidden 토글과 mtTrack('method')뿐이며 innerHTML 갱신이 전혀 없어 '사용자 숫자 대입'은 존재하지 않는다(모든 산식이 일반형 텍스트).

> 증거: /home/user/reit-insight/dart-search/web/modelter/index.html:1319 `<div class="wn-overlay" id="mdOverlay" hidden>` · :1651 `<button class="md-open" id="mdOpen">방법론 · 가정과 계산식 보기</button>` · :11027 `function open(){ ov.hidden=false; ... mtTrack('method'); }`

### 방법론 모달 NOI 산식의 현행 엔진 불일치(구식 설명 잔존)

모달의 '1차연도 NOI = (임대료+관리비)/㎡ × 연면적 × 12 × 순영업이익률(오피스 65%·물류 85%)'는 현재 화면 본 엔진과 다르다. 실제 화면 결과는 simDcf가 6176에서 _newSimDcf로 교체돼 calcModel(상세 EGI−OPEX: 임대가능면적×임대율 임대료 + 관리비 + 기타수입 + 보증금 운용수익 − 항목별 운영비)로 계산되고, 65%/85% 고정 마진 간이식은 ① IM 제시치 대조(2719) ② 시나리오 노트 추정 매각가(3520) ③ 1변수 민감도(3533) ④ 사장된 구 simDcf(3877)에만 남아 있다. 단위 표기도 모달은 '/㎡'인데 실제 입력 필드는 '원/평·월'이다.

> 증거: /home/user/reit-insight/dart-search/web/modelter/index.html:1330 `1차연도 NOI = (임대료 + 관리비)/㎡ × 연면적 × 12 × 순영업이익률` · :6176 `try{ if(typeof simDcf==='function') simDcf=_newSimDcf; }catch(e){}` · :6160 `var r=calcModel(assumFull());` · :3877 `noi1=((rpp+cpp)*gfa*12/1e6)*(1-(cur==='office'?0.35:0.15))`

### NOI 직접 입력 모드가 본 엔진에 미반영(의심)

'NOI 직접 입력' 선택 시 _newSimDcf는 noi1>0 존재만 검사한 뒤 calcModel(assumFull())을 호출하는데, 입력→가정 매핑 함수 assumOverrides(5739-5781)에는 noi1을 어떤 셀로도 넣는 코드가 없다. 따라서 화면 결과가 사용자의 noi1 대신 템플릿 기본 드라이버(C23=130,000원/평 등)로 계산될 가능성이 있다. 6226의 경고문('엑셀 모델은 평당 단가로 NOI를 산출')은 엑셀에 대해서만 이 사실을 고지한다.

> 증거: /home/user/reit-insight/dart-search/web/modelter/index.html:6159 `else { var _n1=mnum('noi1'); if(!isFinite(_n1)||_n1<=0) return null; }` 직후 :6160 `calcModel(assumFull())` · :5739-5781 assumOverrides에 noi1 매핑 부재 · :6226 경고문

> 불확실: 실행 검증은 하지 않았음 — 다른 경로에서 noi1을 역산해 C23을 덮어쓸 가능성을 전수 확인하진 못했으나 grep 상 noi1 소비처는 간이 경로들뿐

**지시서 가정과 다른 점**

- ICR·Debt Yield·내재 LTV '있다'는 가정은 사실이나, Debt Yield 분모가 화면 위치별로 다름(커버넌트 표=그 해 기말잔액, 리파이·PPT=당초 대출 한도) — 단일 정의가 아니므로 '구현돼 있다' 한 마디로 넘기면 안 됨
- 손익분기 Exit Cap '솔버 수식'은 존재하지 않음 — 폐형식 수식이 아니라 전체 엔진을 이분법으로 반복 계산(mtBisect, 1~15%, EM=1.0/IRR=0 목표)하는 수치해법
- 방법론 모달에 사용자 숫자 대입은 전무(정적 텍스트, hidden 토글만) — 태스크 P4/V4가 pending인 상태와 일치. 게다가 모달의 '1차연도 NOI' 산식은 이미 교체된 구 간이엔진(65%/85% 마진·연면적·/㎡ 단위) 설명이라 현행 화면 엔진(calcModel: 임대가능면적×임대율·상세 OPEX·원/평·월)과 불일치
- 'CoC'라는 라벨은 미니바에만 있고 실제 정의는 '보통주 평균 배당률'(분자=우선주 배당 후 보통주 운영배당 연평균·매각연도 제외, 분모=초기 보통주 자기자본) — 총자기자본 기준 CoC로 가정하면 틀림. 분양(dev) 딜에는 CoC 자체가 없음
- CFADS 개념은 화면·모달 어디에도 없고 엑셀 07_Equity_Waterfall 행 라벨 1곳에만 등장 — DSCR 분자는 CFADS가 아닌 순수 NOI(CapEx·운용보수 차감 전)
- 임대료 단가 면적 기준: 입력 힌트는 '연면적과 곱해'라고 쓰여 있으나 실제 계산은 임대가능면적(연면적×0.88/0.97 은닉 기본값)×임대율 — 힌트 문구와 엔진이 불일치하고, 임대가능면적 비율은 화면 입력 필드가 없음
- (부수 발견) 'NOI 직접 입력' 모드에서 화면 본 엔진이 noi1을 소비하지 않는 것으로 보임(assumOverrides에 매핑 부재) — 지표 정의 문서화 전에 사실 확인 필요


## 자본구조(트랜치·메자닌·우선주·워터폴)

### 트랜치 구성·UI

트랜치는 TRANCHES 상수로 4단 고정: senior(선순위 대출)·mezz(중순위/메자닌, 기본 off)·pref(우선주)·common(보통주). 각 트랜치에 on/off 토글, 비중(%), 금리(pref는 '요구 CoC', common은 '목표 IRR'), extra select(선순위: 상환방식 4종, 메자닌: 상환방식 2종, 우선주: 누적적/비누적적)가 있고 선순위에만 '거치(년)' 입력이 추가된다. 비중 합계 표시(stackSum)가 있으며 트랜치 추가/삭제·다중 선순위는 불가.

> 증거: dart-search/web/modelter/index.html:1734-1739 `const TRANCHES=[{id:"senior"...opts:["만기일시","원리금균등","원금균등","거치후 원리금균등"]},{id:"mezz"...on:false...},{id:"pref"...},{id:"common"...equity:true}]`; :2108 senior_grace 입력; :2127 stackSum

### 메자닌 실제 계산 여부

메자닌은 UI 토글·입력만 있고 실제 계산에는 미반영. 오피스·물류의 파리티 엔진 calcModel은 선순위(loan=sLtv×appraisal)+우선주만 반영하고 mezz를 아예 읽지 않으며, mezz_on=true면 엑셀 노트에 '메자닌은 반영되지 않습니다' 경고를 넣는다. IC 원페이저에도 Mezzanine 행이 MISS 처리 + '중순위(메자닌) 대출은 현재 계산 엔진에 반영되지 않습니다' 주석. mezz를 스케줄까지 계산하던 옛 간이엔진 simDcf(:3882)는 :6176 `simDcf=_newSimDcf`로 덮어써져 미사용(사실상 dead path). mezz가 수치에 반영되는 유일한 경로는 simDevBulk(:4269)인데 금액 합산뿐 이자·스케줄 없음.

> 증거: index.html:5808,5810 `var loan=sLtv*appraisal...var prefAmt=n('C51',0)*uses` (mezz 없음); :6227 `if(k['mezz_on']===true) w.push('이 템플릿의 자본구조는 선순위+우선주+보통주 3단이라 메자닌은 반영되지 않습니다.')`; :7061-7064 `DS2L:'Mezzanine', DS2A:MISS ... DN1:'• 중순위(메자닌) 대출은 현재 계산 엔진에 반영되지 않습니다'`

### 우선주/보통주 워터폴 엔진

calcModel(오피스·물류)과 leaseModelV2(렌트롤 v2)에 동일 워터폴: prefAmt=C51×총사용액(uses), 매년 due=prefAmt×prefCoc+누적미지급(prefAcc), pd=min(dist,due), 누적적(C73=1)이면 미지급분 이월(비누적이면 소멸, 단 이월분에 이자 가산 없음). 매각연도에 pp=min(잔여분배, prefAmt+prefAcc)로 우선주 원금+미수배당을 보통주보다 먼저 회수, 잔여는 보통주 100%(Hurdle/Promote 없음 — 'WF4: 잔여차익 Common 100%'). 보통주는 plug: common=uses−loan−prefAmt−보증금승계. 엑셀 07_Equity_Waterfall 시트도 같은 수식(MIN/누적 accrual C10, C73 플래그)으로 생성되어 파리티 유지.

> 증거: index.html:5841-5845 `var prefCum=(n('C73',1)===1)... due=prefAmt*prefCoc+prefAcc, pd=Math.min(dist[y],due)... pp=(y===hold-1)?Math.min(dist[y]-pd,prefAmt+prefAcc):0`; :5816 `var common=uses-loan-prefAmt-depSrc`; :6075-6083 엑셀 07_Equity_Waterfall 수식; :7072 `WF4:'잔여차익 Common 100%'`

### 트랜치별 IRR·CoC·EM 계산

우선주·보통주 각각 IRR·EM이 따로 계산됨: prefIRR=_irr([-prefAmt]+prefCF), commonIRR=_irr([-common]+commonCF), prefEM·commonEM도 산출. CoC는 보통주만 계산(commonCoC=매각연도 제외 평균 배당/자본)이고 우선주는 입력 배당률(prefCoc)을 그대로 '배당률'로 표시. 화면 _trancheBlock, PPT 표(트랜치·금액·평균 CoC·IRR·EM), IC 원페이저(EQ1~EQ3), 엑셀 09_Return_Summary(C5 보통주/D5 우선주/E5 총자기자본 IRR, E6 세후)에 모두 노출. 선순위·메자닌(대주) 수익률 IRR은 어디에도 계산 안 함.

> 증거: index.html:5848-5851 `var coc=(commonCF.slice(0,hold-1)...)/common; var prefIRR=(prefAmt>0)?_irr([-prefAmt].concat(prefCF)):null; var commonIRR=...; var commonEM=...`; :7317-7320 PPT `['트랜치','금액','평균 CoC','IRR','EM']`; :6094-6097 Return_Summary IRR/EM 수식

### 금리 구조 (고정/변동·index+spread·floor/cap)

모든 딜이 고정금리 단일 % 입력. 변동금리·기준금리+스프레드·금리 floor/cap은 어떤 엔진·UI에도 없음. 캐비앳으로 명시: 리파이 '변동금리·약정 트리거는 미반영'(:1363, :3989), 리파이 엑셀 노트 '단순화: 고정금리 · 약정 트리거(LTV 재평가 등) 미반영'(:6361). 'floor/cap/spread' 검색 히트는 Math.floor와 'Cap 스프레드'(Exit Cap−진입 Cap 표시, :2724)뿐.

> 증거: index.html:6361 `'단순화: 고정금리 · 약정 트리거(LTV 재평가 등) 미반영...'`; :3989 `'약정 트리거(LTV 재평가)·변동금리는 미반영.'`

### 수수료 (upfront 등)

매입 딜: 금융 취급수수료율 C17(loan×0.5% 기본, uses에 가산되는 upfront), 중도상환수수료율 C71(매각 시 대출잔액×요율 차감), 매각성과보수율 C72(max(0, 순매각가−uses)×요율), 운용보수 C76(매입가×요율)+비히클 고정비 C77(연 정액 feeY로 배당재원 차감). 리파이: 기존대출 중도상환수수료+신규 취급수수료(fees=oldbal×prepay%+loan×newfee%). 개발(분양): 본PF 수수료(필요 본PF 한도=최대 인출액 대비 %).

> 증거: index.html:5808 `finFee=loan*n('C17',0.005)`; :5840 `d-=endBal[hold-1]*prepayR+Math.max(0,netSale-uses)*perfR+depExit`; :5498 라벨 `B17 금융 취급수수료율 / B71 중도상환수수료율 / B72 매각성과보수율`; :3966 `var fees=I.oldbal*I.prepay/100+loan*I.newfee/100`; :1858 pffee

### cash sweep · distribution lockup

매입(오피스·물류)·리파이에는 cash sweep·distribution lockup·커버넌트 트리거가 전혀 없음(잉여현금은 전액 즉시 분배 가정). 유일한 sweep 유사 기제는 개발(분양) 월별 엔진의 '잉여현금 자동 차입 상환'(브릿지→본PF 잔액에 잉여현금을 자동 상환)이지만 이는 PF 구조상 상환이지 약정 기반 sweep이 아님. 'sweep/lockup' 문자열은 코드 전체에 부재.

> 증거: index.html:1356 `잉여현금은 차입을 자동 상환하고, 이자는 잔액에 월할로 붙습니다`; :4082 `자금 전개: 자기자본 선투입 → 부족분 차입(브릿지 m<K → 본PF 전환) → 잉여현금 상환`

### 거치 후 분할상환(amortization) 방식

선순위(매입): '만기일시(이자만)'·'원리금균등'·'원금균등'·'거치후 원리금균등' 4종 + 거치년수(C80, grace=min(만기−1)로 클램프, 거치 중 이자만·이후 잔여만기 PMT). 엑셀 05_Debt_Schedule도 동일 IF 중첩 수식으로 파리티. 리파이: 대안별 만기일시/원리금균등/원금균등 3종, 만기 벌룬은 차환 가정으로 DSCR에서 제외. 메자닌 select('만기일시상환'/'이자만 지급')는 현재 어떤 활성 엔진도 소비하지 않음.

> 증거: index.html:5829,5834 `var grace=Math.max(0,Math.min(mat-1,Math.round(n('C80',0))))... else if(repay.indexOf('거치')>=0)prin=(y<grace)?0:(pmt(sRate,mat-grace,loan)-interest)`; :6060 엑셀 `IF(...C47="거치후 원리금균등",IF(y<=C80,0,(-PMT(C46,C48-C80,C49))-이자)...)`; :3960 리파이 3종

### 딜 유형별 자본구조 적용 범위

TRANCHES 스택 UI는 office·logistics·dev(stack:true)에만 붙고, dev 중 공동주택 분양(devResi)은 `!devResi()` 조건으로 스택 UI 자체가 숨겨짐 — 분양 딜의 자본구조는 자기자본+브릿지→본PF 단일 여신(트랜치·우선주·워터폴 없음). dev 비분양(devBulk)만 스택을 읽되 simDevBulk는 senior+mezz+pref 금액을 정적으로 빼서 자기자본·간이 IRR만 산출. Capital_Stack·Waterfall '시트 추가'(:2558-2564)는 Claude 지시문(프롬프트) 생성 경로일 뿐이고, 실제 다운로드 xlsx(XLTMPL 13시트)에는 07_Equity_Waterfall이 항상 포함되는 대신 Capital_Stack 시트는 없음.

> 증거: index.html:2333 `if(d.stack && !isQuick && !devResi()) html+=stackHtml(d.stackMode);`; :4268-4271 simDevBulk `['senior','mezz'].forEach(...debt+=l/100*tpc)... equity=tpc-debt-prefAmt`; :2562-2563 지시문용 시트 삽입; :6075 실제 엑셀 `sheet('07_Equity_Waterfall')`

> 불확실: 구형 leaseModel v1(:7730, 비누적 단순 pref 로직)은 호출처가 검색되지 않아 dead code로 판단했으나 동적 호출 가능성은 완전히 배제 못 함

### 워터폴 음수 분배 엣지

calcModel 워터폴의 pd=Math.min(dist[y],due)는 dist가 음수인 해에 우선주 지급이 음수로 기록됨(0 클램프 없음). 반면 (미사용) 구 simDcf는 Math.min(Math.max(opCF,0),prefDue)로 클램프했음. 엑셀 07_Equity_Waterfall MIN 수식도 화면과 동일하게 클램프 없음(파리티는 유지).

> 증거: index.html:5843 `pd=Math.min(dist[y],due)` vs :3902 `prefPaid=Math.min(Math.max(opCF,0),prefDue)`

> 불확실: 음수 분배 연도가 실사용 입력에서 잘 발생하지 않아 의도된 단순화인지 버그인지 코드만으로는 판단 불가

**지시서 가정과 다른 점**

- "메자닌 또는 중순위 선택 기능" — UI 토글·입력(비중·금리·상환방식)은 존재하지만 계산에는 어디에도 반영 안 됨: 오피스·물류 파리티 엔진(calcModel·leaseModelV2)·13시트 엑셀·분양 엔진 모두 선순위+우선주+보통주 3단만 계산하고, mezz_on 시 경고문만 출력(index.html:6227). 유일한 반영처인 simDevBulk도 금액 합산뿐 이자·상환 스케줄 없음. 즉 '선택 기능'은 껍데기이고 실계산 기능이 아님
- 메자닌 상환방식 select('만기일시상환'/'이자만 지급', :1736)는 현재 활성 엔진 어디서도 읽지 않음 — 이를 소비하던 구 simDcf(:3882)가 :6176에서 덮어써짐
- 변동금리·index+spread·금리 floor/cap 미구현 — 전 딜 고정금리 단일 입력이며 캐비앳으로 '변동금리 미반영' 명시(:3989, :6361)
- cash sweep·distribution lockup 미구현 — 매입 딜은 잉여현금 전액 즉시 분배 가정. 분양 엔진의 잉여현금 자동 차입상환(:1356)만 유사 기제
- 워터폴에 Hurdle·Promote 없음 — 잔여차익은 보통주 100%(:7072). Hurdle/Promote는 Claude 지시문 텍스트(:2439)와 시트 설명(:1707)에만 등장하고 엔진·엑셀 수식에는 없음
- 대출 트랜치 수는 고정(선순위 1개 + 계산 미반영 메자닌 1개) — 다중 선순위/A·B note 등 트랜치 개수 조절 불가. 리파이의 '대안 3개'는 동시 트랜치가 아니라 대체안 비교
- 지시문 모드의 Capital_Stack 시트는 실제 다운로드 엑셀에는 존재하지 않음(Claude 프롬프트 문구에만 추가, :2562) — '트랜치별 시트가 추가된다'는 UI 힌트(:2104)는 지시문 산출물 기준


## 렌트롤

### 입력 경로 (붙여넣기 + 파일 업로드)

두 경로 모두 지원: (1) 엑셀 범위 복사→textarea#rrPaste 붙여넣기 후 #rrParse 버튼 → RENTROLL.parseDelimited(탭/콤마 자동 판별, 콤마 CSV는 RFC4180 따옴표 인지 파싱), (2) 파일 업로드 input#rrFile(accept=.xlsx,.csv) — .xlsx는 자체 리더 XLSXREAD.readXlsx로 시트 중 데이터 최다 시트 선택(pickSheet), 그 외는 텍스트로 읽어 parseDelimited. 파서 모듈은 IIFE로 window.RENTROLL에 노출(파이프라인: parseDelimited→detectHeaderRow→autoMap→extractLeases→aggregate→validateLeases). 헤더 자동감지 후 열 매핑을 드롭다운으로 수동 수정 가능(rrMap change 핸들러). 전 과정 브라우저 로컬 처리, 서버 전송 없음.

> 증거: dart-search/web/modelter/index.html:7576 `function parseDelimited(text)` / :7975 `pb.addEventListener('click',...processGrid(RENTROLL.parseDelimited(t))` / :7978 `if(/\.xlsx$/i.test(f.name)){...XLSXREAD.readXlsx(new Uint8Array(fr.result))...}` / :7571-7824 렌트롤 모듈, :1667-1668 입력 UI

### 인식 필드 정확 목록

KW 키워드 사전 기준 11개 필드: name(임차인·테넌트·tenant·상호·업체 등), leasearea(임대면적·계약면적), netarea(전용면적), area(면적·평·㎡ 단일), rent(임대료·월임대료·월세), cam(관리비·공용관리비), deposit(보증금), start(시작·개시·입주), end(종료·만기·만료·expiry), rentfree(렌트프리·무상·fitout), stepup(상승·인상·escal·증액). 면적 열 우선순위는 임대면적→일반 면적→전용면적(전용은 참고 보관). 면적 단위(평/㎡)는 헤더 키워드→값 중앙값(>1000이면 ㎡)으로 자동판정, 임대료·관리비는 평당/총액을 헤더 '평당' 키워드→절대값 임계(임대료 100만원, 관리비 50만원)로 자동판정. 단, start(계약시작)는 매핑 UI(RR_FLDS)에 있고 인식만 될 뿐 extractLeases에서 map.start를 전혀 읽지 않아 계산에 미사용.

> 증거: dart-search/web/modelter/index.html:7597-7609 `var KW={name:[...],leasearea:[...],...,rentfree:['렌트프리','rentfree','rent free','무상','fitout','free'],stepup:[...]}` / :7651 `var areaCol=(map.leasearea!=null)?map.leasearea:((map.area!=null)?map.area:map.netarea)` / :7666,7678 평당/총액 판정 / grep 결과 map.start 사용처 0건

> 불확실: start 열 미사용은 grep(map\.start) 0건으로 확인했으나, 향후 표시용으로도 안 쓰는지는 전수 확인 안 함

### 만기 롤오버 처리 (연별 + 기대값)

월별이 아닌 연 단위 엔진. 실사용 엔진 leaseIncome/leaseModelV2에서 만기연차 eY=ceil(yrsToExp)로 올림 처리. 만기 전: 실제 임대료×(1+stepUp)^(y-1), 잔여 렌트프리 개월 차감. 만기 후: 시장임대료 marketPP×(1+mtm)로 전환하되 롤오버 첫해만 확률가중 기대값 — 점유계수 occF=renewP+(1-renewP)×max(0,(12-downtime)/12), 렌트프리계수 rfF=(12-newRentFree)/12 — 이후 mktStepUp로 성장. 업로드 시점 공실면적은 absorbMonths에 걸쳐 (1-stabVac)까지 선형 흡수(lease-up)하며 신규 흡수분에 렌트프리 헤어컷 차감. 기본가정(수정 가능 입력): 재계약률 70%·다운타임 6개월·신규 렌트프리 3개월·흡수 12개월·안정화 공실 5%·시장상승 3%/년. mtm은 applyRR에서 0 고정.

> 증거: dart-search/web/modelter/index.html:5969 `var eY=Math.max(1,Math.ceil(l.yrsToExp...))` / :5973 `var occF=first?(mkt.renewP+(1-mkt.renewP)*Math.max(0,(12-mkt.downtime)/12)):1; var rfF=first?Math.max(0,(12-mkt.newRentFree)/12):1` / :5976-5978 공실 흡수 / :7889 기본값 `['rr_renew','재계약률(%)',70],['rr_down','다운타임(개월)',6]` / :7905 `mtm:0`

### 엔진 이중화 — RENTROLL.leaseModel은 미사용

렌트롤 NOI 엔진이 2벌 존재: RENTROLL.leaseModel(파서 모듈 내, '연 단위+기대값 롤오버')과 leaseModelV2(+leaseIncome). 화면 결과(rrLeaseResult)·민감도·엑셀 오버라이드(leaseExtraSheets) 모두 leaseModelV2만 호출하고, RENTROLL.leaseModel은 정의·export만 되고 index.html과 tools/ 어디서도 호출되지 않음. 두 엔진은 로직이 다름(예: leaseModelV2는 보증금 승계 depSrc·거치상환·운용보수 feeY·세후 IRRat 포함, leaseModel은 미포함).

> 증거: dart-search/web/modelter/index.html:7730 `function leaseModel(leases, V, ro, hold){` (호출처 grep 0건) / :6123 `var r=leaseModelV2(rm.leases, assumFullV2(), rm.mkt, _H)` / :6262 엑셀도 leaseModelV2

### rent-free · step-up · TI/LC 존재 여부 (문제 B)

rent-free: 존재 — (a) 현 계약 잔여 렌트프리(rentfree 열, 개월)를 연도별 지급개월(paying=12-freeThis)에서 차감, (b) 신규·롤오버 계약용 newRentFree(기본 3개월) 별도. step-up: 존재 — 임차인별 stepup 열을 인식해 개별 상승률로 쓰고 없으면 시장상승률 fallback(l.stepUp!=null?l.stepUp:mkt.mktStepUp). TI/LC: 부재 — TI(임차인 공사비 지원)·LC(임대 중개수수료) 개념이 코드 어디에도 없음(grep: 'TI/LC', 'leasing commission', '중개수수료' 0건, 'fitout'은 렌트프리 열 동의어 키워드로만 1건). 재임대 비용은 렌트프리·다운타임으로만 표현되고, 자본적 지출은 일반 경상 capexAnnual뿐.

> 증거: dart-search/web/modelter/index.html:5970-5971 `var freeBefore=Math.max(0,(l.rentFreeRemain||0)-12*(y-1)); var freeThis=Math.min(12,freeBefore), paying=12-freeThis` / :5969 `var stp=(l.stepUp!=null?l.stepUp:mkt.mktStepUp)` / :7607 rentfree 동의어에만 'fitout'

> 불확실: 임차인별 stepup 열 값은 단위 변환 없이 그대로 소수로 사용됨(7686 `stepUp:...toNum(row[map.stepup])||null` → 5969 `Math.pow(1+stp,y-1)`). 시장상승률 입력은 /100 변환(7905 `mktStepUp:rrv('rr_step',3)/100`)되지만 열 값은 안 되므로, 열에 '3'(%)을 넣으면 연 300% 성장으로 계산되는 것으로 보임 — 실행 검증은 안 함(읽기 전용 감사)

### WALE · 만기 집중도 · 임차인 집중도

모두 존재. 순수 함수 rrRiskMetrics가 waleArea(면적 가중)·waleRent(임대료 가중, 만기 있는 계약만), exp12/exp36(12·36개월 내 만기 면적 비중), top1/top3(연임대료 기준, 동일 임차인명 합산), occupancy(임대가능면적 대비), 연도별 만기 스케줄(sched)을 산출. 판정 임계 MT_RISK: WALE ok≥4.0/watch≥2.5년, exp36 ok<30%/watch<50%, top1 ok<20%/watch<35%, top3 ok<45%/watch<65%, 점유 ok≥95%. 화면 '임대차 리스크' 카드(renderRRRisk)와 엑셀 Lease_Risk 시트(SUMPRODUCT 수식, 화면과 동일 정의) 양쪽에 구현. 엑셀 top1은 행 단위 MAX라 복수 행 임차인이면 화면(합산)과 다를 수 있다는 주석 존재, top3는 수식이 아닌 화면 산출값 하드코딩. WALE<2.5년이면 체크 레지스트리 경고(RR_WALE_SHORT)도 발생.

> 증거: dart-search/web/modelter/index.html:3712 `var MT_RISK={ wale:{ok:4.0,watch:2.5}, exp36:{ok:0.30,watch:0.50}, top1:{ok:0.20,watch:0.35},...}` / :3714-3734 rrRiskMetrics / :6323-6327 `lrow(3,'WALE — 면적 가중(년)','SUMPRODUCT(...)...')`·`'최대 임차인 비중...행 기준 — 동일 임차인 복수 행이면 화면(합산)과 다를 수 있음'` / :2816 RR_WALE_SHORT

### 임차인명 익명화·마스킹 (3계층)

(1) 저장 계층: applyRR이 rrModel.leases를 만들 때 name 필드를 아예 제외(area·rentPP·camPP·deposit·yrsToExp·rentFreeRemain·stepUp만) — 실명은 세션 한정 rrState에만 보관. (2) 공유 링크: sharePayload가 마스킹 토글과 무관하게 항상 '임차인A/B/...'로 치환해 링크에 실명을 담지 않음. (3) 표시 토글: 리스크 카드의 체크박스 #rrMaskCk(state.rrmask='1') → rrMaskOn()/rrAlias(i)/rrDisplayName(nm,i)로 화면(3746)·엑셀 01_Rent_Roll(6242, 6269-6271)·체크 레지스트리(2813)·인쇄(3443)에 일괄 적용. 문구도 '화면·엑셀·인쇄 모두 적용'(3776) 명시.

> 증거: dart-search/web/modelter/index.html:7907 `var leases=pending.ex.leases.map(function(l){ return {area:l.area, netArea:l.netArea, rentPP:l.rentPP, ...}; })` (name 없음) / :4830-4831 `o.name='임차인'+String.fromCharCode(65+(i%26))+...` / :3619-3621 `function rrMaskOn(){...} function rrAlias(i){...'임차인'+...} function rrDisplayName(nm,i){ return rrMaskOn()?rrAlias(i):(nm||('임차'+(i+1))); }`

### 행 단위 검증(validateLeases)

매핑 확정 전 원본 점검 경고 7종 존재: 면적 0/누락 행 제외(RR_ZERO_AREA, error), 음수 임대료(RR_NEGATIVE_RENT, error), 만기일 파싱 실패→만기 없음 처리(RR_DATE_PARSE_FAILED), 기준일(2026-06-30 하드코딩) 이전 만기(RR_EXPIRED_LEASE), 보증금만 있고 임대료 없음, 중복 임차인명(info), 임대면적 합계>임대가능면적 105%, 평당 월임대료 중앙값 스케일 이상(5천~40만원 범위 밖 → 월세/연세·평/㎡ 의심).

> 증거: dart-search/web/modelter/index.html:7777-7818 `function validateLeases(...)` / :7646 `var asOf=opts.asOf?parseDate(opts.asOf):new Date(2026,5,30)` (기준일 고정)

**지시서 가정과 다른 점**

- 작업지시서 문제 B가 'rent-free 개념 부재'를 전제한다면 사실과 다름 — 현 계약 잔여 렌트프리(rentfree 열→rentFreeRemain, 개월 단위 지급개월 차감)와 신규·롤오버 렌트프리(newRentFree) 모두 구현되어 있음 (index.html:5970-5973, 7607)
- step-up도 부재가 아님 — 임차인별 stepup 열 인식 + 시장상승률 fallback이 구현되어 있음 (index.html:5969, 7608). 다만 열 값에 %→소수 변환이 없어 '3' 입력 시 연 300%로 해석될 소지가 있음(단위 버그 의심)
- 문제 B 중 실제로 부재인 것은 TI/LC뿐 — TI(임차인 공사비 지원)·LC(중개수수료) 항목이 어디에도 없고, 재임대 비용은 렌트프리·다운타임으로만 근사됨
- 만기 롤오버를 '월별'로 가정했다면 불일치 — 엔진은 연 단위이며 만기를 연차로 올림(ceil) 처리하고, 다운타임·렌트프리를 첫해의 연내 비율 계수로 환산함 (index.html:5969-5974)
- 렌트롤 반영 엔진을 RENTROLL.leaseModel로 가정했다면 불일치 — 그 함수는 export만 되고 호출처가 없으며, 화면·민감도·엑셀 모두 leaseModelV2(+leaseIncome)를 사용함 (index.html:7730 정의 vs 6123/6200/6262 호출)
- 계약시작(start) 열은 헤더 인식·매핑 UI에는 있으나 계산에서 전혀 사용되지 않음 — '계약 시작일 반영'을 가정했다면 불일치
- 렌트롤은 오피스·물류 매입 딜에서만 동작(cur==='office'||'logistics' 가드, index.html:6122, 8041) — 개발·리파이 딜 렌트롤을 가정했다면 불일치


## 산출물(Excel·PPT·메모)과 메타 일관성

### XLSXGEN 오피스·물류 시트 수 (13시트의 실체)

오피스·물류 매입 엑셀은 XLTMPL 단일 템플릿에서 생성되며 시트 배열은 13개: 00_Cover, 01_Assumptions, 02_Sources_Uses, 03_Capital_Stack, 04_Operating_ProForma, 05_Debt_Schedule, 06_Tax_Disposition, 07_Equity_Waterfall, 08_Equity_Cashflow, 09_Return_Summary, 10_Sensitivity, 11_Validation_Checks(이상 12개 hidden:false) + _Calc(hidden:true). 즉 '13시트'는 숨김 시트 _Calc를 포함한 수치이고 사용자에게 보이는 시트는 12개다. 오피스와 물류는 같은 템플릿을 공유한다(다운로드 분기 6664·6685에서 refi/dev만 별도 처리, 나머지는 XLTMPL).

> 증거: dart-search/web/modelter/index.html:5498 `const XLTMPL={"sheets":[{"name":"00_Cover","hidden":false,...` — grep 결과 "hidden":false 12건, "hidden":true 1건(`"name":"_Calc","hidden":true`)

### XLSXGEN 개발(분양) 시트 수

공동주택 분양 사업수지 엑셀 devTemplate()은 정확히 6시트를 반환: 00_Cover, 01_Assumptions, 02_Unit_Mix, 03_Monthly_CF, 04_Profitability, 05_Sensitivity. 다운로드 토스트도 '(6시트·수식 연결)'.

> 증거: dart-search/web/modelter/index.html:6651 `return {sheets:[cover,asum,um,mc,pf,sens]};` / 6701 `toast('분양수지 엑셀 받기 완료 (6시트·수식 연결)')`

### XLSXGEN 리파이낸싱 시트 수

refiTemplate()은 정확히 4시트를 반환: 00_Cover, 01_Assumptions, 02_Term_Sheets, 03_Debt_Schedule. 다운로드 토스트도 '(4시트·수식 연결)'.

> 증거: dart-search/web/modelter/index.html:6449 `return {sheets:[cover,asum,ts,sch]};` / 6680 `toast('리파이낸싱 비교 엑셀 받기 완료 (4시트·수식 연결)')`

### 렌트롤 업로드 시 실제 시트 수는 13이 아님

렌트롤 임차인별(lease) 모드면 leaseExtraSheets()가 4개 시트(01_Rent_Roll, 02_Market_Assumptions, Lease_NOI_Buildup, Lease_Risk)를 13시트 템플릿에 추가해 실제 파일은 17시트가 되고, 집계 모드라도 rentRollSheet() 1개가 추가돼 14시트가 된다. 그러나 버튼·토스트·모든 공개 페이지 문구는 '13시트' 고정.

> 증거: dart-search/web/modelter/index.html:6341 `return {sheets:[sRR,sMA,sLB,sLR], ov:ov, leaseMode:true};` / 6778-6779 `var bytes = ext ? XLSXGEN.buildXlsx(_TPL, ov, ext.sheets, ext.ov) : (function(){ var rr=rentRollSheet(); return XLSXGEN.buildXlsx(_TPL, ov, rr?[rr]:null); })();`

### ICPPT 슬라이드 수

buildIcPptx()는 `total=7`로 고정하고 slides.push()를 정확히 7회, 전부 무조건 실행한다(S1 표지·S2 투자요약·S3 자본구조/수익분해·S4 핵심가정·S5 현금흐름(리파이는 연도별 DSCR)·S6 민감도·S7 리스크점검). 딜 유형별로 슬라이드 내용만 바뀌고 장수는 항상 7장. 토스트·버튼 문구('IC 패키지 7장')와 일치.

> 증거: dart-search/web/modelter/index.html:7247 `var r=D.r, raw=r.raw||{}, total=7, slides=[];` — slides.push는 7271/7294/7381/7392/7418/7468/7493의 7곳 / 7564 토스트 'IC 패키지 7장(표지·요약·구조·가정·현금흐름·민감도·점검)'

### 티저 슬라이드 수

원페이지 티저는 내장 base64 PPTX 양식(TPL_B64)의 slide1.xml 하나에 ⟦토큰⟧을 치환하는 방식으로 정확히 1장이며, 오피스·물류 매입 전용(dev·refi에서는 버튼 숨김, teaserValues()가 null 반환).

> 증거: dart-search/web/modelter/index.html:7088-7089 `var slide=XLSXREAD.entryText(files['ppt/slides/slide1.xml']); slide=slide.replace(/⟦(\w+)⟧/g,...)` / 7001 `if(!(cur==='office'||cur==='logistics')) return null;` / 6811 `var tz=$id('tzDownload'); if(tz) tz.hidden=(isDev||isRefi);`

### 화면 KPI vs 산출물의 결과 객체 공유 여부

공유되는 캐시 객체는 없다. 화면 KPI(renderSim), IC PPT(icData), 티저(teaserValues), 한 줄 보고(oneLineReport), 검토 메모(reviewMemo), 요약 PNG(summaryCardPNG), 인쇄 요약(buildPrintSummary)이 각각 simModel()을 독립적으로 재호출한다. simModel()은 state 기반 순수 계산(캐시·메모이제이션 없음)이라 값은 동일하지만 구조적으로는 '각자 재계산'이다. PPT는 IRR을 자체 수식으로 다시 계산하지 않고 simModel() 반환값(r.raw.IRR 등)을 그대로 표에 넣는다 — 단 S6 민감도 슬라이드만은 sens2Data()/devSens2()/__mtScenario()로 엔진을 격자 재실행한다(화면 히트맵과 같은 함수).

> 증거: dart-search/web/modelter/index.html:4293 `function simModel(){ if(cur==='office'||cur==='logistics') return simDcf(); ... }` / 4516(renderSim) · 7210(icData) · 7002(teaserValues) · 5149(oneLineReport) · 5171(reviewMemo) · 5240(summaryCardPNG) 모두 `r=simModel()` / 7425 `m=sens2Data(...)`, 7450 `var rr=global.__mtScenario(d.ec,d.g)`

### Excel의 숫자 소스 — 결과 객체가 아니라 입력+수식

엑셀은 화면 결과 객체를 쓰지 않는다. 오피스·물류는 XLTMPL 수식 템플릿에 assumOverrides()(입력값)만 주입해 엑셀 스스로 재계산하게 하고, dev·refi 템플릿도 입력값 기반 수식이다. 다만 11_Validation_Checks의 '자가 검증 스탬프'는 calcModel(assumFull()) — simDcf와 별개인 제3의 JS 재현 엔진 — 의 IRR·EM·minDSCR·netSale을 상수로 고정해 엑셀 수식과 PASS/FAIL 대조한다. 화면=엑셀 일치는 tools/parity 하네스로 별도 검증하는 구조.

> 증거: dart-search/web/modelter/index.html:6705-6706 `var ov=assumOverrides(); var _TPL=holdTemplate(XLTMPL, mtHold());` / 6732 `var _rS=calcModel(assumFull());` / 6739 `_pv2({r:'C19',role:'vf',n:_rS.IRR,...}); _pv2({r:'D19',...,f:'09_Return_Summary!E5'...})` / 5806 `function calcModel(V){...}` (별도 구현)

### 검토 메모·한 줄 보고의 숫자 출처

한 줄 보고 oneLineReport()는 simModel()의 r.kpis(big 3개) + dealVerdict(r) 판정 + shareLink(읽기 전용 링크)로 문자열을 조립하고, 검토 메모 reviewMemo()는 simModel().raw에서 매입가·uses·IRR·EM·minDSCR 등을 직접 포맷하며, 6) 다운사이드 줄만 __mtSensBase()/__mtSens2()로 엔진을 한 번 더 돌려 계산한다. 메모 끝에 mtBuild() 빌드 스탬프와 verification 링크를 붙인다.

> 증거: dart-search/web/modelter/index.html:5149-5167 (oneLineReport: simModel→kpis.big→dealVerdict→shareLink) / 5183 `L.push('1) 딜 개요 — 매입가 '+meok(w.price)+...)` / 5199 `var dsr=window.__mtSens2(b.ec+1.0, b.g-1.0, 'growth');` / 5235 `if(mtBuild()) L.push('※ 생성 빌드 '+mtBuild()+...)`

### 공개 페이지 산출물 개수 문구 대조표

매입 13시트·분양 6시트·리파이 4시트·IC PPT 7장·티저 1장 표기는 5개 페이지 전체에서 서로 일치한다. [매입 13시트] index.html 9(meta)·1378·1382·1536·1599·6793(토스트)·6809 / guide.html 29(FAQ JSON-LD) / howto.html 7·25·96·181 / verification.html 73. [분양 6시트] index.html 1382·6701 / guide.html 29 / verification.html 73. [리파이 4시트] index.html 1363·6680 / guide.html 29 / verification.html 73. [PPT 7장] index.html 1310·1538·7564 / howto.html 7·25·96·182. [티저 1장] index.html 1537 / howto.html 183. 불일치는 개수 자체가 아니라 (a) index.html meta description(9행)이 딜 4종을 나열하면서 '13시트 Excel'만 대표로 쓰는 반면 guide.html FAQ(29행)는 13/6/4를 딜별로 정확히 구분하는 표현 차이, (b) 렌트롤 반영 시 실제 14~17시트가 되는데 모든 페이지가 13 고정, (c) trust.html 98행 '1~2장 PDF'는 신뢰 문서 인쇄 안내로 산출물 개수와 무관.

> 증거: dart-search/web/modelter/guide.html:29 `오피스·물류센터 매입(레버드 DCF 13시트), 공동주택 분양 사업수지(...6시트), 리파이낸싱 대안 비교(...4시트)` / index.html:9 meta description `수식이 살아있는 13시트 Excel 모델` / verification.html:73 `오피스 매입 (13시트)...공동주택 분양 사업수지 (6시트)...리파이낸싱 비교 (4시트)`

### 마지막 업데이트 날짜 표기 불일치

index.html 푸터는 '마지막 업데이트 2026-07-02'(1650행)인데 같은 파일의 빌드 스탬프 MT_BUILD는 '2026-07-10·003110971d'(1927행), verification.html은 datePublished 2026-07-10(19행)과 '빌드 2026-07-10·003110971d · git fbc1633'(68행), trust.html은 '개정 2026-07-09 최초 공개'(193행)다. 즉 본체 푸터 날짜만 8일 뒤처져 있다. guide.html·howto.html에는 업데이트 날짜 표기가 아예 없다(© 2026 Modelter만, 각 237·211행).

> 증거: dart-search/web/modelter/index.html:1650 `© 2026 · 마지막 업데이트 2026-07-02` vs index.html:1927 `window.MT_BUILD='2026-07-10·003110971d';` vs verification.html:68 `빌드 <b>2026-07-10·003110971d</b> · git fbc1633 · 2026-07-10`

### IC PPT '재계산 없음' 문구 vs 실제 코드

S1 표지 고지와 버튼 title(1538행)은 '화면 결과 그대로, 재계산 없음'이라고 쓰지만, S6 민감도 슬라이드는 sens2Data()/devSens2()로 격자 전체를 엔진 재실행하고 시나리오 표도 __mtScenario()를 3회 호출한다(슬라이드 각주 스스로 '모델 전체 재계산'이라 표기). KPI·가정·현금흐름 표는 재계산 없이 옮기는 게 맞으므로 절반만 정확한 문구다.

> 증거: dart-search/web/modelter/index.html:7270 `...재계산 없이 그대로 옮겨졌습니다...` vs 7425-7426 `m=sens2Data(...)` / `m=devSens2()` 및 7440 `'...레버드 IRR — 모델 전체 재계산.'`

### 모델 깊이(DEPTHS) 시트 범위 라벨 vs 실제 sheetListFor 산출 (Claude in Excel 지시문 빌더 — XLSXGEN과 별개 기능)

DEPTHS 라벨은 quick '1~3시트', standard '5~8시트', deep '10시트+'인데, sheetListFor() 실제 계산으로 standard 오피스는 CORE_STD 3(Source_Data·Assumptions·Sources_Uses) + 딜 시트 7−STD_EXCLUDE 2 = 5 + Validation_Checks 1 = 9시트(우선주 기본 on이면 Capital_Stack·Waterfall 추가로 11까지), dev standard는 3+7+1=11시트로 '5~8시트' 범위를 초과한다. quick(오피스 3)·deep(오피스 15)은 라벨과 부합. 이 시트 목록은 DEALS[].sheets(1744·1778·1812·1863행) 기반의 프롬프트 생성용으로, 실제 XLSX 13/6/4시트와는 다른 체계다.

> 증거: dart-search/web/modelter/index.html:1890-1892 `quick:{...range:"1~3시트"...}, standard:{...range:"5~8시트"...}, deep:{...range:"10시트+"...}` / 2543-2556 `const CORE_STD=["Source_Data","Assumptions","Sources_Uses"]; ... sheets=[...new Set([...CORE_STD,...stdDealSheets,...TAIL])];` / 1909-1913 STD_EXCLUDE office:["Rent_Roll","Sensitivity"]

> 불확실: 자본구조 시트(Capital_Stack·Waterfall) 추가 여부는 stackState 런타임 값(mezz_on/pref_on)에 달려 있어 기본 UI 상태를 실행 확인하지는 않음. 다만 스택 시트 없이도 9~11시트로 라벨 상한 8을 넘는 것은 정적 계산으로 확정.

### buildSheetXml / XLSXGEN 구조

buildSheetXml(sheet,...)은 XLSXGEN 모듈 내부 시트 XML 직렬화 함수이고, buildXlsx(t, ov, extraSheets, extraOv)가 t.sheets 배열을 map으로 순회해 워크북을 조립한다. 시트 수는 전적으로 넘겨준 템플릿 배열 길이 + extraSheets로 결정된다.

> 증거: dart-search/web/modelter/index.html:5598 `function buildSheetXml(sheet, xfMap, xfList){` / 5679 `var sheetsMeta=t.sheets.map(function(s){return buildSheetXml(s, xfMap, xfList);});` / 5731 `global.XLSXGEN=api;`

**지시서 가정과 다른 점**

- '오피스·물류 13시트'는 숨김 계산 시트 _Calc를 포함한 수치다 — 사용자에게 보이는 시트는 12개(00_Cover~11_Validation_Checks). '13시트' 공표치를 검증하는 CI를 만들 때 hidden 포함 기준을 명시해야 한다 (index.html:5498).
- 렌트롤을 올리면 실제 다운로드 파일은 13시트가 아니라 14시트(집계 1장 추가) 또는 17시트(임차인별 모드 4장 추가)가 된다 — 모든 공개 문구는 13 고정 (index.html:6341, 6778-6779).
- '화면 KPI와 산출물이 같은 결과 객체를 쓴다'는 가정과 달리, 공유 캐시 객체는 없고 각 산출물(PPT·티저·메모·한줄보고·PNG)이 simModel()을 독립 재호출한다. 값은 순수함수라 동일하지만 '단일 결과 객체 파이프라인'은 아니다 (index.html:4293, 7210, 7002, 5149, 5171).
- Excel은 화면 결과 객체를 아예 쓰지 않고 입력값+살아있는 수식으로 재구성되며, 자가검증 스탬프의 '웹 계산값'은 simDcf가 아닌 별도 JS 재현 엔진 calcModel(assumFull())에서 나온다 — 화면 엔진과 3중 구현(simDcf / XLTMPL 수식 / calcModel)이 존재하고 일치는 파리티 하네스에 의존한다 (index.html:6732, 5806).
- IC PPT의 '재계산 없음' 고지(버튼 title·S1 표지)는 민감도·시나리오 슬라이드(S6)에는 사실이 아니다 — sens2Data/devSens2/__mtScenario로 엔진을 재실행한다 (index.html:7270 vs 7425-7450).
- 모델 깊이 라벨 '표준 5~8시트'(Claude in Excel 지시문 빌더)는 실제 sheetListFor() 산출(오피스 9~11시트, 개발 11시트)과 맞지 않는다 — 다만 이는 XLSX 13/6/4시트와 별개의 프롬프트용 시트 체계다 (index.html:1890-1892 vs 2540-2566).
- index.html 푸터 '마지막 업데이트 2026-07-02'가 빌드 스탬프(MT_BUILD 2026-07-10)·verification.html(2026-07-10)과 8일 어긋난다. guide.html·howto.html에는 업데이트 날짜 표기 자체가 없다 (index.html:1650 vs 1927, verification.html:68).
- 작업지시서 검색 힌트 중 'ICPPT slides'는 배열 상수가 아니라 buildIcPptx() 안에서 slides.push() 7회로 조립되는 지역 변수다 — 슬라이드 수를 CI로 검증하려면 push 호출 수 또는 total=7 상수를 봐야 한다 (index.html:7247).


## 저장·버전·공유

### 딜 저장 localStorage 키·스키마

딜 워크스페이스 키는 'mt_deals'(WS_KEY), 스키마 문자열 '1.0'(WS_SCHEMA). 구조는 {schema, deals:{dealId:{id,name,createdAt,updatedAt,currentVersionId,versions:[],outputs:[],status}}}. 캐시(_wsCache) 경유로 읽고 wsPersist()가 통째로 JSON.stringify 저장. 레거시 'mt_slots'는 wsMigrateSlots()로 1회 이관.

> 증거: dart-search/web/modelter/index.html:2850 `var WS_KEY='mt_deals', WS_SCHEMA='1.0';` / :2859 `localStorage.setItem(WS_KEY, JSON.stringify(_wsCache))` / :2864 `JSON.parse(localStorage.getItem('mt_slots')||'null')`

### 버전 배열 구조

딜당 versions 배열이 있고 각 버전은 {id, n, label:'v0.N', name(설명), createdAt, hash(FNV-1a 8자리 hex, wsHash), snap(입력 전체 딥카피), summary(재계산 KPI 추출)}. 결과값은 하드코딩하지 않고 snap만 저장 후 복원 시 엔진이 재계산(summary는 computeForSnapshot로 추출만).

> 증거: index.html:2897-2903 `wsAddVersion`: `label:'v0.'+n ... hash:wsHash(snap), snap:JSON.parse(JSON.stringify(snap)), summary:wsSummary(snap)` / :2873 주석 '입력값만 저장하고, 복원 시 엔진이 결과를 재계산'

### 용량 위험·쿼터 처리

버전마다 snap 전체(state+stackState+refiState+렌트롤 leases 배열)를 딥카피로 누적 저장 — 버전 수 제한 없음. outputs(산출물 이력)만 60건으로 절단. 용량 초과는 setItem 실패 catch에서 토스트('저장 공간이 부족합니다 — 딜을 .modelter로 백업 후 정리하세요')로만 대응, 사전 용량 측정·경고 없음.

> 증거: index.html:2911 `if(deal.outputs.length>60) deal.outputs=deal.outputs.slice(-60);` / :2859 catch 내 toast

> 불확실: 실측 용량은 렌트롤 규모에 따라 다름 — 임차인 수십 개×버전 수십 개면 수백 KB 수준으로 추정(코드상 상한 없음)

### 렌트롤 원본·임차인 실명 저장 여부

원본 파일(binary)은 저장 경로 자체가 없음(붙여넣기 텍스트 파싱만). 렌트롤 확정(applyRR) 시 rrModel.leases는 name 필드를 아예 빼고 {area,netArea,rentPP,camPP,deposit,yrsToExp,rentFreeRemain,stepUp}만 담음 — 따라서 mt_deals(wsSnapshot의 rr)와 .modelter에는 임차인 실명이 저장되지 않음. 실명은 window.rrState(메모리 전용, wsSnapshot·saveLocal 미포함)에만 존재. 자동저장 mt_state(saveLocal)는 rr 자체를 포함하지 않음.

> 증거: index.html:7907 `var leases=pending.ex.leases.map(function(l){ return {area:l.area, netArea:l.netArea, rentPP:l.rentPP, ...} });` (name 없음) / :2878 wsSnapshot `rr:{leases:window.rrModel.leases,mkt:...}` / :5430 saveLocal 페이로드에 rr 없음

### 딜 복제·상태 태그

복제는 wsDupDeal: 열려 있는 딜이면 화면 상태(미저장 변경 포함), 아니면 현재 버전 snap으로 새 딜 v0.1 생성 — 원본 이력 불변. 상태 태그는 WS_STATUSES=['검토중','IC 상정','보류','클로징','드랍'], deal.status(기본 '검토중')로 저장, 필터(WSFILTER)와 파이프라인 보고(wsPipelineReport)에 사용.

> 증거: index.html:2948-2963 `wsDupDeal` / :3189 `var WS_STATUSES=['검토중','IC 상정','보류','클로징','드랍'];` / :3380 `d.status=t.value; wsPersist();`

### .modelter 백업 파일 — 실존

실제 존재함. 내보내기: {fileType:'MODELTER_DEAL_EXPORT', schema:'1.0', exportedAt, deal(버전·산출물 이력 포함 딥카피)}를 'Modelter_Deal_<딜명>_<YYYYMMDD>.modelter'로 다운로드. 가져오기(wsImportFile): fileType 검증 + schema 메이저 '1' 검사, 딜/버전/산출물 ID 재발급, 이름 충돌 시 ' (가져옴)' 접미. UI는 백업 패널의 파일 input(accept='.modelter,application/json').

> 증거: index.html:3015 `{fileType:'MODELTER_DEAL_EXPORT', schema:WS_SCHEMA, ...}` / :3022 `a.download='Modelter_Deal_'+nm+'_'+ymd+'.modelter'` / :3026-3027 fileType·schema 검증 / :3337 `<input type="file" id="wsImport" accept=".modelter,application/json">`

### 엑셀 라운드트립(xlsx_restore)

.modelter와 별개로 존재. 생성 xlsx 안에 평문 마커 `MTSNAP1:<mtLZ payload>:PANSTM`가 STORE 시트에 심어지고, '엑셀에서 복원(.xlsx)' input이 파일을 텍스트로 읽어 정규식 매치→mtLZ.decompress→applySharedPayload로 복원. 스냅샷은 __mtSnapForXlsx=encodeState(마스킹 payload)라 실명 미포함. 이벤트 mtTrack('xlsx_restore').

> 증거: index.html:3391 `txt.match(/MTSNAP1:([A-Za-z0-9_-]+):PANSTM/)` / :4838 `window.__mtSnapForXlsx=function(){ ...encodeState()... }` / :5672 STORE 시트 문구 '임차인 실명은 담기지 않습니다'

### 공유 링크 인코딩(mtLZ)

mtLZ는 자체 구현 LZW(12비트 고정폭, 사전 4096 동결) + 4바이트 원문 길이 프리픽스 → base64url(A-Za-z0-9-_). encodeState()=mtLZ.compress(JSON.stringify(sharePayload())). shareLink(readonly,src)가 '#v='(읽기전용)/'#e='(편집) + 선택적 '&src='(화이트리스트 8채널: xlsx,ppt,png,qr,share,notes,team,hero)를 붙임. 레거시 '#d='(비압축 base64)도 복원 호환.

> 증거: index.html:4778-4825 mtLZ 구현 / :4842-4848 `return location.origin+location.pathname+"#"+(readonly?"v":"e")+"="+enc+(s?"&src="+s:"");` / :5403 레거시 `[#&]d=` 처리

### 임차인명 마스킹 — 인코딩 단계 적용

sharePayload()가 인코딩 직전에 rr.leases를 복사하며 name을 '임차인A/B/…'(26개 초과 시 A1식 접미)로 치환 — #v·#e 모두 동일 함수(encodeState)를 쓰므로 편집용 링크에도 적용. 단 실무상 rrModel.leases에는 name이 애초에 없어(applyRR에서 제거) 이 마스킹은 이중 방어. 반면 state.asset(자산명)·면적·임대료·보증금·만기 수치는 마스킹 없이 그대로 링크에 포함.

> 증거: index.html:4830-4831 `o.name='임차인'+String.fromCharCode(65+(i%26))+(i>=26?Math.floor(i/26):'')` / :4826 주석 '임차인 실명은 마스킹해 링크에 담지 않음'

### 링크 포함/제외 목록

포함: {c(딜유형), d(깊이), s(state 전체 — 자산명 포함), k(자본스택), r(리파이), rr(마스킹 렌트롤), ek(예시키), ue, st(가정 출처 태그)}. 제외: BYOK API 키(메모리 변수 KEY + 선택 시 sessionStorage 'mt_byok_k'만 — 주석에 'localStorage·state·공유 링크에 절대 저장하지 않음'), mt_mydef/mt_house 프리셋(#v/#e에는 불포함, #h= 전용), 렌트롤 원본 파일, 딜 이름·버전 이력(ws 메타데이터).

> 증거: index.html:4835 `return {c:cur,d:depth,s:state,k:stackState,r:refiState,rr:rr,ek:...,ue:...,st:srcTags};` / :10499 주석 '키는 메모리 보관(선택 시 이 탭 세션스토리지) — localStorage·state·공유 링크에 절대 저장하지 않음' / :10502 `var SS_KEY='mt_byok_k';`

### 읽기전용(#v) vs 편집(#e) 차이

tryRestoreFromURL이 `[#&][ev]=` 매치 후 #v면 enterReadonly(): window.__mtReadonly=true + body.mt-ro 클래스 + roBanner/roCta 표시, 모바일은 결과 카드로 자동 스크롤. '내 모델로 열기'(__mtExitReadonly)로 해제되며 해시 제거. #e는 그대로 편집 가능. 읽기전용에서는 내 기본값 등 일부 기능 차단(myDefPop이 __mtReadonly 검사).

> 증거: index.html:5399-5401 `var mNew=h.match(/[#&][ev]=([^&]+)/), readonly=/[#&]v=/.test(h); ... if(readonly) enterReadonly();` / :5410-5420 enterReadonly / :4894 `if(window.__mtReadonly){ toast('읽기 전용 모드에서는 사용할 수 없습니다'); return; }`

### payload 버전 필드

#v/#e 공유 payload에는 버전/스키마 필드가 없음(c,d,s,k,r,rr,ek,ue,st 뿐). 포맷 세대 구분은 해시 파라미터 이름으로만 함(#d=레거시 비압축 → #v/#e=LZW v2). 스키마 버전 필드는 .modelter 파일(schema:'1.0')과 mt_deals(schema:'1.0')에만 존재.

> 증거: index.html:4835 sharePayload 반환 객체(버전 키 없음) / :4777 주석 '입력값 URL 공유 (v2: LZW 압축 + 읽기 전용)' / :3015 `schema:WS_SCHEMA`

### URL 길이 경고

링크 복사 경로(shareLink→copyShare)에는 길이 검사·경고가 전혀 없음. 유일한 길이 관련 처리는 QR 생성: QR 타입 5~40을 순차 시도 후 전부 실패하면 토스트 '링크가 너무 깁니다 — 렌트롤을 제외하고 다시 시도해 보세요'. 즉 카톡·메일에서 잘릴 수 있는 초장문 URL에 대한 사전 경고는 부재.

> 증거: index.html:10461-10462 `for(t=5;t<=40;t++){...} if(!qr){ toast('링크가 너무 깁니다 — 렌트롤을 제외하고 다시 시도해 보세요'); return; }` / :4842-4856 shareLink·copyShare에 length 검사 없음

### 공유 전 preflight(포함 정보 미리보기) UI

딜 공유(#v/#e)에는 없음. 공유 팝오버(sharePop)는 하단 고정 고지문 한 줄('서버에 저장하지 않습니다 — 딜 정보는 링크 안에만 담기고, 임차인 실명은 링크에서 마스킹됩니다')뿐이고, 실제 포함 데이터 목록을 보여주는 미리보기는 없음. exConfirmOutput은 '예시 숫자 잔존' 확인일 뿐 포함 정보 미리보기가 아님. 미리보기 모달은 #h=(팀 기준 설치) 수신 측(houseImportPreview)에만 존재. 태스크 목록상 V6 '공유 프리플라이트 라이트 — 링크 포함 정보 미리보기'가 pending.

> 증거: index.html:5315 `'<div class="sp-note">서버에 저장하지 않습니다 — ... 임차인 실명은 링크에서 마스킹됩니다.</div>'` / :1969-1979 exConfirmOutput(예시값 확인 전용) / :4311-4329 houseImportPreview(#h= 전용 미리보기)

### 내 기본값(mydef) 저장 구조

키 'mt_mydef'. 구조: {office|logistics|dev|refi: {s:{화이트리스트 키만}, k:자본스택 복사 or null, at:ISO일시}}. 저장 가능 키는 MYDEF_KEYS로 딜 유형별 고정(office/logistics: acqtax·acqfee·depmult·depassume·opfee·fixcost·salefee·prepayfee·dispfee, dev: taxpct 등 11개, refi: dscrmin·prepayfee·newfee) — 매입가·임대료 등 딜 고유값은 구조적으로 저장 불가. 적용 시 srcTags에 '회사 표준' 출처 태그 기록.

> 증거: index.html:4858-4863 `const MYDEF_KEYS={office:[...],dev:[...],refi:[...]}` / :4877 `db[cur]={s:s, k:kk, at:new Date().toISOString()};` / :4886 `srcTags[k]={s:'회사 표준'}`

### 하우스 기준(house) 저장·배포 구조

키 'mt_house'. 평면 객체 {irr,dscr,ltv,team,ver,at}(문자열). houseOn()은 irr/dscr/ltv 중 하나라도 >0이면 활성 — 판정·커버넌트·대주 뷰가 통상값(IRR 8%·DSCR 1.2x·LTV 60%) 대신 사용. 팀 배포는 #h= 링크: pay={h:mt_house, at, md:mt_mydef 전체}를 mtLZ로 압축 — 수신 측은 houseImportPreview 표로 확인 후 클릭해야 적용(자동 적용 금지, 적용 시 mt_house 덮어쓰기 + mt_mydef 병합).

> 증거: index.html:4297 `houseLoad ... localStorage.getItem('mt_house')` / :4304-4309 `houseShareLink`: `var pay={h:h, at:...}; ... pay.md=md; ... '#h='+enc` / :4336-4338 apply 시 setItem('mt_house')·mt_mydef 병합

### localStorage/sessionStorage 키 전수 목록

localStorage: mt_theme(테마), mt_deals(딜 워크스페이스), mt_slots(레거시·이관용), mt_state(입력 자동저장, rr 미포함), mt_house, mt_mydef, mt_tip_next, mt_coach, mt_visited, mt_onboarded, mt_adjauto, mt_qa(운영자 QA 제외 플래그), mt_src, mt_nudge, mt_wn_snooze_v4(What's new 스누즈). sessionStorage: mt_byok_k(API 키, 옵트인), mt_ex_ack(예시값 경고 1회 확인).

> 증거: index.html:2850,4297,4864,5430,10502,10998 등 (grep 'mt_' 전수) / :10998 `var SNOOZE='mt_wn_snooze_v4';`

### 공유 링크 2개 diff·복원 우선순위(부가)

백업 패널에 공유 링크 2개(#v/#e)를 붙여넣어 가정 변경점을 표로 비교하는 wsLinkDiff가 있음(wsParseLink가 로컬에서 mtLZ 해독 — 서버 미경유). 부팅 복원 순서는 URL 공유값(#h는 비차단 미리보기만) > 로컬 mt_state > 예시.

> 증거: index.html:3249-3269 wsParseLink·wsLinkDiff / :5476-5477 `// URL 공유값 > 브라우저 저장값 > 예시 순으로 복원  if(!tryRestoreFromURL() && !tryRestoreLocal()) fillExample();`

**지시서 가정과 다른 점**

- 공유 전 '포함 정보 미리보기(preflight)' UI는 존재하지 않음 — sharePop의 고정 고지문 1줄과 예시값 잔존 확인(exConfirmOutput)뿐. 실제 포함 데이터 미리보기 모달은 #h=(팀 기준 설치) 수신 측에만 있음. 태스크 V6('공유 프리플라이트 라이트')가 pending 상태로, 지시서가 '있다'고 가정했다면 미구현 계획 항목임
- URL 길이 경고는 링크 복사 경로에 없음 — QR 생성 실패 시에만 '링크가 너무 깁니다' 토스트가 뜸(index.html:10462). 일반 #v/#e 복사에는 길이 검사·경고 코드가 전혀 없음
- #v/#e 공유 payload에는 버전(스키마) 필드가 없음 — 버전 필드는 .modelter 파일(schema:'1.0')과 mt_deals에만 존재. 링크 포맷 세대는 해시 파라미터 이름(#d= 레거시 vs #v/#e)으로만 구분
- 임차인명 마스킹은 인코딩 단계(sharePayload)에서 적용되지만, 실제로는 렌트롤 확정 시점(applyRR, index.html:7907)에 name 필드가 이미 제거되어 rrModel에 실명이 없음 — 마스킹 함수는 이중 방어. 지시서가 '마스킹이 유일한 방어선'이라 가정했다면 실제 구조와 다름. 반대로 state.asset(자산명)은 어떤 단계에서도 마스킹되지 않고 링크에 포함됨
- '.modelter 백업 파일 기능'은 지시서 가정대로 실존함(export/import 모두, index.html:3012-3037) — 불일치 아님을 명시. 추가로 지시서에 없을 수 있는 엑셀 라운드트립 복원(MTSNAP1 마커, :3391)도 병존


## 파리티·CI·성능 예산

### gen-xlsx.js 지원 딜

파리티 1단계 생성기는 office·logistics·dev·refi 4딜 전부 지원. 헤드리스로 배포 index.html을 로드해 fillExample()→simModel()→엑셀 blob 캡처 + 엔진 기대값(expected.json)을 덤프. logistics 드라이버는 office 드라이버의 문자열 치환으로 생성.

> 증거: tools/parity/gen-xlsx.js:17 `if (!['office', 'logistics', 'dev', 'refi'].includes(DEAL))` / :93 `DRIVERS.logistics = DRIVERS.office.replace('"office"', '"logistics"')`

### check.py 지원 딜 — refi 포함

2단계 재계산 검증기(check.py)는 refi를 포함한 4딜 전부 지원. refi는 02_Term_Sheets 시트의 C/D/E열(대안 1/2/3) × 5행(5=대출금, 13=1차년 DSCR, 14=최소 DSCR, 15=총이자, 16=만기잔액) = 15개 지표를 python formulas 엔진으로 재계산 비교. 파일 수정시각 2026-07-10 07:42 — 태스크 V2(리파이 파리티 편입, completed)로 최근 편입됨.

> 증거: tools/parity/check.py:14 `if deal not in ('office', 'logistics', 'dev', 'refi')` / :58-70 refi 분기 `cols = ['C','D','E']` + `('대안%s 대출금'...'만기잔액')`

### office/logistics 검증 지표·허용 오차

09_Return_Summary 시트 6개 지표: 세전 IRR(E5, tol 0.001), 세후 IRR(E6, 0.001), EM(E7, 0.01), 평균 CoC 보통주(C8, 0.001), 최소 DSCR(C13, 0.01), 언레버드 IRR(C12, 0.001). C=보통주·D=우선주·E=총자기자본 열 구조.

> 증거: tools/parity/check.py:37-46 `checks = [('세전 IRR(총자기자본)', cell('09_Return_Summary','E5'), exp['IRR'], 0.001), ...]`

### dev 검증 지표·허용 오차

04_PROFITABILITY 시트 8개 지표: 분양수입(C5, 상대 1e-9), 금융비 이자(C14, 상대 1e-7), 본PF 한도(C16, 상대 1e-7), 사업이익(C21, 상대 1e-7), 이익률(C22, 절대 1e-9), 종료 시 미상환(C26, 절대 1.0원), EM(C28, 1e-6), 연환산 IRR(C29, 1e-6). 이익률은 engine %값을 /100해 비교.

> 증거: tools/parity/check.py:47-57 `('분양수입', cell('04_PROFITABILITY','C5'), exp['rev'], max(1e-6, abs(exp['rev'])*1e-9)), ... ('이익률', ..., exp['margin']/100.0, 1e-9)`

### refi 검증 지표·허용 오차

대안별(최대 3개, exp['rows'][:3]) 5개 지표 = 15개: 대출금(상대 1e-9), 1차년 DSCR(0.001), 최소 DSCR(0.001), 총이자(max(1.0, 상대 1e-7)), 만기잔액(max(1.0, 상대 1e-7)). 어긋나면 exit 1.

> 증거: tools/parity/check.py:64-70, :80 `sys.exit(1 if fails else 0)`

### gen-verification.js 파리티 범위

DEALS 배열에 4딜 전부(office·logistics·dev·refi) 포함, 각 딜에 대해 gen-xlsx.js→check.py를 실제 실행(runParity)해 PASS/FAIL/미실행·최대 오차·지표 수를 verification.html 표로 게시. Python·formulas가 없으면 ok=null('미실행')로 표기하고 절차만 게시.

> 증거: tools/gen-verification.js:20 `const DEALS = [{k:'office',...},{k:'logistics',...},{k:'dev',...},{k:'refi', n:'리파이낸싱 비교 (4시트)'}]` / :23-32 runParity()

### verification.html 공개 문구·표

현재 생성본 제목은 '파리티 결과 — 전 딜 일치'(allOK일 때)이고 표에 4딜 전부 PASS: 오피스(최대 오차 2.2e-15·6지표), 물류(4.4e-16·6지표), 분양(1.2e-10·8지표), 리파이낸싱 비교(1.8e-12·15지표). 리파이 행 존재함. 재현 절차 4단계에 'refi 넣어 반복 — 4딜 전수' 명시.

> 증거: dart-search/web/modelter/verification.html:72-73 `<h2>파리티 결과 — 전 딜 일치</h2>` + `<td>리파이낸싱 비교 (4시트)</td><td><span class="pass">PASS</span></td><td>최대 오차 1.8e-12 · 15개 지표</td>`

> 불확실: verification.html의 공개 문구 '허용 오차 5e-4 이내면 PASS'(gen-verification.js:133)는 check.py 실제 허용 오차(EM·minDSCR 0.01, IRR 0.001 등)와 정확히 일치하지 않음 — 일부 지표는 5e-4보다 느슨함

### modelter-ci-check.js 성능 예산 마커·측정 방식

파일 최상단 섹션 0(16-23행)에 2개 예산: ① 렌더 블로킹 외부 CSS 0건 — noscript 제거 후 https 외부 stylesheet가 전부 media="print"인지 검사(20행), ② gzip<300KB — zlib.gzipSync(level 6) 바이트를 Math.round(/1024)로 KB 환산해 <300 검사(22-23행). dev 재계산<500ms 예산은 이 파일에 없고 tools/qa/smoke.js:182에 있음(update() 7회 실행 중앙값 runs[3] < 500ms, Playwright 실브라우저 필요). 또한 1g 섹션(238-257행)이 verification.html 존재·4딜 표 포함(254행)·check.py refi 지원(256행)을 정적 마커로 강제.

> 증거: tools/modelter-ci-check.js:22-23 `const gzKB = Math.round(require('zlib').gzipSync(Buffer.from(html), { level: 6 }).length / 1024); ok(gzKB < 300, ...)` / tools/qa/smoke.js:182 `ok(perf < 500, 'dev update 중앙값 ...')`

### 현재 gzip 크기·여유

배포 index.html(862,443바이트 원본)의 gzip CLI 측정 = 265,287바이트(≈259.1KiB). CI와 동일 방식(zlib level 6) 측정 = 268,979바이트 → CI 표기 263KB. 300KB 게이트까지 여유 37KB(CI 기준). 이전 기록 261KB에서 약 2KB 증가.

> 증거: 실측: `gzip -c dart-search/web/modelter/index.html | wc -c` → 265287 / node zlib level6 → 268979 bytes = 263KB (tools/modelter-ci-check.js:22 방식 재현)

### 파리티 실패 → 배포 차단 구조

차단은 '수동 절차상 게이트'일 뿐 자동 파이프라인 강제가 아님. ① gen-verification.js는 FAIL 딜이 있으면 exit 1(157-162행)하지만, 이 스크립트를 실행하는 GitHub 워크플로·git hook·package.json이 전혀 없음(수동 릴리스 절차 docs/STRATEGY.md:78-84에서만 호출). ② 자동으로 도는 것은 modelter-ci.yml의 modelter-ci-check.js뿐인데, 이는 파리티 재계산을 실행하지 않고 정적 마커(파일 존재·refi 문자열)만 검사. ③ modelter-ci.yml 스스로 '하드 게이트로 만들려면 브랜치 보호 규칙 필요'라고 주석(3-4행) — 현재는 빨간불 알림이며 Cloudflare는 master 푸시 시 CI 결과와 무관하게 배포. ④ Python·formulas 미설치 시 ok=null('미실행')로 exit 0 — 차단 안 됨(158행은 ok===false만 필터). ⑤ verification.html은 게이트 판정 전에 이미 기록됨(155행 write → 158행 검사)이라 FAIL 표가 찍힌 페이지를 커밋·푸시하면 그대로 배포됨.

> 증거: tools/gen-verification.js:155-162 `fs.writeFileSync(OUT, html); ... const failed = results.filter(r => r.ok === false); if (failed.length) { ... process.exit(1); }` / .github/workflows/modelter-ci.yml:3-4, :31 (run: node tools/modelter-ci-check.js 만) / .git/hooks 비어 있음, 루트 package.json 없음

**지시서 가정과 다른 점**

- check.py의 refi 미지원 의심(작업지시서 힌트 'refi 포함 여부!')과 달리, check.py는 refi를 실검증함(check.py:14, 58-70; 태스크 V2 완료, 2026-07-10 07:42 수정) — 다만 문서 2곳이 코드보다 뒤처짐: CLAUDE.md 파리티 명령은 여전히 'check.py office|logistics|dev'(refi 누락), tools/parity/README.md:24-28·43은 refi를 '생성·수식 존재 확인용'으로만 표기
- CLAUDE.md의 'CI가 강제하는 성능 예산(gzip<300KB·렌더 블로킹 외부 CSS 0건·dev 재계산<500ms)' 중 dev<500ms는 CI(modelter-ci-check.js·GitHub Actions)가 아니라 tools/qa/smoke.js:182(Playwright, 수동 실행)에만 있음 — 어떤 GitHub 워크플로도 smoke.js를 실행하지 않으므로 자동 강제 아님
- STRATEGY.md:81·verification.html의 '파리티 FAIL 시 배포 차단' 문구와 달리, gen-verification.js exit 1은 수동 릴리스 절차에서만 작동 — 자동 배포 경로(master 푸시 → Cloudflare)에는 파리티가 전혀 연결돼 있지 않고, modelter-ci.yml도 브랜치 보호 미설정 시 소프트 알림에 불과(워크플로 주석 3-4행이 이를 자인)
- verification.html 공개 문구 '허용 오차 5e-4 이내면 PASS'(gen-verification.js:133)는 check.py 실제 오차와 불일치 — EM·최소 DSCR은 0.01, IRR류는 0.001로 5e-4보다 느슨한 지표가 다수(실측 오차는 e-10~e-16 수준이라 실질 영향은 없음)


## 가정 근거·점검·준비도

### 가정 출처·기준일 기록(R33) — 저장 구조

필드명은 srcMeta가 아니라 전역 객체 `srcTags` — 키=필드키, 값={s:출처문자열, d:기준일(YYYY-MM-DD)}. 출처 선택지는 SRC_OPTS 5종('IM 기재','감정평가','실사','추정','회사 표준') 고정. localStorage(mt_state)와 공유 링크 페이로드에 `st` 키로 함께 직렬화·복원되고, fillExample()·전체 지우기 시 {}로 초기화된다.

> 증거: dart-search/web/modelter/index.html:1938 `let exampleKeys=new Set(), exUserEdited=false; var srcTags={};` · :4932 `var SRC_OPTS=['IM 기재','감정평가','실사','추정','회사 표준'];` · :4841 `return {c:cur,...,st:srcTags};` · :5436 saveLocal의 `st:srcTags` · :1942 `srcTags={};`

### 가정 출처·기준일 기록(R33) — UI

칩이 아니라 헤더의 '출처' 버튼(id=srcBtn) → srcPop() 모달. 값이 입력된 필드만 행으로 나열해 <가정|현재값|출처 select|기준일 date input> 테이블로 편집하며 change 즉시 srcTags에 저장(별도 저장 버튼 없음, mtTrack('src_tag') 1회). 읽기 전용 모드에서는 차단.

> 증거: dart-search/web/modelter/index.html:1513 `<button class="ex ghost" id="srcBtn" title="가정별 출처(IM 기재·감정평가·실사·추정·회사 표준)와 기준일 기록...">출처</button>` · :4941-4942 select/date 입력 · :4954-4961 change 핸들러 즉시 저장

### 가정 출처·기준일 기록(R33) — Excel·메모 반영

매입(오피스·물류) 13시트 엑셀에서만 01_Assumptions F열('출처 · 비고')에 '[출처 · 기준일]' 텍스트를 앞에 붙여 기록. 필드→행 매핑은 하드코딩된 _SRC_ROW 18개(asset,gfa,price,...,hold). dev(분양)·refi 엑셀 경로는 srcTags 블록 도달 전에 return하므로 출처 미반영. 검토 메모 복사에는 '※ 가정 출처: IM 기재 3 · 추정 2' 식의 출처별 개수 집계만 실린다.

> 증거: dart-search/web/modelter/index.html:6718-6730 `var _SRC_ROW={asset:6,gfa:7,price:12,...hold:79}; ... _fc.s=_txt+' '+String(_fc.s||'')...` (refi는 :6688, dev는 :6709에서 조기 return) · :5232-5235 `L.push('※ 가정 출처: '+_sp.join(' · '));`

### 출처 자동 기록 경로

3곳에서 자동 태깅: AI IM 추출 적용 시와 무키 로컬 인식 적용 시 srcTags[k]={s:'IM 기재', d:오늘}, '내 기본값' 프리셋 적용 시 srcTags[k]={s:'회사 표준'}(기준일 없음). srcPop 모달 안내문에도 '자동으로 기록됩니다' 명시.

> 증거: dart-search/web/modelter/index.html:10643 및 :10773 `srcTags[k]={s:'IM 기재', d:new Date().toISOString().slice(0,10)};` · :4892 `srcTags[k]={s:'회사 표준'};`

### MKTREF/fieldRefMeta — 시장 참고치 구조

/*__MKTREF_START__*/~END 블록은 data/market-ref.json에서 tools/gen-marketref.js가 커밋 타임에 인라인 생성(직접 수정 금지 주석). 상수 4벌: FIELD_REF(참고 범위 텍스트 17키)·FIELD_REF_META(필드별 {s:출처,d:기준} 예: exitcap {s:'감정평가·매매 관행',d:'2026.2Q'})·FIELD_REF_DEAL/FIELD_REF_DEAL_META(딜 유형별 오버라이드). fieldRefMeta(k)는 딜 오버라이드 우선. MARKET_REF_ASOF='2026.2Q'. JSON 원본은 필드별 {text,src,asof} 구조.

> 증거: dart-search/web/modelter/index.html:2008-2060 (FIELD_REF/FIELD_REF_META/FIELD_REF_DEAL_META 정의) · :2063 `function fieldRefMeta(k){...FIELD_REF_DEAL_META[cur]...}` · /home/user/reit-insight/data/market-ref.json `"exitcap": { "text": "참고 4~6%...", "src": "감정평가·매매 관행", "asof": "2026.2Q" }`

### MKTREF — 참고치의 출처·기준일 표시 UI

숫자 입력 필드 밑 .f-ref 스팬에 '참고 4~6%...' 텍스트를 상시 표시하고, 메타가 있으면 뒤에 .f-src 스팬 '· 2026.2Q · 감정평가·매매 관행'을 덧붙임(title='출처: … 기준 · 참고치이며 개별 자산별로 다릅니다'). 클릭형 칩이 아닌 정적 인라인 텍스트. 점검표의 범위 판정 파싱(refRange)은 텍스트(FIELD_REF)만 쓰고 메타는 표시 전용.

> 증거: dart-search/web/modelter/index.html:2099 `<span class="f-src" title="출처: ${mm.s} · ${mm.d} 기준 ...">· ${mm.d} · ${mm.s}</span>` · :2062 주석 '표시용 — refRange 파싱은 fieldRef 텍스트만 사용'

### 예시값 잔존 경고(ex_ack) — 조건

fillExample()이 채운 키를 exampleKeys Set으로 추적, 사용자가 필드를 수정하면 exTouch로 제거. 경고 confirm(exConfirmOutput)은 exMixed()==사용자가 일부라도 수정(exUserEdited)했고 예시 키가 남아있는 '혼합 상태'에서만, 세션당 1회(sessionStorage mt_ex_ack='1', 이벤트 ex_ack). 적용 산출물 9종: 인쇄 요약·요약카드 PNG·검토 메모·공유·한 줄 보고·공유 링크·엑셀·티저·IC 패키지. 전부 예시 그대로(아무것도 안 만진) 상태는 confirm 없이 통과하고 칩(exChip)도 안 뜸 — 대신 검토 메모에 '※ 아직 전부 예시 숫자입니다' 꼬리표만 붙음.

> 증거: dart-search/web/modelter/index.html:1954 `function exMixed(){ return exUserEdited && exRemaining().length>0; }` · :1977-1982 `if(!exMixed()) return true; if(sessionStorage.getItem('mt_ex_ack')==='1') return true; ... confirm(...)` · 호출부 :3486,5328,5335,5346,5359,5369,6662,7105,7559 · :5239 전부-예시 꼬리표

### ex_ack와 'Default 잔존' 개념의 거리

추적 대상은 오직 예시 딜(fillExample) 값. 빈 칸에 침묵 적용되는 표준가정(코드 기본값)은 exampleKeys 대상이 아니며 별도 처리 — 보고서에서 '미입력은 실제 적용될 표준값을 표기'(:3462 주석), IM 체크리스트 안내 '못 찾은 항목은 비워두세요 — 표준가정으로 계산되고 엑셀 가정 시트에 표준가정임이 표시됩니다'(:10677). 즉 '예시값 잔존 경고'는 있으나 '모든 기본값(표준가정 포함) 잔존' 개념의 부분집합만 커버.

> 증거: dart-search/web/modelter/index.html:1935-1937 주석 '예시값 잔존 추적 — 샘플 숫자가 보고서·공유로 그대로 나가는 신뢰 사고 방지' · :1947-1953 exRemaining()은 exampleKeys만 순회

### 가정 적정성 점검표(check_open)

완전 자동 판정(수동 체크 아님). checkAssumptions()가 현재 딜의 숫자 필드 중 fieldRef 참고 범위가 있는 것만 대상으로 refRange로 lo~hi 파싱 후 low/high/ok/empty 4상태 판정(만원↔원 단위 자동 환산, '임대료의 35~45%' 같은 상대 기준은 판정 생략). 항목 수는 고정이 아니라 딜별 참고범위 보유 필드 수(FIELD_REF 공통 17키 + FIELD_REF_DEAL 오버라이드). chkPop() 모달에 '범위 안 n · 범위 밖 n · 미입력 n' 요약과 ●▲▼○ 배지 표, 이벤트 check_open.

> 증거: dart-search/web/modelter/index.html:4978-4989 `var st=(v<rr.lo)?'low':((v>rr.hi)?'high':'ok');` · :4970 상대 기준 판정 생략 · :5025-5027 모달 요약 · :5045 `mtTrack('check_open')`

### 검토 질의서(inquiry_copy)

inquiryText()가 점검 결과에서 자동 생성: ①범위 밖 항목→'통상 … 대비 높음/낮음: 산정 근거 요청' ②미입력→'IM·감정평가서·계약서 기준 값 회신 요청' ③예시값 잔존 최대 8개→'현재 예시값으로 계산 중: 실제 값 회신 요청'. 클립보드 복사 시 mtTrack('inquiry_copy'). 항목이 없으면 '확인 요청 항목이 없습니다' 한 줄.

> 증거: dart-search/web/modelter/index.html:4991-5009 inquiryText 본문 (`exs.slice(0,8)` 예시값 편입) · :5036-5040 복사+`mtTrack('inquiry_copy')`

### AI IM 추출(BYOK) — 근거 원문(snippet)

추출 스키마에 evidence 객체를 요구('키=필드명, 값=문서에서 그대로 옮긴 근거 문구 40자 이내') — 시스템 프롬프트에도 명시. 리뷰 테이블에 '근거 원문' 열로 표시(44자 절단). 무키 로컬 인식(localExtract)도 매치 지점 앞뒤 ±14자 컨텍스트를 ev로 만들어 동일하게 표시. 단, evidence는 표시 전용 — 적용(apply/quickApply) 시 srcTags에 {s:'IM 기재',d:날짜}만 남고 원문 인용은 어디에도(상태·저장본·엑셀) 저장되지 않으며 close() 시 extracted=null로 폐기.

> 증거: dart-search/web/modelter/index.html:10554 `props['evidence']={type:['object','null'], description:'각 추출 필드의 근거 원문 인용...'}` · :10620,10625 근거 열 렌더 · :10705-10706 localExtract의 ctx/ev · :10643 적용 시 srcTags만 기록 · :10546 `close(){ ... extracted=null; }`

### AI IM 추출(BYOK) — 사용자 확인 절차

자동 적용 아님. 추출 후 리뷰 화면에 필드별 체크박스(기본 checked)+추출값+현재값+근거 원문을 보여주고 '적용 전 원문과 대조하세요. 체크한 항목만 폼에 채워집니다' 안내, '체크한 항목 적용' 버튼을 눌러야 state에 반영. 적용 시 exTouch(사용자 제공 값 취급)+활성화 신호+im_extract 이벤트. 무키 인식도 같은 체크→적용 구조(im_quick). 추출 대상은 FIELDS 13개(asset~sellerirr, 매도자 제시 IRR 대조용 포함), 오피스·물류 매입 딜 전용, 키는 메모리/옵트인 sessionStorage(mt_byok_k), api.anthropic.com 직접 호출, 사진 최대 4장(1568px 축소).

> 증거: dart-search/web/modelter/index.html:10621 `<input type="checkbox" class="imx-ck" data-k=...checked>` · :10630-10632 '체크한 항목만 폼에 채워집니다'+apply 버튼 · :10637-10649 apply()가 checked만 반영 · :10510-10524 FIELDS 13개 · :10810 딜 제한

### 모델 준비도 등급 개념 존재 여부

없음. '준비도·등급·readiness·scorecard·모델 점수' 검색 무매치. 가장 근접한 기존 장치는 ①핵심 입력 진행률 바(renderInpProg — QUICK_FIELDS 기준 n/m과 '핵심 입력 완료 · 결과가 준비됐습니다' 문구, 등급 아님) ②예시값 잔존 칩('⚠ 예시값 그대로 n개') ③점검표의 범위 안/밖/미입력 카운트. 이들을 합산한 단일 등급·스코어는 어디에도 없음.

> 증거: dart-search/web/modelter/index.html:2667-2691 `function renderInpProg(){...} txt.textContent=done?('핵심 입력 완료 · 결과가 준비됐습니다'):('핵심 입력 '+filled+'/'+total);` · '준비도|등급|readiness' grep 0건

**지시서 가정과 다른 점**

- 'srcMeta'라는 필드는 존재하지 않음 — 실제 구현은 전역 객체 `srcTags`(직렬화 키는 `st`)이며 구조는 {필드키:{s:출처,d:기준일}} (index.html:1938, 4841)
- 출처 기록 UI는 '칩'이 아님 — 헤더 '출처' 버튼(srcBtn)→모달 테이블의 select+date 입력 방식 (index.html:1513, 4933-4963). 칩 형태는 참고치 인라인 텍스트(f-ref/f-src)와 예시값 exChip뿐
- 출처의 엑셀 반영은 오피스·물류 매입 13시트(01_Assumptions F열)에만 — 분양(dev)·리파이(refi) 엑셀은 srcTags를 싣지 않음 (index.html:6688/6709 조기 return, 6718-6734)
- ex_ack는 'Default(표준가정 포함)가 남아있다' 전반이 아니라 'fillExample 예시값이 혼합 상태로 남아있다'만 감지 — 전부 예시 그대로면 confirm 없이 통과(칩도 미표시), 빈 칸에 침묵 적용되는 표준가정은 추적 대상 아님 (index.html:1954, 1977)
- 점검표(check_open)는 수동 체크리스트가 아니라 참고범위 기반 완전 자동 판정이며 항목 수도 고정이 아님(딜별 참고범위 보유 숫자 필드 수에 따라 가변) (index.html:4978-4989)
- AI 추출의 근거 원문(evidence)은 리뷰 화면 표시 전용 — 적용 후 srcTags에는 {s:'IM 기재',d:날짜}만 남고 원문 인용문은 저장본·공유 링크·엑셀 어디에도 보존되지 않음 (index.html:10643, 10546)
- '모델 준비도 등급' 개념은 예상대로 부재 — 유사 최근접은 핵심 입력 진행률 바(n/m)와 예시값 잔존 칩이며 통합 등급/점수는 없음 (index.html:2667-2691)
