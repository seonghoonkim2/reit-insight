#!/usr/bin/env node
'use strict';
/* 비공개 운영 보고서. KST 완료 일자만 읽으며 저장소/운영 사이트를 변경하지 않는다.
 * CF_ACCOUNT_ID=... CF_API_TOKEN=... node tools/modelter-patterns.js
 *   --days 30 --end-date 2026-10-22 --out data/patterns.html --json data/patterns.json
 * --end-date는 제외할 첫 KST 날짜(기본 오늘). --fixture는 동일 SQL 결과의 오프라인 검증용.
 * 수치·임차인·사용자 식별자·전체 URL은 조회/저장하지 않는다. 공개 저장소에 보고서 업로드 금지.
 */
const fs = require('fs');
const path = require('path');
const { OUTPUT_EVENTS, DEAL_LABEL, EV_LABEL, DEVICE_LABEL } = require('./modelter-labels');
const DAY = 86400000, KST = 9 * 3600000, ROW_LIMIT = 10000;
const NEW_EVENTS = ['xlsx_ready', 'xlsx_error', 'wizard_open', 'wizard_finish', 'ws_restore', 'resume_copy'];
const CORE_EVENTS = [...new Set(['session', 'activate', 'computed', 'sample_start', 'landing', 'ws_save', ...OUTPUT_EVENTS, ...NEW_EVENTS])];
const TIME_EVENTS = ['session', 'activate', 'computed', 'xlsx_download', 'xlsx_ready', 'xlsx_error', 'ws_save', 'ws_restore'];
const ROOT = path.join(__dirname, '..');
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => n == null ? '확인 불가' : Number(n).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
const pct = (a, b) => b > 0 ? (a / b * 100).toFixed(1) + '%' : '—';

function dateMs(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw new Error('날짜는 YYYY-MM-DD 형식이어야 합니다.');
  const ms = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) throw new Error('유효하지 않은 날짜입니다.');
  return ms;
}
function addDays(value, days) { return new Date(dateMs(value) + days * DAY).toISOString().slice(0, 10); }
function kstDate(now) { return new Date(new Date(now).getTime() + KST).toISOString().slice(0, 10); }
function period(start, end) {
  return { start, endExclusive: end, timezone: 'Asia/Seoul', startUtc: new Date(dateMs(start) - KST).toISOString(), endUtcExclusive: new Date(dateMs(end) - KST).toISOString() };
}
function makePeriods({ days = 30, endDate, now = new Date() } = {}) {
  days = Number(days);
  if (!Number.isInteger(days) || days < 7 || days > 90) throw new Error('--days는 7~90 사이의 정수여야 합니다.');
  endDate = endDate || kstDate(now);
  dateMs(endDate);
  if (endDate > kstDate(now)) throw new Error('완료되지 않은 미래 KST 날짜를 포함할 수 없습니다.');
  return { days, selected: period(addDays(endDate, -days), endDate), recent7: period(addDays(endDate, -7), endDate), previous7: period(addDays(endDate, -14), addDays(endDate, -7)), retention: period(addDays(endDate, -90), endDate) };
}
function assertRetainedPeriods(periods, now = new Date()) {
  // 조회에 성공한 빈 응답도 보존기간 밖이면 0건이라는 근거가 될 수 없다.
  // 약 3개월 보존을 정확한 90일 보장으로 해석하지 않는다. 기본 보고서는 최근 30일만 쓴다.
  const floor = new Date(now).getTime() - 90 * DAY;
  if (['selected', 'recent7', 'previous7'].some(name => Date.parse(periods[name].startUtc) < floor)) {
    const error = new Error('선택 기간 또는 비교 기간이 조회 가능한 보존 범위를 벗어났습니다. 해당 기간의 사용량을 확인할 수 없습니다.');
    error.code = 'RETENTION_LIMITED';
    throw error;
  }
}
function sqlDate(iso) { return iso.slice(0, 19).replace('T', ' '); }
function where(p, includeBots) {
  return `timestamp >= toDateTime('${sqlDate(p.startUtc)}') AND timestamp < toDateTime('${sqlDate(p.endUtcExclusive)}')${includeBots ? '' : " AND blob10 != '1'"}`;
}
function list(items) { return items.map(e => `'${e}'`).join(','); }
function buildQueries(periods, includeBots = false) {
  const w = where(periods.selected, includeBots);
  const w14 = where(period(periods.previous7.start, periods.recent7.endExclusive), includeBots);
  const split = `if(timestamp >= toDateTime('${sqlDate(periods.recent7.startUtc)}'), 'this', 'prev')`;
  const core = `blob1 IN (${list(CORE_EVENTS)})`;
  return {
    events: `SELECT blob1 AS ev, sum(_sample_interval) AS n FROM Modelter WHERE ${w} GROUP BY ev LIMIT ${ROW_LIMIT}`,
    hourly: `SELECT toStartOfInterval(timestamp, INTERVAL '1' HOUR) AS t, blob1 AS ev, sum(_sample_interval) AS n FROM Modelter WHERE ${w} AND blob1 IN (${list(TIME_EVENTS)}) GROUP BY t, ev ORDER BY t LIMIT ${ROW_LIMIT}`,
    wow: `SELECT ${split} AS w, blob1 AS ev, sum(_sample_interval) AS n FROM Modelter WHERE ${w14} GROUP BY w, ev LIMIT ${ROW_LIMIT}`,
    cross: `SELECT blob5 AS ref, blob4 AS device, blob2 AS deal, blob1 AS ev, blob11 AS act, blob9 AS src, sum(_sample_interval) AS n FROM Modelter WHERE ${w} AND ${core} GROUP BY ref, device, deal, ev, act, src LIMIT ${ROW_LIMIT}`,
    weekCross: `SELECT ${split} AS w, blob1 AS ev, blob11 AS act, blob9 AS src, blob4 AS device, sum(_sample_interval) AS n FROM Modelter WHERE ${w14} AND ${core} GROUP BY w, ev, act, src, device LIMIT ${ROW_LIMIT}`,
    wantRetention: `SELECT blob2 AS deal, sum(_sample_interval) AS n FROM Modelter WHERE ${where(periods.retention, includeBots)} AND blob1='deal_want' GROUP BY deal LIMIT ${ROW_LIMIT}`,
  };
}

function readCount(row, query) {
  const n = typeof row.n === 'string' && row.n.trim() !== '' ? Number(row.n) : row.n;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) throw new Error(query + ': 표본 가중 합계가 유효하지 않습니다.');
  return n;
}
function validateRows(rows, query) {
  if (!Array.isArray(rows)) throw new Error(query + ': 조회 결과가 누락되었습니다.');
  if (rows.length >= ROW_LIMIT) throw new Error(query + ': 행 제한에 도달하여 완전한 집계인지 확인할 수 없습니다.');
  rows.forEach(row => { if (!row || typeof row !== 'object') throw new Error(query + ': 결과 행이 유효하지 않습니다.'); readCount(row, query); });
}
function add(map, key, n) { map[key] = (map[key] || 0) + n; }
function tally(rows, key = 'ev') {
  const map = Object.create(null);
  for (const row of rows) add(map, String(row[key] || ''), readCount(row, key));
  return map;
}
function sourceLabel(ref) {
  if (!ref) return '출처 기록 없음';
  if (ref === 'modelter.com' || ref === 'www.modelter.com') return ref + ' (최초 유입 미상)';
  if (ref === 'teams.microsoft.com' || ref === 'teams.live.com' || ref === 'teams.cloud.microsoft' || ref === 'teams.public.onecdn.static.microsoft') return 'Teams · ' + ref;
  return ref;
}
function utcHour(value) {
  const text = String(value || '');
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? text.replace(' ', 'T') + 'Z' : text;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(iso)) throw new Error('시간 버킷에 명시적인 UTC 시각이 필요합니다.');
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms) || ms % 3600000 !== 0) throw new Error('유효하지 않은 UTC 시간 버킷입니다.');
  return ms;
}
function timeBuckets(rows, p) {
  const byDay = Object.create(null), hours = Array(24).fill(0), weekdays = Array(7).fill(0);
  for (let d = p.start; d < p.endExclusive; d = addDays(d, 1)) byDay[d] = { day: d };
  for (const row of rows) {
    const ms = utcHour(row.t), local = new Date(ms + KST), day = local.toISOString().slice(0, 10);
    if (!byDay[day] || !TIME_EVENTS.includes(row.ev)) throw new Error('일별 집계에 조회 범위 밖의 행이 있습니다.');
    const n = readCount(row, 'hourly');
    add(byDay[day], row.ev, n);
    if (row.ev === 'session') { hours[local.getUTCHours()] += n; weekdays[(local.getUTCDay() + 6) % 7] += n; }
  }
  return { daily: Object.values(byDay), hours, weekdays };
}
function reconcile(expected, actual, keys, description) {
  // SQL 차원별 쿼리는 서로 다른 샘플을 사용할 수 있다. 차이는 숨기지 않고 표본 가중 추정임을 표시한다.
  return keys.flatMap(key => {
    const a = expected[key] || 0, b = actual[key] || 0;
    return Math.abs(a - b) > 1e-7 * Math.max(1, a, b) ? [{ event: key, expected: a, actual: b, check: description }] : [];
  });
}
function dimensions(rows, field) {
  const groups = Object.create(null);
  for (const row of rows) {
    const k = String(row[field] || ''), map = groups[k] || (groups[k] = Object.create(null));
    add(map, row.ev, row.n);
  }
  return groups;
}
function buildReport(raw, periods, { now = new Date(), includeBots = false, fixture = false } = {}) {
  assertRetainedPeriods(periods, now);
  const queries = buildQueries(periods, includeBots);
  for (const key of Object.keys(queries)) validateRows(raw[key], key);
  const events = tally(raw.events), weeks = { this: Object.create(null), prev: Object.create(null) };
  for (const row of raw.wow) {
    if (!['this', 'prev'].includes(row.w)) throw new Error('주간 비교 구분이 유효하지 않습니다.');
    add(weeks[row.w], row.ev, readCount(row, 'wow'));
  }
  const cross = raw.cross.map(row => {
    if (!CORE_EVENTS.includes(row.ev)) throw new Error('교차 집계에 허용되지 않은 이벤트가 있습니다.');
    return { ref: String(row.ref || ''), device: String(row.device || ''), deal: String(row.deal || ''), ev: row.ev, act: row.act === '1' ? '1' : row.act === '0' ? '0' : '', src: String(row.src || ''), n: readCount(row, 'cross') };
  });
  const weekCross = raw.weekCross.map(row => {
    if (!['this', 'prev'].includes(row.w) || !CORE_EVENTS.includes(row.ev)) throw new Error('주간 교차 집계가 유효하지 않습니다.');
    return { w: row.w, ev: row.ev, act: row.act === '1' ? '1' : row.act === '0' ? '0' : '', src: String(row.src || ''), device: String(row.device || ''), n: readCount(row, 'weekCross') };
  });
  const time = timeBuckets(raw.hourly, periods.selected);
  const checks = [
    ...reconcile(events, tally(raw.hourly), TIME_EVENTS, '시간별 합계 / 전체'),
    ...reconcile(events, tally(cross), CORE_EVENTS, '교차 합계 / 전체'),
    ...['this', 'prev'].flatMap(w => reconcile(weeks[w], tally(weekCross.filter(r => r.w === w)), CORE_EVENTS, w + ' 주간 교차 합계 / 전체')),
  ];
  const grouped = { ref: dimensions(cross, 'ref'), device: dimensions(cross, 'device'), deal: dimensions(cross, 'deal'), src: dimensions(cross, 'src'), act: dimensions(cross, 'act') };
  const queryStatus = Object.fromEntries(Object.keys(queries).map(k => [k, { status: 'ok', rows: raw[k].length }]));
  return {
    schema: 3, reportKey: `kst:${periods.selected.start}:${periods.selected.endExclusive}`, generatedAt: new Date(now).toISOString(), timezone: 'Asia/Seoul', periods, botExcluded: !includeBots, source: fixture ? 'fixture' : 'analytics-engine',
    availability: { status: checks.length ? 'partial' : 'complete', queries: queryStatus, retentionLimited: false, reconciliation: checks, newEvents: Object.fromEntries(NEW_EVENTS.map(e => [e, events[e] > 0 ? 'observed' : 'not-observed'])) },
    events, weeks, ...time, grouped, cross, weekCross,
    retentionDemand: { period: periods.retention, completeness: 'retention-limited', byDeal: tally(raw.wantRetention, 'deal') },
    notes: ['방문·행동 횟수이며 고유 사용자·실제 딜 개수가 아닙니다.', '엑셀 생성 완료는 기기 저장 완료가 아닙니다.', '새 이벤트 미관측은 미배포·미사용·미수집을 구분하지 못합니다.', 'src=resume은 링크 목적이며 동일인 기기 이동이나 재방문율이 아닙니다.', '기간이 겹치는 보고서는 합산하지 않습니다. 하루 자료의 키는 KST 날짜입니다.'],
  };
}

function table(headers, rows) {
  return '<div class="scroll"><table><thead><tr>' + headers.map(x => '<th>' + esc(x) + '</th>').join('') + '</tr></thead><tbody>' + rows.map(row => '<tr>' + row.map(x => '<td>' + esc(x) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
}
function bars(labels, values) {
  const max = Math.max(1, ...values);
  return '<div class="bars">' + labels.map((label, i) => `<div class="bar"><span>${esc(label)}</span><div><i style="width:${values[i] / max * 100}%"></i></div><b>${num(values[i])}</b></div>`).join('') + '</div>';
}
function page(content) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>모델터 사용 보고서</title><style>
  :root{--bg:#f3f1ec;--panel:#fdfcf9;--ink:#1b2230;--muted:#626a75;--line:#e3e0d8;--gold:#a9792b}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.6 -apple-system,"Malgun Gothic",sans-serif;padding:24px}.wrap{max-width:1100px;margin:auto}h1{font-size:24px;margin:0}h2{font-size:17px;margin:0 0 12px}.sub,.note{color:var(--muted);font-size:12px}.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px;margin:16px 0}.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;font-size:12px}th,td{text-align:right;padding:7px 9px;border-bottom:1px solid var(--line);white-space:nowrap}th:first-child,td:first-child{text-align:left}th{color:var(--muted)}.row{display:grid;grid-template-columns:1fr 1fr;gap:16px}.row>.card{margin:0}.bar{display:flex;align-items:center;gap:10px;font-size:12px;margin:3px 0}.bar>span{width:38px}.bar>div{flex:1;height:7px;background:var(--bg)}.bar i{display:block;height:7px;background:var(--gold)}.bar>b{width:48px;text-align:right;font-weight:500}.warning{border-left:4px solid var(--gold);padding-left:12px}summary{cursor:pointer;color:var(--muted)}@media(max-width:700px){body{padding:12px}.row{display:block}.row>.card{margin:16px 0}}@media(prefers-color-scheme:dark){:root{--bg:#14171d;--panel:#1c2027;--ink:#e8eaef;--muted:#b6bcc7;--line:#303641;--gold:#c99b4e}}
  </style></head><body><main class="wrap">${content}</main></body></html>`;
}
function render(report) {
  const p = report.periods, ev = report.events, w = report.weeks;
  const periodText = x => `${x.start} ~ ${addDays(x.endExclusive, -1)} KST`;
  const mainMetrics = ['session', 'activate', 'computed', 'xlsx_download', ...NEW_EVENTS, 'ws_save'];
  const newLabel = (e, n) => NEW_EVENTS.includes(e) && !n ? '미관측' : num(n || 0);
  const metricRows = mainMetrics.map(e => [EV_LABEL[e] || e, newLabel(e, w.prev[e]), newLabel(e, w.this[e]), newLabel(e, ev[e])]);
  metricRows.push(['직접 입력 / 방문', pct(w.prev.activate || 0, w.prev.session || 0), pct(w.this.activate || 0, w.this.session || 0), pct(ev.activate || 0, ev.session || 0)]);
  const groupedTable = (field, labels) => table(['구분', '방문', '입력', '결과', '엑셀 버튼', '생성 완료', '생성 오류', '저장 완료', '저장 버전 열기'], Object.entries(report.grouped[field]).sort((a, b) => (b[1].session || 0) - (a[1].session || 0)).map(([k, vals]) => [field === 'ref' ? sourceLabel(k) : ((labels || {})[k] || k || '기록 없음'), ...['session', 'activate', 'computed', 'xlsx_download', 'xlsx_ready', 'xlsx_error', 'ws_save', 'ws_restore'].map(e => newLabel(e, vals[e]))]));
  const actRows = ['prev', 'this'].map(key => {
    const rows = report.weekCross.filter(r => r.w === key);
    const count = fn => rows.filter(fn).reduce((sum, r) => sum + r.n, 0);
    return [key === 'this' ? '최근 완료 7일' : '이전 7일', num(count(r => OUTPUT_EVENTS.includes(r.ev) && r.act === '1')), num(count(r => OUTPUT_EVENTS.includes(r.ev) && r.act === '0')), num(count(r => OUTPUT_EVENTS.includes(r.ev) && r.act === '')), num(count(r => r.ev === 'landing' && r.src === 'resume' && r.device === 'desktop'))];
  });
  const allEvents = [...new Set([...Object.keys(w.prev), ...Object.keys(w.this)])].sort((a, b) => (w.this[b] || 0) - (w.this[a] || 0));
  return page(`<h1>모델터 사용 보고서</h1><p class="sub">${periodText(p.selected)} · 생성 ${esc(report.generatedAt)} · ${report.botExcluded ? '봇 태그 제외' : '봇 포함'} · ${report.source === 'fixture' ? '검증용 자료' : '비공개 운영 자료'}</p>
  ${report.availability.status !== 'complete' ? '<div class="card warning"><b>집계 사이에 표본 가중합 차이가 있습니다.</b><p>조회마다 사용하는 표본이 달라 합계가 다를 수 있습니다. 차이는 JSON의 availability.reconciliation에 남겼으며 원본 숫자를 맞추어 바꾸지 않았습니다. 진단 자료로만 사용하고 정확한 전환율이나 성과 달성으로 판정하지 마세요.</p></div>' : ''}
  <section class="card"><h2>최근 사용</h2><p class="note">최근 7일: ${periodText(p.recent7)} · 이전 7일: ${periodText(p.previous7)} · 오늘 제외</p>${table(['항목', '이전 7일', '최근 7일', `선택 ${p.days}일`], metricRows)}<p class="note">방문·행동 횟수입니다. 실제 딜 수나 사용자 전환율이 아닙니다. 엑셀 버튼, 생성 완료, 디스크 저장 완료는 서로 다릅니다. 새 기록의 ‘미관측’은 배포 전인지 사용이 없었는지 구분할 수 없다는 뜻입니다. wizard의 이전 혼합 기록은 새 시작·마지막 단계 기록과 합치지 않습니다.</p></section>
  <section class="card"><h2>입력 후 산출과 PC 링크 열기</h2>${table(['기간', '입력 표식 있는 산출', '입력 표식 없는 산출', '표식 미수집 산출', 'PC 이어보기 링크 열기'], actRows)}<p class="note">산출은 기존 버튼·복사 행동 정의를 유지합니다. 새 성공 이벤트를 더해 중복 계산하지 않습니다. 입력 표식은 실제 딜 여부를 보장하지 않으며, PC 링크 열기는 같은 사람의 기기 이동을 증명하지 않습니다. landing 전체는 재방문이 아닙니다.</p></section>
  <section class="card"><h2>일별 기록 · KST</h2>${table(['날짜', ...TIME_EVENTS.map(e => EV_LABEL[e] || e)], report.daily.map(d => [d.day, ...TIME_EVENTS.map(e => newLabel(e, d[e]))]))}<p class="note">조회에 성공한 범위의 빈 날짜만 0으로 표시합니다. 조회 실패는 0으로 표시하지 않습니다.</p></section>
  <div class="row"><section class="card"><h2>시간대 · KST 방문</h2>${bars(Array.from({ length: 24 }, (_, i) => i + '시'), report.hours)}</section><section class="card"><h2>요일 · KST 방문</h2>${bars(['월', '화', '수', '목', '금', '토', '일'], report.weekdays)}</section></div>
  <section class="card"><h2>기기별 사용</h2>${groupedTable('device', DEVICE_LABEL)}</section>
  <section class="card"><h2>딜 유형별 사용</h2>${groupedTable('deal', DEAL_LABEL)}</section>
  <section class="card"><h2>유입 호스트</h2>${groupedTable('ref')}<p class="note">modelter.com은 최초 유입 미상입니다. 직접 방문·재방문으로 해석하지 않습니다. Teams는 실제 Teams 호스트가 기록된 경우만 표시하며, 출처가 없는 방문을 추정해 합치지 않습니다.</p></section>
  <section class="card"><h2>링크 구분</h2>${groupedTable('src')}<p class="note">src는 링크의 용도입니다. team은 Teams가 아니며, resume은 PC 이어보기 용도입니다.</p></section>
  <section class="card"><h2>준비 중 딜에 대한 관심</h2>${table(['딜', '조회 가능한 최근 90일 클릭'], Object.entries(report.retentionDemand.byDeal).sort((a, b) => b[1] - a[1]).map(([k, n]) => [DEAL_LABEL[k] || k, num(n)]))}<p class="note">${periodText(p.retention)} 조회 결과입니다. Analytics Engine의 약 90일 보존 한계로 과거 일부가 없을 수 있습니다. 전체 누적이나 고유 사용자 수가 아니며, 클릭 수만으로 새 유형 개발을 결정하지 않습니다.</p></section>
  <section class="card"><details><summary>전체 이벤트 주간 비교</summary>${table(['이벤트', '설명', '이전 7일', '최근 7일'], allEvents.map(e => [e, EV_LABEL[e] || '', num(w.prev[e] || 0), num(w.this[e] || 0)]))}</details></section>
  <p class="note">각 수치는 sum(_sample_interval)의 표본 가중 추정치입니다. 차원별 조회의 표본 차이는 availability.reconciliation에 남깁니다. 겹치는 기간 보고서를 합산하지 않습니다. 새 기록과 모바일 이름 단계 변경의 배포일을 경계로 비교해야 합니다. 2026년 8월 고정 실험은 과거 기록이며 현재 성과 판정에 사용하지 않습니다. 딜 수치·이름·임차인·사용자 식별자·전체 링크는 수집하지 않습니다.</p>`);
}
function markdown(report) {
  const p = report.periods.selected, w = report.weeks;
  return [`# 모델터 사용 보고서`, `${p.start} ~ ${addDays(p.endExclusive, -1)} KST · 생성 ${report.generatedAt}`, `자료 상태: ${report.availability.status}`, '', '| 항목 | 이전 완료 7일 | 최근 완료 7일 |', '|---|---:|---:|', ...['session', 'activate', 'computed', 'xlsx_download', 'xlsx_ready', 'xlsx_error', 'ws_save', 'ws_restore', 'resume_copy'].map(e => `| ${EV_LABEL[e]} | ${NEW_EVENTS.includes(e) && !w.prev[e] ? '미관측' : num(w.prev[e] || 0)} | ${NEW_EVENTS.includes(e) && !w.this[e] ? '미관측' : num(w.this[e] || 0)} |`), '', '방문·행동 횟수이며 사용자 전환율·실제 딜 수가 아닙니다. 생성 완료는 디스크 저장 완료가 아닙니다.', '상세 보고서는 비공개 저장소에서만 보관합니다. 겹치는 기간을 합산하지 않습니다.', ''].join('\n');
}

async function runSQL(sql, account, token) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'text/plain' }, body: sql, signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error('Analytics Engine HTTP ' + res.status);
  let j; try { j = await res.json(); } catch (_) { throw new Error('Analytics Engine 응답을 읽지 못했습니다.'); }
  if (!j || j.success === false || (Array.isArray(j.errors) && j.errors.length) || !Array.isArray(j.data)) throw new Error('Analytics Engine 집계가 누락되었습니다.');
  return j.data;
}
function write(file, content) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
function parseArgs(argv) {
  const options = { days: 30, out: path.join(ROOT, 'data', 'patterns.html'), json: '', md: '', fixture: '', endDate: '', account: process.env.CF_ACCOUNT_ID || '', token: process.env.CF_API_TOKEN || '', includeBots: false, sql: false };
  const fields = { days: 'days', out: 'out', json: 'json', md: 'md', fixture: 'fixture', 'end-date': 'endDate', account: 'account', token: 'token' };
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    if (name === '--include-bots') options.includeBots = true;
    else if (name === '--sql') options.sql = true;
    else if (name.startsWith('--') && fields[name.slice(2)] && argv[i + 1] && !argv[i + 1].startsWith('--')) options[fields[name.slice(2)]] = argv[++i];
    else throw new Error('지원하지 않거나 값이 빠진 인자가 있습니다.');
  }
  return options;
}
async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv), now = new Date(), periods = makePeriods({ days: options.days, endDate: options.endDate, now });
  const queries = buildQueries(periods, options.includeBots);
  if (options.sql) { console.log(JSON.stringify(queries, null, 2)); return; }
  const raw = {}, availability = { status: 'unavailable', queries: Object.fromEntries(Object.keys(queries).map(k => [k, { status: 'not-run' }])) };
  try {
    assertRetainedPeriods(periods, now);
    if (options.fixture) {
      const input = JSON.parse(fs.readFileSync(options.fixture, 'utf8'));
      for (const key of Object.keys(queries)) { validateRows(input[key], key); raw[key] = input[key]; availability.queries[key] = { status: 'ok', rows: raw[key].length }; }
    } else {
      if (!options.account || !options.token) throw new Error('조회용 CF_ACCOUNT_ID · CF_API_TOKEN이 필요합니다.');
      for (const [key, sql] of Object.entries(queries)) {
        try { raw[key] = await runSQL(sql, options.account, options.token); validateRows(raw[key], key); availability.queries[key] = { status: 'ok', rows: raw[key].length }; }
        catch (e) { availability.queries[key] = { status: 'failed' }; throw e; }
      }
    }
    const report = buildReport(raw, periods, { now, includeBots: options.includeBots, fixture: !!options.fixture });
    write(options.out, render(report));
    if (options.json) write(options.json, JSON.stringify(report, null, 2) + '\n');
    if (options.md) write(options.md, markdown(report));
    console.log('보고서 생성 완료 · ' + report.availability.status + ' · ' + report.reportKey);
  } catch (e) {
    // 이전 실행의 HTML/JSON을 정상 결과로 재사용하지 못하게 실패 상태로 덮어쓴다. 응답 원문/비밀은 저장하지 않는다.
    if (e.code === 'RETENTION_LIMITED') { availability.retentionLimited = true; availability.reason = 'retention-limited'; }
    const failed = { schema: 3, timezone: 'Asia/Seoul', generatedAt: now.toISOString(), periods, availability, events: null, weeks: null, cross: null };
    write(options.out, page('<h1>사용 보고서를 확인할 수 없습니다</h1><p>조회나 검증이 완료되지 않았습니다. 이 보고서에는 0건이나 이전 실행의 수치를 대신 표시하지 않습니다.</p>'));
    if (options.json) write(options.json, JSON.stringify(failed, null, 2) + '\n');
    if (options.md) write(options.md, '# 모델터 사용 보고서\n\n조회 또는 검증 실패. 사용량을 0건으로 해석하지 마세요.\n');
    throw e;
  }
}
if (require.main === module) main().catch(e => { console.error('보고서 생성 실패: ' + e.message); process.exitCode = 1; });
module.exports = { DAY, KST, ROW_LIMIT, NEW_EVENTS, CORE_EVENTS, TIME_EVENTS, makePeriods, assertRetainedPeriods, addDays, kstDate, buildQueries, validateRows, timeBuckets, buildReport, render, markdown, sourceLabel, parseArgs, runSQL, main };
