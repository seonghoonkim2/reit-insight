/* 모델터 CI 검증 — 라이브 배포 전 깨진 코드/빠진 파일 차단
 * 실행: node tools/modelter-ci-check.js   (의존성 없음)
 * 검사: ① 앱 로드(전 script 문법) ② 5개 딜 계산 무예외 ③ 렌트롤 경로(struct/tranche/mini)
 *       ④ 핵심 모듈/수정 존재 ⑤ _headers(CSP·X-Frame-Options) ⑥ og.png 존재
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'dart-search', 'web', 'modelter');
const HTML = path.join(DIR, 'index.html');
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); else console.log('  ✓ ' + msg); };

const html = fs.readFileSync(HTML, 'utf8');

/* ── 1) 정적 존재 검사 ── */
ok(fs.existsSync(path.join(DIR, 'og.png')), 'og.png 존재 (소셜 미리보기 404 방지)');
const headersPath = path.join(DIR, '_headers');
ok(fs.existsSync(headersPath), '_headers 존재');
if (fs.existsSync(headersPath)) {
  const h = fs.readFileSync(headersPath, 'utf8');
  ok(/content-security-policy/i.test(h), '_headers: CSP 포함');
  ok(/x-frame-options/i.test(h), '_headers: X-Frame-Options 포함');
}
ok(/\.xl-dl\[hidden\]\{display:none\}/.test(html), 'CSS: .xl-dl[hidden] 가드(엑셀버튼 숨김 버그 방지)');
ok(/_hesc\(h\)/.test(html) && /_hesc\(samples/.test(html) && /_hesc\(w\.msg\)/.test(html), '렌트롤 헤더·샘플·경고 XSS 이스케이프 유지');
ok(html.includes('id="miniKpi"'), '미니 결과(IRR·CoC) 위젯 존재');
ok(html.includes('id="wnOverlay"'), "What's new 팝업 존재");
ok((html.match(/trn-pref/g) || []).length >= 1, '우선주·보통주 트랜치 블록 존재');
ok(/window\.mtTrack\s*=\s*track/.test(html), '익명 사용 이벤트 트래킹 스니펫 존재');
ok((html.match(/IRRat:IRRat/g) || []).length >= 2, '세후 IRR 계산(calcModel·leaseModelV2) 존재');
ok(html.includes('Levered IRR (세후)'), '비도관 세후 IRR KPI 존재');
ok(html.includes('id="mdOverlay"'), '방법론(가정·계산식) 모달 존재');
ok((html.match(/k:"prepayfee"/g) || []).length >= 2 && (html.match(/k:"dispfee"/g) || []).length >= 2, '중도상환수수료·매각성과보수 입력(오피스·물류) 존재');
ok(html.includes('06_Tax_Disposition!C19-06_Tax_Disposition!C20'), '엑셀 워터폴에서 매각 부대비 차감(엑셀 파리티)');
ok((html.match(/perfR/g) || []).length >= 2, '화면 매각 부대비 계산(calcModel·leaseModelV2) 존재');
ok((html.match(/k:"vacancy"/g) || []).length >= 2, '공실률 입력(오피스·물류) 존재');
ok((html.match(/prefCum/g) || []).length >= 2, '우선주 누적배당 계산(calcModel·leaseModelV2) 존재');
ok(html.includes('우선주 누적 미지급'), '엑셀 워터폴 우선주 누적 미지급 행(엑셀 파리티)');
ok(/leasearea:\[/.test(html) && /netarea:\[/.test(html), '렌트롤 전용/임대면적 분리 인식(파서)');
ok(html.includes("rentable=gfa*n('leaseRatio'"), '렌트롤 공실 = 임대가능면적(GFA×비율) 기준');
ok((html.match(/임대면적\(평\)/g) || []).length >= 2, '렌트롤 임대면적 컬럼(샘플·엑셀)');
ok((html.match(/depSrc/g) || []).length >= 2, '보증금 승계 계산(calcModel·leaseModelV2) 존재');
ok(html.includes('보증금 승계 (1=반영)'), '엑셀 보증금 승계 셀(C74)');
ok((html.match(/k:"depassume"/g) || []).length >= 2, '보증금 승계 입력(오피스·물류) 존재');
ok((html.match(/feeY/g) || []).length >= 2, '운용보수·고정비 계산(calcModel·leaseModelV2) 존재');
ok(html.includes('운용보수율(취득가)'), '엑셀 운용보수 셀(C76/C78)');
ok((html.match(/k:"opfee"/g) || []).length >= 2, '운용보수 입력(오피스·물류) 존재');
ok(html.includes('window.__setSensAxis'), '민감도 축 토글(성장률/금리) 존재');
ok(html.includes("What's new · v4"), "What's new 팝업 v4");
ok(html.includes("function loadSampleDeal"), "샘플 딜 로더 존재");
ok(html.includes("MT_SAMPLES"), "샘플 딜 데이터(가짜 임차인) 존재");
ok(html.includes("function rrDisplayName"), "임차인명 비식별 헬퍼 존재");
ok(html.includes('function holdTemplate'), '변동 보유기간 엑셀 생성기(holdTemplate) 존재');
ok((html.match(/t:"range"/g) || []).length >= 2, '보유기간 슬라이더(오피스·물류) 존재');
ok(html.includes('function mtHold'), '보유기간 헬퍼(mtHold) 존재');
ok(html.includes('function putS'), 'holdTemplate 헤더·2차지표 재생성 존재');
ok(/depExit/.test(html), '보증금 성장 정산(depExit) 존재');
ok(html.includes('function computeForSnapshot'), '딜 비교 순수계산 래퍼(computeForSnapshot) 존재');
ok(html.includes('function renderCompare'), '딜 비교 렌더러(renderCompare) 존재');
ok(html.includes('id="cmpOverlay"'), '딜 비교 모달 존재');
ok(html.includes('class="ps-kpis"'), 'IC 원페이저 KPI 스트립 존재');
ok(html.includes('class="ps-stack"'), 'IC 원페이저 자본구조(트랜치) 섹션 존재');
ok(/class="ps-sens"/.test(html), 'IC 원페이저 민감도 히트맵 섹션 존재');
ok((html.match(/NOI\[y\]-INT\[y\]-depY-feeY/g)||[]).length>=2, '세무 손금산입: 과세소득 = NOI−이자−감가−운용보수(화면 2엔진)');
ok(html.includes('C5-C6-C7-01_Assumptions!$C$78'), '엑셀 기본템플릿 과세소득에 운용보수 손금산입');
ok(html.includes("c+'7-'+A+'$C$78'"), 'holdTemplate 과세소득에 운용보수 손금산입(변동 보유)');
ok(html.includes('01_Assumptions!$C$75*POWER(1+01_Assumptions!$C$27,01_Assumptions!$C$79)'), '엑셀 기본템플릿 보증금 성장 정산(P0-3 완결)');
ok(html.includes('prt-flag'), '파리티 배지(화면=엑셀) 존재');
ok(html.includes('화면 = 다운로드 엑셀'), '파리티 배지 라벨');
ok(html.includes('<h4>화면 = 다운로드 엑셀</h4>'), '방법론 모달 화면=엑셀 일치 섹션 존재');
ok(html.includes('function validateLeases'), '렌트롤 행 단위 검증(validateLeases) 존재');
ok(html.includes('id="rrWarns"'), '렌트롤 검증 경고 영역 존재');
ok(html.includes('rr-maptbl'), '렌트롤 매핑 확인 표 존재');
ok(html.includes('function rrRiskMetrics'), '임대차 리스크 지표(rrRiskMetrics) 존재');
ok(html.includes('id="rrRiskCard"'), '임대차 리스크 카드 존재');
ok(html.includes("name:'Lease_Risk'"), '엑셀 Lease_Risk 시트 존재');
ok(html.includes('function mtChecks'), '체크 레지스트리(mtChecks) 존재');
ok(html.includes('function renderCases'), '케이스 엔진(renderCases) 존재');
ok(html.includes('var MT_CASES'), '케이스 조정폭 상수 존재');
ok(html.includes('function mtBisect'), '역산 솔버(mtBisect) 존재');
ok(html.includes('function mtQuality'), '가정 품질 점수(mtQuality) 존재');
ok(html.includes('function mtMaturity'), '성숙도 배지(mtMaturity) 존재');
ok(html.includes('id="qualCard"'), '가정 신뢰도 카드 존재');
ok(html.includes('function solveBidPrice'), '목표 IRR 매입가 역산 존재');
ok(html.includes('id="solverCard"'), '역산 카드 존재');
ok(html.includes('function _covBlock'), '부채 커버넌트 표(_covBlock) 존재');
ok(html.includes('INT:INT,endBal:endBal,exitCap:'), '엔진 INT·endBal·exitCap 노출(2엔진)');
ok((html.match(/INT:INT,endBal:endBal,exitCap:/g)||[]).length>=2, '두 엔진 모두 노출');
ok(html.includes('04_Operating_ProForma!C18/C6'), '엑셀 05 ICR 행');
ok(html.includes('04_Operating_ProForma!C18/C8'), '엑셀 05 Debt Yield 행');
ok(html.includes('Exit Cap ≥ 진입 Cap − 0.5%p'), '엑셀 11 검증: 역스프레드 체크');
ok(html.includes('feats:featSnapshot()'), '이벤트 스키마: 활성기능 스냅샷(feats) 전송');
ok(html.includes("track('share_link')") && html.includes("track('pdf_export')") && html.includes("track('slot_save')"), '이벤트: 공유·PDF·보관함 액션 추적');
ok(html.includes("mtTrack('sens_axis'"), '이벤트: 민감도 축 토글 추적');

/* ── 2) 앱 로드 + 딜별 계산 (DOM 스텁 헤드리스) ── */
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const main = blocks.find(b => b.includes('function fillExample'));
const inj = blocks.find(b => b.includes('const XLTMPL='));
ok(!!main, 'main 스크립트 블록 발견');
ok(!!inj, 'injected 스크립트 블록 발견');

function stub() { const s = {}; const f = function () { return el; };
  const el = new Proxy(f, { get(t, p) {
    if (p === 'querySelectorAll') return () => [];
    if (p === 'querySelector' || p === 'closest') return () => null;
    if (p === 'getBoundingClientRect') return () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 });
    if (p === 'classList') return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    if (p === 'style') return s.__s || (s.__s = {});
    if (p === 'dataset') return s.__d || (s.__d = {});
    if (['addEventListener','removeEventListener','appendChild','removeChild','insertBefore','setAttribute','removeAttribute','click','focus','blur','select','remove','scrollIntoView','setSelectionRange'].includes(p)) return () => {};
    if (p === 'getAttribute') return () => null;
    if (p === 'getContext') return () => stub();
    if (['value','innerHTML','textContent','className','href','placeholder','id','name','type'].includes(p)) return (p in s) ? s[p] : '';
    if (['hidden','checked','disabled'].includes(p)) return (p in s) ? s[p] : false;
    if (p === Symbol.toPrimitive) return () => '';
    if (p in s) return s[p];
    return el;
  }, set(t, p, v) { s[p] = v; return true; }, apply() { return el; } }); return el; }

const G = globalThis;
G.window = G; G.addEventListener = () => {}; G.matchMedia = () => ({ matches: false, addEventListener() {} });
G.innerWidth = 1200; G.innerHeight = 800; G.scrollTo = () => {};
G.document = { getElementById: () => stub(), querySelector: () => null, querySelectorAll: () => [], createElement: () => stub(), addEventListener: () => {}, body: stub(), documentElement: stub(), readyState: 'complete', fonts: { ready: Promise.resolve() } };
G.location = { hash: '', origin: 'https://modelter.com', pathname: '/', href: '' };
G.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
G.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
// navigator는 Node 내장 getter → defineProperty로 교체(sendBeacon 캡처). fetch 폴백도 캡처.
try { Object.defineProperty(G, 'navigator', { configurable: true, value: { sendBeacon: (u, b) => { if (u === '/e') G.__beacon = b; return true; } } }); } catch (e) { }
G.fetch = (u, o) => { if (u === '/e' && o) G.__beacon = o.body; return Promise.resolve({ ok: true, status: 204 }); };
G.alert = () => {};
G.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} }; G.Blob = function (p) { this.parts = p; };
G.IntersectionObserver = function () { this.observe = () => {}; this.disconnect = () => {}; };

const driver = `;(function(){
  var deals = ["office","logistics","dev","refi","reit"];
  deals.forEach(function(c){
    cur = c; window.rrModel = null;
    fillExample();
    var r = simModel();
    if (c !== "refi" && !(r && (r.kpis || r.type))) throw new Error("simModel 비정상: " + c);
    if (typeof renderForm === "function") renderForm();
    if (typeof update === "function") update();
  });
  // 렌트롤 경로
  cur = "office";
  var leases = [{area:1200,rentPP:62000,camPP:21000,deposit:120000000,yrsToExp:2,rentFreeRemain:0,stepUp:0.02}];
  var mkt = {marketPP:62000,marketCamPP:21000,newRentFree:3,absorbMonths:12,stabVac:0.05,renewP:0.7,downtime:6,mktStepUp:0.03,mtm:0,camG:0.03,repay:"만기일시(이자만)"};
  window.rrModel = {leases:leases, mkt:mkt, on:true};
  window.rrState = {agg:{count:1,leasedArea:1200,vacancy:0.857,wAvgRentPP:62000}, leases:leases};
  var RR = simModel();
  if (!(RR && RR.struct)) throw new Error("렌트롤 struct 누락");
  if (!(RR && RR.tranche)) throw new Error("렌트롤 tranche 누락");
  if (!(RR && RR.mini)) throw new Error("렌트롤 mini 누락");
  window.rrModel = null;
  // 변동 보유기간(3~10년) 무예외 + 엑셀 템플릿 생성
  cur = "office"; fillExample();
  ["3","7","10"].forEach(function(H){ state["hold"]=H; var rh=simModel(); if(!(rh&&rh.kpis)) throw new Error("보유기간 "+H+"년 계산 실패"); });
  if (typeof holdTemplate==="function"){ var t7=holdTemplate(XLTMPL,7); if(!(t7&&t7.sheets&&t7.sheets.length)) throw new Error("holdTemplate(7) 실패"); }
  state["hold"]="5";
  // 렌트롤 전용/임대면적 분리: 임대면적이 billing area, 전용면적은 netArea로 보관
  if (typeof RENTROLL !== "undefined") {
    var _g = [["임차인","전용면적(평)","임대면적(평)","월임대료","계약만기"],["t",1200,2000,124000000,"2028-02"],["u",900,1500,93000000,"2027-06"]];
    var _hr = RENTROLL.detectHeaderRow(_g), _m = RENTROLL.autoMap(_g[_hr]), _ex = RENTROLL.extractLeases(_g, _hr, _m, {});
    if (_ex.leases[0].area !== 2000) throw new Error("렌트롤 임대면적 billing 실패: " + _ex.leases[0].area);
    if (_ex.leases[0].netArea !== 1200) throw new Error("렌트롤 전용면적 netArea 실패: " + _ex.leases[0].netArea);
    var _agg = RENTROLL.aggregate(_ex.leases, 8400, 0.88);
    if (!(_agg.rentable > 7391 && _agg.rentable < 7393)) throw new Error("렌트롤 임대가능면적 산출 실패: " + _agg.rentable);
    // 따옴표 CSV(임차인명 콤마) 열 밀림 방지
    var _csvq = ["임차인,임대면적(평),월임대료", String.fromCharCode(34)+"ABC, Inc."+String.fromCharCode(34)+",2000,124000000"].join(String.fromCharCode(10));
    var _gq = RENTROLL.parseDelimited(_csvq);
    if (!(_gq[1].length === 3 && _gq[1][0] === "ABC, Inc.")) throw new Error("따옴표 CSV 파싱 실패: " + JSON.stringify(_gq[1]));
    // 행 단위 검증: 정상 렌트롤 → error 0 / 오류 렌트롤 → 코드별 검출
    var _gOK = [["임차인","임대면적(평)","월임대료","보증금","계약만기"],["t1",1000,80000000,800000000,"2028-06"],["t2",800,60000000,600000000,"2029-03"]];
    var _mOK = RENTROLL.autoMap(_gOK[0]), _eOK = RENTROLL.extractLeases(_gOK, 0, _mOK, {});
    var _wOK = RENTROLL.validateLeases(_gOK, 0, _mOK, _eOK, {rentable: 2000});
    if (_wOK.some(function(w){return w.sev === "error";})) throw new Error("정상 렌트롤에서 error 검출: " + JSON.stringify(_wOK));
    var _gBAD = [["임차인","임대면적(평)","월임대료","보증금","계약만기"],
      ["z1",0,50000000,0,"2028-06"],            // 면적 0 → 제외
      ["z2",500,-10000000,0,"2028-06"],          // 음수 임대료
      ["z3",500,0,500000000,"2027-01"],          // 보증금만 있고 임대료 없음
      ["z4",500,40000000,0,"2020-01"],           // 만기 지남
      ["z5",500,40000000,0,"만기미상"]];          // 날짜 인식 실패
    var _mB = RENTROLL.autoMap(_gBAD[0]), _eB = RENTROLL.extractLeases(_gBAD, 0, _mB, {});
    var _wB = RENTROLL.validateLeases(_gBAD, 0, _mB, _eB, {rentable: 1500});
    var _codes = _wB.map(function(w){return w.code;});
    ["RR_ZERO_AREA","RR_NEGATIVE_RENT","RR_DEPOSIT_WITHOUT_RENT","RR_EXPIRED_LEASE","RR_DATE_PARSE_FAILED","RR_AREA_SUM_EXCEEDS_NLA"].forEach(function(cd){
      if (_codes.indexOf(cd) < 0) throw new Error("렌트롤 검증 미검출: " + cd + " (got " + _codes.join(",") + ")");
    });
  }
  // 임대차 리스크 지표: WALE(면적)=(100*1+300*3)/400=2.5, top1=쿠팡 300/400=0.75, 만기 스케줄
  if (typeof rrRiskMetrics === "function") {
    var _rm = rrRiskMetrics([
      {name:"소형임차", area:100, rentPP:10000, deposit:0, yrsToExp:1},
      {name:"대형임차", area:300, rentPP:10000, deposit:0, yrsToExp:3}
    ], 500);
    if (Math.abs(_rm.waleArea - 2.5) > 1e-9) throw new Error("WALE(면적) 오류: " + _rm.waleArea);
    if (Math.abs(_rm.waleRent - 2.5) > 1e-9) throw new Error("WALE(임대료) 오류: " + _rm.waleRent);
    if (Math.abs(_rm.top1 - 0.75) > 1e-9) throw new Error("top1 집중도 오류: " + _rm.top1);
    if (Math.abs(_rm.exp12 - 0.25) > 1e-9) throw new Error("12M 만기비중 오류: " + _rm.exp12);
    if (Math.abs(_rm.occupancy - 0.8) > 1e-9) throw new Error("점유율 오류: " + _rm.occupancy);
    if (!(_rm.sched[1] && _rm.sched[3])) throw new Error("만기 스케줄 누락");
  }
  // 체크 레지스트리: 커버넌트 기준 초과 설정 → breach 검출 / raw 노출 확인
  if (typeof mtChecks === "function") {
    cur = "office"; window.rrModel = null; fillExample();
    var _m5 = simModel();
    if (!(_m5 && _m5.raw && _m5.raw.INT && _m5.raw.endBal && _m5.raw.exitCap > 0)) throw new Error("simModel raw(INT/endBal/exitCap) 미노출");
    if (!(_m5.cov && _m5.cov.indexOf("커버넌트") >= 0)) throw new Error("커버넌트 표(cov) 미부착");
    state["covdscr"] = "9.9";
    var _ck = mtChecks();
    if (!_ck.some(function(c){ return c.id === "DEBT_DSCR_BREACH"; })) throw new Error("DSCR 커버넌트 breach 미검출");
    state["covdscr"] = "";
    var _ck2 = mtChecks();
    if (_ck2.some(function(c){ return c.id === "DEBT_DSCR_BREACH"; })) throw new Error("기준 해제 후에도 breach 잔존");
  }
  // 케이스 엔진: Severe IRR < Base IRR 단조성 + 전역 복원
  if (typeof caseSnapshot === "function" && typeof computeForSnapshot === "function") {
    cur = "office"; window.rrModel = null; fillExample();
    var _bs = simModel().raw;
    var _stB = state, _curB = cur;
    var _sv = computeForSnapshot(caseSnapshot(MT_CASES[1].adj));
    if (state !== _stB || cur !== _curB) throw new Error("케이스 계산 후 전역 미복원");
    if (!(_sv && _sv.raw && _sv.raw.IRR != null)) throw new Error("Severe 케이스 계산 실패");
    if (!(_sv.raw.IRR < _bs.IRR)) throw new Error("Severe IRR(" + _sv.raw.IRR + ") >= Base(" + _bs.IRR + ")");
  }
  // 역산 솔버: 목표=현재 IRR → 매입가 ≈ 현재 매입가(±1%), 비현실 목표(80%) → 미수렴
  if (typeof solveBidPrice === "function") {
    cur = "office"; window.rrModel = null; fillExample();
    var _cur0 = simModel().raw, _p0 = parseFloat(String(state.price).replace(/,/g, ""));
    var _r1 = solveBidPrice(_cur0.IRR);
    if (!_r1.converged) throw new Error("현재 IRR 역산 미수렴");
    if (Math.abs(_r1.value - _p0) / _p0 > 0.01) throw new Error("역산 매입가 오차: " + _r1.value + " vs " + _p0);
    var _r2 = solveBidPrice(5.0);
    if (_r2.converged) throw new Error("비현실 목표(500%)에 수렴함");
    var _r3 = solveBreakEvenExitCap("em");
    if (!(_r3.converged && _r3.value > 0)) throw new Error("손익분기 Exit Cap 미수렴");
    // 검증: 그 exit cap 적용 시 EM≈1.0
    var _snx = state.exitcap; state.exitcap = String(Math.round(_r3.value * 100) / 100);
    var _em = simModel().raw.EM; state.exitcap = _snx;
    if (Math.abs(_em - 1.0) > 0.01) throw new Error("손익분기 Exit Cap 검산 실패: EM=" + _em);
  }
  // 품질 점수·성숙도: 결정론 + 게이팅
  if (typeof mtQuality === "function") {
    cur = "office"; window.rrModel = null; srcState = {}; fillExample();
    var _q1 = mtQuality(), _q2 = mtQuality();
    if (_q1.score !== _q2.score) throw new Error("품질 점수 비결정적");
    var _mt1 = mtMaturity(_q1);
    if (_mt1.lv !== "S0") throw new Error("렌트롤 없이 S0 아님: " + _mt1.lv);
    // 렌트롤 확정 + 커버넌트 + 출처 개선 → 등급 상승
    window.rrModel = {leases:[{area:1200,rentPP:62000,camPP:21000,deposit:0,yrsToExp:3}], mkt:{marketPP:62000,marketCamPP:21000,newRentFree:3,absorbMonths:12,stabVac:0.05,renewP:0.7,downtime:6,mktStepUp:0.03,mtm:0,camG:0.03,repay:"만기일시(이자만)"}, on:true, confirmed:true};
    state["covdscr"] = "1.2";
    ["price","exitcap","noig","opfee","acqtax","salefee","hold"].forEach(function(k){ srcState[k] = "actual"; });
    srcState["_srate"] = "actual";
    var _q3 = mtQuality(), _mt3 = mtMaturity(_q3);
    if (!(_q3.score > _q1.score)) throw new Error("출처 개선에도 점수 미상승");
    if (_mt3.lv === "S0") throw new Error("조건 충족에도 S0 잔존");
    window.rrModel = null; srcState = {}; state["covdscr"] = "";
  }
  // 비도관 세후 IRR 경로: 도관에선 세후 KPI 없음 / 비도관에선 세후 KPI 등장·세전과 상이
  cur = "office"; fillExample();
  var preR = simModel(); if (preR.kpis.some(function(k){return k.l.indexOf("세후")>=0;})) throw new Error("도관인데 세후 KPI가 노출됨");
  state["taxmode"] = "비도관(법인세 적용)"; state["taxrate"] = "22";
  var atR = simModel();
  var atK = atR.kpis.filter(function(k){return k.l.indexOf("세후")>=0;});
  if (atK.length !== 1) throw new Error("비도관 세후 IRR KPI 누락");
  if (atK[0].v === preR.kpis[0].v) throw new Error("비도관 세후 IRR가 세전과 동일(세금 미반영)");
  state["taxmode"] = ""; state["taxrate"] = "";
  // 딜 비교 뷰: 순수계산 래퍼가 전역을 반드시 복원 + renderCompare 무예외
  if (typeof computeForSnapshot === "function" && typeof renderCompare === "function") {
    cur = "office"; window.rrModel = null; fillExample();
    var _sOffice = {}; for (var _k1 in state) _sOffice[_k1] = state[_k1];
    cur = "logistics"; fillExample();
    var _sLogi = {}; for (var _k2 in state) _sLogi[_k2] = state[_k2];
    cur = "office"; fillExample();
    var _stBefore = state, _curBefore = cur, _depthBefore = depth;
    var _cs = computeForSnapshot({c:"logistics", d:depth, s:_sLogi, k:stackState, r:refiState, rr:null});
    if (!(_cs && _cs.kpis && _cs.kpis.length)) throw new Error("computeForSnapshot 결과 없음");
    if (cur !== _curBefore || depth !== _depthBefore || state !== _stBefore) throw new Error("computeForSnapshot 전역 미복원");
    var _origLoad = loadSlots;
    loadSlots = function(){ return { "딜A":{c:"office",d:depth,s:_sOffice,k:{},r:{},rr:null}, "딜B":{c:"logistics",d:depth,s:_sLogi,k:{},r:{},rr:null} }; };
    var _stB2 = state, _curB2 = cur;
    try { renderCompare(); } finally { loadSlots = _origLoad; }
    if (cur !== _curB2 || state !== _stB2) throw new Error("renderCompare 후 전역 미복원");
  }
  // IC 원페이저 강화(KPI스트립·트랜치·히트맵): 오피스(전체)·리츠(KPI만) 무예외
  if (typeof buildPrintSummary === "function") {
    cur = "office"; window.rrModel = null; fillExample(); buildPrintSummary();
    cur = "reit"; fillExample(); buildPrintSummary();
    cur = "office"; fillExample();
  }
  // 이벤트 스키마 확장: mtTrack 페이로드에 활성기능 스냅샷(feats) 포함
  if (typeof window.mtTrack === "function") {
    cur = "office"; window.rrModel = null; fillExample();
    window.mtTrack("ci_probe");
    var _pb = null; try { _pb = JSON.parse(globalThis.__beacon || "{}"); } catch (e) {}
    if (!_pb || _pb.t !== "ci_probe") throw new Error("mtTrack 비콘 미전송");
    if (!("feats" in _pb)) throw new Error("이벤트 스키마에 feats 누락");
    if (_pb.deal !== "office") throw new Error("이벤트 deal 필드 누락");
  }
  globalThis.__CI_OK = 1;
})();`;

try {
  new Function(main + '\n' + inj + '\n' + driver)();
  ok(G.__CI_OK === 1, '앱 로드 + 5개 딜 계산 + 렌트롤 경로 무예외');
} catch (e) {
  fails.push('헤드리스 실행 예외: ' + (e && e.message));
}

/* ── 결과 ── */
console.log('');
if (fails.length) {
  console.error('❌ 모델터 CI 실패 (' + fails.length + '건):');
  fails.forEach(f => console.error('   - ' + f));
  process.exit(1);
}
console.log('✅ 모델터 CI 통과 — 라이브 배포 안전');
