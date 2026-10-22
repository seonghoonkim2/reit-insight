#!/usr/bin/env node
'use strict';
// KST boundary / sample weights / unavailable-data checks. No network or production events.
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const reporting = require('../modelter-patterns');
const legacy = require('../modelter-report');
const { validate: validatePrivateReport } = require('../private-reporting/validate-report');
const { OUTPUT_EVENTS, EV_LABEL } = require('../modelter-labels');
let checks = 0;
function equal(a, b, message) { assert.deepEqual(a, b, message); checks++; }
function check(value, message) { assert.ok(value, message); checks++; }
function throws(fn, pattern, message) { assert.throws(fn, pattern, message); checks++; }
const now = new Date('2026-10-22T00:03:00Z');
const periods = reporting.makePeriods({ days: 30, now });
equal(periods.selected.start, '2026-09-22', '30 complete KST days begin September 22');
equal(periods.selected.endExclusive, '2026-10-22', 'Today is an exclusive KST end date');
equal(periods.selected.startUtc, '2026-09-21T15:00:00.000Z', 'KST midnight begins on previous UTC day');
equal(periods.selected.endUtcExclusive, '2026-10-21T15:00:00.000Z', 'Current partial KST day excluded');
equal(periods.recent7.startUtc, '2026-10-14T15:00:00.000Z', 'Recent week is seven completed local dates');
equal(periods.previous7.endUtcExclusive, periods.recent7.startUtc, 'Weeks meet without overlap');
equal(periods.previous7.start, '2026-10-08', 'Previous week is the matching seven days');
equal(reporting.makePeriods({ now: '2026-10-21T14:59:59Z' }).selected.endExclusive, '2026-10-21', 'Before KST midnight excludes October 21');
equal(reporting.makePeriods({ now: '2026-10-21T15:00:00Z' }).selected.endExclusive, '2026-10-22', 'At KST midnight October 21 is complete');
equal(reporting.makePeriods({ endDate: '2024-03-01', days: 7, now }).selected.start, '2024-02-23', 'Leap-day subtraction is calendar-correct');
for (const date of ['2026-02-29', '2026-13-01', "2026-10-22' OR 1=1", '2026-10-2']) throws(() => reporting.makePeriods({ endDate: date, now }), /날짜/, 'Reject invalid or injected date');
throws(() => reporting.makePeriods({ endDate: '2026-10-23', now }), /미래/, 'Cannot include a partial or future local day');
for (const days of [6, 91, 7.5, '30x']) throws(() => reporting.makePeriods({ days, now }), /--days/, 'Bound range and reject invalid day count');
equal(reporting.parseArgs(['--days', '14', '--end-date', '2026-10-20']).days, '14', 'Existing --days syntax remains supported');
throws(() => reporting.parseArgs(['--end-date']), /인자/, 'Missing CLI value cannot silently become current day');

const queries = reporting.buildQueries(periods);
for (const [name, sql] of Object.entries(queries)) {
  check(sql.includes('sum(_sample_interval)'), name + ' uses weighted counts');
  check(sql.includes("blob10 != '1'"), name + ' excludes explicitly tagged bots');
  check(sql.includes('timestamp >= toDateTime(') && sql.includes('timestamp < toDateTime('), name + ' uses a half-open absolute period');
  check(!sql.includes('now()'), name + ' cannot drift during query execution');
  check(sql.includes('LIMIT 10000'), name + ' has a bounded aggregation');
}
check(!reporting.buildQueries(periods, true).cross.includes("blob10 != '1'"), 'Bot-inclusive diagnostic override is explicit');
check(queries.wow.includes("timestamp >= toDateTime('2026-10-14 15:00:00')"), 'Weekly split includes exact KST midnight');

// Independent pseudo-events include weighted samples, start/end boundaries, and KST Sunday/Monday.
const points = [
  { t: '2026-09-21T14:59:59Z', ev: 'session', n: 99 }, // outside start
  { t: '2026-09-21T15:00:00Z', ev: 'session', n: 2 },
  { t: '2026-10-14T14:59:59Z', ev: 'session', n: 3 }, // last second of previous week
  { t: '2026-10-14T15:00:00Z', ev: 'session', n: 5 }, // start of recent week
  { t: '2026-10-18T14:30:00Z', ev: 'session', n: 7 }, // Sunday 23:30 KST
  { t: '2026-10-18T15:20:00Z', ev: 'session', n: 11 }, // Monday 00:20 KST
  { t: '2026-10-21T14:59:59Z', ev: 'session', n: 13 }, // last included second
  { t: '2026-10-21T15:00:00Z', ev: 'session', n: 101 }, // current local day
  { t: '2026-10-20T02:20:00Z', ev: 'session', n: 200, bot: true },
  { t: '2026-10-20T02:20:00Z', ev: 'activate', n: 1.25, act: '1' },
  { t: '2026-10-20T02:20:00Z', ev: 'computed', n: 1.25, act: '1' },
  { t: '2026-10-20T02:20:00Z', ev: 'xlsx_download', n: 3, act: '1' },
  { t: '2026-10-20T02:20:00Z', ev: 'xlsx_ready', n: 2, act: '1' },
  { t: '2026-10-20T02:20:00Z', ev: 'xlsx_error', n: 1, act: '1' },
  { t: '2026-10-20T02:20:00Z', ev: 'landing', n: 2, src: 'resume' },
  { t: '2026-10-20T02:20:00Z', ev: 'ws_restore', n: 1, act: '1' },
];
const inRange = (r, p) => !r.bot && Date.parse(r.t) >= Date.parse(p.startUtc) && Date.parse(r.t) < Date.parse(p.endUtcExclusive);
const selected = points.filter(r => inRange(r, periods.selected));
const recent = points.filter(r => inRange(r, periods.recent7));
const prev = points.filter(r => inRange(r, periods.previous7));
function group(rows, fields) {
  const groups = new Map();
  for (const r of rows) {
    const values = fields.map(k => r[k]), key = JSON.stringify(values);
    if (!groups.has(key)) groups.set(key, { ...Object.fromEntries(fields.map((k, i) => [k, values[i]])), n: 0 });
    groups.get(key).n += r.n;
  }
  return [...groups.values()];
}
function crossRow(r) { return { ...r, ref: 'modelter.com', device: 'desktop', deal: 'office', act: r.act || '0', src: r.src || '' }; }
const raw = {
  events: group(selected, ['ev']),
  hourly: group(selected.filter(r => reporting.TIME_EVENTS.includes(r.ev)).map(r => ({ ...r, t: new Date(Math.floor(Date.parse(r.t) / 3600000) * 3600000).toISOString() })), ['t', 'ev']),
  wow: group([...recent.map(r => ({ ...r, w: 'this' })), ...prev.map(r => ({ ...r, w: 'prev' }))], ['w', 'ev']),
  cross: group(selected.filter(r => reporting.CORE_EVENTS.includes(r.ev)).map(crossRow), ['ref', 'device', 'deal', 'ev', 'act', 'src']),
  weekCross: group([...recent.map(r => ({ ...crossRow(r), w: 'this' })), ...prev.map(r => ({ ...crossRow(r), w: 'prev' }))].filter(r => reporting.CORE_EVENTS.includes(r.ev)), ['w', 'ev', 'act', 'src', 'device']),
  wantRetention: [{ deal: 'hotel', n: '12' }],
};
const rawBefore = JSON.stringify(raw);
const data = reporting.buildReport(raw, periods, { now, fixture: true });
equal(data.events.session, 41, 'Weighted selected total excludes both boundaries outside the range and bots');
equal(data.weeks.this.session, 36, 'Exact week boundary belongs to current week');
equal(data.weeks.prev.session, 3, 'Previous week ends before the split');
equal(data.events.activate, 1.25, 'Sample-weight precision is preserved, not rounded before ratios');
equal(data.daily[0], { day: '2026-09-22', session: 2 }, 'Start UTC hour maps to KST date');
equal(data.daily.find(r => r.day === '2026-10-18').session, 7, 'Sunday late UTC afternoon still counts on correct local date');
equal(data.daily.find(r => r.day === '2026-10-19').session, 11, 'UTC Sunday after 15:00 counts as Monday KST');
equal(data.hours[0], 18, 'Local midnight buckets sum across dates');
equal(data.hours[23], 23, 'Local 23:00 buckets include the last second of day');
equal(data.weekdays, [11, 2, 16, 5, 0, 0, 7], 'Weekday and daily/hour buckets agree in KST');
equal(data.daily.reduce((n, d) => n + (d.session || 0), 0), 41, 'Daily sum reconciles to total');
equal(data.hours.reduce((a, b) => a + b, 0), 41, 'Hourly sum reconciles to total');
equal(data.weekdays.reduce((a, b) => a + b, 0), 41, 'Weekday sum reconciles to total');
equal(data.availability.status, 'complete', 'Complete query set with matching weighted sums');
equal(data.availability.newEvents.wizard_open, 'not-observed', 'Absent new event cannot be called confirmed unused');
equal(data.availability.newEvents.xlsx_ready, 'observed', 'Observed success is separate from button action');
equal(OUTPUT_EVENTS.filter(e => reporting.NEW_EVENTS.includes(e)), [], 'New success events never double count historical output definition');
equal(data.retentionDemand.completeness, 'retention-limited', 'Ninety-day demand is not lifetime total');
equal(JSON.stringify(raw), rawBefore, 'Report never mutates underlying counts');
equal(reporting.sourceLabel('modelter.com'), 'modelter.com (최초 유입 미상)', 'Self referrer does not imply direct or repeat visitor');
check(reporting.sourceLabel('teams.public.onecdn.static.microsoft').startsWith('Teams'), 'Known Teams host is explicitly labelled');
check(!reporting.sourceLabel('myteams.example').startsWith('Teams'), 'Unrelated host is not inferred as Teams');
check(!reporting.sourceLabel('').includes('직접'), 'Missing referrer is not inferred as direct');
for (const e of reporting.NEW_EVENTS) check(!!EV_LABEL[e], e + ' has a human label');

const mismatched = structuredClone(raw); mismatched.cross[0].n += 1;
const mismatch = reporting.buildReport(mismatched, periods, { now });
equal(mismatch.availability.status, 'partial', 'Independent sampled-query disagreement is visible, never silently fixed');
check(mismatch.availability.reconciliation.some(x => x.event === 'session' && x.expected === 41 && x.actual === 42), 'Count reconciliation includes both actual weighted totals');
const oldPeriod = reporting.makePeriods({ endDate: '2026-06-01', now });
const emptyRaw = Object.fromEntries(Object.keys(queries).map(k => [k, []]));
throws(() => reporting.buildReport(emptyRaw, oldPeriod, { now }), /보존 범위/, 'Old successful empty queries are unavailable, never rendered as zero use');
const oldComparison = reporting.makePeriods({ endDate: '2026-08-02', days: 7, now });
throws(() => reporting.assertRetainedPeriods(oldComparison, now), /보존 범위/, 'Unavailable comparison week rejects an otherwise retained selected week');
equal(reporting.buildReport(emptyRaw, periods, { now }).availability.status, 'complete', 'Successful empty query is distinct from unavailable query');
for (const key of Object.keys(queries)) {
  const missing = structuredClone(raw); delete missing[key];
  throws(() => reporting.buildReport(missing, periods, { now }), /누락/, key + ' omission fails rather than inserting empty counts');
}
for (const n of [null, '', 'NaN', -1, Infinity]) throws(() => reporting.validateRows([{ n }], 'test'), /합계/, 'Reject corrupt weighted result');
throws(() => reporting.validateRows(Array.from({ length: reporting.ROW_LIMIT }, () => ({ n: 1 })), 'test'), /행 제한/, 'Reached row cap is not presented as complete');
throws(() => reporting.timeBuckets([{ t: periods.selected.endUtcExclusive, ev: 'session', n: 1 }], periods.selected), /범위 밖/, 'Hourly rows outside requested days are rejected');
throws(() => reporting.timeBuckets([{ t: '2026-10-20T01:00:00', ev: 'session', n: 1 }], periods.selected), /UTC/, 'Timezone-less ISO is not silently interpreted in host timezone');
const html = reporting.render(data);
check(html.includes('2026-09-22 ~ 2026-10-21 KST'), 'Visible selected dates exclude today');
check(html.includes('미관측') && html.includes('기기 저장 완료') === false && html.includes('디스크 저장 완료'), 'Success and absence semantics are explained');
check(html.includes('생성 오류') && html.includes('저장 버전 열기'), 'Failure and restore signals are visible');
check(!/착수 가능|절대 누적|회수 재진입/.test(html), 'Old unsupported decision labels are removed');
check(html.includes('modelter.com (최초 유입 미상)'), 'Rendered source table retains unknown-original-source meaning');
check(reporting.markdown(data).includes('미관측'), 'Brief report preserves unobserved-event caveat');
const legacyHtml = legacy.build([{ endDate: '2026-09-29', days: 30, events: {}, funnel: {} }]);
check(legacyHtml.includes('과거 스냅샷 기록') && legacyHtml.includes('UTC/실행시각 기준'), 'Old snapshot dashboard cannot masquerade as the new KST source');
check(legacyHtml.includes('2026년 8월 고정 실험 · 과거 기록 펼치기'), 'Fixed experiments are archived behind a labelled detail section');

// Private cutover accepts verified live-source reports, not merely a self-declared complete flag.
const liveShaped = structuredClone(data); liveShaped.source = 'analytics-engine';
equal(validatePrivateReport(liveShaped, { now }), [], 'Complete live-shaped report with matching boundaries and sums passes');
equal(validatePrivateReport(liveShaped, { now, allowSamplingDifference: true }), [], 'Routine mode also accepts reconciled complete reports');
check(validatePrivateReport(data, { now }).some(e => e.includes('실제')), 'A fixture cannot satisfy live collection acceptance');
for (const input of [null, [], 'report', {}]) check(validatePrivateReport(input, { now }).length > 0, 'Malformed report cannot pass cutover');
for (const [name, mutate] of [
  ['partial', r => { r.availability.status = 'partial'; }],
  ['unavailable', r => { r.availability.status = 'unavailable'; r.events = null; }],
  ['retention limit', r => { r.availability.retentionLimited = true; }],
  ['unreported reconciliation', r => { r.availability.reconciliation = [{ event: 'session' }]; }],
  ['missing query', r => { delete r.availability.queries.cross; }],
  ['failed query', r => { r.availability.queries.cross.status = 'failed'; }],
  ['capped query', r => { r.availability.queries.cross.rows = 10000; }],
  ['wrong schema', r => { r.schema = 2; }],
  ['bot-inclusive', r => { r.botExcluded = false; }],
  ['wrong timezone', r => { r.timezone = 'UTC'; }],
  ['wrong days', r => { r.periods.days = 29; }],
  ['wrong recent7 length', r => { r.periods.recent7.start = '2026-10-16'; r.periods.recent7.startUtc = '2026-10-15T15:00:00.000Z'; }],
  ['overlapping weeks', r => { r.periods.previous7.endUtcExclusive = r.periods.recent7.endUtcExclusive; }],
  ['wrong KST midnight', r => { r.periods.selected.startUtc = '2026-09-22T00:00:00.000Z'; }],
  ['different selected/recent end', r => { r.periods.recent7.endExclusive = '2026-10-21'; }],
  ['future end', r => { r.periods.selected.endExclusive = '2026-10-23'; }],
  ['different period key', r => { r.reportKey = 'kst:2026-09-23:2026-10-22'; }],
  ['bad generation timestamp', r => { r.generatedAt = 'yesterday'; }],
  ['future generation timestamp', r => { r.generatedAt = '2026-10-23T00:00:00Z'; }],
  ['before data period generation', r => { r.generatedAt = '2026-10-20T00:00:00Z'; }],
  ['missing metrics', r => { r.events = null; }],
  ['negative metric', r => { r.events.session = -1; }],
  ['missing cross data', r => { r.cross = null; }],
  ['missing weekday', r => { r.weekdays.pop(); }],
  ['missing day', r => { r.daily.pop(); }],
  ['cross sum', r => { r.cross[0].n += 1; }],
  ['weekly sum', r => { r.weekCross[0].n += 1; }],
  ['daily sum', r => { r.daily[0].session += 1; }],
  ['hour sum', r => { r.hours[0] += 1; }],
]) {
  const changed = structuredClone(liveShaped); mutate(changed);
  check(validatePrivateReport(changed, { now }).length > 0, name + ' cannot pass private cutover');
  check(validatePrivateReport(changed, { now, allowSamplingDifference: true }).length > 0, name + ' cannot pass routine mode either');
}
const livePartial = structuredClone(mismatch); livePartial.source = 'analytics-engine';
check(validatePrivateReport(livePartial, { now }).length > 0, 'Strict cutover refuses an honestly recorded sampled difference');
equal(validatePrivateReport(livePartial, { now, allowSamplingDifference: true }), [], 'Routine mode accepts recorded sampled difference as diagnostic partial');
const unrecorded = structuredClone(livePartial); unrecorded.availability.reconciliation[0].actual += 1;
check(validatePrivateReport(unrecorded, { now, allowSamplingDifference: true }).length > 0, 'Routine mode refuses altered difference metadata');
const missingDiff = structuredClone(livePartial); missingDiff.availability.reconciliation = [];
check(validatePrivateReport(missingDiff, { now, allowSamplingDifference: true }).length > 0, 'Routine mode refuses undisclosed difference');
const partialFixture = structuredClone(livePartial); partialFixture.source = 'fixture';
check(validatePrivateReport(partialFixture, { now, allowSamplingDifference: true }).length > 0, 'Routine mode cannot accept synthetic partial report');
const hourDifference = structuredClone(raw); hourDifference.hourly.find(r => r.ev === 'session').n += 1;
const hourPartial = reporting.buildReport(hourDifference, periods, { now });
equal(validatePrivateReport(hourPartial, { now, allowSamplingDifference: true }), [], 'Independent hourly-query sampling difference is allowed when recorded');
check(validatePrivateReport(hourPartial, { now }).length > 0, 'Strict cutover still rejects hourly sampling difference');
for (const field of ['hours', 'weekdays']) {
  const broken = structuredClone(hourPartial); broken[field][0] += 1;
  check(validatePrivateReport(broken, { now, allowSamplingDifference: true }).some(e => e.includes('동일 원본')), 'Routine refuses ' + field + ' disagreement against its own daily source');
}
check(reporting.render(livePartial).includes('진단 자료로만 사용'), 'Partial report visibly limits use of sampled differences');

// CLI artifact and failure-path checks run solely against temporary synthetic fixtures.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'modelter-reporting-'));
try {
  const fixture = path.join(temp, 'fixture.json'), out = path.join(temp, 'report.html'), json = path.join(temp, 'report.json'), md = path.join(temp, 'report.md');
  // Move only timestamps for the subprocess fixture so the regression remains valid after 90 days.
  const cliEnd = reporting.kstDate(new Date());
  const shift = Date.parse(cliEnd + 'T00:00:00Z') - Date.parse('2026-10-22T00:00:00Z');
  const cliRaw = structuredClone(raw); cliRaw.hourly.forEach(r => { r.t = new Date(Date.parse(r.t) + shift).toISOString(); });
  fs.writeFileSync(fixture, JSON.stringify(cliRaw));
  const args = [path.join(__dirname, '..', 'modelter-patterns.js'), '--fixture', fixture, '--end-date', cliEnd, '--days', '30', '--out', out, '--json', json, '--md', md];
  const first = spawnSync(process.execPath, args, { encoding: 'utf8', env: { ...process.env, TZ: 'Pacific/Honolulu' } });
  equal(first.status, 0, 'Offline CLI produces all artifacts');
  const fromFile = JSON.parse(fs.readFileSync(json, 'utf8'));
  equal(fromFile.events.session, 41, 'JSON preserves weighted totals');
  equal(fromFile.timezone, 'Asia/Seoul', 'JSON timezone is explicit');
  check(fromFile.generatedAt.endsWith('Z') && fromFile.reportKey === `kst:${reporting.addDays(cliEnd, -30)}:${cliEnd}`, 'Report freshness and overlap identity are explicit');
  const anotherZone = spawnSync(process.execPath, args, { encoding: 'utf8', env: { ...process.env, TZ: 'Asia/Seoul' } });
  equal(anotherZone.status, 0, 'CLI runs with different host timezone');
  equal(JSON.parse(fs.readFileSync(json, 'utf8')).daily, fromFile.daily, 'Host timezone does not change calendar grouping');
  const sampledRaw = structuredClone(cliRaw); sampledRaw.cross[0].n += 1;
  const sampledReport = reporting.buildReport(sampledRaw, reporting.makePeriods({ endDate: cliEnd }), { now: new Date() });
  const sampledPath = path.join(temp, 'sampled-live-shaped.json'); fs.writeFileSync(sampledPath, JSON.stringify(sampledReport));
  const guardArgs = [path.join(__dirname, '..', 'private-reporting', 'validate-report.js'), sampledPath];
  equal(spawnSync(process.execPath, guardArgs, { encoding: 'utf8' }).status, 1, 'CLI cutover default refuses sampled partial');
  const diagnosticGuard = spawnSync(process.execPath, [...guardArgs, '--allow-sampling-difference'], { encoding: 'utf8' });
  equal(diagnosticGuard.status, 0, 'CLI routine flag accepts well-formed diagnostic partial');
  check(diagnosticGuard.stdout.includes('진단 보고서') && !diagnosticGuard.stdout.includes('합계 일치'), 'Routine CLI reports diagnostic quality, not equality');
  // Old period must overwrite a previously successful report, before query/secrets checks.
  const oldArgs = args.slice(); oldArgs[oldArgs.indexOf('--end-date') + 1] = '2020-01-01';
  const oldRun = spawnSync(process.execPath, oldArgs, { encoding: 'utf8' });
  equal(oldRun.status, 1, 'Out-of-retention CLI fails even with an otherwise valid fixture');
  const oldFile = JSON.parse(fs.readFileSync(json, 'utf8'));
  equal(oldFile.events, null, 'Out-of-retention report replaces previous counts with null');
  equal(oldFile.availability.reason, 'retention-limited', 'Unavailable retained range has an explicit reason');
  check(Object.values(oldFile.availability.queries).every(q => q.status === 'not-run'), 'Retention guard runs before queries');
  check(fs.readFileSync(out, 'utf8').includes('사용 보고서를 확인할 수 없습니다'), 'Out-of-retention HTML replaces previous success');
  const regenerate = spawnSync(process.execPath, args, { encoding: 'utf8' });
  equal(regenerate.status, 0, 'Can recover by requesting a retained window');
  const missing = structuredClone(cliRaw); delete missing.cross; fs.writeFileSync(fixture, JSON.stringify(missing));
  const failed = spawnSync(process.execPath, args, { encoding: 'utf8' });
  equal(failed.status, 1, 'Incomplete query fixture fails process');
  const failure = JSON.parse(fs.readFileSync(json, 'utf8'));
  equal(failure.availability.status, 'unavailable', 'Failure overwrites stale success metadata');
  equal(failure.events, null, 'Failure never produces zero metrics');
  check(fs.readFileSync(out, 'utf8').includes('사용 보고서를 확인할 수 없습니다'), 'Failure overwrites stale HTML');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }

(async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => ({ ok: true, json: async () => ({ data: [] }) });
    equal(await reporting.runSQL('SELECT', 'fixture', 'fixture'), [], 'Valid empty response is allowed');
    for (const response of [{}, { success: false, data: [] }, { data: null }, { errors: [{}], data: [] }]) {
      global.fetch = async () => ({ ok: true, json: async () => response });
      await assert.rejects(reporting.runSQL('SELECT', 'fixture', 'fixture'), /누락/); checks++;
    }
    global.fetch = async () => ({ ok: false, status: 403 });
    await assert.rejects(reporting.runSQL('SELECT', 'fixture', 'fixture'), /HTTP 403/); checks++;
  } finally { global.fetch = originalFetch; }
  console.log('Reporting periods OK — ' + checks + ' checks; KST dates, weighted counts, privacy labels and missing-data failures.');
})().catch(error => { console.error(error); process.exitCode = 1; });
