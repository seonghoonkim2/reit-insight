#!/usr/bin/env node
/* 다운로드 엑셀 표시 회귀 검사 (Node 내장 모듈만 사용).
 * 실제 __downloadXlsx()가 만든 ZIP/XML을 검사한다. 계산 정확성은 parity/check.py의 책임.
 * 사용: node tools/qa/excel-format.js [--out <검토용 xlsx 저장 폴더>]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const ROOT = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'dart-search/web/modelter/index.html'), 'utf8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const main = blocks.find(b => b.includes('function fillExample'));
const xlsx = blocks.find(b => b.includes('const XLTMPL='));
if (!main || !xlsx) throw new Error('앱 스크립트를 찾지 못했습니다');
const outIndex = process.argv.indexOf('--out');
if (outIndex >= 0 && !process.argv[outIndex + 1]) throw new Error('--out 다음에 저장 폴더를 지정하세요');
const output = outIndex >= 0 ? path.resolve(process.argv[outIndex + 1] || '') : null;
if (output) fs.mkdirSync(output, { recursive: true });

// 렌트롤은 테스트용 임의 값이다. 실제 사용자·임차인 데이터는 사용하지 않는다.
const LEASES = [
  { name: '검사 임차인 A', area: 3500, netArea: 2800, rentPP: 85000, camPP: 30000, deposit: 2500000000, yrsToExp: 1.5, rentFreeRemain: 1, stepUp: 0.03 },
  { name: '검사 임차인 B', area: 2500, netArea: 2000, rentPP: 88000, camPP: 32000, deposit: 1800000000, yrsToExp: 4, rentFreeRemain: 0, stepUp: 0.02 },
];
const MARKET = { marketPP: 90000, marketCamPP: 32000, mtm: 0, newRentFree: 2, absorbMonths: 9, stabVac: 0.05, renewP: 0.65, downtime: 3, mktStepUp: 0.03, camG: 0.03, repay: '만기일시(이자만)', grace: 0 };
// 실제 이름 대신 길이 경계와 XML 특수문자만 재현한다.
const TENANT_222 = '장'.repeat(222);
const ASSET_285 = '자'.repeat(285);
const VERY_LONG_TENANT = '긴임차인'.repeat(1024) + ' & <끝> ';
const VERY_LONG_ASSET = '긴자산'.repeat(1365) + ' & <끝> ';
let textSeed = 73129;
const LONG_LINK_ASSET = Array.from({ length: 2500 }, () => {
  textSeed = (Math.imul(textSeed, 1664525) + 1013904223) >>> 0;
  return String.fromCharCode(33 + ((textSeed >>> 16) % 90));
}).join('');
const SOURCE_ROWS = { asset: 6, gfa: 7, price: 12, appraisal: 14, acqtax: 15, acqfee: 16,
  rentpp: 23, campp: 24, vacancy: 25, depmult: 26, noig: 27, exitcap: 58, salefee: 59,
  prepayfee: 71, dispfee: 72, opfee: 76, fixcost: 77, hold: 79 };
const PROVENANCE = {
  sourceTags: Object.fromEntries(Object.keys(SOURCE_ROWS).map((key, i) => [key, {
    s: ['IM 기재', '감정평가', '실사', '추정', '회사 표준'][i % 5],
    d: '2026-09-' + String(i + 1).padStart(2, '0'),
  }])),
  context: { dealId: 'qa-deal', dealName: '가상 검토 딜 & A', versionId: 'qa-version',
    label: 'v3', vname: '실사 반영', dirty: false, explicit: true },
  house: { team: '가상 검토팀', ver: 'v2', at: '2026-09-20', irr: 8, dscr: 1.3 },
};
const cases = [
  { name: 'office', deal: 'office', hold: 5 },
  { name: 'logistics', deal: 'logistics', hold: 5 },
  { name: 'dev', deal: 'dev' },
  { name: 'refi', deal: 'refi' },
  { name: 'office_hold3', deal: 'office', hold: 3 },
  { name: 'office_hold4', deal: 'office', hold: 4 },
  { name: 'office_hold6', deal: 'office', hold: 6 },
  { name: 'office_hold7', deal: 'office', hold: 7 },
  { name: 'office_hold8', deal: 'office', hold: 8 },
  { name: 'office_hold9', deal: 'office', hold: 9 },
  { name: 'office_hold10', deal: 'office', hold: 10 },
  { name: 'office_rentroll', deal: 'office', hold: 5, rentroll: 'source' },
  { name: 'office_lease_hold10', deal: 'office', hold: 10, rentroll: 'model' },
  { name: 'office_tenant222', deal: 'office', hold: 5, rentroll: 'model', leases: [{ ...LEASES[0], name: TENANT_222 }, LEASES[1]], clipped: true, compactClipped: false },
  // Approved A&R input width is now 21 (was 17): 285 characters fit below
  // Excel's 409pt row limit. The much longer fixture still checks clipping.
  { name: 'office_asset285', deal: 'office', hold: 5, asset: ASSET_285, clipped: true, compactClipped: false },
  { name: 'office_very_long_text', deal: 'office', hold: 5, asset: VERY_LONG_ASSET, rentroll: 'model', leases: [{ ...LEASES[0], name: VERY_LONG_TENANT }, LEASES[1]], clipped: true },
  { name: 'office_long_restore_link', deal: 'office', hold: 5, asset: LONG_LINK_ASSET, clipped: true, longLink: true },
  { name: 'office_multiline_asset', deal: 'office', hold: 5, asset: Array.from({ length: 40 }, (_, i) => '자산 ' + (i + 1)).join('\n'), clipped: true },
  { name: 'office_restore_optout', deal: 'office', hold: 5, recover: false },
  { name: 'office_long_link_optout', deal: 'office', hold: 5, asset: LONG_LINK_ASSET, recover: false, clipped: true, longLink: true },
  { name: 'office_provenance', deal: 'office', hold: 5, ...PROVENANCE },
  { name: 'office_lease_provenance', deal: 'office', hold: 5, rentroll: 'model', ...PROVENANCE },
];

function stub() {
  const state = {};
  const el = new Proxy(function () {}, {
    get(_, key) {
      if (key === 'querySelectorAll') return () => [];
      if (key === 'querySelector' || key === 'closest') return () => null;
      if (key === 'getBoundingClientRect') return () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 });
      if (key === 'classList') return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
      if (key === 'style' || key === 'dataset') return state[key] || (state[key] = {});
      if (['addEventListener', 'removeEventListener', 'appendChild', 'removeChild', 'insertBefore', 'setAttribute', 'removeAttribute', 'click', 'focus', 'blur', 'select', 'remove', 'scrollIntoView', 'setSelectionRange'].includes(key)) return () => {};
      if (key === 'getAttribute') return () => null;
      if (key === 'getContext') return () => stub();
      if (['value', 'innerHTML', 'textContent', 'className', 'href', 'placeholder', 'id', 'name', 'type'].includes(key)) return key in state ? state[key] : '';
      if (['hidden', 'checked', 'disabled'].includes(key)) return key in state ? state[key] : false;
      if (key === Symbol.toPrimitive) return () => '';
      return key in state ? state[key] : el;
    },
    set(_, key, value) { state[key] = value; return true; },
    apply() { return el; },
  });
  return el;
}

function generate(config) {
  const dom = new Map();
  const sandbox = {
    console: { log() {}, warn() {}, error() {} }, TextEncoder, TextDecoder,
    setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
    addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    innerWidth: 1200, innerHeight: 800, scrollTo() {}, alert() {}, confirm: () => true,
    document: {
      getElementById(id) { if (!dom.has(id)) dom.set(id, stub()); return dom.get(id); },
      querySelector: () => null, querySelectorAll: () => [], createElement: () => stub(),
      addEventListener() {}, body: stub(), documentElement: stub(), readyState: 'complete', fonts: { ready: Promise.resolve() },
    },
    location: { hash: '', origin: 'https://modelter.com', pathname: '/', href: 'https://modelter.com/' },
    localStorage: { getItem: key => key === 'mt_house' && config.house ? JSON.stringify(config.house) : null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    URL: { createObjectURL: () => 'blob:qa', revokeObjectURL() {} },
    navigator: {},
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    IntersectionObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
  };
  sandbox.window = sandbox;
  sandbox.Blob = function (parts) { this.parts = parts; sandbox.lastBlob = this; };
  sandbox.document.getElementById('recoverChk').checked = config.recover !== false;
  vm.createContext(sandbox);
  const leases = config.leases || LEASES;
  const patch = config.rentroll ? `
    window.rrState = { leases: ${JSON.stringify(leases)} };
    ${config.rentroll === 'model' ? `window.rrModel = {on: true, leases: ${JSON.stringify(leases)}, mkt: ${JSON.stringify(config.market || MARKET)}};` : ''}
  ` : '';
  const driver = `
    cur = ${JSON.stringify(config.deal)}; window.rrState = null; window.rrModel = null; fillExample();
    ${config.hold ? `state.hold = '${config.hold}';` : ''}
    ${config.asset !== undefined ? `state.asset = ${JSON.stringify(config.asset)};` : ''}
    ${config.state ? `Object.assign(state, ${JSON.stringify(config.state)});` : ''}
    ${config.stack ? `Object.assign(stackState, ${JSON.stringify(config.stack)});` : ''}
    ${config.sourceTags ? `Object.assign(srcTags, ${JSON.stringify(config.sourceTags)});` : ''}
    ${patch}
    window.engineRaw = (simModel() || {}).raw;
    window.sensitivityBase = typeof window.__mtSensBase === 'function' ? window.__mtSensBase() : null;
    window.expectedSnapshot = encodeState();
    window.fullRestoreUrl = shareLink(true, 'xlsx');
    window.generatedDate = new Date().toISOString().slice(0, 10);
    ${config.download === false ? '' : 'window.__downloadXlsx(' + (config.context ? JSON.stringify(config.context) : '') + ');'}
  `;
  vm.runInContext(main + '\n' + xlsx + '\n' + driver, sandbox, { timeout: 15000 });
  if (config.download !== false && (!sandbox.lastBlob || !sandbox.lastBlob.parts[0])) throw new Error('다운로드 파일이 생성되지 않았습니다');
  return {
    bytes: config.download === false ? null : Buffer.from(sandbox.lastBlob.parts[0]), expected: sandbox.engineRaw,
    sensitivityBase: sandbox.sensitivityBase,
    snapshot: sandbox.expectedSnapshot, fullRestoreUrl: sandbox.fullRestoreUrl,
    generatedDate: sandbox.generatedDate,
    decodeSnapshot: code => JSON.parse(vm.runInContext('mtLZ.decompress(' + JSON.stringify(code) + ')', sandbox)),
  };
}

function unzip(bytes) {
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('ZIP 종료 레코드 없음');
  const files = new Map();
  let offset = bytes.readUInt32LE(end + 16);
  for (let i = 0; i < bytes.readUInt16LE(end + 10); i++) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error('ZIP 중앙 디렉터리 손상');
    const method = bytes.readUInt16LE(offset + 10), size = bytes.readUInt32LE(offset + 20);
    const nameLength = bytes.readUInt16LE(offset + 28), extraLength = bytes.readUInt16LE(offset + 30), commentLength = bytes.readUInt16LE(offset + 32);
    const name = bytes.toString('utf8', offset + 46, offset + 46 + nameLength);
    const local = bytes.readUInt32LE(offset + 42);
    if (bytes.readUInt32LE(local) !== 0x04034b50) throw new Error('ZIP 로컬 헤더 손상: ' + name);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const packed = bytes.subarray(start, start + size);
    const value = method === 0 ? packed : method === 8 ? zlib.inflateRawSync(packed) : null;
    if (!value || value.length !== bytes.readUInt32LE(offset + 24)) throw new Error('ZIP 압축/크기 불일치: ' + name);
    if (files.has(name)) throw new Error('ZIP 중복 파일: ' + name);
    files.set(name, value.toString('utf8'));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}
function decode(value) {
  return String(value || '').replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
function attrs(value) { return Object.fromEntries([...String(value || '').matchAll(/([\w:]+)="([^"]*)"/g)].map(m => [m[1], decode(m[2])])); }
function tags(xml, name) {
  return [...String(xml || '').matchAll(new RegExp('<' + name + '\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/' + name + '>)', 'g'))]
    .map(m => ({ ...attrs(m[1]), content: m[2] || '' }));
}
function column(ref) { let n = 0; for (const c of ref.match(/^[A-Z]+/)[0]) n = n * 26 + c.charCodeAt(0) - 64; return n; }
function colName(n) { let s = ''; for (; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; }
function rectangle(range) {
  const [first, last = first] = range.split(':');
  return { left: column(first), right: column(last), top: Number(first.match(/\d+/)[0]), bottom: Number(last.match(/\d+/)[0]) };
}
function workbook(bytes) {
  const files = unzip(bytes), styleXml = files.get('xl/styles.xml');
  const fonts = tags(tags(styleXml, 'fonts')[0].content, 'font');
  const fills = tags(tags(styleXml, 'fills')[0].content, 'fill');
  const xfs = tags(tags(styleXml, 'cellXfs')[0].content, 'xf');
  const rels = new Map(tags(files.get('xl/_rels/workbook.xml.rels'), 'Relationship').map(r => [r.Id, r.Target]));
  const strings = tags(files.get('xl/sharedStrings.xml'), 'si').map(si => tags(si.content, 't').map(t => decode(t.content)).join(''));
  const sheets = tags(files.get('xl/workbook.xml'), 'sheet').map(s => {
    const target = rels.get(s['r:id']);
    const file = target.startsWith('/') ? target.slice(1) : path.posix.normalize('xl/' + target);
    const xml = files.get(file); if (!xml) throw new Error('시트 XML 없음: ' + s.name);
    const rawCells = tags(xml, 'c');
    const cells = new Map(rawCells.map(c => {
      const value = tags(c.content, 'v')[0], formula = tags(c.content, 'f')[0];
      const inline = tags(c.content, 't').map(t => decode(t.content)).join('');
      return [c.r, { ...c, value: c.t === 's' ? strings[Number(value && value.content)] : c.t === 'inlineStr' ? inline : value ? decode(value.content) : '', formula: formula ? decode(formula.content) : null }];
    }));
    return { ...s, xml, cells, cellCount: rawCells.length, merges: tags(xml, 'mergeCell').map(m => m.ref), cols: tags(xml, 'col'), rows: new Map(tags(xml, 'row').map(r => [Number(r.r), r])) };
  });
  return { files, sheets, styles: xfs.map(xf => ({
    ...xf, font: fonts[Number(xf.fontId || 0)], fill: fills[Number(xf.fillId || 0)], alignment: tags(xf.content, 'alignment')[0] || {},
  })) };
}

let pass = 0, fail = 0;
function check(condition, message) { if (condition) pass++; else { fail++; console.error('  FAIL: ' + message); } }
function cellStyle(wb, sheet, ref) { const c = sheet.cells.get(ref); return c ? wb.styles[Number(c.s || 0)] : null; }
function fontSize(style) { return style ? Number((tags(style.font.content, 'sz')[0] || {}).val) : NaN; }
function fontColor(style) { return style ? String((tags(style.font.content, 'color')[0] || {}).rgb || '').slice(-6).toUpperCase() : ''; }
function fillColor(style) { return style ? String((tags(style.fill.content, 'fgColor')[0] || {}).rgb || '').slice(-6).toUpperCase() : ''; }
function width(sheet, col) { const i = column(col), c = sheet.cols.find(c => Number(c.min) <= i && Number(c.max) >= i); return c ? Number(c.width) : 0; }
function showSheet(wb, name) { const sheet = wb.sheets.find(s => s.name === name); if (!sheet) throw new Error('시트 없음: ' + name); return sheet; }
function styleChecks(wb, config, expected, generated) {
  const compact = wb.sheets.some(s => s.name === 'A&R');
  const restore = showSheet(wb, '_Restore');
  check(restore.state === 'hidden', config.name + ': 복원 시트 숨김');
  const restoreMatch = /^MTSNAP1:(.+):PANSTM$/.exec((restore.cells.get('B3') || {}).value);
  check(Boolean(restoreMatch), config.name + ': 복원 데이터 보존');
  check(restoreMatch && restoreMatch[1] === generated.snapshot, config.name + ': 링크 길이·옵트아웃과 무관하게 원본 복원 코드 보존');
  const snapshot = restoreMatch ? generated.decodeSnapshot(restoreMatch[1]) : null;
  if (config.asset !== undefined) check(snapshot && snapshot.s.asset === config.asset, config.name + ': 복원 데이터에 자산명 원문 보존');
  if (config.rentroll === 'model') {
    const leases = config.leases || LEASES;
    check(snapshot && snapshot.rr && snapshot.rr.leases.length === leases.length, config.name + ': 복원 데이터에 계약 수 보존');
    check(snapshot && snapshot.rr && snapshot.rr.leases.every((lease, i) => lease.name !== leases[i].name && lease.name.startsWith('임차인')), config.name + ': 복원 데이터 임차인명 마스킹');
    check(snapshot && snapshot.rr && snapshot.rr.leases.every((lease, i) => Object.keys(leases[i]).filter(k => k !== 'name').every(k => lease[k] === leases[i][k])), config.name + ': 이름 외 원본 임대조건 보존');
  }
  const visible = wb.sheets.filter(s => s.state !== 'hidden');
  const sheetNames = new Set(wb.sheets.map(s => s.name));
  const count = config.deal === 'dev' ? 6 : config.deal === 'refi' ? 4 : (compact ? 6 + (config.rentroll ? 1 : 0) : 12 + (config.rentroll === 'source' ? 1 : config.rentroll === 'model' ? 4 : 0));
  check(visible.length === count, config.name + ': 표시 시트 수 (' + visible.length + '/' + count + ')');
  if (compact) {
    check(visible[0].name === 'A&R', config.name + ': 가정·결과 시트가 첫 탭');
    for (const name of ['A&R', '운영수지', '대출', '세무·매각', '지분 현금흐름', '검증']) check(sheetNames.has(name), config.name + ': 통합 시트 ' + name + ' 존재');
    check(![...sheetNames].some(name => /^(00_Cover|01_Assumptions|02_Sources_Uses|03_Capital_Stack|07_Equity_Waterfall|09_Return_Summary|10_Sensitivity)$/.test(name)), config.name + ': 통합 전 중복 탭 없음');
  }
  for (const sheet of wb.sheets) {
    const label = config.name + '/' + sheet.name;
    check([...sheet.rows.values()].every(row => !row.ht || (Number.isFinite(Number(row.ht)) && Number(row.ht) > 0 && Number(row.ht) <= 409)), label + ': 모든 행 높이는 409pt 이하');
    check(!/<c\b[^>]*\bt="e"/.test(sheet.xml), label + ': 엑셀 오류 셀 없음');
    check([...sheet.cells.values()].every(c => c.t || !c.value || Number.isFinite(Number(c.value))), label + ': 유한 숫자 값');
    const invalidRefs = [];
    for (const cell of sheet.cells.values()) {
      if (!cell.formula) continue;
      if (cell.formula.includes('#REF!')) invalidRefs.push(cell.r + '=#REF!');
      // 문자열 리터럴의 느낌표는 시트 참조가 아니다.
      const formula = cell.formula.replace(/"(?:[^"]|"")*"/g, '');
      for (const ref of formula.matchAll(/(?:'((?:[^']|'')+)'|([A-Za-z0-9_]+))!/g)) {
        const name = (ref[1] || ref[2]).replace(/''/g, "'");
        if (!sheetNames.has(name)) invalidRefs.push(cell.r + ' -> ' + name);
      }
    }
    check(invalidRefs.length === 0, label + ': 수식 참조 시트 존재' + (invalidRefs.length ? ' (' + invalidRefs.slice(0, 3).join(', ') + ')' : ''));
    check(!/<sheetProtection\b/.test(sheet.xml), label + ': 가정·수식 편집 가능');
    if (sheet.state === 'hidden') continue;
    check(/showGridLines="0"/.test(sheet.xml), label + ': 눈금선 숨김');
    const pane = tags(sheet.xml, 'pane')[0];
    if (sheet.name === '00_Cover') check(!pane, label + ': 표지에 불필요한 틀 고정 없음');
    else check(pane && pane.state === 'frozen' && Number(pane.xSplit) === 2 && Number(pane.ySplit) >= 4, label + ': 제목·항목 열 틀 고정');
    check(compact && sheet.name === 'A&R' ? width(sheet, 'B') === 29 : width(sheet, 'B') >= 30, label + ': 승인 디자인의 항목 열 너비');
    const title = sheet.cells.get('B1') || sheet.cells.get('B2');
    if (title) check(fontSize(cellStyle(wb, sheet, title.r)) >= 14, label + ': 제목 글자 크기');
    if (compact && title) {
      const style = cellStyle(wb, sheet, title.r);
      check(fontColor(style) === '1F3864' && fillColor(style) === 'FFFFFF', label + ': 승인한 남색 제목·흰 배경');
      const header = cellStyle(wb, sheet, 'B4');
      check(fontColor(header) === 'FFFFFF' && fillColor(header) === '1F3864', label + ': 표 머리글 남색·흰 글씨');
    }
    const darkHeaders = [...sheet.cells.values()].filter(c => (c.value !== '' || c.formula) &&
      ['1F3864', '2F5496'].includes(fillColor(cellStyle(wb, sheet, c.r))));
    const unreadableHeaders = darkHeaders.filter(c => fontColor(cellStyle(wb, sheet, c.r)) !== 'FFFFFF');
    check(unreadableHeaders.length === 0, label + ': 모든 남색·파랑 머리글은 흰 글씨' +
      (unreadableHeaders.length ? ' (' + unreadableHeaders.map(c => c.r).join(', ') + ')' : ''));
    check(sheet.cells.size === sheet.cellCount, label + ': 셀 주소 중복 없음');
    const overlaps = [];
    for (let i = 0; i < sheet.merges.length; i++) {
      const a = rectangle(sheet.merges[i]);
      for (let j = i + 1; j < sheet.merges.length; j++) {
        const b = rectangle(sheet.merges[j]);
        if (a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top) overlaps.push(sheet.merges[i] + ' / ' + sheet.merges[j]);
      }
    }
    check(overlaps.length === 0, label + ': 병합 범위 겹침 없음' + (overlaps.length ? ' (' + overlaps.slice(0, 3).join(', ') + ')' : ''));
    for (const range of sheet.merges) {
      const [first, last] = range.split(':'); if (!last) continue;
      const top = Number(first.match(/\d+/)[0]), bottom = Number(last.match(/\d+/)[0]);
      const hiddenData = [...sheet.cells.values()].filter(c => c.r !== first && column(c.r) >= column(first) && column(c.r) <= column(last) && Number(c.r.match(/\d+/)[0]) >= top && Number(c.r.match(/\d+/)[0]) <= bottom && (c.formula || c.value !== ''));
      check(hiddenData.length === 0, label + '/' + range + ': 병합에 값·수식이 가려지지 않음');
    }
  }
  const externalLinks = [...wb.files].filter(([name]) => /^xl\/worksheets\/_rels\/.+\.rels$/.test(name)).flatMap(([, xml]) => tags(xml, 'Relationship').filter(rel => rel.TargetMode === 'External'));
  const visibleText = visible.flatMap(sheet => [...sheet.cells.values()].filter(c => !c.formula).map(c => c.value)).join('\n');
  const fullLinkFits = generated.fullRestoreUrl && generated.fullRestoreUrl.length <= 1900;
  const downloadSupportsLink = config.deal !== 'dev' && config.deal !== 'refi';
  if (downloadSupportsLink) {
    if (config.recover !== false && fullLinkFits) {
      check(externalLinks.length === (compact ? 1 : 2), config.name + ': 정상 복원 링크는 ' + (compact ? 'A&R에 한 번' : '표지·가정표에') + ' 표시');
      check(externalLinks.every(link => link.Target === generated.fullRestoreUrl && /#v=.+&src=xlsx$/.test(link.Target)), config.name + ': 정상 링크는 가정을 포함한 URL 유지');
      check(externalLinks.every(link => {
        const code = /#v=([^&]+)/.exec(link.Target);
        return code && code[1] === generated.snapshot;
      }), config.name + ': 링크와 파일의 복원 데이터 일치');
    } else {
      check(externalLinks.length === 0, config.name + ': 복원 불가·옵트아웃 시 외부 링크 제외');
      check(!visibleText.includes('modelter.com에서 다운로드 시점 가정 열기'), config.name + ': 복원되지 않는 가정 열기 안내 없음');
    }
    check(externalLinks.every(link => !/#src=xlsx$/.test(link.Target)), config.name + ': 가정 없는 채널 링크로 대체하지 않음');
    if (config.longLink) check(generated.fullRestoreUrl.length > 1900, config.name + ': 실제 복원 URL 1900자 초과 조건 재현');
    const missingLinkNote = '가정이 많아 복원 링크를 넣지 않았습니다.';
    if (config.recover !== false && !fullLinkFits) {
      for (const name of compact ? ['A&R'] : ['00_Cover', '01_Assumptions']) check([...showSheet(wb, name).cells.values()].some(c => c.value.includes(missingLinkNote)), config.name + '/' + name + ': 긴 링크의 복원 불가 안내');
    } else check(!visibleText.includes(missingLinkNote), config.name + ': 정상 링크·옵트아웃에 불필요한 복원 불가 안내 없음');
  }
  const clippingNote = compact ? '원문은 보존됩니다. 셀을 선택해 수식 입력줄에서 전체 내용을 확인하세요.' : '원문은 보존되며 셀을 선택해 수식 입력줄에서 전체 내용을 확인할 수 있습니다.';
  const clipped = compact && config.compactClipped !== undefined ? config.compactClipped : Boolean(config.clipped);
  check(visibleText.includes(clippingNote) === clipped, config.name + ': 긴 텍스트가 한도를 넘은 경우에만 전체 내용 확인 방법 안내');
  if (clipped) check(visible.some(sheet => [...sheet.rows.values()].some(row => Number(row.ht) === 409)), config.name + ': 긴 텍스트 행을 409pt로 제한');
  for (const sheet of visible) {
    const limited = [...sheet.rows.values()].some(row => Number(row.ht) === 409);
    const note = [...sheet.cells.values()].find(c => c.value.includes(clippingNote));
    check(Boolean(note) === limited, config.name + '/' + sheet.name + ': 표시 한도에 걸린 시트마다 원문 확인 안내');
    if (note) check(/긴 텍스트 확인 \([A-Z]+\d+/.test(note.value), config.name + '/' + sheet.name + ': 안내에 해당 셀 주소 표시');
  }
  if (config.asset !== undefined && downloadSupportsLink) check((showSheet(wb, compact ? 'A&R' : '01_Assumptions').cells.get('C6') || {}).value === config.asset, config.name + ': 가정표의 긴 자산명 원문 보존');
  if (config.leases) {
    check((showSheet(wb, compact ? 'Rent Roll' : '01_Rent_Roll').cells.get('B5') || {}).value === config.leases[0].name, config.name + ': 렌트롤의 긴 임차인명 원문 보존');
    if (config.rentroll === 'model' && !compact) check((showSheet(wb, 'Lease_Risk').cells.get('B5') || {}).value === config.leases[0].name, config.name + ': 리스크 표의 긴 임차인명 원문 보존');
  }
  if (config.deal === 'dev' || config.deal === 'refi') return;
  check(showSheet(wb, '_Calc').state === 'hidden', config.name + ': 계산 보조 시트 숨김');
  const assumptions = showSheet(wb, compact ? 'A&R' : '01_Assumptions'), validation = showSheet(wb, compact ? '검증' : '11_Validation_Checks');
  if (config.sourceTags) {
    for (const [key, tag] of Object.entries(config.sourceTags)) {
      const ref = (compact ? 'E' : 'F') + SOURCE_ROWS[key], cell = assumptions.cells.get(ref);
      const prefix = '[' + tag.s + ' · ' + tag.d + ']';
      check(cell && cell.value.startsWith(prefix), config.name + '/' + ref + ': 사용자가 기록한 출처·날짜 보존');
    }
  }
  if (config.context || config.house) {
    const metadata = compact ? (assumptions.cells.get('G67') || {}).value :
      (showSheet(wb, '00_Cover').cells.get('B2') || {}).value;
    const ctx = config.context, house = config.house;
    if (ctx) {
      check(metadata && metadata.includes('Deal: ' + ctx.dealName), config.name + ': 사용자 딜명 보존');
      check(metadata && metadata.includes(ctx.label + '·' + ctx.vname), config.name + ': 저장한 버전명 보존');
      check(metadata && metadata.includes('생성 ' + generated.generatedDate), config.name + ': 실제 다운로드 생성일 보존');
    }
    if (house) check(metadata && metadata.includes(house.team + ' ' + house.ver + ' 기준 적용 · ' + house.at), config.name + ': 팀 기준명·버전·기준일 보존');
  }
  const pane = tags(assumptions.xml, 'pane')[0];
  check(pane && pane.topLeftCell === 'C5', config.name + ': 가정표 머리글만 고정하여 작업 영역 확보');
  check(/^(?:'A&R'!)?C79$/.test(((assumptions.cells.get('C57') || {}).formula || '').replace(/\$/g, '')), config.name + ': 보유기간 표시는 생성 기준 기간 참조');
  check(Number((assumptions.cells.get('C79') || {}).value) === config.hold, config.name + ': 생성 기준 보유기간 값');
  const validations = tags(assumptions.xml, 'dataValidation');
  function ruleFor(ref) { return validations.find(rule => rule.sqref.split(/\s+/).includes(ref)); }
  for (const [ref, choices] of [
    ['C47', ['만기일시(이자만)', '원금균등', '원리금균등', '거치후 원리금균등']],
    ['C84', ['이자만 지급', '만기일시상환(이자 누적)']],
  ]) {
    const rule = ruleFor(ref), value = rule && tags(rule.content, 'formula1')[0];
    const actual = value ? decode(value.content).replace(/^"|"$/g, '').split(',') : [];
    check(rule && rule.type === 'list' && rule.showErrorMessage === '1' && rule.errorStyle === 'stop' && actual.length === choices.length && choices.every(choice => actual.includes(choice)), config.name + '/' + ref + ': 상환방식 목록 검증');
  }
  for (const ref of ['C66', 'C73', 'C74']) {
    const rule = ruleFor(ref), first = rule && tags(rule.content, 'formula1')[0], last = rule && tags(rule.content, 'formula2')[0];
    check(rule && rule.type === 'whole' && rule.operator === 'between' && rule.showErrorMessage === '1' && rule.errorStyle === 'stop' && first && first.content === '0' && last && last.content === '1', config.name + '/' + ref + ': 0·1 정수 입력 검증');
  }
  for (const [ref, metric] of [['C19', 'IRR'], ['C20', 'EM'], ['C21', 'minDSCR'], ['C22', 'netSale']]) {
    const value = expected && expected[metric], snapshot = validation.cells.get(ref);
    check(Number.isFinite(value), config.name + ': 화면 기대값 ' + metric + ' 유한');
    check(snapshot && !snapshot.t && Number.isFinite(value) && Math.abs(Number(snapshot.value) - value) <= Math.max(1e-10, Math.abs(value) * 1e-10), config.name + '/' + ref + ': 다운로드 시점 ' + metric + '은 현재 화면 엔진과 일치');
  }
  check(fontSize(cellStyle(wb, assumptions, 'B7')) === 10, config.name + ': 가정 항목 10pt');
  check(fontSize(cellStyle(wb, assumptions, 'C7')) === 10, config.name + ': 입력 숫자 10pt');
  check(Number((assumptions.rows.get(7) || {}).ht) >= 23, config.name + ': 본문 행 높이');
  check(compact ? width(assumptions, 'E') === 32 && width(validation, 'F') === 43 : width(assumptions, 'F') >= 47 && width(validation, 'F') >= 47, config.name + ': 승인 디자인의 가정·검증 비고 너비');
  check(fontSize(cellStyle(wb, assumptions, compact ? 'E11' : 'F11')) === (compact ? 10 : 9), config.name + ': 가정 비고 글자 크기');
  if (compact) {
    const section = cellStyle(wb, assumptions, 'B5');
    check(fillColor(section) === '2F5496' && fontColor(section) === 'FFFFFF', config.name + ': 구역 제목 파랑·흰 글씨');
    check(fontColor(cellStyle(wb, assumptions, 'C7')) === '0000FF', config.name + ': 입력값 파랑');
    check(fontColor(cellStyle(wb, assumptions, 'H5')) === '008000', config.name + ': 다른 시트 참조 초록');
    check(fontColor(cellStyle(wb, assumptions, 'E11')) === '808080', config.name + ': 비고 회색');
    check(fontSize(cellStyle(wb, assumptions, 'H5')) === 13 && fontSize(cellStyle(wb, assumptions, 'J5')) === 13, config.name + ': 보통주·총자기자본 IRR 강조');
  }
  for (const row of [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 27, 28, 29, 30]) {
    const verdict = validation.cells.get('E' + row), note = validation.cells.get('F' + row);
    if (verdict && verdict.formula) {
      const style = cellStyle(wb, validation, verdict.r);
      check(fontSize(style) === 10 && style.alignment.horizontal === 'center', config.name + '/' + verdict.r + ': 판정 본문 서식');
      check(!/FFFFFF/.test(style.font.content), config.name + '/' + verdict.r + ': 머리글 흰 글씨 혼입 없음');
    }
    if (note && note.value) {
      const style = cellStyle(wb, validation, note.r);
      check(fontSize(style) === (compact ? 10 : 9) && style.alignment.horizontal === 'left' && style.alignment.wrapText === '1', config.name + '/' + note.r + ': 비고 글자 크기·왼쪽·줄바꿈');
    }
  }
  const notes = compact ? [
    ['A&R', 'G65'], ['검증', 'B17'], ['검증', 'B23'], ['검증', 'B25'],
  ] : [
    ['10_Sensitivity', 'B19'],
    ['11_Validation_Checks', 'B17'], ['11_Validation_Checks', 'B23'], ['11_Validation_Checks', 'B25'],
  ];
  if (config.recover !== false) notes.push(...(compact ? [['A&R', 'B87']] : [['00_Cover', 'B40'], ['00_Cover', 'B41'], ['00_Cover', 'B42'], ['01_Assumptions', 'B87']]));
  for (const [name, ref] of notes) {
    const sheet = showSheet(wb, name), merge = sheet.merges.find(m => m.startsWith(ref + ':'));
    check(Boolean(merge), config.name + '/' + name + '/' + ref + ': 긴 안내 병합');
    const style = cellStyle(wb, sheet, ref);
    check(style && style.alignment.wrapText === '1', config.name + '/' + name + '/' + ref + ': 안내 줄바꿈');
  }
  const operating = showSheet(wb, compact ? '운영수지' : '04_Operating_ProForma'), equity = showSheet(wb, compact ? '지분 현금흐름' : '08_Equity_Cashflow');
  const end = colName(config.hold + 3);
  check((operating.cells.get(end + '4') || {}).value.includes('Y' + (config.hold + 1)), config.name + ': 마지막 운영수지 헤더는 매각 다음 연도');
  check((equity.cells.get(end + '4') || {}).value.includes('Y' + config.hold), config.name + ': 마지막 자기자본 헤더는 매각 연도');
  check(width(operating, end) >= 14 && width(equity, end) >= 14, config.name + ': 동적 마지막 연도 너비');
  if (!compact) {
  const cover = showSheet(wb, '00_Cover');
  check(width(cover, end) >= 14, config.name + ': 표지 마지막 NOI 수치 열 너비');
  const coverYears = [...cover.cells.values()].filter(c => /^[C-Z]+21$/.test(c.r) && c.value);
  check(coverYears.length === config.hold + 1, config.name + ': 표지 NOI 연도 수는 보유기간+1');
  check(coverYears.every(c => width(cover, c.r) >= 14), config.name + ': 표지 NOI의 모든 수치 열 너비');
  for (let y = 1; y <= config.hold + 1; y++) {
    const col = colName(y + 2), header = cover.cells.get(col + '21'), noi = cover.cells.get(col + '22');
    check(header && new RegExp('^Y' + y + '(?:\\D|$)').test(header.value) && noi && noi.formula === "'04_Operating_ProForma'!" + col + '18', config.name + '/' + col + '22: 표지 NOI와 연도별 운영수지 연결');
  }
  if (config.hold >= 7) {
    check(cover.merges.filter(m => /^B4[012]:/.test(m)).every(m => column(m.split(':')[1]) >= config.hold + 3), config.name + ': 표지 안내 병합도 기간에 맞게 확장');
  }
  const term = ruleFor('C48'), grace = ruleFor('C80');
  check(term && term.type === 'whole' && term.operator === 'greaterThanOrEqual' && (tags(term.content, 'formula1')[0] || {}).content === '1', config.name + ': 상환기간은 양의 정수 입력');
  check(grace && grace.type === 'whole' && (tags(grace.content, 'formula2')[0] || {}).content === 'MAX(0,ROUND(C48,0)-1)', config.name + ': 거치기간 입력 제한이 실제 상환기간 셀 참조');
  } else {
    for (const ref of ['H5', 'J5', 'J6', 'J7', 'H13', 'H28', 'H38', 'H53', 'J61']) check(Boolean((assumptions.cells.get(ref) || {}).formula), config.name + '/A&R!' + ref + ': 결과·자금조달·민감도가 실제 수식');
    check(!(assumptions.cells.get('H6') || {}).formula && !(assumptions.cells.get('I6') || {}).formula, config.name + ': 미구현 종류별 세후 수익률은 공란');
    check((equity.cells.get(end + '17') || {}).value.includes('Y' + config.hold), config.name + ': 통합 워터폴의 마지막 연도');
    for (let year = 1; year <= config.hold; year++) {
      const col = colName(year + 3);
      check(Boolean((equity.cells.get(col + '21') || {}).formula), config.name + '/지분 현금흐름!' + col + '21: 연도별 우선주 배분 수식 보존');
    }
  }
  if (config.rentroll) check(showSheet(wb, compact ? 'Rent Roll' : '01_Rent_Roll').cells.has('B5'), config.name + ': 렌트롤 첫 계약 보존');
  if (config.rentroll === 'model' && !compact) {
    const buildup = showSheet(wb, 'Lease_NOI_Buildup');
    check(buildup.cells.has(end + '5'), config.name + ': 임차인별 수입의 동적 마지막 연도 보존');
    check(width(buildup, end) >= 14, config.name + ': 임차인별 수입의 동적 열 너비');
    check(showSheet(wb, 'Lease_Risk').cells.has('C5'), config.name + ': 임대차 리스크 계산 보존');
  }
  if (config.rentroll === 'model' && compact) {
    const rentroll = showSheet(wb, 'Rent Roll');
    for (const title of ['시장 가정', '임차인 집중도 및 만기']) check([...rentroll.cells.values()].some(c => c.value === title), config.name + ': 통합 임대차 시트의 ' + title + ' 표 보존');
    const firstTenant = (config.leases || LEASES)[0].name;
    const riskHeading = [...rentroll.cells.values()].find(c => c.value === '임차인 집중도 및 만기');
    const riskFirstRow = riskHeading ? Number(riskHeading.r.match(/\d+/)[0]) + 4 : 0;
    const riskName = rentroll.cells.get('B' + riskFirstRow);
    const riskNameSource = showSheet(wb, '_Calc').cells.get('W74');
    check((rentroll.cells.get('B5') || {}).value === firstTenant && riskName && /_Calc'?!\$?W\$?74/.test(riskName.formula || '') && riskNameSource && /\bB\$?5\b/.test(riskNameSource.formula || ''), config.name + ': 임대차 리스크의 임차인명도 원본 계약 입력에 연결');
    check([...operating.cells.values()].some(c => c.r.startsWith(end) && Number(c.r.match(/\d+/)[0]) > 24 && c.formula), config.name + ': 운영수지 아래 임차인별 마지막 연도 수입 수식 유지');
    for (let year = 0; year <= config.hold; year++) {
      for (const row of [5, 6]) {
        const ref = colName(year + 3) + row;
        check(Boolean((operating.cells.get(ref) || {}).formula), config.name + '/' + ref + ': 임대료·관리비 수입은 편집에 반응하는 수식');
      }
    }
    for (const ref of ['C23', 'C24', 'C25', 'C27', 'C28', 'C75']) check(Boolean((assumptions.cells.get(ref) || {}).formula), config.name + '/A&R!' + ref + ': 렌트롤 도출 가정은 원본 입력을 참조');
    check(!visibleText.includes('이 표의 값 수정은 임대수입에 반영되지 않습니다'), config.name + ': 옛 스냅샷 제한 안내 제거');
  }
}

if (require.main === module) {
for (const config of cases) {
  const before = fail;
  try {
    const generated = generate(config), { bytes, expected } = generated;
    if (output) fs.writeFileSync(path.join(output, config.name + '.xlsx'), bytes);
    styleChecks(workbook(bytes), config, expected, generated);
    console.log((fail === before ? 'PASS ' : 'FAIL ') + config.name + ' (' + bytes.length + ' bytes)');
  } catch (error) { fail++; console.error('FAIL ' + config.name + ': ' + error.message); }
}
console.log('\n엑셀 표시 검사: ' + pass + ' 통과, ' + fail + ' 실패 / ' + cases.length + '개 다운로드 조건');
process.exitCode = fail ? 1 : 0;
}
module.exports = { generate, workbook, cases, LEASES, MARKET };
