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
const W = `timestamp > now() - INTERVAL '${DAYS}' DAY`;

/* 데이터 주의 각주(날짜 상수) — 이 날짜들이 창에 걸릴 때만 의미가 있으나, 항상 명시해 오독 방지 */
const NOTE_ACTIVATE_SINCE = '2026-07-07';   // activate·computed 신호가 존재하기 시작한 날
const NOTE_FIX_DEPLOYED = '2026-07-09';     // 계측 보정(리파이·분양그리드·렌트롤·IM 경로) 배포일

const Q = {
  daily: `SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS d, blob1 AS ev, sum(_sample_interval) AS n FROM ${D} WHERE ${W} AND blob1 IN ('session','activate','computed','xlsx_download','prompt_copy') GROUP BY d, ev ORDER BY d`,
  wow: `SELECT if(timestamp > now() - INTERVAL '7' DAY, 'this', 'prev') AS w, blob1 AS ev, sum(_sample_interval) AS n FROM ${D} WHERE timestamp > now() - INTERVAL '14' DAY GROUP BY w, ev`,
  dealOut: `SELECT blob2 AS deal, blob1 AS ev, sum(_sample_interval) AS n FROM ${D} WHERE ${W} AND blob1 IN (${OUTPUT_EVENTS.map(e => `'${e}'`).join(',')}) GROUP BY deal, ev`,
  devEv: `SELECT blob4 AS dev, blob1 AS ev, sum(_sample_interval) AS n FROM ${D} WHERE ${W} AND blob1 IN ('session','deal_select','activate','computed','xlsx_download','prompt_copy','onboard') GROUP BY dev, ev`,
  hour: `SELECT toHour(timestamp) AS h, sum(_sample_interval) AS n FROM ${D} WHERE ${W} AND blob1='session' GROUP BY h ORDER BY h`,
  dow: `SELECT toDayOfWeek(timestamp) AS dw, sum(_sample_interval) AS n FROM ${D} WHERE ${W} AND blob1='session' GROUP BY dw ORDER BY dw`,
  cc: `SELECT blob6 AS cc, sum(_sample_interval) AS n FROM ${D} WHERE ${W} AND blob1='session' GROUP BY cc ORDER BY n DESC LIMIT 8`,
  axis: `SELECT blob8 AS k, sum(_sample_interval) AS n FROM ${D} WHERE ${W} AND blob1='sens_axis' AND blob8!='' GROUP BY k ORDER BY n DESC LIMIT 8`,
  depth: `SELECT blob3 AS k, sum(_sample_interval) AS n FROM ${D} WHERE ${W} AND blob1='deal_select' AND blob3!='' GROUP BY k ORDER BY n DESC`,
  featCombo: `SELECT blob7 AS k, sum(_sample_interval) AS n FROM ${D} WHERE ${W} AND blob7!='' AND blob1='computed' GROUP BY k ORDER BY n DESC LIMIT 8`,
};

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
  if (!ACCOUNT || !TOKEN) { console.error('CF_ACCOUNT_ID · CF_API_TOKEN 환경변수가 필요합니다.'); process.exit(1); }
  const raw = {};
  for (const [k, sql] of Object.entries(Q)) raw[k] = await runSQL(sql);

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
.foot{font-size:11px;color:var(--muted);margin-top:16px;line-height:1.7}
.tip{position:fixed;pointer-events:none;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:6px 9px;font-size:11.5px;box-shadow:0 4px 14px rgba(0,0,0,.12);opacity:0;transition:opacity .12s;font-variant-numeric:tabular-nums;z-index:9}
</style></head><body><div class="wrap">
<h1>모델터 사용 패턴</h1>
<p class="sub">기준 ${today} · 최근 ${DAYS}일 · 생성 ${genAt} · 익명 집계(수치·PII 없음)</p>

<div class="grid5">${kpis}</div>

${obs.length ? `<div class="card"><h2>핵심 관찰 <span>자동 산출</span></h2><ul class="obs">${obs.map(o => '<li>' + o + '</li>').join('')}</ul></div>` : ''}

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
}

main().catch(e => { console.error('조회 실패: ' + e.message + '\n· CF_ACCOUNT_ID·CF_API_TOKEN 과 토큰 권한(Account Analytics : Read)을 확인하세요.'); process.exit(1); });
