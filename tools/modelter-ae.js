#!/usr/bin/env node
/* 모델터 계기판 (Analytics Engine) — 며칠치 누적 사용을 SQL로 조회해 퍼널·기능채택으로 집계
 *
 * Workers Logs(wrangler tail)는 실시간·단기 보존이라 "지난 며칠"이 안 보입니다.
 * 이 스크립트는 Analytics Engine 데이터셋(Modelter)에 SQL을 던져 누적 데이터를 봅니다.
 *
 * 준비물 (본인 Cloudflare 계정):
 *   · 계정 ID   — 대시보드 우측 또는 Workers 개요에 표시
 *   · API 토큰  — My Profile → API Tokens → Create Token
 *                 권한: "Account Analytics : Read" (그 계정 범위)
 *
 * 사용:
 *   CF_ACCOUNT_ID=xxxx CF_API_TOKEN=yyyy node tools/modelter-ae.js
 *   node tools/modelter-ae.js --account xxxx --token yyyy --days 14
 *   node tools/modelter-ae.js --sql        # 실행하지 않고 SQL 쿼리문만 출력(대시보드/curl용)
 *
 * 수집 원칙(불변): 이벤트명·딜유형·활성기능 플래그·기기·유입 호스트만. 수치·PII 없음.
 *
 * AE 스키마 (worker.js writeDataPoint 기준):
 *   blob1=이벤트  blob2=딜  blob3=깊이  blob4=기기  blob5=유입호스트  blob6=국가  blob7=feats  blob8=axis  blob9=src(채널)  blob10=bot(자동화 태깅 — 기본 제외, --include-bots로 포함)  blob11=act(실사용 표식 — 자기 숫자 입력 세션, 북극성 K3)
 *   double1=rr    double2=featN    index1=이벤트    _sample_interval=표본가중치(합이 추정 실건수)
 *
 * 채널 어트리뷰션:
 *   node tools/modelter-ae.js --attribution   # src·유입호스트별 session→activate→computed→output 퍼널 분해
 */
'use strict';

const DATASET = 'Modelter';
// 산출물 목록·라벨은 공용 모듈에서(report.js 와 단일 진실 공유 — 드리프트 방지)
const { OUTPUT_EVENTS, FIRST_NUMBER_BUCKETS, FEAT_LABEL, DEAL_LABEL } = require('./modelter-labels');

// ── 인자 파싱 ──
function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return def;
}
const FLAG_SQL = process.argv.includes('--sql');
const FLAG_SNAPSHOT = process.argv.includes('--snapshot');   // 집계를 data/ae-snapshots/<날짜>.json 으로 누적 저장
const FLAG_ATTR = process.argv.includes('--attribution');    // src·유입호스트별 퍼널 분해 추가 출력
const ACCOUNT = arg('account', process.env.CF_ACCOUNT_ID || '');
const TOKEN = arg('token', process.env.CF_API_TOKEN || '');
const DAYS = parseInt(arg('days', '7'), 10) || 7;
const FLAG_BOTS = process.argv.includes('--include-bots');  // 기본은 봇 제외(blob10='1' 태깅분) — 구 데이터(blob10='')는 그대로 포함
const BOT_FILTER = FLAG_BOTS ? '' : " AND blob10 != '1'";
const WHERE = `timestamp > now() - INTERVAL '${DAYS}' DAY` + BOT_FILTER;

// ── 쿼리 정의 ──
const Q = {
  events: `SELECT blob1 AS k, sum(_sample_interval) AS n FROM ${DATASET} WHERE ${WHERE} GROUP BY k ORDER BY n DESC`,
  deals: `SELECT blob2 AS k, sum(_sample_interval) AS n FROM ${DATASET} WHERE ${WHERE} AND blob2 != '' GROUP BY k ORDER BY n DESC`,
  depth: `SELECT blob3 AS k, sum(_sample_interval) AS n FROM ${DATASET} WHERE ${WHERE} AND blob3 != '' GROUP BY k ORDER BY n DESC`,
  device: `SELECT blob4 AS k, sum(_sample_interval) AS n FROM ${DATASET} WHERE ${WHERE} AND blob4 != '' GROUP BY k ORDER BY n DESC`,
  ref: `SELECT blob5 AS k, sum(_sample_interval) AS n FROM ${DATASET} WHERE ${WHERE} AND blob5 != '' GROUP BY k ORDER BY n DESC LIMIT 8`,
  feats: `SELECT blob7 AS k, sum(_sample_interval) AS n FROM ${DATASET} WHERE ${WHERE} AND blob7 != '' GROUP BY k`,
  src: `SELECT blob9 AS k, sum(_sample_interval) AS n FROM ${DATASET} WHERE ${WHERE} AND blob9 != '' GROUP BY k ORDER BY n DESC LIMIT 12`,
};
// 채널별 퍼널 — (채널, 이벤트) 2차원 집계. blob9=src / blob5=유입호스트 기준으로 각각 분해.
const Q_ATTR_SRC = `SELECT blob9 AS g, blob1 AS k, sum(_sample_interval) AS n FROM ${DATASET} WHERE ${WHERE} GROUP BY g, k`;
const Q_ATTR_REF = `SELECT blob5 AS g, blob1 AS k, sum(_sample_interval) AS n FROM ${DATASET} WHERE ${WHERE} GROUP BY g, k`;
// 일자별 핵심 이벤트 시계열 — 한 번의 스냅샷 안에서도 추세를 보이게 (best-effort: AE 날짜함수 실패 시 생략)
const Q_DAILY = `SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS d, blob1 AS k, sum(_sample_interval) AS n FROM ${DATASET} WHERE ${WHERE} GROUP BY d, k ORDER BY d`;
/* 북극성(K3) — 산출물이 '자기 숫자'로 만들어졌는지. blob11=act(1=활성화 세션). 2026-07-26 계측 개시.
   blob11='' 은 미계측 구간이므로 unknown 으로 분리한다(act/nonact 와 합치면 기준선이 오염됨). */
const Q_ACT_OUT = `SELECT blob11 AS a, sum(_sample_interval) AS n FROM ${DATASET} WHERE ${WHERE} AND blob1 IN (${OUTPUT_EVENTS.map(e => `'${e}'`).join(',')}) GROUP BY a`;
/* 북극성 팀 전달 — 2026-08-15 KST 배포 뒤의 사전 등록 14일 창만 센다.
   종료 상한이 없으면 뒤늦게 생성한 스냅샷의 누적값이 계속 커져 14일 판정을 왜곡한다.
   메뉴 발견(handoff_open)·실제 링크 생성(share_link)은 act 여부로 분리하고,
   같은 고정 창의 session·activate도 함께 저장해 활성화율 기준을 정확히 판정한다.
   이 절대기간 쿼리에는 최근 DAYS 조건을 섞지 않는다. */
const TEAM_HANDOFF_SINCE_UTC = '2026-08-14 23:03:30';
const TEAM_HANDOFF_UNTIL_UTC = '2026-08-28 23:03:30';
const TEAM_WINDOW_EVENTS = ['session', 'activate', 'handoff_open', 'share_link'];
const Q_TEAM_HANDOFF = `SELECT blob1 AS e, blob11 AS a, sum(_sample_interval) AS n FROM ${DATASET} WHERE timestamp >= toDateTime('${TEAM_HANDOFF_SINCE_UTC}') AND timestamp < toDateTime('${TEAM_HANDOFF_UNTIL_UTC}')${BOT_FILTER} AND blob1 IN (${TEAM_WINDOW_EVENTS.map(e => `'${e}'`).join(',')}) GROUP BY e, a`;
/* 첫 숫자 속도 이벤트는 실제 프로덕션 배포 완료(2026-08-15 10:18:30 KST)부터 별도 14일 창을 센다.
   팀 전달보다 2시간 15분 늦게 계측됐으므로 같은 시작시각으로 소급하지 않는다. */
const FIRST_NUMBER_SINCE_UTC = '2026-08-15 01:18:30';
const FIRST_NUMBER_UNTIL_UTC = '2026-08-29 01:18:30';
const Q_FIRST_NUMBER_WINDOW = `SELECT blob1 AS e, sum(_sample_interval) AS n FROM ${DATASET} WHERE timestamp >= toDateTime('${FIRST_NUMBER_SINCE_UTC}') AND timestamp < toDateTime('${FIRST_NUMBER_UNTIL_UTC}')${BOT_FILTER} AND blob1 IN (${FIRST_NUMBER_BUCKETS.map(b => `'${b.event}'`).join(',')}) GROUP BY e`;
/* 딜 커버리지 게이트 — deal_want 는 2026-07-14 부터 브라우저당 유형별 1표(dedupe). 그 이전은 클릭 수라 섞으면 안 된다.
   ⚠ AE 보존기간(약 90일)을 넘기면 이 절대 기간 쿼리는 과소집계된다 — 2026-10 이후엔 커밋된 스냅샷 누적 합산으로 전환할 것. */
const GATE_SINCE = '2026-07-14 00:00:00';
const Q_WANT_GATE = `SELECT blob2 AS k, sum(_sample_interval) AS n FROM ${DATASET} WHERE blob1='deal_want' AND blob2 != '' AND timestamp > toDateTime('${GATE_SINCE}')${FLAG_BOTS ? '' : " AND blob10 != '1'"} GROUP BY k ORDER BY n DESC`;

// ── AE SQL API 호출 ──
async function runSQL(sql) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/analytics_engine/sql`;
  const res = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'text/plain' }, body: sql });
  const txt = await res.text();
  if (!res.ok) throw new Error('HTTP ' + res.status + ' — ' + txt.slice(0, 300));
  let j; try { j = JSON.parse(txt); } catch (e) { throw new Error('응답 파싱 실패: ' + txt.slice(0, 200)); }
  return (j && j.data) ? j.data : [];
}
function toMap(rows) { const m = {}; for (const r of rows) { const k = String(r.k == null ? '' : r.k); m[k] = (m[k] || 0) + Number(r.n || 0); } return m; }

// ── 출력 헬퍼 (modelter-funnel.js와 동일 스타일) ──
function bar(n, max, w) { const x = max > 0 ? Math.round(n / max * w) : 0; return '█'.repeat(x) + '·'.repeat(Math.max(0, w - x)); }
function pct(a, b) { return b > 0 ? (a / b * 100).toFixed(1) + '%' : '—'; }
function rowsOf(obj, opt) {
  opt = opt || {};
  const ents = Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, opt.top || 99);
  const max = ents.length ? ents[0][1] : 0;
  const denom = opt.denom || ents.reduce((s, e) => s + e[1], 0);
  return ents.map(([k, v]) => '   ' + String(k).padEnd(opt.pad || 16) + String(Math.round(v)).padStart(6) + '  ' + bar(v, max, 16) + '  ' + pct(v, denom)).join('\n');
}

function render(data) {
  const ev = data.events, outputs = OUTPUT_EVENTS.reduce((s, e) => s + (ev[e] || 0), 0);
  const S = ev.session || 0, A = ev.activate || 0, C = ev.computed || 0, O = outputs;
  const L = [];
  L.push('');
  L.push('╔══════════════════════════════════════════════════╗');
  L.push('║  모델터 계기판 · Analytics Engine (최근 ' + String(DAYS).padStart(2) + '일)       ║');
  L.push('╚══════════════════════════════════════════════════╝');

  L.push('');
  L.push('■ 활성화 퍼널 (세션당 1회 신호)');
  const fmax = Math.max(S, A, C, O, 1);
  const fl = (label, n, base, suffix) => '   ' + label.padEnd(22) + String(Math.round(n)).padStart(6) + '  ' + bar(n, fmax, 20) + '  ' + (base != null ? pct(n, base) : '') + (suffix || '');
  L.push(fl('방문 (session)', S, null));
  L.push(fl('→ 직접 입력 (activate)', A, S, S ? '  of 방문' : ''));
  L.push(fl('→ 결과 도달 (computed)', C, A, A ? '  of 입력' : ''));
  L.push(fl('→ 산출물 (output)', O, C, C ? '  of 결과' : ''));
  L.push('   ' + '전환(방문→산출물)'.padEnd(22) + ' '.repeat(6) + '  ' + pct(O, S));

  L.push('');
  L.push('■ 산출물 종류');
  const outObj = {}; for (const e of OUTPUT_EVENTS) if (ev[e]) outObj[e] = ev[e];
  L.push(Object.keys(outObj).length ? rowsOf(outObj, { denom: O }) : '   (없음)');

  L.push('');
  L.push('■ 딜 유형 분포');
  const dealObj = {}; for (const k in data.deals) dealObj[DEAL_LABEL[k] || k] = data.deals[k];
  L.push(Object.keys(dealObj).length ? rowsOf(dealObj, { pad: 12 }) : '   (없음)');

  L.push('');
  L.push('■ 활성 기능 채택 (feats)');
  const featObj = {};
  for (const combo in data.feats) { const n = data.feats[combo]; for (const f of combo.split(',')) { if (f) featObj[FEAT_LABEL[f] || f] = (featObj[FEAT_LABEL[f] || f] || 0) + n; } }
  L.push(Object.keys(featObj).length ? rowsOf(featObj, { pad: 14 }) : '   (없음)');

  L.push('');
  L.push('■ 깊이 · 기기 · 유입');
  L.push('  [깊이] ' + (Object.entries(data.depth).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + Math.round(v)).join(' · ') || '—'));
  L.push('  [기기] ' + (Object.entries(data.device).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + Math.round(v) + ' (' + pct(v, S) + ')').join(' · ') || '—'));
  L.push('  [유입] ' + (Object.entries(data.ref).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k + ' ' + Math.round(v)).join(' · ') || '직접/미상'));
  if (data.src) L.push('  [채널] ' + (Object.entries(data.src).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + ' ' + Math.round(v)).join(' · ') || '태그 없음'));

  L.push('');
  L.push('■ 전체 이벤트');
  L.push(rowsOf(ev, { pad: 18 }));
  L.push('');
  return L.join('\n');
}

// ── 채널 어트리뷰션 — (채널, 이벤트) 2차원 집계를 채널별 퍼널로 접기 ──
function attrByGroup(rows) {
  const g = {};
  for (const r of rows) {
    const key = (r.g == null || r.g === '') ? '(직접/미상)' : String(r.g);
    const ev = String(r.k || ''); const n = Number(r.n || 0);
    (g[key] = g[key] || {})[ev] = (g[key][ev] || 0) + n;
  }
  const out = {};
  for (const key in g) out[key] = funnelOf(g[key]);
  return out;
}
function renderAttr(title, byGroup) {
  const L = ['', '■ ' + title];
  const groups = Object.entries(byGroup).sort((a, b) => (b[1].session || 0) - (a[1].session || 0));
  if (!groups.length) { L.push('   (없음)'); return L.join('\n'); }
  L.push('   ' + '채널'.padEnd(14) + '  방문   입력   결과   산출    전환(방문→산출)');
  for (const [k, f] of groups) {
    L.push('   ' + String(k).slice(0, 14).padEnd(14) +
      String(Math.round(f.session)).padStart(5) + String(Math.round(f.activate)).padStart(7) +
      String(Math.round(f.computed)).padStart(7) + String(Math.round(f.output)).padStart(7) +
      '     ' + pct(f.output, f.session));
  }
  return L.join('\n');
}

// ── 스냅샷 누적 저장 — AE는 ~90일만 보관하므로 집계를 git에 커밋해 영구 이력화 ──
function funnelOf(ev) {
  const outputs = OUTPUT_EVENTS.reduce((s, e) => s + (ev[e] || 0), 0);
  return { session: ev.session || 0, activate: ev.activate || 0, computed: ev.computed || 0, output: outputs };
}
// ISO 주차(YYYY-Www) — 주간 스냅샷 식별용
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const yStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil((((t - yStart) / 86400000) + 1) / 7);
  return t.getUTCFullYear() + '-W' + String(wk).padStart(2, '0');
}
const SNAP_SCHEMA = 2;   // 스냅샷 스키마 버전 — 필드 추가(additive)만, 제거·의미 변경 시 인상 + docs/METRICS.md 갱신
// 쓰기 전 검증 — 깨진 스냅샷이 조용히 커밋돼 추세를 오염시키는 것을 차단(부재 필드 = v1 하위호환, 읽기는 관대하게)
function validateSnap(snap) {
  const errs = [];
  for (const k of ['endDate', 'week', 'days', 'generatedAt', 'funnel', 'events']) if (snap[k] == null) errs.push('필수 키 누락: ' + k);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(snap.endDate))) errs.push('endDate 형식(YYYY-MM-DD) 위반: ' + snap.endDate);
  if (!/^\d{4}-W\d{2}$/.test(String(snap.week))) errs.push('week 형식(YYYY-Www) 위반: ' + snap.week);
  const f = snap.funnel || {};
  for (const k of ['session', 'activate', 'computed', 'output']) if (typeof f[k] !== 'number' || !isFinite(f[k])) errs.push('funnel.' + k + ' 숫자 아님');
  if (!snap.events || typeof snap.events !== 'object' || !Object.keys(snap.events).length) errs.push('events 비어 있음');
  if (snap.teamHandoffByAct) {
    const th = snap.teamHandoffByAct;
    for (const k of ['since', 'decisionDate']) if (!/^\d{4}-\d{2}-\d{2}$/.test(String(th[k] || ''))) errs.push('teamHandoffByAct.' + k + ' 날짜 형식 위반');
    const win = th.window || {};
    for (const k of ['session', 'activate']) if (typeof win[k] !== 'number' || !isFinite(win[k])) errs.push('teamHandoffByAct.window.' + k + ' 숫자 아님');
    for (const ev of ['handoff_open', 'share_link']) {
      const row = th[ev] || {};
      for (const k of ['act', 'nonact', 'unknown']) if (typeof row[k] !== 'number' || !isFinite(row[k])) errs.push('teamHandoffByAct.' + ev + '.' + k + ' 숫자 아님');
    }
    if (th.firstNumber) {
      for (const k of ['since', 'until']) if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(String(th.firstNumber[k] || ''))) errs.push('teamHandoffByAct.firstNumber.' + k + ' 시각 형식 위반');
      for (const b of FIRST_NUMBER_BUCKETS) {
        if (typeof th.firstNumber[b.event] !== 'number' || !isFinite(th.firstNumber[b.event])) errs.push('teamHandoffByAct.firstNumber.' + b.event + ' 숫자 아님');
      }
    }
  }
  return errs;
}
async function writeSnapshot(data, daily, attribution, extra) {
  const path = require('path'), fs = require('fs');
  const dir = path.join(__dirname, '..', 'data', 'ae-snapshots');
  fs.mkdirSync(dir, { recursive: true });
  const end = new Date();
  const endDate = end.toISOString().slice(0, 10);
  const snap = {
    schema: SNAP_SCHEMA, botExcluded: !FLAG_BOTS,   // 이 스냅샷의 분모가 봇 제외인지(2026-07-10 이후 기본 true)
    endDate, week: isoWeek(end), days: DAYS, generatedAt: end.toISOString(),
    funnel: funnelOf(data.events),
    events: data.events, deals: data.deals, device: data.device,
    ref: data.ref, feats: data.feats, depth: data.depth, src: data.src || {},
    attribution: attribution || null,
    daily: daily || null,
    // 북극성(K3) 기준선 · 딜 커버리지 게이트 — 둘 다 additive(구 스냅샷 소비자 무영향)
    outputsByAct: (extra && extra.outputsByAct) || null,
    teamHandoffByAct: (extra && extra.teamHandoffByAct) || null,
    dealWantGate: (extra && extra.dealWantGate) || null,
  };
  const errs = validateSnap(snap);
  if (errs.length) { console.error('❌ 스냅샷 스키마 검증 실패 — 저장 안 함:\n  - ' + errs.join('\n  - ')); process.exit(1); }
  const file = path.join(dir, endDate + '.json');
  fs.writeFileSync(file, JSON.stringify(snap, null, 1));
  return path.relative(path.join(__dirname, '..'), file);
}

async function main() {
  if (FLAG_SQL) {
    console.log('# Analytics Engine SQL (대시보드 Query Builder 또는 curl에 붙여 사용)\n');
    for (const [name, sql] of Object.entries(Q)) console.log('-- ' + name + '\n' + sql + '\n');
    console.log('-- attribution_src\n' + Q_ATTR_SRC + '\n');
    console.log('-- attribution_ref\n' + Q_ATTR_REF + '\n');
    console.log('-- team_handoff_fixed_14d\n' + Q_TEAM_HANDOFF + '\n');
    console.log('-- first_number_fixed_14d\n' + Q_FIRST_NUMBER_WINDOW + '\n');
    console.log('# curl 예:\n#   curl "https://api.cloudflare.com/client/v4/accounts/<계정ID>/analytics_engine/sql" \\\n#     -H "Authorization: Bearer <토큰>" --data "' + Q.events + '"');
    return;
  }
  if (!ACCOUNT || !TOKEN) {
    console.error('계정 ID·API 토큰이 필요합니다.\n' +
      '  CF_ACCOUNT_ID=xxxx CF_API_TOKEN=yyyy node tools/modelter-ae.js\n' +
      '  (SQL만 보려면)  node tools/modelter-ae.js --sql\n\n' +
      '토큰: Cloudflare 대시보드 → My Profile → API Tokens → "Account Analytics : Read" 권한으로 발급');
    process.exit(1);
  }
  if (typeof fetch !== 'function') { console.error('Node 18+ 필요 (전역 fetch 없음). node --version 확인.'); process.exit(1); }
  try {
    const data = {};
    for (const [name, sql] of Object.entries(Q)) data[name] = toMap(await runSQL(sql));
    console.log(render(data));
    // 채널 어트리뷰션 — src·유입호스트별 퍼널 분해
    let attribution = null;
    if (FLAG_ATTR || FLAG_SNAPSHOT) {
      try {
        const bySrc = attrByGroup(await runSQL(Q_ATTR_SRC));
        const byRef = attrByGroup(await runSQL(Q_ATTR_REF));
        attribution = { bySrc, byRef };
        if (FLAG_ATTR) {
          console.log(renderAttr('채널(src)별 퍼널 — 어떤 링크가 산출물까지 가나', bySrc));
          console.log(renderAttr('유입 호스트별 퍼널 — 어디서 와서 산출물까지 가나', byRef));
          console.log('');
        }
      } catch (e) { console.error('어트리뷰션 조회 건너뜀: ' + e.message); }
    }
    if (FLAG_SNAPSHOT) {
      let daily = null;
      try {                                            // 일자별 시계열은 best-effort
        const rows = await runSQL(Q_DAILY);
        const byDay = {};
        for (const r of rows) {
          const d = String(r.d || '').slice(0, 10); if (!d) continue;
          (byDay[d] = byDay[d] || {})[String(r.k || '')] = Number(r.n || 0);
        }
        daily = Object.keys(byDay).sort().map(d => Object.assign({ day: d }, byDay[d]));
      } catch (_) { /* 날짜함수 미지원 시 시계열 없이 저장 */ }
      const extra = {};
      try {                                            // 북극성 K3 — 산출물의 act 분해 (best-effort)
        const rows = await runSQL(Q_ACT_OUT);
        const o = { act: 0, nonact: 0, unknown: 0 };
        for (const r of rows) {
          const a = String(r.a == null ? '' : r.a), n = Number(r.n || 0);
          if (a === '1') o.act += n; else if (a === '0') o.nonact += n; else o.unknown += n;
        }
        o.since = '2026-07-26';                        // act 계측 개시일 — unknown 은 그 이전 구간
        extra.outputsByAct = o;
      } catch (e) { console.error('act 분해 조회 건너뜀: ' + e.message); }
      try {                                            // 북극성 팀 전달 — 오계측 분리 배포 이후만
        const [rows, firstRows] = await Promise.all([runSQL(Q_TEAM_HANDOFF), runSQL(Q_FIRST_NUMBER_WINDOW)]);
        const h = {
          since: '2026-08-15',
          decisionDate: '2026-08-29',
          window: { session: 0, activate: 0 },
          handoff_open: { act: 0, nonact: 0, unknown: 0 },
          share_link: { act: 0, nonact: 0, unknown: 0 },
          firstNumber: {
            since: '2026-08-15T10:18:30+09:00',
            until: '2026-08-29T10:18:30+09:00',
            ...Object.fromEntries(FIRST_NUMBER_BUCKETS.map(b => [b.event, 0])),
          },
        };
        for (const r of rows) {
          const e = String(r.e || ''), a = String(r.a == null ? '' : r.a), n = Number(r.n || 0);
          if (e === 'session' || e === 'activate') { h.window[e] += n; continue; }
          if (!h[e]) continue;
          if (a === '1') h[e].act += n; else if (a === '0') h[e].nonact += n; else h[e].unknown += n;
        }
        for (const r of firstRows) {
          const e = String(r.e || '');
          if (Object.prototype.hasOwnProperty.call(h.firstNumber, e)) h.firstNumber[e] += Number(r.n || 0);
        }
        extra.teamHandoffByAct = h;
      } catch (e) { console.error('팀 전달 act 분해 조회 건너뜀: ' + e.message); }
      try {                                            // 딜 커버리지 게이트 (dedupe 이후 절대 기간)
        const rows = await runSQL(Q_WANT_GATE);
        const g = { since: GATE_SINCE.slice(0, 10), target: 50 };
        for (const r of rows) { const k = String(r.k || ''); if (k) g[k] = Number(r.n || 0); }
        extra.dealWantGate = g;
      } catch (e) { console.error('게이트 조회 건너뜀: ' + e.message); }
      const rel = await writeSnapshot(data, daily, attribution, extra);
      console.log('\n📸 스냅샷 저장: ' + rel + '  (git에 커밋하면 영구 누적)');
      console.log('   대시보드 생성:  node tools/modelter-report.js');
    }
  } catch (e) {
    console.error('조회 실패: ' + e.message + '\n\n' +
      '· 계정 ID·토큰과 토큰 권한(Account Analytics : Read)을 확인하세요.\n' +
      '· 데이터셋 이름은 wrangler.toml의 dataset = "' + DATASET + '" 입니다.\n' +
      '· SQL만 확인하려면: node tools/modelter-ae.js --sql');
    process.exit(1);
  }
}

if (require.main === module) main();
module.exports = { Q, Q_TEAM_HANDOFF, Q_FIRST_NUMBER_WINDOW, TEAM_HANDOFF_SINCE_UTC, TEAM_HANDOFF_UNTIL_UTC, FIRST_NUMBER_SINCE_UTC, FIRST_NUMBER_UNTIL_UTC, render, toMap, attrByGroup, renderAttr, funnelOf, isoWeek, validateSnap };
