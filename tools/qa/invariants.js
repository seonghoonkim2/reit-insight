#!/usr/bin/env node
/* 모델터 엔진 불변식(property) QA — 경제적 단조성 검사
 *
 * 사용:   node tools/qa/invariants.js
 * 방식:   배포 index.html의 계산 엔진을 Node에서 직접 로드(tools/parity/gen-xlsx.js의
 *         DOM 스텁 패턴 재사용, 브라우저 불필요). 딜별로 fillExample()로 기준을 잡고
 *         state를 한 축씩 바꿔 재계산 → "방향이 경제 상식과 맞는지"를 검사한다.
 * 원칙:   각 검사는 스윕 값마다 fillExample()로 원복 후 해당 축만 변경 — 검사 간 오염 없음.
 *         불변식이 깨지면 테스트를 완화하지 말 것(엔진 버그 신호) — exit 1.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = path.join(ROOT, 'dart-search', 'web', 'modelter', 'index.html');
const html = fs.readFileSync(HTML, 'utf8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const main = blocks.find(b => b.includes('function fillExample'));
const inj = blocks.find(b => b.includes('const XLTMPL='));
if (!main || !inj) { console.error('index.html에서 스크립트 블록을 찾지 못했습니다'); process.exit(1); }

/* ── 최소 DOM 스텁 — gen-xlsx.js와 동일: 앱 스크립트가 예외 없이 로드될 만큼만 ── */
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
G.Blob = function (parts) { this.parts = parts; };
G.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
G.IntersectionObserver = function () { this.observe = () => {}; this.disconnect = () => {}; };
G.fetch = () => Promise.resolve({ ok: true });  // 익명 비콘이 호출돼도 네트워크로 나가지 않게

/* ── 엔진 조작 핸들 노출 — 스크립트 전역(cur/state/…)은 Function 스코프라 클로저로 접근 ── */
const EXPOSE = `;globalThis.__API={
  setCur:function(c){ cur=c; },
  fill:function(){ window.rrModel=null; fillExample(); },
  sim:function(){ return simModel(); },
  get:function(k){ return state[k]; },
  set:function(k,v){ state[k]=String(v); },
  setStack:function(k,v){ stackState[k]=String(v); },
  setRefi:function(k,v){ refiState[k]=String(v); }
};`;
new Function(main + '\n' + inj + '\n' + EXPOSE)();
const API = globalThis.__API;

/* ── smoke.js 스타일 검사 목록 ── */
let pass = 0, fail = 0;
const failures = [];
function ok(c, msg) { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; failures.push(msg); console.log('  ✗ FAIL: ' + msg); } }

function fresh(deal) { API.setCur(deal); API.fill(); return API.sim(); }
/* 스윕: 값마다 예시로 원복 → mutate(v) → 재계산 → pick 추출 */
function sweep(deal, values, mutate, pick) {
  return values.map(v => { fresh(deal); mutate(v); return pick(API.sim(), v); });
}
const fin = x => x != null && isFinite(x);
function strictDown(a, eps) { for (let i = 0; i + 1 < a.length; i++) { if (!fin(a[i]) || !fin(a[i + 1]) || !(a[i + 1] < a[i] - eps)) return false; } return true; }
function strictUp(a, eps) { for (let i = 0; i + 1 < a.length; i++) { if (!fin(a[i]) || !fin(a[i + 1]) || !(a[i + 1] > a[i] + eps)) return false; } return true; }
const fmt = (a, d) => a.map(x => fin(x) ? Number(x).toFixed(d == null ? 4 : d) : 'null').join(' → ');

/* dev 아파트 분양가 일괄 스케일 — 평형표(p) 전체를 f배 */
function scaleAptPrice(f) {
  const rows = JSON.parse(API.get('aptrows'));
  rows.forEach(r => { r.p = String(Math.round(parseFloat(String(r.p).replace(/,/g, '')) * f * 100) / 100); });
  API.set('aptrows', JSON.stringify(rows));
}

(function () {
  // ── [0] 기준 결과 — 4딜 엔진이 예시에서 유효 결과를 내는지 ──
  console.log('\n[0] 기준 결과 (fillExample → simModel)');
  const b_of = fresh('office'), b_lg = fresh('logistics'), b_dv = fresh('dev'), b_rf = fresh('refi');
  ok(b_of && b_of.raw && fin(b_of.raw.IRR), 'office 기준 IRR ' + (b_of && b_of.raw ? fmt([b_of.raw.IRR]) : 'null'));
  ok(b_lg && b_lg.raw && fin(b_lg.raw.IRR), 'logistics 기준 IRR ' + (b_lg && b_lg.raw ? fmt([b_lg.raw.IRR]) : 'null'));
  ok(b_dv && b_dv.raw && fin(b_dv.raw.profit) && fin(b_dv.raw.margin), 'dev 기준 사업이익 ' + (b_dv && b_dv.raw ? fmt([b_dv.raw.profit], 0) : 'null'));
  ok(b_rf && b_rf.rows && b_rf.rows.length === 3, 'refi 기준 대안 ' + (b_rf && b_rf.rows ? b_rf.rows.length : 0) + '개');

  // ── [1] 오피스 — 가격·금리·공실 단조성 ──
  console.log('\n[1] 오피스 매입 (calcModel 정밀 엔진)');

  // ① Exit Cap ↑ → 순매각가 ↓, IRR ↓
  const ec = sweep('office', ['4.8', '5.3', '5.8'], v => API.set('exitcap', v), r => ({ ns: r.raw.netSale, irr: r.raw.IRR }));
  ok(strictDown(ec.map(x => x.ns), 1e-6), '① Exit Cap 4.8→5.8% : 순매각가 단조 감소 (' + fmt(ec.map(x => x.ns), 0) + ' 백만)');
  ok(strictDown(ec.map(x => x.irr), 1e-9), '① Exit Cap 4.8→5.8% : 레버드 IRR 단조 감소 (' + fmt(ec.map(x => x.irr)) + ')');

  // ② 매입가 ↑ → IRR ↓ (감정가는 예시값 고정 → 대출 동일, 자기자본만 증가)
  const pr = sweep('office', ['120000', '126000', '132000'], v => API.set('price', v), r => r.raw.IRR);
  ok(strictDown(pr, 1e-9), '② 매입가 1,200→1,320억 : IRR 단조 감소 (' + fmt(pr) + ')');

  // ③ 선순위 금리 ↑ → 자기자본 연 CF 합 ↓, IRR ↓
  const rt = sweep('office', ['4.2', '4.7', '5.2'], v => API.setStack('senior_rate', v),
    r => ({ cf: r.raw.dist.reduce((a, b) => a + b, 0), irr: r.raw.IRR }));
  ok(strictDown(rt.map(x => x.cf), 1e-6), '③ 선순위 금리 4.2→5.2% : 자기자본 CF 합 단조 감소 (' + fmt(rt.map(x => x.cf), 0) + ' 백만)');
  ok(strictDown(rt.map(x => x.irr), 1e-9), '③ 선순위 금리 4.2→5.2% : IRR 단조 감소 (' + fmt(rt.map(x => x.irr)) + ')');

  // ④ 공실률 ↑ → 1차연도 NOI ↓
  const vc = sweep('office', ['5', '10', '20'], v => API.set('vacancy', v), r => r.raw.NOI[0]);
  ok(strictDown(vc, 1e-6), '④ 공실률 5→20% : NOI[0] 단조 감소 (' + fmt(vc, 1) + ' 백만)');

  // ⑤ 보유기간 3~10년 각각에서 IRR 수렴(유한) — irr() 이분법 실패(null) 없음
  const hd = sweep('office', ['3', '4', '5', '6', '7', '8', '9', '10'], v => API.set('hold', v), r => r.raw.IRR);
  ok(hd.every(fin), '⑤ 보유기간 3→10년 : IRR 전 구간 유한 (' + fmt(hd, 3) + ')');

  // ── [2] 분양 사업수지 (월별 엔진) ──
  console.log('\n[2] 공동주택 분양 (devResiCompute 월별 엔진)');

  // ⑥ 분양가 ↑ → 사업이익 ↑ (판매비·보증·대납이자가 매출 연동이어도 이익 방향은 불변이어야 함)
  const sp = sweep('dev', [1.0, 1.05, 1.10], f => scaleAptPrice(f), r => r.raw.profit);
  ok(strictUp(sp, 1e-6), '⑥ 분양가 ×1.0→×1.1 : 사업이익 단조 증가 (' + fmt(sp, 0) + ' 백만)');

  // ⑦ 공사비 ↑ → 이익률 ↓ (설계감리·예비비가 공사비 비율 연동이라 더 가파르게 하락)
  const cc = sweep('dev', ['290000', '304500', '319000'], v => API.set('conscost', v), r => r.raw.margin);
  ok(strictDown(cc, 1e-9), '⑦ 공사비 2,900→3,190억 : 사업이익률 단조 감소 (' + fmt(cc, 3) + ' %)');

  // (보너스) 분양률 ↓ → 사업이익 ↓ — 대주 스트레스 표와 같은 축
  const sd = sweep('dev', ['100', '90', '80'], v => API.set('aptsold', v), r => r.raw.profit);
  ok(strictDown(sd, 1e-6), '＋ 분양률 100→80% : 사업이익 단조 감소 (' + fmt(sd, 0) + ' 백만)');

  // ── [3] 리파이낸싱 비교 ──
  console.log('\n[3] 리파이낸싱 (refiSchedule 연도 전개)');

  // ⑧ 금리 ↑ → 해당 대안 총이자 ↑
  const ri = sweep('refi', ['4.0', '4.5', '5.0'], v => API.setRefi('a1_rate', v), r => r.rows.find(x => x.n === 1).totInt);
  ok(strictUp(ri, 1e-6), '⑧ 1안 금리 4.0→5.0% : 총이자 단조 증가 (' + fmt(ri, 0) + ' 백만)');

  // (보너스) LTV ↑ → 대출금 ↑ · 1차연도 DSCR ↓
  const rl = sweep('refi', ['50', '55', '60'], v => API.setRefi('a1_ltv', v),
    r => { const a = r.rows.find(x => x.n === 1); return { loan: a.loan, dscr: a.dscr }; });
  ok(strictUp(rl.map(x => x.loan), 1e-6), '＋ 1안 LTV 50→60% : 대출금 단조 증가 (' + fmt(rl.map(x => x.loan), 0) + ' 백만)');
  ok(strictDown(rl.map(x => x.dscr), 1e-9), '＋ 1안 LTV 50→60% : Y1 DSCR 단조 감소 (' + fmt(rl.map(x => x.dscr), 3) + 'x)');

  // 마지막 원복 — 이후 어떤 코드가 이 컨텍스트를 재사용해도 예시 상태
  fresh('office');

  console.log('\n결과: ' + pass + ' 통과, ' + fail + ' 실패' + (fail ? '\n' + failures.map(f => ' - ' + f).join('\n') : ''));
  process.exit(fail ? 1 : 0);
})();
