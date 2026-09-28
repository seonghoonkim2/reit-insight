#!/usr/bin/env node
/* Generate real downloadable lease workbooks and independent-path screen results.
 * No lease arithmetic is duplicated here. Changed scenarios are fed through the
 * application's normal state -> simModel path, then the original workbook is
 * edited and recalculated separately by lease-live.py.
 */
'use strict';
const fs = require('fs'), path = require('path');
const { generate, workbook } = require('../qa/excel-format');
const option = process.argv.indexOf('--out');
const out = option >= 0 ? path.resolve(process.argv[option + 1]) : path.join(__dirname, 'out', 'lease-live');
fs.mkdirSync(out, { recursive: true });
const clone = value => JSON.parse(JSON.stringify(value));
const state = { asset: '검증용 가상 임대자산', gfa: '6200', price: '93000', appraisal: '95790',
  rentpp: '78000', campp: '23000', vacancy: '7', noig: '2.5', depmult: '10', depassume: '반영',
  acqtax: '4.6', acqfee: '1.7', opfee: '0.35', fixcost: '85', salefee: '1.6',
  prepayfee: '0.3', dispfee: '10', exitcap: '5.2', taxmode: '도관과세(법인세 면제)' };
const stack = { senior_on: true, senior_ltv: '58', senior_rate: '4.7', senior_extra: '만기일시',
  mezz_on: false, pref_on: true, pref_ltv: '25', pref_coc: '6.5', pref_extra: '누적적' };
const market = { marketPP: 92000, marketCamPP: 27000, mtm: 0.05, newRentFree: 2,
  absorbMonths: 18, stabVac: 0.05, renewP: 0.65, downtime: 3, mktStepUp: 0.03,
  camG: 0.02, repay: '만기일시(이자만)', grace: 0 };
const leases = [
  { name: '가상 임차인 A', area: 2500.125, netArea: 1900.25, rentPP: 78000.75, camPP: 23000.25,
    deposit: 1500000000.75, yrsToExp: 2.01, rentFreeRemain: 1.5, stepUp: 0.015 },
  { name: '가상 임차인 B', area: 1500.375, netArea: 1200.125, rentPP: 83000.5, camPP: 25000.5,
    deposit: 900000000.25, yrsToExp: null, rentFreeRemain: 0, stepUp: null },
];
const full = [
  { ...leases[0], area: 2728, rentPP: 78000, camPP: 23000, deposit: 1500000000, yrsToExp: null, rentFreeRemain: 0, stepUp: 0 },
  { ...leases[1], area: 2728, rentPP: 83000, camPP: 25000, deposit: 900000000, yrsToExp: null, rentFreeRemain: 0, stepUp: 0 },
];
function many(count) {
  return Array.from({ length: count }, (_, i) => ({ name: '가상 계약 ' + (i + 1), area: 4800 / count,
    netArea: 4000 / count, rentPP: 72000 + i * 13.25, camPP: 22000 + i * 7.5,
    deposit: 2400000000 / count, yrsToExp: i % 7 === 0 ? null : 1.01 + i % 5,
    rentFreeRemain: i % 3, stepUp: i % 4 === 0 ? null : 0.01 + (i % 3) * 0.01 }));
}
const cases = [
  { name: 'flat_hold3', hold: 3, leases: full, market: { ...market, camG: 0, mktStepUp: 0 }, manual: 'flat' },
  { name: 'rentfree_hold4', hold: 4, leases: [{ ...full[0], rentFreeRemain: 25 }, full[1]], market: { ...market, camG: 0, mktStepUp: 0 }, manual: 'rentfree25' },
  { name: 'fractional_hold5', hold: 5, leases, market, mutations: true },
  { name: 'renew0_hold6', hold: 6, leases, market: { ...market, renewP: 0 } },
  { name: 'renew100_hold7', hold: 7, leases, market: { ...market, renewP: 1 } },
  { name: 'zero_growth_hold8', hold: 8, leases: leases.map(l => ({ ...l, stepUp: null })), market: { ...market, mktStepUp: 0, camG: 0 } },
  { name: 'absorption_hold9', hold: 9, leases, market: { ...market, absorbMonths: 36, newRentFree: 6 } },
  { name: 'twenty_hold10', hold: 10, leases: many(20), market },
  { name: 'hundred_hold3', hold: 3, leases: many(100), market },
];
const marketLabels = { marketPP: '시장 평당임대료(원)', marketCamPP: '시장 평당관리비(원)',
  mtm: 'MTM(시장격차)', newRentFree: '신규 렌트프리(개월)', absorbMonths: '공실 흡수기간(개월)',
  stabVac: '안정화 공실률', renewP: '재계약률', downtime: '다운타임(개월)',
  mktStepUp: '시장 임대료 상승률', camG: '관리비 성장률' };
const manifest = { description: 'Screen-engine scenarios are generated through the live application path; original exported formulas are independently recalculated after edits.', cases: [] };
for (const c of cases) {
  const config = { name: c.name, deal: 'office', hold: c.hold, rentroll: 'model', leases: c.leases, market: c.market, state, stack };
  const generated = generate(config), parsed = workbook(generated.bytes);
  const rr = parsed.sheets.find(s => s.name === 'Rent Roll');
  if (!rr) throw Error('Rent Roll sheet missing: ' + c.name);
  const refs = {};
  for (const [key, label] of Object.entries(marketLabels)) {
    const matches = [...rr.cells.values()].filter(cell => cell.value === label);
    if (matches.length !== 1) {
      if (key === 'camG') continue; // The validator requires this when the new generator adds it.
      throw Error('Market label is missing or ambiguous: ' + label + ' (' + c.name + ')');
    }
    refs[key] = 'Rent Roll!C' + matches[0].r.match(/\d+/)[0];
  }
  const file = c.name + '.xlsx'; fs.writeFileSync(path.join(out, file), generated.bytes);
  const entry = { name: c.name, file, hold: c.hold, leases: c.leases, market: c.market,
    marketRefs: refs, manual: c.manual || null, baseline: generated.expected, sensitivityBase: generated.sensitivityBase, edits: [] };
  if (c.mutations) {
    const changes = [
      { name: 'contract rent', input: 'Rent Roll!E5', value: 70000, leaseKey: 'rentPP', index: 0 },
      { name: 'market rent', input: refs.marketPP, value: 70000, marketKey: 'marketPP' },
      { name: 'zero market growth and inherited step', input: refs.mktStepUp, value: 0, marketKey: 'mktStepUp' },
      { name: 'blank expiry remains current contract', input: 'Rent Roll!I5', value: '', leaseKey: 'yrsToExp', index: 0, webValue: null },
      { name: 'blank step inherits market growth', input: 'Rent Roll!J5', value: '', leaseKey: 'stepUp', index: 0, webValue: null },
      { name: 'fractional expiry crosses year boundary', input: 'Rent Roll!I5', value: 2, leaseKey: 'yrsToExp', index: 0 },
      { name: 'long remaining rent free', input: 'Rent Roll!H5', value: 25, leaseKey: 'rentFreeRemain', index: 0 },
      { name: 'zero renewal probability', input: refs.renewP, value: 0, marketKey: 'renewP' },
      { name: 'full renewal probability', input: refs.renewP, value: 1, marketKey: 'renewP' },
      { name: 'long absorption', input: refs.absorbMonths, value: 36, marketKey: 'absorbMonths' },
      { name: 'contract area', input: 'Rent Roll!D5', value: 2300.5, leaseKey: 'area', index: 0 },
      { name: 'contract deposit', input: 'Rent Roll!G5', value: 1700000000.5, leaseKey: 'deposit', index: 0 },
    ];
    for (const edit of changes) {
      const cfg = clone(config); cfg.download = false;
      const webValue = Object.hasOwn(edit, 'webValue') ? edit.webValue : edit.value;
      if (edit.leaseKey) cfg.leases[edit.index][edit.leaseKey] = webValue;
      if (edit.marketKey) cfg.market[edit.marketKey] = webValue;
      entry.edits.push({ name: edit.name, inputs: { [edit.input]: edit.value }, expected: generate(cfg).expected });
    }
  }
  manifest.cases.push(entry);
  console.log('LEASE GENERATED ' + c.name + ' | ' + c.leases.length + ' contracts | ' + generated.bytes.length + ' bytes | ' + entry.edits.length + ' edit scenarios');
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('LEASE FIXTURES ' + manifest.cases.length + ' workbooks -> ' + out);
