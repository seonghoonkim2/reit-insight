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
ok(/_hesc\(hdr\[col\]/.test(html), '렌트롤 헤더 XSS 이스케이프 유지');
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
G.navigator = {}; G.alert = () => {};
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
  // 렌트롤 전용/임대면적 분리: 임대면적이 billing area, 전용면적은 netArea로 보관
  if (typeof RENTROLL !== "undefined") {
    var _g = [["임차인","전용면적(평)","임대면적(평)","월임대료","계약만기"],["t",1200,2000,124000000,"2028-02"],["u",900,1500,93000000,"2027-06"]];
    var _hr = RENTROLL.detectHeaderRow(_g), _m = RENTROLL.autoMap(_g[_hr]), _ex = RENTROLL.extractLeases(_g, _hr, _m, {});
    if (_ex.leases[0].area !== 2000) throw new Error("렌트롤 임대면적 billing 실패: " + _ex.leases[0].area);
    if (_ex.leases[0].netArea !== 1200) throw new Error("렌트롤 전용면적 netArea 실패: " + _ex.leases[0].netArea);
    var _agg = RENTROLL.aggregate(_ex.leases, 8400, 0.88);
    if (!(_agg.rentable > 7391 && _agg.rentable < 7393)) throw new Error("렌트롤 임대가능면적 산출 실패: " + _agg.rentable);
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
