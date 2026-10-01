#!/usr/bin/env node
/* Base workbook compaction must be lossless. This digest covers every original
 * cell (including its order), formula, format, merge and sheet property, not just
 * the 25 sensitivity scenarios. Update it only after reviewing an intentional
 * base-template change; holdTemplate changes do not alter this snapshot.
 * Optional: node tools/qa/template-compaction.js --baseline path/to/index.html
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'dart-search/web/modelter/index.html'), 'utf8');
function template(source) {
  const start = source.indexOf('const XLTMPL=');
  const end = source.indexOf('// buildXlsx(tmpl, overrides)', start);
  assert(start >= 0 && end > start, 'Base template markers are missing');
  return vm.runInNewContext(source.slice(start, end) + '\nJSON.stringify(XLTMPL)', {}, { timeout: 1000 });
}
const actual = template(html);
const baselineIndex = process.argv.indexOf('--baseline');
if (baselineIndex >= 0) {
  assert(process.argv[baselineIndex + 1], '--baseline requires an HTML file');
  assert.strictEqual(actual, template(fs.readFileSync(process.argv[baselineIndex + 1], 'utf8')),
    'Reconstructed template differs from the baseline');
}
const digest = crypto.createHash('sha256').update(actual).digest('hex');
assert.strictEqual(digest, '2f37261dfdfc3196e93e40e18c4dab2149dec8532bdc1eb59dcef4f5354d9c31',
  'Base workbook values, formulas or styles changed');
const data = JSON.parse(actual);
assert.strictEqual(data.sheets.length, 13);
assert.strictEqual(data.sheets.reduce((sum, sheet) => sum + sheet.cells.length, 0), 1620);
console.log('TEMPLATE COMPACTION OK: all 13 sheets / 1620 cells exactly match the original base workbook');
