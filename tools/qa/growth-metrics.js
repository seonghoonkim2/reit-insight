#!/usr/bin/env node
'use strict';
// Reports must distinguish repeated actions from session-level conversion.
// No network, telemetry changes or writes to the historical snapshots.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const ae = require('../modelter-ae');
const log = require('../modelter-funnel');
const report = require('../modelter-report');
const { OUTPUT_EVENTS } = require('../modelter-labels');
let checks = 0;
function check(ok, message) { assert.ok(ok, message); checks++; }
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
function noFakeConversion(text, label) {
  check(!/전환\(방문→산출|방문→산출물 전환|<th>전환<\/th>|결과당/.test(text), label + ': repeated outputs are not conversion or a computed-session mean');
  check(!/NaN|Infinity/.test(text), label + ': zero or absent denominators remain defined');
  check(text.includes('전환율') && /아님|아닙니다|알 수 없습니다/.test(text), label + ': limits of event counts are explicit');
}
function fixture(events, extras) {
  return Object.assign({
    endDate: '2026-09-29', days: 30, schema: 2, botExcluded: true,
    events, funnel: ae.funnelOf(events), deals: { office: 9 }, device: { desktop: 6, mobile: 3 },
    feats: { 'rr,dep': 4 }, depth: { standard: 9 }, ref: { 'example.org': 9 }, src: { seo: 9 },
    attribution: { bySrc: { seo: ae.funnelOf(events) } },
  }, extras);
}

const repeated = fixture({ session: 2, activate: 1, computed: 1, xlsx_download: 2, ic_ppt: 1 });
const repeatedBefore = JSON.stringify(repeated);
const cli = ae.render(repeated);
const attr = ae.renderAttr('채널별 판독', repeated.attribution.bySrc);
const html = report.build([repeated]);
for (const [name, text] of [['AE', cli], ['attribution', attr], ['HTML', html]]) {
  noFakeConversion(text, name);
  check(text.includes('1.50건'), name + ': three outputs from two visits are 1.50 actions per visit');
  check(!text.includes('150.0%') && !text.includes('300.0%'), name + ': repeated output ratios never masquerade as a percent');
}
check(attr.includes('50.0%'), 'Attribution retains the actual direct-input / visit rate');
check(html.includes('<th>입력/방문</th>'), 'HTML separates input rate from output frequency');
check(cli.includes('desktop 6 (66.7%)') && cli.includes('mobile 3 (33.3%)'), 'Device events use device-event denominator, not visits');
equal(JSON.stringify(repeated), repeatedBefore, 'Rendering does not mutate raw snapshot fields');

for (const [name, events] of [
  ['sample-only', { session: 2, xlsx_download: 4 }],
  ['zero-visits', { xlsx_download: 4 }],
  ['empty', {}],
]) {
  const data = fixture(events, { device: {}, deals: {}, feats: {}, ref: {}, depth: {}, src: {} });
  for (const [kind, text] of [['AE', ae.render(data)], ['HTML', report.build([data])], ['attribution', ae.renderAttr('test', { seo: data.funnel })]]) {
    noFakeConversion(text, name + ' ' + kind);
    if (name === 'sample-only') check(text.includes('2.00건'), kind + ': samples count as actions even without computed');
    else check(!text.includes('0.00건'), kind + ': missing visit denominator is unknown, not zero');
  }
}

// The raw-log reader must use the same 12 output types as Analytics Engine.
const oneEach = OUTPUT_EVENTS.map(ev => ({ ev, dev: 'desktop', deal: 'office' }));
const parsed = log.extractEvents(oneEach.map(ev => JSON.stringify(ev)).join('\n'));
const tally = log.tally(parsed);
equal(tally.outputs, OUTPUT_EVENTS.length, 'Raw logs include every current output kind, including ic_ppt');
equal(tally.byEv.ic_ppt, 1, 'IC PPT remains a raw event as well as an output');
const logEvents = log.extractEvents([
  { ev: 'session', dev: 'desktop' }, { ev: 'session', dev: 'mobile' },
  { ev: 'activate', dev: 'desktop' }, { ev: 'computed', dev: 'desktop' },
  { ev: 'xlsx_download', dev: 'desktop' }, { ev: 'xlsx_download', dev: 'desktop' },
  { ev: 'ic_ppt', dev: 'desktop' }, { ev: 'other_event' },
].map(ev => JSON.stringify(ev)).join('\n'));
const logTally = log.tally(logEvents);
const logText = log.render(logTally);
noFakeConversion(logText, 'raw-log CLI');
check(logText.includes('1.50건'), 'Raw-log CLI uses output count per visit');
check(logText.includes('desktop 6 (85.7%)') && logText.includes('mobile 1 (14.3%)'), 'Raw-log device ratios exclude events without a device');
equal(logTally.total, 8, 'Unknown/unlabelled raw events are not discarded by presentation fixes');

// Actual production snapshot exposes the previous 206.8% desktop / 76.7% mobile error.
const snapshotPath = path.join(__dirname, '..', '..', 'data', 'ae-snapshots', '2026-09-29.json');
const snapshotRaw = fs.readFileSync(snapshotPath, 'utf8');
const snapshot = JSON.parse(snapshotRaw);
equal(ae.funnelOf(snapshot.events), snapshot.funnel, 'Historical funnel values are preserved');
const actualCli = ae.render(snapshot);
check(actualCli.includes('desktop 1402 (72.9%)') && actualCli.includes('mobile 520 (27.1%)'), 'Actual snapshot device denominator is 1,922 events');
check(!actualCli.includes('206.8%') && !actualCli.includes('76.7%'), 'Actual snapshot no longer displays events / sessions as device share');
const actualAttr = ae.renderAttr('Actual channels', snapshot.attribution.bySrc);
check(actualAttr.includes('5.00건') && !actualAttr.includes('500.0%'), 'Actual sns channel: ten outputs / two visits is five actions, not 500% conversion');
const actualHtml = report.build([snapshot]);
for (const [name, text] of [['actual AE', actualCli], ['actual attribution', actualAttr], ['actual HTML', actualHtml]]) noFakeConversion(text, name);
check(actualCli.includes('0.23건') && actualHtml.includes('0.23건'), 'Actual overall output frequency stays 157/678');
const expandedEvents = Object.entries(snapshot.events).flatMap(([ev, n]) => Array.from({ length: n }, () => ({ ev })));
equal(log.tally(expandedEvents).outputs, 157, 'Actual raw-log total now agrees with AE (including 26 IC PPT events)');
equal(JSON.parse(snapshotRaw), snapshot, 'Historical fixture object is unchanged');
equal(fs.readFileSync(snapshotPath, 'utf8'), snapshotRaw, 'Historical snapshot bytes are unchanged');

const overlapping = report.build([Object.assign({}, repeated, { endDate: '2026-09-28' }), repeated]);
check(overlapping.includes('서로 겹치는 기간') && overlapping.includes('독립된 전후 실험'), 'Rolling snapshots are not presented as independent experimental periods');
check(actualHtml.includes('기기별 이벤트 비중') && actualHtml.includes('방문자 구성비가 아닙니다'), 'Dashboard distinguishes device actions from visitor composition');
check(actualHtml.includes('채택 사용자 수가 아닙니다'), 'Feature flags are not presented as adopted-user counts');

console.log('Growth metrics OK — ' + checks + ' checks; raw counts preserved, repeated outputs and event denominators labelled correctly.');
