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
 *   blob1=이벤트  blob2=딜  blob3=깊이  blob4=기기  blob5=유입호스트  blob6=국가  blob7=feats  blob8=axis
 *   double1=rr    double2=featN    index1=이벤트    _sample_interval=표본가중치(합이 추정 실건수)
 */
'use strict';

const DATASET = 'Modelter';
const OUTPUT_EVENTS = ['xlsx_download', 'teaser', 'ic_ppt', 'share_link', 'memo_copy', 'png_card', 'slot_save', 'prompt_copy', 'pdf_export', 'sample_download'];
const FEAT_LABEL = { rr: '렌트롤', dep: '보증금승계', fee: '운용보수', bido: '비도관과세', vac: '공실', resi: '분양수지', hold: '보유기간변경', pref: '우선주', scen: '시나리오' };
const DEAL_LABEL = { office: '오피스', logistics: '물류', dev: '개발·PF', refi: '리파이낸싱' };

// ── 인자 파싱 ──
function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return def;
}
const FLAG_SQL = process.argv.includes('--sql');
const ACCOUNT = arg('account', process.env.CF_ACCOUNT_ID || '');
const TOKEN = arg('token', process.env.CF_API_TOKEN || '');
const DAYS = parseInt(arg('days', '7'), 10) || 7;
const WHERE = `timestamp > now() - INTERVAL '${DAYS}' DAY`;

// ── 쿼리 정의 ──
const Q = {
  events: `SELECT blob1 AS k, sum(_sample_interval) AS n FROM ${DATASET} WHERE ${WHERE} GROUP BY k ORDER BY n DESC`,
  deals: `SELECT blob2 AS k, sum(_sample_interval) AS n FROM ${DATASET} WHERE ${WHERE} AND blob2 != '' GROUP BY k ORDER BY n DESC`,
  depth: `SELECT blob3 AS k, sum(_sample_interval) AS n FROM ${DATASET} WHERE ${WHERE} AND blob3 != '' GROUP BY k ORDER BY n DESC`,
  device: `SELECT blob4 AS k, sum(_sample_interval) AS n FROM ${DATASET} WHERE ${WHERE} AND blob4 != '' GROUP BY k ORDER BY n DESC`,
  ref: `SELECT blob5 AS k, sum(_sample_interval) AS n FROM ${DATASET} WHERE ${WHERE} AND blob5 != '' GROUP BY k ORDER BY n DESC LIMIT 8`,
  feats: `SELECT blob7 AS k, sum(_sample_interval) AS n FROM ${DATASET} WHERE ${WHERE} AND blob7 != '' GROUP BY k`,
};

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

  L.push('');
  L.push('■ 전체 이벤트');
  L.push(rowsOf(ev, { pad: 18 }));
  L.push('');
  return L.join('\n');
}

async function main() {
  if (FLAG_SQL) {
    console.log('# Analytics Engine SQL (대시보드 Query Builder 또는 curl에 붙여 사용)\n');
    for (const [name, sql] of Object.entries(Q)) console.log('-- ' + name + '\n' + sql + '\n');
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
  } catch (e) {
    console.error('조회 실패: ' + e.message + '\n\n' +
      '· 계정 ID·토큰과 토큰 권한(Account Analytics : Read)을 확인하세요.\n' +
      '· 데이터셋 이름은 wrangler.toml의 dataset = "' + DATASET + '" 입니다.\n' +
      '· SQL만 확인하려면: node tools/modelter-ae.js --sql');
    process.exit(1);
  }
}

if (require.main === module) main();
module.exports = { Q, render, toMap };
