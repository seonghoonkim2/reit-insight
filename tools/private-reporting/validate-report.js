'use strict';
const fs = require('fs');
const { makePeriods, assertRetainedPeriods, buildQueries, CORE_EVENTS, TIME_EVENTS, ROW_LIMIT, addDays } = require('../modelter-patterns');
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const count = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const sameCount = (a, b) => Math.abs(a - b) <= 1e-7 * Math.max(1, a, b);
function validate(report, { now = new Date(), allowSamplingDifference = false } = {}) {
  const errors = [];
  if (!record(report)) return ['보고서 객체가 아님'];
  if (report.schema !== 3) errors.push('지원하지 않는 보고서 스키마');
  if (report.source !== 'analytics-engine') errors.push('실제 Analytics Engine 자료가 아님');
  if (report.timezone !== 'Asia/Seoul' || report.botExcluded !== true) errors.push('시간대 또는 봇 제외 정의 불일치');
  const a = report.availability;
  if (!a || !['complete', 'partial'].includes(a.status) || a.retentionLimited !== false || !Array.isArray(a.reconciliation)) errors.push('자료 누락·보존기간 제한 또는 잘못된 상태');
  else if (!allowSamplingDifference && (a.status !== 'complete' || a.reconciliation.length)) errors.push('전환 검증에는 집계 차이 없는 자료가 필요함');
  let expected;
  try {
    expected = makePeriods({ days: report.periods.days, endDate: report.periods.selected.endExclusive, now });
  } catch (_) { errors.push('완료된 한국 시간 조회 기간이 아님'); }
  for (const name of ['selected', 'recent7', 'previous7']) {
    const p = report.periods && report.periods[name];
    if (!p || !expected || ['start', 'endExclusive', 'timezone', 'startUtc', 'endUtcExclusive'].some(key => p[key] !== expected[name][key])) errors.push('잘못된 기간: ' + name);
  }
  if (expected) {
    if (report.reportKey !== `kst:${expected.selected.start}:${expected.selected.endExclusive}`) errors.push('보고서 기간 키 불일치');
    for (const name of Object.keys(buildQueries(expected))) {
      const q = a && a.queries && a.queries[name];
      if (!q || q.status !== 'ok' || !Number.isInteger(q.rows) || q.rows < 0 || q.rows >= ROW_LIMIT) errors.push('조회 누락 또는 행 제한: ' + name);
    }
  }
  const generated = typeof report.generatedAt === 'string' && /Z$/.test(report.generatedAt) ? Date.parse(report.generatedAt) : NaN;
  if (!Number.isFinite(generated) || generated > new Date(now).getTime() + 5 * 60000 || (expected && generated < Date.parse(expected.selected.endUtcExclusive))) errors.push('보고서 생성 시각 불일치');
  if (expected && Number.isFinite(generated)) {
    try { assertRetainedPeriods(expected, generated); } catch (_) { errors.push('수집 시점에 보존 범위 밖인 기간'); }
  }
  const maps = [report.events, report.weeks && report.weeks.this, report.weeks && report.weeks.prev];
  if (maps.some(m => !record(m) || Object.values(m).some(n => !count(n)))) errors.push('집계 숫자 누락 또는 손상');
  for (const name of ['cross', 'weekCross']) {
    if (!Array.isArray(report[name]) || report[name].length >= ROW_LIMIT || report[name].some(r => !record(r) || !CORE_EVENTS.includes(r.ev) || !count(r.n) || (name === 'weekCross' && !['this', 'prev'].includes(r.w)))) errors.push('교차 집계 누락 또는 손상: ' + name);
  }
  if (!Array.isArray(report.daily) || !expected || report.daily.length !== expected.days || report.daily.some((r, i) => !record(r) || r.day !== addDays(expected.selected.start, i) || Object.entries(r).some(([key, n]) => key !== 'day' && !count(n)))) errors.push('KST 일별 집계 누락 또는 손상');
  for (const [name, size] of [['hours', 24], ['weekdays', 7]]) if (!Array.isArray(report[name]) || report[name].length !== size || report[name].some(n => !count(n))) errors.push('시간·요일 집계 누락 또는 손상: ' + name);
  // 상태 문자열만 믿지 않고 결과 파일의 핵심 가중합을 다시 대조한다.
  if (!errors.length) {
    const sum = (rows, ev) => rows.reduce((n, row) => n + (row.ev === ev ? row.n : 0), 0);
    const diffs = [];
    const compare = (ev, expected, actual, label) => { if (!sameCount(expected, actual)) diffs.push({ event: ev, expected, actual, check: label }); };
    for (const ev of CORE_EVENTS) {
      compare(ev, report.events[ev] || 0, sum(report.cross, ev), '교차 합계 / 전체');
      for (const w of ['this', 'prev']) compare(ev, report.weeks[w][ev] || 0, sum(report.weekCross.filter(r => r.w === w), ev), w + ' 주간 교차 합계 / 전체');
    }
    for (const ev of TIME_EVENTS) compare(ev, report.events[ev] || 0, report.daily.reduce((n, r) => n + (r[ev] || 0), 0), '시간별 합계 / 전체');
    // daily/hours/weekdays는 같은 hourly 응답을 재분류했으므로 이들끼리의 차이는 표본차가 아니다.
    const dailyVisits = report.daily.reduce((n, r) => n + (r.session || 0), 0);
    for (const name of ['hours', 'weekdays']) if (!sameCount(dailyVisits, report[name].reduce((a, b) => a + b, 0))) errors.push('동일 원본의 시간·요일 합계 불일치: ' + name);
    const order = rows => rows.slice().sort((x, y) => (x.check + '/' + x.event).localeCompare(y.check + '/' + y.event));
    const recorded = a.reconciliation;
    if (recorded.some(r => !record(r) || typeof r.event !== 'string' || typeof r.check !== 'string' || !count(r.expected) || !count(r.actual))) errors.push('합계 차이 기록 손상');
    else {
      const left = order(diffs), right = order(recorded);
      if (left.length !== right.length || left.some((d, i) => d.event !== right[i].event || d.check !== right[i].check || !sameCount(d.expected, right[i].expected) || !sameCount(d.actual, right[i].actual))) errors.push('실제 집계 차이와 기록 불일치');
    }
    if (a.status !== (diffs.length ? 'partial' : 'complete')) errors.push('실제 집계와 자료 상태 불일치');
    if (diffs.length && !allowSamplingDifference) errors.push('전환 검증에서 집계 차이 허용 안 됨');
  }
  return errors;
}
if (require.main === module) {
  const report = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const errors = validate(report, { allowSamplingDifference: process.argv.includes('--allow-sampling-difference') });
  if (errors.length) { console.error('보고서 검증 실패: ' + errors.join(' / ')); process.exitCode = 1; }
  else console.log(report.availability.status === 'partial' ? '진단 보고서 확인: 모든 조회 완료, 기록된 표본 가중합 차이 있음' : '보고서 검증 통과: 실데이터·KST·합계 일치');
}
module.exports = { validate };
