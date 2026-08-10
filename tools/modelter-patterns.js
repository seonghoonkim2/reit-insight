#!/usr/bin/env node
/* 모델터 사용 패턴 보고서 — Analytics Engine 교차 집계를 자기완결 HTML 한 장으로
 *
 * 계기판(modelter-report.js)이 "무엇이 얼마나"라면, 이 보고서는 "누가·언제·어떻게"입니다:
 * 주간 모멘텀, 일별 추이, 기기별 전환, 딜×산출물, 시간대·요일(KST), 국가, 기능 조합.
 *
 * 사용:
 *   CF_ACCOUNT_ID=... CF_API_TOKEN=... node tools/modelter-patterns.js
 *   node tools/modelter-patterns.js --days 30 --out data/patterns.html
 *
 * 수집 원칙(불변): 이벤트명·딜유형·기능플래그·기기·유입호스트·국가만. 수치·임차인명·PII 없음.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { OUTPUT_EVENTS, DEAL_LABEL, EV_LABEL, FEAT_LABEL, DEVICE_LABEL } = require('./modelter-labels');

function arg(name, def) { const i = process.argv.indexOf('--' + name); return (i >= 0 && process.argv[i + 1]) ? process.argv[i + 1] : def; }
const ROOT = path.join(__dirname, '..');
const OUT = arg('out', path.join(ROOT, 'data', 'patterns.html'));
const DAYS = Math.max(7, parseInt(arg('days', '30'), 10) || 30);
const ACCOUNT = process.env.CF_ACCOUNT_ID || arg('account', '');
const TOKEN = process.env.CF_API_TOKEN || arg('token', '');
const D = 'Modelter';
const MD = arg('md', '');            // 마크다운 요약 파일( GitHub Actions run Summary 에 그대로 붙임)
const FIXTURE = arg('fixture', '');  // 쿼리 결과 JSON 고정 입력 — 토큰 없는 환경에서 렌더 검증용
const INCLUDE_BOTS = process.argv.includes('--include-bots');
const BOTW = INCLUDE_BOTS ? '' : " AND blob10 != '1'";   // 봇 태깅분 기본 제외(구 데이터 blob10=''는 포함)
const W = `timestamp > now() - INTERVAL '${DAYS}' DAY${BOTW}`;

/* 데이터 주의 각주(날짜 상수) — 이 날짜들이 창에 걸릴 때만 의미가 있으나, 항상 명시해 오독 방지 */
const NOTE_ACTIVATE_SINCE = '2026-07-07';   // activate·computed 신호가 존재하기 시작한 날
const NOTE_FIX_DEPLOYED = '2026-07-09';     // 계측 보정(리파이·분양그리드·렌트롤·IM 경로) 배포일

const Q = {
  daily: `SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS d, blob1 AS ev, sum(_sample_interval) AS n FROM ${D} WHERE ${W} AND blob1 IN ('session','activate','computed','xlsx_download','prompt_copy') GROUP BY d, ev ORDER BY d`,
  wow: `SELECT if(timestamp > now() - INTERVAL '7' DAY, 'this', 'prev') AS w, blob1 AS ev, sum(_sample_interval) AS n FROM ${D} WHERE timestamp > now() - INTERVAL '14' DAY${BOTW} GROUP BY w, ev`,
  dealOut: `SELECT blob2 AS deal, blob1 AS ev, sum(_sample_interval) AS n FROM ${D} WHERE ${W} AND blob1 IN (${OUTPUT_EVENTS.map(e => `'${e}'`).join(',')}) GROUP BY deal, ev`,
  devEv: `SELECT blob4 AS dev, blob1 AS ev, sum(_sample_interval) AS n FROM ${D} WHERE ${W} AND blob1 IN ('session','deal_select','activate','computed','xlsx_download','prompt_copy','onboard') GROUP BY dev, ev`,
  hour: `SELECT toHour(timestamp) AS h, sum(_sample_interval) AS n FROM ${D} WHERE ${W} AND blob1='session' GROUP BY h ORDER BY h`,
  dow: `SELECT toDayOfWeek(timestamp) AS dw, sum(_sample_interval) AS n FROM ${D} WHERE ${W} AND blob1='session' GROUP BY dw ORDER BY dw`,
  cc: `SELECT blob6 AS cc, sum(_sample_interval) AS n FROM ${D} WHERE ${W} AND blob1='session' GROUP BY cc ORDER BY n DESC LIMIT 8`,
  axis: `SELECT blob8 AS k, sum(_sample_interval) AS n FROM ${D} WHERE ${W} AND blob1='sens_axis' AND blob8!='' GROUP BY k ORDER BY n DESC LIMIT 8`,
  depth: `SELECT blob3 AS k, sum(_sample_interval) AS n FROM ${D} WHERE ${W} AND blob1='deal_select' AND blob3!='' GROUP BY k ORDER BY n DESC`,
  featCombo: `SELECT blob7 AS k, sum(_sample_interval) AS n FROM ${D} WHERE ${W} AND blob7!='' AND blob1='computed' GROUP BY k ORDER BY n DESC LIMIT 8`,
  dealWant: `SELECT blob2 AS k, sum(_sample_interval) AS n FROM ${D} WHERE ${W} AND blob1='deal_want' GROUP BY k ORDER BY n DESC LIMIT 10`,
  refFun: `SELECT blob5 AS g, blob1 AS ev, sum(_sample_interval) AS n FROM ${D} WHERE ${W} AND blob1 IN ('session','activate','computed',${OUTPUT_EVENTS.map(e => `'${e}'`).join(',')}) GROUP BY g, ev`,
  srcFun: `SELECT blob9 AS g, blob1 AS ev, sum(_sample_interval) AS n FROM ${D} WHERE ${W} AND blob9!='' AND blob1 IN ('session','activate','computed',${OUTPUT_EVENTS.map(e => `'${e}'`).join(',')}) GROUP BY g, ev`,
  // 북극성 K3 — 자기 숫자를 넣은 세션(blob11=act)의 산출물. act 계측 배포(2026-07-26) 이전 데이터는 blob11=''
  actOut: `SELECT if(timestamp > now() - INTERVAL '7' DAY, 'this', 'prev') AS w, blob11 AS act, sum(_sample_interval) AS n FROM ${D} WHERE timestamp > now() - INTERVAL '14' DAY${BOTW} AND blob1 IN (${OUTPUT_EVENTS.map(e => `'${e}'`).join(',')}) GROUP BY w, act`,
  /* 커버리지 게이트 — deal_want 는 2026-07-14 부터 브라우저당 유형별 1표. 조회 창(--days)과 무관한 절대 기간 누적.
     ⚠ AE 보존기간(약 90일) 초과 시 과소집계 — 2026-10 이후 커밋된 스냅샷 누적 합산으로 전환할 것. */
  wantGate: `SELECT blob2 AS k, sum(_sample_interval) AS n FROM ${D} WHERE blob1='deal_want' AND blob2!='' AND timestamp > toDateTime('2026-07-14 00:00:00')${BOTW} GROUP BY k ORDER BY n DESC`,
};
const GATE_TARGET = 50;

async function runSQL(sql) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/analytics_engine/sql`;
  const res = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'text/plain' }, body: sql });
  const txt = await res.text();
  if (!res.ok) throw new Error('HTTP ' + res.status + ' — ' + txt.slice(0, 200));
  let j; try { j = JSON.parse(txt); } catch (e) { throw new Error('응답 파싱 실패'); }
  return (j && j.data) || [];
}

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = n => Math.round(Number(n) || 0).toLocaleString();
const pct = (a, b) => { a = Number(a) || 0; b = Number(b) || 0; return b > 0 ? (a / b * 100).toFixed(1) + '%' : '—'; };
const AXIS_LABEL = { rate: '금리', growth: '성장률', cap: 'Exit Cap', price: '분양가', sold: '분양률' };
const DEPTH_LABEL = { standard: '표준', deep: '심화', quick: '빠른 검토' };
const DOW_LABEL = ['', '월', '화', '수', '목', '금', '토', '일'];

/* ── 라인차트(멀티 시리즈 · 점선 이중부호화 · 호버 툴팁) ── */
function lineChart(id, labels, sets) {
  const Wc = 720, H = 210, P = { l: 42, r: 14, t: 14, b: 26 };
  const all = sets.reduce((a, s) => a.concat(s.data), []);
  const max = Math.max(1, ...all);
  const n = labels.length;
  const x = i => P.l + (n <= 1 ? 0 : (Wc - P.l - P.r) * i / (n - 1));
  const y = v => H - P.b - (H - P.t - P.b) * (v / max);
  let svg = `<svg viewBox="0 0 ${Wc} ${H}" class="chart" id="${id}" data-labels="${esc(labels.join('|'))}" data-sets="${esc(JSON.stringify(sets.map(s => ({ name: s.name, data: s.data }))))}">`;
  for (let g = 0; g <= 4; g++) { const gy = P.t + (H - P.t - P.b) * g / 4; svg += `<line x1="${P.l}" y1="${gy}" x2="${Wc - P.r}" y2="${gy}" class="grid"/><text x="${P.l - 5}" y="${gy + 3}" class="axis" text-anchor="end">${Math.round(max * (1 - g / 4))}</text>`; }
  labels.forEach((lb, i) => { if (n <= 12 || i % Math.ceil(n / 12) === 0) svg += `<text x="${x(i)}" y="${H - 8}" class="axis" text-anchor="middle">${esc(lb)}</text>`; });
  sets.forEach(s => {
    svg += `<polyline points="${s.data.map((v, i) => x(i) + ',' + y(v)).join(' ')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-dasharray="${s.dash || ''}"/>`;
    s.data.forEach((v, i) => { svg += `<circle cx="${x(i)}" cy="${y(v)}" r="2.5" fill="${s.color}"/>`; });
  });
  svg += `<line class="xh" x1="0" y1="${P.t}" x2="0" y2="${H - P.b}" stroke="currentColor" opacity="0" stroke-dasharray="2 3"/>`;
  svg += `<rect class="hover" x="${P.l}" y="${P.t}" width="${Wc - P.l - P.r}" height="${H - P.t - P.b}" fill="transparent"/>`;
  svg += '</svg>';
  const legend = sets.map(s => `<span class="lg"><svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="${s.color}" stroke-width="2.5" stroke-dasharray="${s.dash || ''}"/></svg>${esc(s.name)}</span>`).join('');
  const tbl = `<details class="tbl"><summary>표로 보기</summary><div class="tblwrap"><table><tr><th>일자</th>${sets.map(s => '<th>' + esc(s.name) + '</th>').join('')}</tr>${labels.map((lb, i) => '<tr><td>' + esc(lb) + '</td>' + sets.map(s => '<td>' + num(s.data[i]) + '</td>').join('') + '</tr>').join('')}</table></div></details>`;
  return `<div class="ln">${svg}<div class="legend">${legend}</div>${tbl}</div>`;
}

/* ── 세로 막대(시간대·요일) ── */
function colChart(items, opt) {
  opt = opt || {};
  const Wc = 340, H = 150, P = { l: 8, r: 8, t: 16, b: 20 };
  const max = Math.max(1, ...items.map(i => i.v));
  const bw = (Wc - P.l - P.r) / items.length;
  let svg = `<svg viewBox="0 0 ${Wc} ${H}" class="chart">`;
  items.forEach((it, i) => {
    const h = Math.max(1, (H - P.t - P.b) * it.v / max);
    const bx = P.l + i * bw + 1, by = H - P.b - h;
    const hot = it.v === max;
    svg += `<rect x="${bx}" y="${by}" width="${Math.max(1, bw - 2)}" height="${h}" rx="2.5" fill="var(--gold)" opacity="${hot ? 1 : 0.55}"><title>${esc(it.k)}: ${num(it.v)}</title></rect>`;
    if (hot) svg += `<text x="${bx + bw / 2 - 1}" y="${by - 4}" class="axis" text-anchor="middle" font-weight="700">${num(it.v)}</text>`;
    if (items.length <= 8 || i % Math.ceil(items.length / 12) === 0) svg += `<text x="${bx + bw / 2 - 1}" y="${H - 6}" class="axis" text-anchor="middle">${esc(it.k)}</text>`;
  });
  svg += '</svg>';
  return svg;
}

function barList(pairs, opt) {
  opt = opt || {};
  if (!pairs.length) return '<p class="empty">(데이터 없음)</p>';
  const max = pairs[0][1], denom = opt.denom || pairs.reduce((s, p) => s + p[1], 0);
  return '<div class="bars">' + pairs.slice(0, opt.top || 10).map(([k, v]) =>
    `<div class="brow"><span class="bk">${esc(k)}</span><span class="btrack"><span class="bfill" style="width:${max ? v / max * 100 : 0}%"></span></span><span class="bn">${num(v)}<i>${pct(v, denom)}</i></span></div>`).join('') + '</div>';
}

const toPairs = (rows, labelMap) => { const m = {}; for (const r of rows) { const k = String(r.k == null ? '' : r.k); m[k] = (m[k] || 0) + Number(r.n || 0); } return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => [(labelMap && labelMap[k]) || k, v]); };

async function main() {
  let raw = {};
  if (FIXTURE) {
    raw = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    for (const k of Object.keys(Q)) if (!raw[k]) raw[k] = [];
  } else {
    if (!ACCOUNT || !TOKEN) { console.error('CF_ACCOUNT_ID · CF_API_TOKEN 환경변수가 필요합니다.'); process.exit(1); }
    for (const [k, sql] of Object.entries(Q)) raw[k] = await runSQL(sql);
  }

  /* ── 모델 구성 ── */
  const days = [];
  { // 최근 DAYS일의 연속 날짜축 (빈 날 0 채움)
    const byDay = {};
    for (const r of raw.daily) { const d = String(r.d).slice(0, 10); (byDay[d] = byDay[d] || {})[r.ev] = Number(r.n) || 0; }
    const ds = Object.keys(byDay).sort();
    if (ds.length) {
      let cur = new Date(ds[0] + 'T00:00:00Z');
      const end = new Date(ds[ds.length - 1] + 'T00:00:00Z');
      while (cur <= end) { const key = cur.toISOString().slice(0, 10); days.push(Object.assign({ day: key }, byDay[key] || {})); cur = new Date(cur.getTime() + 86400000); }
    }
  }
  const wow = {}; for (const r of raw.wow) { (wow[r.ev] = wow[r.ev] || { prev: 0, this: 0 })[r.w] = Number(r.n) || 0; }
  const wget = ev => wow[ev] || { prev: 0, this: 0 };
  const mult = (a, b) => b > 0 ? (a / b) : (a > 0 ? Infinity : 0);
  const multTxt = (a, b) => b > 0 ? '×' + (a / b).toFixed(1) : (a > 0 ? '신규' : '—');

  const dev = {}; for (const r of raw.devEv) { const d = String(r.dev || ''); (dev[d] = dev[d] || {})[r.ev] = Number(r.n) || 0; }
  const dk = dev.desktop || {}, mb = dev.mobile || {};

  const dealOut = {}; for (const r of raw.dealOut) { const d = String(r.deal || '?'); (dealOut[d] = dealOut[d] || {})[r.ev] = (dealOut[d] && dealOut[d][r.ev] || 0) + (Number(r.n) || 0); }

  const hours = []; { const m = {}; for (const r of raw.hour) m[Number(r.h)] = Number(r.n) || 0; for (let k = 0; k < 24; k++) { const kst = (k + 9) % 24; hours.push({ kst, v: m[k] || 0 }); } hours.sort((a, b) => a.kst - b.kst); }
  const dows = []; { const m = {}; for (const r of raw.dow) m[Number(r.dw)] = Number(r.n) || 0; for (let i = 1; i <= 7; i++) dows.push({ k: DOW_LABEL[i], v: m[i] || 0 }); }

  /* ── 수요·유입/채널 퍼널·전 이벤트(주간 비교) ── */
  function funBy(rows) {
    const m = {};
    for (const r of rows || []) {
      const g = String(r.g == null ? '' : r.g) || '(직접/미상)';
      const o = m[g] = m[g] || { session: 0, activate: 0, computed: 0, output: 0 };
      const ev = String(r.ev), n = Number(r.n) || 0;
      if (ev === 'session' || ev === 'activate' || ev === 'computed') o[ev] += n; else o.output += n;
    }
    return Object.entries(m).sort((a, b) => b[1].session - a[1].session);
  }
  const refFun = funBy(raw.refFun), srcFun = funBy(raw.srcFun);
  const dealWantPairs = (raw.dealWant || []).map(r => [DEAL_LABEL[r.k] || String(r.k), Number(r.n) || 0]).sort((a, b) => b[1] - a[1]);
  // 커버리지 게이트 — 누적 표 수 / 목표. 선두 유형이 목표에 닿으면 해당 딜 구현 착수.
  const gatePairs = (raw.wantGate || []).map(r => [DEAL_LABEL[r.k] || String(r.k), Number(r.n) || 0]).sort((a, b) => b[1] - a[1]);
  const gateLead = gatePairs[0] || null;
  const evRows = Object.entries(wow).map(([ev, w]) => [ev, w.this || 0, w.prev || 0]).sort((a, b) => b[1] - a[1]);

  /* KPI v1 트래커 (docs/STRATEGY.md 2026-07-13 확정) — K3 = act 플래그가 붙은 산출물(북극성) */
  const _s7 = wget('session');
  //  act 계측 배포(2026-07-26) 이전 이벤트는 blob11=''이므로 '1'만 실사용으로 집계.
  //  아직 표식이 하나도 없으면(배포 직후) 기준선 수집 중임을 그대로 표기해 0을 성과 하락으로 오독하지 않게 함.
  const actAgg = { this: 0, prev: 0 }; let actTagged = 0;
  for (const r of (raw.actOut || [])) {
    const n = Number(r.n) || 0;
    if (String(r.act) === '1') { actAgg[r.w === 'this' ? 'this' : 'prev'] += n; actTagged += n; }
  }
  const k3Val = actTagged > 0 ? num(actAgg.this) + '건' : '기준선 수집 중';
  const k3Goal = actTagged > 0 ? ('전주 ' + num(actAgg.prev) + ' · 8월 기준선 → +30%') : 'act 계측 2026-07-26 배포 → 8월 기준선';
  const kpiV1 = [
    ['K1 주간 방문', num(_s7.this), '목표 800', _s7.this >= 800],
    ['K2 활성화율', pct(wget('activate').this, _s7.this), '목표 10%+ (다음 15%)', _s7.this > 0 && wget('activate').this / _s7.this >= 0.10],
    ['K3 실사용 산출물', k3Val, k3Goal, actTagged > 0 ? (actAgg.this >= actAgg.prev) : null],
    ['K4 회수 재진입(착지)', num(wget('landing').this), '목표 주 15', (wget('landing').this || 0) >= 15],
  ];

  /* ── 자동 관찰(규칙 기반 · 데이터 없으면 생략) ── */
  const obs = [];
  const sW = wget('session');
  if (sW.prev >= 10 && mult(sW.this, sW.prev) >= 1.5) obs.push(`방문이 주간 <b>${multTxt(sW.this, sW.prev)}</b> (${num(sW.prev)} → ${num(sW.this)}) — 성장 구간입니다.`);
  else if (sW.prev >= 10 && mult(sW.this, sW.prev) <= 0.67) obs.push(`방문이 주간 <b>${multTxt(sW.this, sW.prev)}</b> (${num(sW.prev)} → ${num(sW.this)}) — 감속 신호, 유입원 점검이 필요합니다.`);
  { // 최다 성장 산출물
    let best = null;
    for (const ev of OUTPUT_EVENTS) { const w = wget(ev); if (w.this >= 5 && w.this > w.prev && (!best || mult(w.this, w.prev) > mult(best.w.this, best.w.prev))) best = { ev, w }; }
    if (best) obs.push(`가장 빠르게 크는 산출물은 <b>${EV_LABEL[best.ev] || best.ev}</b> (${num(best.w.prev)} → ${num(best.w.this)}, ${multTxt(best.w.this, best.w.prev)}).`);
  }
  { const dr = (dk.xlsx_download || 0) / Math.max(1, dk.session || 0), mr = (mb.xlsx_download || 0) / Math.max(1, mb.session || 0);
    if ((mb.session || 0) >= 30 && dr > 0 && mr > 0 && dr / mr >= 2) obs.push(`모바일은 방문의 ${pct(mb.session, (mb.session || 0) + (dk.session || 0))}인데 방문당 엑셀이 데스크톱의 <b>1/${(dr / mr).toFixed(1)}</b> — 유입 채널 규명(E5 src 태그)이 필요합니다.`); }
  { const a7 = wget('activate').this, s7 = wget('session').this; if (s7 >= 30 && a7 > 0) obs.push(`최근 7일 활성화율(직접 입력/방문)은 <b>${pct(a7, s7)}</b>.`); }
  { const peakH = hours.slice().sort((a, b) => b.v - a.v)[0], peakD = dows.slice().sort((a, b) => b.v - a.v)[0];
    if (peakH && peakH.v > 0 && peakD && peakD.v > 0) obs.push(`피크는 <b>${peakD.k}요일 · ${peakH.kst}시(KST)</b> — 업무시간 도구 패턴.`); }

  /* ── 렌더 ── */
  const genAt = new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' KST';
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  const kpiDefs = [
    ['방문 (7일)', num(sW.this), sW.prev ? '전주 ' + num(sW.prev) + ' · ' + multTxt(sW.this, sW.prev) : '최근 7일'],
    ['엑셀 (7일)', num(wget('xlsx_download').this), '전주 ' + num(wget('xlsx_download').prev) + ' · ' + multTxt(wget('xlsx_download').this, wget('xlsx_download').prev)],
    ['AI프롬프트 (7일)', num(wget('prompt_copy').this), '전주 ' + num(wget('prompt_copy').prev) + ' · ' + multTxt(wget('prompt_copy').this, wget('prompt_copy').prev)],
    ['활성화율 (7일)', pct(wget('activate').this, sW.this), '직접 입력 / 방문'],
    ['결과 도달 (7일)', num(wget('computed').this), '자기 딜 결과'],
  ];
  const kpis = kpiDefs.map(k => `<div class="kpi"><div class="kv">${k[1]}</div><div class="kl">${esc(k[0])}</div><div class="ks">${esc(k[2])}</div></div>`).join('');

  const trend = days.length >= 2 ? lineChart('trend',
    days.map(d => d.day.slice(5)),
    [
      { name: '방문', color: 'var(--gold)', dash: '', data: days.map(d => d.session || 0) },
      { name: '엑셀', color: 'var(--green)', dash: '5 3', data: days.map(d => d.xlsx_download || 0) },
      { name: '직접입력', color: 'var(--red)', dash: '1.5 3', data: days.map(d => d.activate || 0) },
    ]) : '<p class="empty">(일별 데이터 부족)</p>';

  /* 기기 비교 — 방문당 비율 */
  const devRows = [
    ['방문', num(dk.session || 0), num(mb.session || 0)],
    ['방문당 딜 선택', pct(dk.deal_select, dk.session), pct(mb.deal_select, mb.session)],
    ['방문당 직접 입력', pct(dk.activate, dk.session), pct(mb.activate, mb.session)],
    ['방문당 엑셀', pct(dk.xlsx_download, dk.session), pct(mb.xlsx_download, mb.session)],
    ['AI프롬프트 복사', num(dk.prompt_copy || 0), num(mb.prompt_copy || 0)],
  ].map(r => `<tr><td>${esc(r[0])}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('');

  /* 딜 × 산출물 매트릭스 (상위 산출물 열만) */
  const outCols = OUTPUT_EVENTS.map(ev => [ev, Object.values(dealOut).reduce((s, o) => s + (o[ev] || 0), 0)]).filter(c => c[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 6).map(c => c[0]);
  const dealRowsArr = Object.entries(dealOut).map(([d, o]) => [d, o, Object.values(o).reduce((s, v) => s + v, 0)]).sort((a, b) => b[2] - a[2]);
  const dealMatrix = dealRowsArr.length ? `<div class="tblwrap"><table class="mx"><tr><th>딜</th>${outCols.map(c => '<th>' + esc(EV_LABEL[c] || c) + '</th>').join('')}<th>합계</th></tr>` +
    dealRowsArr.map(([d, o, tot]) => `<tr><td>${esc(DEAL_LABEL[d] || d)}</td>${outCols.map(c => '<td' + ((o[c] || 0) === 0 ? ' class="z"' : '') + '>' + (o[c] ? num(o[c]) : '·') + '</td>').join('')}<td><b>${num(tot)}</b></td></tr>`).join('') + '</table></div>' : '<p class="empty">(데이터 없음)</p>';

  const featPairs = (() => { const m = {}; for (const r of raw.featCombo) { for (const f of String(r.k).split(',')) { if (f) m[FEAT_LABEL[f] || f] = (m[FEAT_LABEL[f] || f] || 0) + Number(r.n || 0); } } return Object.entries(m).sort((a, b) => b[1] - a[1]); })();

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>모델터 사용 패턴</title>
<style>
:root{--bg:#f3f1ec;--panel:#fdfcf9;--ink:#1b2230;--ink2:#46505f;--muted:#8b8f98;--line:#e3e0d8;--line2:#efece4;--gold:#a9792b;--green:#2e7d4f;--red:#b4552d}
@media(prefers-color-scheme:dark){:root{--bg:#14171d;--panel:#1c2027;--ink:#e8eaef;--ink2:#b6bcc7;--muted:#8b919c;--line:#2a3039;--line2:#20252d;--gold:#c99b4e;--green:#4da375;--red:#cf7a52}}
:root[data-theme="dark"]{--bg:#14171d;--panel:#1c2027;--ink:#e8eaef;--ink2:#b6bcc7;--muted:#8b919c;--line:#2a3039;--line2:#20252d;--gold:#c99b4e;--green:#4da375;--red:#cf7a52}
:root[data-theme="light"]{--bg:#f3f1ec;--panel:#fdfcf9;--ink:#1b2230;--ink2:#46505f;--muted:#8b8f98;--line:#e3e0d8;--line2:#efece4;--gold:#a9792b;--green:#2e7d4f;--red:#b4552d}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 -apple-system,"Malgun Gothic","Apple SD Gothic Neo",sans-serif;padding:22px}
.wrap{max-width:960px;margin:0 auto}
h1{font-size:22px;margin:0 0 2px}.sub{color:var(--muted);font-size:12.5px;margin:0 0 18px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:15px 17px;margin-bottom:14px}
.card h2{font-size:14px;margin:0 0 11px;font-weight:700}.card h2 span{font-weight:500;color:var(--muted);font-size:11.5px;margin-left:6px}
.grid5{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:14px}
@media(max-width:720px){.grid5{grid-template-columns:repeat(2,1fr)}}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 13px}
.kv{font-size:22px;font-weight:800;color:var(--gold);font-variant-numeric:tabular-nums;line-height:1.1}
.kl{font-size:12px;font-weight:600;color:var(--ink2);margin-top:4px}.ks{font-size:10.5px;color:var(--muted);margin-top:1px;font-variant-numeric:tabular-nums}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media(max-width:720px){.row2{grid-template-columns:1fr}}
.chart{width:100%;height:auto}.grid{stroke:var(--line2)}.axis{fill:var(--muted);font-size:9px}
.legend{display:flex;gap:14px;margin-top:6px;font-size:11.5px;color:var(--ink2)}.lg svg{margin-right:5px;vertical-align:-1px}
.obs{margin:0;padding-left:18px}.obs li{margin:4px 0}
.bars{display:flex;flex-direction:column;gap:7px}
.brow{display:flex;align-items:center;gap:9px}.bk{min-width:88px;font-size:12px;color:var(--ink2)}
.btrack{flex:1;height:9px;background:var(--line2);border-radius:6px;overflow:hidden}
.bfill{display:block;height:100%;background:var(--gold);border-radius:6px}
.bn{min-width:72px;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;font-size:12.5px}.bn i{font-style:normal;color:var(--muted);font-weight:500;font-size:10.5px;margin-left:5px}
.tblwrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums}
th,td{border:1px solid var(--line2);padding:5px 9px;text-align:right}th{color:var(--ink2);font-weight:600;background:var(--bg)}
td:first-child,th:first-child{text-align:left}.mx td.z{color:var(--muted)}
.tbl{margin-top:8px;font-size:12px}.tbl summary{cursor:pointer;color:var(--muted)}
.note,.empty{font-size:11px;color:var(--muted)}.note{margin:9px 0 0;line-height:1.6}
.gate{margin-top:12px;padding-top:10px;border-top:1px solid var(--line)}
.gate-h{font-size:11.5px;font-weight:700;color:var(--ink-2);margin-bottom:6px}
.gate-h span{font-weight:400;color:var(--muted)}
.gbar{display:inline-block;width:70px;height:6px;border-radius:3px;background:var(--line);vertical-align:middle;overflow:hidden;margin-right:5px}
.gfill{display:block;height:100%;background:var(--accent);border-radius:3px}
.up{color:var(--green)}
.foot{font-size:11px;color:var(--muted);margin-top:16px;line-height:1.7}
.tip{position:fixed;pointer-events:none;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:6px 9px;font-size:11.5px;box-shadow:0 4px 14px rgba(0,0,0,.12);opacity:0;transition:opacity .12s;font-variant-numeric:tabular-nums;z-index:9}
</style></head><body><div class="wrap">
<h1>모델터 사용 패턴</h1>
<p class="sub">기준 ${today} · 최근 ${DAYS}일 · 생성 ${genAt} · 익명 집계(수치·PII 없음)</p>

<div class="grid5">${kpis}</div>

${obs.length ? `<div class="card"><h2>핵심 관찰 <span>자동 산출</span></h2><ul class="obs">${obs.map(o => '<li>' + o + '</li>').join('')}</ul></div>` : ''}

<div class="card"><h2>KPI v1 트래커 <span>주 7일 창 · 목표는 docs/STRATEGY.md</span></h2>
<div class="tblwrap"><table><tr><th>지표</th><th>이번 주</th><th>목표</th><th>상태</th></tr>${kpiV1.map(k => `<tr><td>${esc(k[0])}</td><td>${esc(k[1])}</td><td>${esc(k[2])}</td><td>${k[3] === null ? '—' : (k[3] ? '✅ 달성' : '진행 중')}</td></tr>`).join('')}</table></div></div>

<div class="card"><h2>일별 추이 <span>방문 · 엑셀 · 직접입력</span></h2>${trend}</div>

<div class="row2">
  <div class="card"><h2>시간대 <span>KST · 세션</span></h2>${colChart(hours.map(h => ({ k: h.kst + '', v: h.v })))}
    <p class="note">한국 업무시간 패턴이면 8~18시에 몰립니다.</p></div>
  <div class="card"><h2>요일 <span>세션</span></h2>${colChart(dows)}</div>
</div>

<div class="row2">
  <div class="card"><h2>기기별 행동 <span>방문당 비율</span></h2>
    <div class="tblwrap"><table><tr><th></th><th>데스크톱</th><th>모바일</th></tr>${devRows}</table></div>
    <p class="note">모바일 유입이 커도 작업 전환이 낮으면 "링크 확인" 방문일 가능성 — src 태그(E5)로 확인.</p></div>
  <div class="card"><h2>딜 × 산출물 <span>최근 ${DAYS}일</span></h2>${dealMatrix}</div>
</div>

<div class="row2">
  <div class="card"><h2>수요 신호 <span>준비 중 딜 클릭(deal_want)</span></h2>
    ${dealWantPairs.length ? barList(dealWantPairs, { top: 8 }) : '<p class="empty">(아직 없음)</p>'}
    ${gatePairs.length ? `<div class="gate"><div class="gate-h">커버리지 게이트 — 누적 표 수 / ${GATE_TARGET} <span>2026-07-14 이후(브라우저당 1표)</span></div>
      <div class="tblwrap"><table><tr><th>딜 유형</th><th>누적</th><th>진행</th><th>판정</th></tr>
      ${gatePairs.slice(0, 6).map(([k, n]) => { const p = Math.min(100, Math.round(n / GATE_TARGET * 100));
        return `<tr><td>${esc(k)}</td><td>${num(n)} / ${GATE_TARGET}</td><td><span class="gbar"><span class="gfill" style="width:${p}%"></span></span> ${p}%</td><td>${n >= GATE_TARGET ? '<b class="up">착수 가능</b>' : '대기'}</td></tr>`;
      }).join('')}</table></div></div>` : ''}
    <p class="note">착수 기준: 단일 유형 누적 <b>${GATE_TARGET}표</b> — <b>2026-07-14부터 브라우저당 유형별 1표</b>(이전 수치는 반복 클릭 포함, 게이트 판정은 07-14 이후 집계만). 위 막대는 조회 기간과 무관한 <b>절대 누적</b>입니다.</p></div>
  <div class="card"><h2>유입 호스트별 퍼널 <span>방문→입력→결과→산출물</span></h2>
    <div class="tblwrap"><table><tr><th>유입</th><th>방문</th><th>입력</th><th>결과</th><th>산출물</th></tr>${refFun.slice(0, 8).map(([g, f]) => `<tr><td>${esc(g)}</td><td>${num(f.session)}</td><td>${num(f.activate)}</td><td>${num(f.computed)}</td><td>${num(f.output)}</td></tr>`).join('')}</table></div>
    ${srcFun.length ? `<p class="note" style="margin-top:8px">채널(src) 태그: ${srcFun.map(([g, f]) => esc(g) + ' ' + num(f.session) + '·산출 ' + num(f.output)).join(' / ')}</p>` : ''}</div>
</div>

<div class="card"><h2>전 이벤트 주간 비교 <span>이번 7일 vs 지난 7일 · ${evRows.length}종</span></h2>
<details class="tbl" open><summary>표 접기/펼치기</summary><div class="tblwrap"><table><tr><th>이벤트</th><th>라벨</th><th>이번 주</th><th>지난 주</th><th>추세</th></tr>${evRows.map(([ev, t, p]) => `<tr><td>${esc(ev)}</td><td>${esc(EV_LABEL[ev] || '')}</td><td>${num(t)}</td><td>${num(p)}</td><td>${p > 0 ? (t >= p ? '▲' : '▼') + ' ' + multTxt(t, p) : (t > 0 ? '신규' : '—')}</td></tr>`).join('')}</table></div></details></div>

<div class="row2">
  <div class="card"><h2>국가 <span>세션</span></h2>${barList(toPairs(raw.cc.map(r => ({ k: r.cc, n: r.n }))))}</div>
  <div class="card"><h2>민감도 축 · 깊이 · 기능</h2>
    ${barList(toPairs(raw.axis, AXIS_LABEL), { top: 5 })}
    <p class="note" style="margin-bottom:7px">깊이: ${toPairs(raw.depth, DEPTH_LABEL).map(p => p[0] + ' ' + num(p[1])).join(' · ') || '—'}</p>
    ${featPairs.length ? barList(featPairs, { top: 6 }) : ''}
    <p class="note">기능은 "결과 도달" 시점에 켜져 있던 조합을 분해한 값.</p></div>
</div>

<p class="foot">데이터 주의: 직접입력(activate)·결과도달(computed) 신호는 <b>${NOTE_ACTIVATE_SINCE}</b>부터 존재하며,
<b>${NOTE_FIX_DEPLOYED}</b>에 계측 보정(리파이 텀시트·분양 그리드·렌트롤·IM 경로 추가)이 배포되어 이후 수치는 보정 효과를 포함합니다.
집계는 앱이 직접 보낸 이벤트만 세며(봇·크롤러 제외), 표본 가중 합산이라 소수점 반올림 오차가 있을 수 있습니다. 수치·임차인명·개인정보는 애초에 수집하지 않습니다.</p>
</div>
<div class="tip" id="tip"></div>
<script>
(function(){
  var svg=document.getElementById('trend'); if(!svg) return;
  var tip=document.getElementById('tip');
  var labels=(svg.dataset.labels||'').split('|');
  var sets=[]; try{ sets=JSON.parse(svg.dataset.sets||'[]'); }catch(e){}
  var xh=svg.querySelector('.xh'), hov=svg.querySelector('.hover');
  if(!hov||!sets.length) return;
  var P={l:42,r:14}, W=720;
  function idxAt(evt){
    var r=svg.getBoundingClientRect(), sx=(evt.clientX-r.left)*(W/r.width);
    var n=labels.length; if(n<2) return 0;
    var t=(sx-P.l)/(W-P.l-P.r)*(n-1);
    return Math.max(0,Math.min(n-1,Math.round(t)));
  }
  hov.addEventListener('mousemove',function(evt){
    var i=idxAt(evt), n=labels.length;
    var xx=P.l+(W-P.l-P.r)*i/(n-1);
    xh.setAttribute('x1',xx); xh.setAttribute('x2',xx); xh.setAttribute('opacity','.45');
    tip.innerHTML='<b>'+labels[i]+'</b><br>'+sets.map(function(s){return s.name+' '+(s.data[i]||0);}).join('<br>');
    tip.style.left=(evt.clientX+14)+'px'; tip.style.top=(evt.clientY+10)+'px'; tip.style.opacity='1';
  });
  hov.addEventListener('mouseleave',function(){ tip.style.opacity='0'; xh.setAttribute('opacity','0'); });
})();
</script>
</body></html>`;

  try {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, html);
  } catch (e) {
    console.error('보고서 파일을 쓰지 못했습니다: ' + OUT + '\n  → ' + e.message); process.exit(1);
  }
  console.log('✅ 패턴 보고서 생성: ' + path.relative(ROOT, OUT));

  /* ── 마크다운 요약 — GitHub Actions run Summary 에 그대로 붙여 '다운로드 없이 보기' ── */
  if (MD) {
    const fmtT = (t, p) => p > 0 ? ((t >= p ? '▲' : '▼') + multTxt(t, p)) : (t > 0 ? '신규' : '—');
    const md = [];
    md.push(`# 모델터 사용 보고 — ${today} (최근 ${DAYS}일 · 봇 제외)`);
    md.push('');
    md.push('## KPI v1 (주 7일 창)');
    md.push('| 지표 | 이번 주 | 목표 | 상태 |');
    md.push('|---|---|---|---|');
    kpiV1.forEach(k => md.push(`| ${k[0]} | ${k[1]} | ${k[2]} | ${k[3] === null ? '—' : (k[3] ? '✅ 달성' : '진행 중')} |`));
    md.push('');
    const outThis = OUTPUT_EVENTS.reduce((a, e) => a + (wget(e).this || 0), 0);
    md.push(`**주간 퍼널**: 방문 ${num(sW.this)} → 직접 입력 ${num(wget('activate').this)} → 결과 ${num(wget('computed').this)} → 산출물 ${num(outThis)}`);
    md.push('');
    if (dealWantPairs.length) md.push('**수요(deal_want)**: ' + dealWantPairs.slice(0, 6).map(p => `${p[0]} ${num(p[1])}`).join(' · ') + ' _(07-14부터 브라우저당 1표 — 게이트 50건은 그 이후 집계로 판정)_');
    if (gateLead) md.push(`**커버리지 게이트**: ${gateLead[0]} **${num(gateLead[1])}/${GATE_TARGET}**` +
      (gateLead[1] >= GATE_TARGET ? ' — ✅ **착수 가능**' : ` (${Math.round(gateLead[1] / GATE_TARGET * 100)}%)`) +
      (gatePairs.length > 1 ? ' · 다음: ' + gatePairs.slice(1, 4).map(p => `${p[0]} ${num(p[1])}`).join(' · ') : '') + ' _(07-14 이후 절대 누적)_');
    const extRef = refFun.filter(([g]) => g && g.indexOf('modelter.com') < 0 && g !== '(직접/미상)').slice(0, 6);
    if (extRef.length) md.push('**외부 유입(방문·산출물)**: ' + extRef.map(([g, f]) => `${g} ${num(f.session)}·${num(f.output)}`).join(' · '));
    md.push('');
    md.push('## 이번 주 이벤트 상위 15');
    md.push('| 이벤트 | 라벨 | 이번 주 | 지난 주 | 추세 |');
    md.push('|---|---|---|---|---|');
    evRows.slice(0, 15).forEach(([ev, t, p]) => md.push(`| ${ev} | ${EV_LABEL[ev] || ''} | ${num(t)} | ${num(p)} | ${fmtT(t, p)} |`));
    md.push('');
    md.push('_전체 상세(차트·기기·시간대·유입 퍼널)는 Artifacts → modelter-usage-report 의 patterns.html_');
    fs.writeFileSync(MD, md.join('\n') + '\n');
    console.log('✅ 마크다운 요약: ' + path.relative(ROOT, MD));
  }
}

main().catch(e => { console.error('조회 실패: ' + e.message + '\n· CF_ACCOUNT_ID·CF_API_TOKEN 과 토큰 권한(Account Analytics : Read)을 확인하세요.'); process.exit(1); });
