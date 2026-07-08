#!/usr/bin/env node
/* 모델터 파리티 1단계 — 배포 index.html을 헤드리스로 실행해
 * "화면 엔진 기대값"과 "다운로드 엑셀 바이트"를 함께 덤프합니다.
 *
 * 사용:  node tools/parity/gen-xlsx.js office|logistics|dev|refi
 * 출력:  tools/parity/out/<딜>_parity.xlsx  +  <딜>_expected.json
 * 다음:  python3 tools/parity/check.py <딜>   (엑셀을 수식 엔진으로 재계산해 비교)
 *
 * 원칙: 화면 = 다운로드 엑셀. 계산 엔진이나 엑셀 생성기를 수정했다면
 *       반드시 이 2단계(생성→검증)를 딜 유형별로 다시 돌려야 합니다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DEAL = process.argv[2] || 'office';
if (!['office', 'logistics', 'dev', 'refi'].includes(DEAL)) {
  console.error('사용: node tools/parity/gen-xlsx.js office|logistics|dev|refi');
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

/* 딜별 드라이버 — 예시 로드 → 엔진 결과 확인 → 엑셀 바이트 캡처 */
const DRIVERS = {
  office: `;(function(){
    cur = "office"; window.rrModel = null; fillExample();
    var r = simModel();
    if (!(r && r.raw && r.raw.IRR != null)) throw new Error("engine null");
    window.__downloadXlsx();
    var blob = globalThis.__lastBlob;
    if (!blob || !blob.parts || !blob.parts[0] || !blob.parts[0].length) throw new Error("blob 미캡처");
    globalThis.__OUT = { bytes: blob.parts[0], raw: { IRR: r.raw.IRR, IRRat: r.raw.IRRat, EM: r.raw.EM, coc: r.raw.coc, minDSCR: r.raw.minDSCR, unlev: r.raw.unlev, equity: r.raw.equity } };
  })();`,
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
DRIVERS.logistics = DRIVERS.office.replace('"office"', '"logistics"');

new Function(main + '\n' + inj + '\n' + DRIVERS[DEAL])();
const out = globalThis.__OUT;
fs.writeFileSync(path.join(OUT, DEAL + '_parity.xlsx'), Buffer.from(out.bytes));
fs.writeFileSync(path.join(OUT, DEAL + '_expected.json'), JSON.stringify(out.raw, null, 1));
console.log(DEAL, '| xlsx bytes:', out.bytes.length, '| expected keys:', Object.keys(out.raw).join(','));
