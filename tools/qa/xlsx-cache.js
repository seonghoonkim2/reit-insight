#!/usr/bin/env node
'use strict';
// Exercise the production XLSX generator, including typed OOXML result caches.
// No hook is inserted into the shipped application and no evaluator is copied.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.resolve(__dirname, '../../dart-search/web/modelter/index.html'), 'utf8');
const start = html.indexOf('(function(global){', html.indexOf('const XLTMPL='));
const suffix = '})(typeof window!==\'undefined\'?window:globalThis);';
const end = html.indexOf(suffix, start) + suffix.length;
assert(start >= 0 && end > start, 'production generator closure must be identifiable');
const context = vm.createContext({ TextEncoder, Uint8Array, module: { exports: {} } });
vm.runInContext(html.slice(start, end), context, { timeout: 1000 });
const build = context.module.exports.buildXlsx;
function sheetXml(bytes) {
  const buffer = Buffer.from(bytes);
  for (let offset = 0; buffer.readUInt32LE(offset) === 0x04034b50;) {
    const length = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString();
    const dataStart = offset + 30 + nameLength + extraLength;
    if (name === 'xl/worksheets/sheet1.xml') return buffer.subarray(dataStart, dataStart + length).toString();
    offset = dataStart + length;
  }
  assert.fail('worksheet missing from workbook');
}
function generate(formulas) {
  const cells = [
    { r: 'A5', s: 'a' }, { r: 'A6', s: 'A' }, { r: 'A7', s: 'other' },
    { r: 'B5', n: 10 }, { r: 'B6', n: 20 }, { r: 'B7', n: 30 },
    { r: 'D5', n: -100 }, { r: 'D6', n: 60 }, { r: 'D7', n: 60 },
    { r: 'E5', s: '=1/0' },
    { r: 'J5', n: -0.000001 }, { r: 'J6', n: 0 }, { r: 'J7', n: 0 },
    { r: 'J8', n: 0 }, { r: 'J9', n: 0 }, { r: 'J10', n: 9955.810557116463 }
  ];
  formulas.forEach((f, i) => cells.push({ r: 'C' + (i + 10), f }));
  return sheetXml(build({ sheets: [{ name: 'Test', maxcol: 5, cells }] }));
}
const cases = [
  ['IF(FALSE,1/0,7)', 7], ['IFERROR(1/0,8)', 8],
  ['IFERROR(POWER(-1,0.5),"n/a")', 'n/a'],
  ['ROUND(-2.5,0)', -3], ['ROUND(-125,-1)', -130], ['ROUNDUP(-1.01,0)', -2],
  ['"a"="A"', true], ['EXACT("a","A")', false], ['-2^2', 4],
  ['SUMPRODUCT(--EXACT(A5:A7,"a"),B5:B7)', 10],
  ['COUNTIF(A5:A7,"A")', 2], ['COUNTIF(A5:A7,"*")', 3],
  ['SUMIFS(B5:B7,A5:A7,"a")', 30],
  ['IFERROR(IRR(B5:B7),"no root")', 'no root'],
  ['PMT(0,4,100)', -25], ['INDEX(A5:B7,2,2)', 20],
  ['IFERROR(LARGE(B5:B7,4),"invalid")', 'invalid'],
  ['C99=0', true], ['C99=""', true], ['IF(FALSE,C29,11)', 11],
  ['E5', '=1/0'], ['IFERROR(1/0,"")', ''],
  ['IRR(D5:D7)', (60 + Math.sqrt(27600)) / 200 - 1],
  ['IF(TRUE,"<A&B>",1/0)', '&lt;A&amp;B&gt;'],
  ['"A"<>"a"', false], ['AND(B5>0,B6>0)', true], ['OR(FALSE,FALSE)', false],
  // A single terminal receipt has a closed-form IRR, even for tiny equity.
  ['IRR(J5:J10)', Math.pow(9955.810557116463 / 0.000001, 1 / 5) - 1]
];
const xml = generate(cases.map(c => c[0]));
cases.forEach(([formula, expected], i) => {
  const ref = 'C' + (i + 10);
  const match = xml.match(new RegExp('<c r="' + ref + '"([^>]*)><f>[^<]*</f><v>([\\s\\S]*?)</v></c>'));
  assert(match, ref + ' must keep both formula and cache: ' + formula);
  if (typeof expected === 'number') {
    assert(!/ t=/.test(match[1]), formula + ' must be a numeric OOXML cache');
    assert(Math.abs(Number(match[2]) - expected) < 1e-9, formula + ' numeric result');
  } else if (typeof expected === 'boolean') {
    assert.match(match[1], / t="b"/, formula + ' boolean OOXML type');
    assert.equal(match[2], expected ? '1' : '0', formula);
  } else {
    assert.match(match[1], / t="str"/, formula + ' string OOXML type');
    assert.equal(match[2], expected, formula);
  }
});
const invalid = ['IFERROR(INDIRECT("A5"),0)', '1/0', 'C10', '1e999', 'SUM(A1:XFD1048576)'];
invalid.forEach(formula => assert.throws(() => generate([formula]), /Excel 미리보기 계산/, formula));
console.log('XLSX CACHE OK: ' + cases.length + ' typed-result cases + ' + invalid.length + ' fail-closed cases');
