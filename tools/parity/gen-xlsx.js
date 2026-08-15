#!/usr/bin/env node
/* 모델터 파리티 1단계 — 배포 index.html을 헤드리스로 실행해
 * "화면 엔진 기대값"과 "다운로드 엑셀 바이트"를 함께 덤프합니다.
 *
 * 사용:  node tools/parity/gen-xlsx.js office|logistics|dev|refi
 *        + 자본구조 변형: office_nopref|office_nonpass|office_hold7
 * 출력:  tools/parity/out/<딜>_parity.xlsx  +  <딜>_expected.json
 * 다음:  python3 tools/parity/check.py <딜>   (엑셀을 수식 엔진으로 재계산해 비교)
 *
 * 원칙: 화면 = 다운로드 엑셀. 계산 엔진이나 엑셀 생성기를 수정했다면
 *       반드시 이 2단계(생성→검증)를 딜 유형별로 다시 돌려야 합니다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* 자본구조 매트릭스 — 예시 딜 1케이스만 검증하던 편향을 깨는 상태 변형.
 * patch는 fillExample() 직후에 실행되어 state/stackState를 바꾸고,
 * 그 뒤 simModel()·엑셀 생성이 바뀐 상태를 읽는다(mnum/assumOverrides가 state를 직접 읽음). */
const VARIANTS = {
  office_nopref:  { base: 'office', patch: "stackState['pref_on']=false;" },
  // 앱 셀렉트 옵션 문자열 그대로 — 비도관 세후 분기와 IM의 연 NOI 직접 입력 경로를 한 변형에서 함께 검증.
  // 직접 NOI는 임대료 산출 예시와 다른 값으로 두어 화면·엑셀 양쪽의 모드 전환이 실제 숫자를 바꾸게 한다.
  office_nonpass: { base: 'office', patch: "state['taxmode']='비도관(법인세 적용)'; state['noimode']='NOI 직접 입력'; state['noi1']='6000';" },
  office_hold7:   { base: 'office', patch: "state['hold']='7';" },
  // 무차입(LTV 0) — 커버리지 지표(DSCR·ICR·Debt Yield)의 분모가 0이 되는 경계.
  // 가드가 빠지면 #DIV/0! 이 표지까지 전파되고, 비유한값이 숫자 셀에 들어가 엑셀이 파일을 거부한다.
  office_nodebt:  { base: 'office', patch: "stackState['senior_ltv']='0'; stackState['pref_ltv']='0';" },
  // 공실 100% — 수입 0 경계. 엔진이 IRR·NOI·DSCR을 null로 돌려주는데도 다운로드는 그대로 실행된다.
  // degenerate: 수치 대조는 성립하지 않고, "파일이 열리는가 · 오류가 노출되지 않는가"만 검사한다.
  office_vac100:  { base: 'office', patch: "state['vacancy']='100';", degenerate: true },
  // 중순위(메자닌) — 현금이자형과 이자누적(PIK)형 각각. 4단 자본구조가 엑셀에서도 같은 값을 내는지 본다.
  // 우선주를 30→15%로 낮춰 보통주가 남는 현실적인 4단 구조로 검증한다
  // (예시 딜의 30% 그대로면 보통주가 Uses의 1%로 눌려 워터폴 검사가 0 대 0 비교가 된다).
  office_mezz:    { base: 'office', patch: "stackState['mezz_on']=true; stackState['mezz_ltv']='10'; stackState['mezz_rate']='8.5'; stackState['mezz_extra']='이자만 지급'; stackState['pref_ltv']='15';" },
  office_mezzpik: { base: 'office', patch: "stackState['mezz_on']=true; stackState['mezz_ltv']='10'; stackState['mezz_rate']='8.5'; stackState['mezz_extra']='만기일시상환(이자 누적)'; stackState['pref_ltv']='15';" },
  // ※ 분양률 0%(dev)는 변형에 넣지 않았다 — 엔진이 결과 자체를 내지 않아 다운로드가 만들어지지 않는다.
  //    검사할 산출물이 없으므로 경계로서 의미가 없다(2026-08-10 확인).
};

const BASE_DEALS = ['office', 'logistics', 'dev', 'refi'];
const DEAL = process.argv[2] || 'office';
if (!BASE_DEALS.includes(DEAL) && !VARIANTS[DEAL]) {
  console.error('사용: node tools/parity/gen-xlsx.js ' + BASE_DEALS.concat(Object.keys(VARIANTS)).join('|'));
  process.exit(1);
}
const ROOT = path.resolve(__dirname, '..', '..');
const HTML = path.join(ROOT, 'dart-search', 'web', 'modelter', 'index.html');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const html = fs.readFileSync(HTML, 'utf8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const main = blocks.find(b => b.includes('function fillExample'));
const inj = blocks.find(b => b.includes('const XLTMPL='));
if (!main || !inj) { console.error('index.html에서 스크립트 블록을 찾지 못했습니다'); process.exit(1); }

/* 최소 DOM 스텁 — 앱 스크립트가 예외 없이 로드될 만큼만 */
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
G.alert = () => {}; G.confirm = () => true;
G.Blob = function (parts) { this.parts = parts; G.__lastBlob = this; };
G.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
G.IntersectionObserver = function () { this.observe = () => {}; this.disconnect = () => {}; };

/* 딜별 드라이버 — 예시 로드 → (변형이면 상태 패치) → 엔진 결과 확인 → 엑셀 바이트 캡처 */
function dcfDriver(engineDeal, patch, degenerate) {
  // 변형은 패치 전 기준값을 함께 재서, 오버라이드가 엔진에 실제 반영됐음을 보증
  const pre = patch ? 'var r0 = simModel();\n    ' + patch : '';
  const guard = patch ? `
    // coc 포함 이유: 우선주 온/오프는 총자기자본 CF를 나누기만 해서 IRR·EM은 그대로고 보통주 CoC만 움직임
    var sig = function(x){ return JSON.stringify([x.raw.IRR, x.raw.IRRat, x.raw.EM, x.raw.coc, x.raw.equity]); };
    if (sig(r) === sig(r0)) throw new Error("변형 미반영 — 패치가 simModel 결과를 바꾸지 못했습니다");` : '';
  // degenerate 변형은 IRR이 null인 게 정상 — 그래도 앱은 다운로드를 실행하므로 산출물을 검사해야 한다
  const engineOk = degenerate ? 'r && r.raw' : 'r && r.raw && r.raw.IRR != null';
  return `;(function(){
    cur = ${JSON.stringify(engineDeal)}; window.rrModel = null; fillExample();
    ${pre}
    var r = simModel();
    if (!(${engineOk})) throw new Error("engine null");${guard}
    window.__downloadXlsx();
    var blob = globalThis.__lastBlob;
    if (!blob || !blob.parts || !blob.parts[0] || !blob.parts[0].length) throw new Error("blob 미캡처");
    globalThis.__OUT = { bytes: blob.parts[0], raw: { IRR: r.raw.IRR, IRRat: r.raw.IRRat, EM: r.raw.EM, coc: r.raw.coc, minDSCR: r.raw.minDSCR, unlev: r.raw.unlev, equity: r.raw.equity } };
  })();`;
}
const DRIVERS = {
  office: dcfDriver('office'),
  dev: `;(function(){
    cur = "dev"; window.rrModel = null; fillExample();
    var r = simModel();
    if (!(r && r.raw)) throw new Error("engine null");
    var tpl = window.__devTemplate(null);
    if (!tpl) throw new Error("template null");
    var bytes = XLSXGEN.buildXlsx(tpl, null, null);
    globalThis.__OUT = { bytes: bytes, raw: r.raw };
  })();`,
  refi: `;(function(){
    cur = "refi"; window.rrModel = null; fillExample();
    var r = simModel();
    if (!(r && r.rows && r.rows.length)) throw new Error("engine null");
    window.__downloadXlsx();
    var blob = globalThis.__lastBlob;
    if (!blob || !blob.parts || !blob.parts[0] || !blob.parts[0].length) throw new Error("blob 미캡처");
    globalThis.__OUT = { bytes: blob.parts[0], raw: { rows: r.rows.map(function(x){ return { n: x.n, net: x.net, y1: x.dscr, minDSCR: x.minDSCR, totInt: x.totInt, balloon: x.balloon, loan: x.loan }; }) } };
  })();`,
};
DRIVERS.logistics = dcfDriver('logistics');
Object.keys(VARIANTS).forEach(k => { DRIVERS[k] = dcfDriver(VARIANTS[k].base, VARIANTS[k].patch, VARIANTS[k].degenerate); });

new Function(main + '\n' + inj + '\n' + DRIVERS[DEAL])();
const out = globalThis.__OUT;
fs.writeFileSync(path.join(OUT, DEAL + '_parity.xlsx'), Buffer.from(out.bytes));
fs.writeFileSync(path.join(OUT, DEAL + '_expected.json'), JSON.stringify(out.raw, null, 1));
console.log(DEAL, '| xlsx bytes:', out.bytes.length, '| expected keys:', Object.keys(out.raw).join(','));
