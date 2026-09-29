#!/usr/bin/env node
'use strict';
// Independent income and funding ledger checks. No production calculation hooks.
// node tools/qa/noi-direct.js [--out <directory>]
const fs = require('fs');
const path = require('path');
const { generate, workbook, LEASES } = require('./excel-format');
let checks = 0;
function ok(value, message) { checks++; if (!value) throw new Error(message); }
function near(actual, expected, message) {
  ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-7 * Math.max(1, Math.abs(expected)), `${message}: ${actual} != ${expected}`);
}
const outArg = process.argv.indexOf('--out');
const out = outArg < 0 ? null : path.resolve(process.argv[outArg + 1]);
if (out) fs.mkdirSync(out, { recursive: true });
const state = { asset: '가상 평택 저온 물류센터', gfa: '12000', price: '120000', appraisal: '123000',
  noimode: 'NOI 직접 입력', noi1: '7500', noig: '0', noideposit: '4500',
  rentpp: '55000', campp: '6500', vacancy: '12', depmult: '12', depassume: '반영',
  opfee: '0.35', fixcost: '60', acqtax: '4.6', acqfee: '1.2', hold: '5', exitcap: '6.5',
  salefee: '1.2', prepayfee: '0', dispfee: '0', taxmode: '비도관', taxrate: '22' };
const stack = { senior_on: true, senior_ltv: '60', senior_rate: '5.8', senior_extra: '만기일시', mezz_on: false, pref_on: false };
const directCases = [
  ['direct_flat', {}], ['direct_growth', { noig: '4' }], ['direct_decline', { noig: '-3' }],
  ['direct_zero', { noi1: '0' }], ['direct_negative', { noi1: '-500' }],
  ['direct_vacancy100', { vacancy: '100' }], ['direct_no_deposit', { noideposit: '' }],
  ['direct_separate_deposit', { depassume: '미반영' }],
];
const cases = directCases.map(([name, patch]) => ({ name, deal: 'logistics', hold: 5, state: { ...state, ...patch }, stack }));
for (const deal of ['office', 'logistics']) for (const depassume of ['반영', '미반영'])
  cases.push({ name: `${deal}_rent_${depassume === '반영' ? 'source' : 'separate'}`, deal, hold: 5,
    state: { ...state, noimode: '임대료·관리비로 산출', noig: '3', depassume }, stack });
for (const depassume of ['반영', '미반영'])
  cases.push({ name: `lease_${depassume === '반영' ? 'source' : 'separate'}`, deal: 'logistics', hold: 5,
    state: { ...state, noi1: '999999', depassume }, stack, rentroll: 'model' });
const results = [];
for (const config of cases) {
  const g = generate(config), wb = workbook(g.bytes), raw = g.expected;
  const cell = (sheet, ref) => wb.sheets.find(s => s.name === sheet).cells.get(ref);
  const value = (sheet, ref) => Number(cell(sheet, ref).value);
  const a = ref => value('A&R', ref);
  const direct = !config.rentroll && config.state.noimode.includes('직접');
  const useDeposit = config.state.depassume !== '미반영';
  const deposit = config.rentroll ? LEASES.reduce((s, l) => s + l.deposit, 0) / 1e6 :
    direct ? Number(config.state.noideposit || 0) : Number(config.state.rentpp) * a('C7') * a('C8') * a('C25') * Number(config.state.depmult) / 1e6;
  near(a('C75'), deposit, config.name + ' actual deposit');
  near(raw.depSrcAmt, useDeposit ? deposit : 0, config.name + ' web source');
  near(a('H37'), useDeposit ? deposit : 0, config.name + ' Excel source');
  near(a('C55'), a('C21') - a('C49') - a('C85') - (useDeposit ? deposit : 0), config.name + ' funding ledger');
  near(a('C90'), direct ? 1 : 0, config.name + ' explicit source mode');
  if (direct) {
    near(a('C91'), Number(config.state.noi1), config.name + ' NOI input retained');
    near(a('C92'), Number(config.state.noig) / 100, config.name + ' growth retained');
    near(a('C93'), deposit, config.name + ' deposit input retained');
    for (const ref of ['C91', 'C92', 'C93']) ok(!cell('A&R', ref).formula, config.name + ' editable ' + ref);
    const decoded = g.decodeSnapshot(g.snapshot);
    ok(decoded.s.noideposit === config.state.noideposit, config.name + ' restore preserves deposit');
  }
  const noi = [];
  for (let y = 0; y <= 5; y++) {
    const col = String.fromCharCode(67 + y);
    const interest = direct || useDeposit ? 0 : deposit * a('C29');
    near(value('운영수지', col + '8'), interest, config.name + ' deposit interest Y' + (y + 1));
    const expected = direct ? Number(config.state.noi1) * (1 + Number(config.state.noig) / 100) ** y :
      value('운영수지', col + '5') + value('운영수지', col + '6') + value('운영수지', col + '7') + interest - value('운영수지', col + '17');
    noi.push(expected);
    near(value('운영수지', col + '18'), expected, config.name + ' Excel NOI Y' + (y + 1));
    near(raw.NOI[y], expected, config.name + ' web NOI Y' + (y + 1));
    if (direct) ok(cell('운영수지', col + '18').formula.includes('$C$91') && cell('운영수지', col + '18').formula.includes('$C$92'), config.name + ' live NOI formula');
  }
  const sale = noi[5] / a('C58') * (1 - a('C59'));
  near(raw.netSale, sale, config.name + ' terminal NOI valuation');
  near(value('세무·매각', 'C15'), sale, config.name + ' Excel sale');
  const flows = [-a('C55')];
  const afterTax = [-a('C55')];
  for (let y = 0; y < 5; y++) {
    const col = String.fromCharCode(67 + y), eq = String.fromCharCode(68 + y);
    let cf = noi[y] - value('운영수지', col + '20') - value('대출', col + '9') - a('C78');
    if (y === 4) cf += sale - value('대출', col + '8') - value('대출', col + '20') - value('세무·매각', 'C19') - value('세무·매각', 'C20') - (useDeposit ? deposit : 0);
    flows.push(cf);
    near(value('지분 현금흐름', eq + '7'), cf, config.name + ' equity ledger Y' + (y + 1));
    near(raw.dist[y], cf, config.name + ' web equity ledger Y' + (y + 1));
    const incomeTax = a('C66') === 1 ? 0 : Math.max(0, noi[y] - value('세무·매각', col + '6') - a('C64') - a('C78')) * a('C65');
    const at = cf - incomeTax - (y === 4 ? value('세무·매각', 'C18') : 0);
    afterTax.push(at); near(value('지분 현금흐름', eq + '8'), at, config.name + ' tax ledger Y' + (y + 1));
  }
  for (const [ref, web, ledger] of [['J5', raw.IRR, flows], ['J6', raw.IRRat, afterTax]]) {
    if (web == null) ok(cell('A&R', ref).value === '', config.name + ' undefined IRR blank');
    else {
      near(a(ref), web, config.name + ' Excel/web return');
      const npv = ledger.reduce((s, v, t) => s + v / (1 + web) ** t, 0);
      ok(Math.abs(npv) < 1e-6 * Math.max(...ledger.map(Math.abs)), config.name + ' independent NPV at IRR: ' + npv);
    }
  }
  for (let row = 20; row <= 44; row++) {
    const factor = value('_Calc', 'A' + row);
    const scenarioDeposit = useDeposit ? deposit * (direct || config.rentroll ? 1 : factor) : 0;
    near(value('_Calc', 'P' + row), scenarioDeposit, config.name + ' sensitivity deposit repayment');
    near(value('_Calc', 'O' + row), scenarioDeposit, config.name + ' sensitivity deposit source');
    const delta = direct ? noi[5] : value('운영수지', 'H5') + (config.rentroll ? 0 : value('운영수지', 'H8'));
    near(value('_Calc', 'Q' + row), noi[5] + (factor - 1) * delta, config.name + ' sensitivity NOI');
  }
  for (const sh of wb.sheets) for (const c of sh.cells.values()) ok(c.t !== 'e', config.name + ' no Excel error ' + sh.name + '!' + c.r);
  if (out) fs.writeFileSync(path.join(out, config.name + '.xlsx'), g.bytes);
  results.push({ name: config.name, NOI: noi, deposit, source: useDeposit, IRR: raw.IRR, flows });
}
if (out) fs.writeFileSync(path.join(out, 'noi-direct-results.json'), JSON.stringify(results, null, 2));
console.log(`PASS: ${checks} checks across ${cases.length} direct NOI / deposit / lease cases`);
