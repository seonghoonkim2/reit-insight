#!/usr/bin/env node
/* 모델터 계기판 — 익명 사용 이벤트 로그를 퍼널·기능채택으로 집계 (의존성 없음)
 *
 * 로그 얻는 법 (택1):
 *   ① 실시간:  wrangler tail --format=json > events.ndjson      (Cloudflare Workers)
 *   ② 대시보드: Workers → Logs 에서 내보낸 텍스트 저장
 *   ③ Analytics Engine: SQL API 결과(JSON) 저장
 *
 * 사용:
 *   node tools/modelter-funnel.js events.ndjson
 *   wrangler tail --format=json | node tools/modelter-funnel.js
 *
 * 수집 원칙(불변): 숫자·개인정보 없음. 이벤트명 / 딜유형 / 활성기능 플래그 / 기기 / 유입호스트만.
 *
 * 퍼널 정의:
 *   session   방문(페이지 로드)
 *   activate  사용자가 직접 값을 입력(예시 로드 아님) — 세션당 1회
 *   computed  자기 딜 입력 후 유효 결과 도달 — 세션당 1회
 *   output    산출물 획득: xlsx_download · teaser · share_link · slot_save · prompt_copy · pdf_export
 */
'use strict';
const fs = require('fs');

const OUTPUT_EVENTS = ['xlsx_download', 'teaser', 'share_link', 'memo_copy', 'png_card', 'pipeline_copy', 'slot_save', 'prompt_copy', 'pdf_export', 'sample_download'];
const OUTPUT_SET = new Set(OUTPUT_EVENTS);

// ── 입력 읽기 (파일 인자 또는 stdin) ──
function readInput() {
  const arg = process.argv[2];
  if (arg && arg !== '-') return fs.readFileSync(arg, 'utf8');
  try { return fs.readFileSync(0, 'utf8'); } catch (e) { return ''; }
}

// ── 한 줄에서 이벤트 객체 뽑기 (여러 로그 포맷 관용적으로 처리) ──
function extractEvents(text) {
  const evs = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    // 1) 줄 전체가 JSON (wrangler tail / AE 결과 / NDJSON)
    let obj = tryJSON(line.trim());
    if (obj) { collect(obj, evs); continue; }
    // 2) "mtevent {json}" 형태 (Workers Logs console.log)
    const idx = line.indexOf('mtevent ');
    if (idx >= 0) {
      const j = tryJSON(line.slice(idx + 8).trim());
      if (j) { pushEvent(j, evs); continue; }
    }
    // 3) 줄 안에 임베드된 {…} 조각
    const braces = line.match(/\{[^{}]*"(?:t|ev)"\s*:[^{}]*\}/g);
    if (braces) for (const b of braces) { const j = tryJSON(b); if (j) pushEvent(j, evs); }
  }
  return evs;
}
function tryJSON(s) { try { return JSON.parse(s); } catch (e) { return null; } }

// wrangler tail 객체는 logs[].message[] 안에 "mtevent {...}" 를 품고 있을 수 있음 → 재귀 수집
function collect(obj, evs) {
  if (obj == null) return;
  if (Array.isArray(obj)) { for (const x of obj) collect(x, evs); return; }
  if (typeof obj === 'string') {
    const idx = obj.indexOf('mtevent ');
    if (idx >= 0) { const j = tryJSON(obj.slice(idx + 8).trim()); if (j) pushEvent(j, evs); }
    return;
  }
  if (typeof obj !== 'object') return;
  if (obj.t || obj.ev) { pushEvent(obj, evs); }
  // 중첩 필드(logs, message, blobs 등) 탐색
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && (typeof v === 'object' || typeof v === 'string')) collect(v, evs);
  }
}
function pushEvent(o, evs) {
  const ev = String(o.ev || o.t || '').trim();
  if (!ev) return;
  evs.push({
    ev,
    deal: String(o.deal || '').trim(),
    depth: String(o.depth || '').trim(),
    feats: String(o.feats || '').trim(),
    dev: String(o.dev || '').trim(),
    ref: String(o.ref || '').trim(),
    cc: String(o.cc || '').trim(),
  });
}

// ── 집계 ──
function tally(evs) {
  const byEv = {}, byDeal = {}, byFeat = {}, byDev = {}, byRef = {}, byDepth = {};
  let outputs = 0;
  for (const e of evs) {
    byEv[e.ev] = (byEv[e.ev] || 0) + 1;
    if (OUTPUT_SET.has(e.ev)) outputs++;
    if (e.deal) byDeal[e.deal] = (byDeal[e.deal] || 0) + 1;
    if (e.depth) byDepth[e.depth] = (byDepth[e.depth] || 0) + 1;
    if (e.dev) byDev[e.dev] = (byDev[e.dev] || 0) + 1;
    if (e.ref) byRef[e.ref] = (byRef[e.ref] || 0) + 1;
    if (e.feats) for (const f of e.feats.split(',')) { if (f) byFeat[f] = (byFeat[f] || 0) + 1; }
  }
  return { byEv, byDeal, byFeat, byDev, byRef, byDepth, outputs, total: evs.length };
}

// ── 출력 헬퍼 ──
function bar(n, max, width) { const w = max > 0 ? Math.round(n / max * width) : 0; return '█'.repeat(w) + '·'.repeat(Math.max(0, width - w)); }
function pct(a, b) { return b > 0 ? (a / b * 100).toFixed(1) + '%' : '—'; }
function rows(obj, opts) {
  opts = opts || {};
  const ents = Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, opts.top || 99);
  const max = ents.length ? ents[0][1] : 0;
  const denom = opts.denom || ents.reduce((s, e) => s + e[1], 0);
  return ents.map(([k, v]) => '   ' + k.padEnd(opts.pad || 16) + String(v).padStart(6) + '  ' + bar(v, max, 16) + '  ' + pct(v, denom));
}

const FEAT_LABEL = { rr: '렌트롤', dep: '보증금승계', fee: '운용보수', bido: '비도관과세', vac: '공실', resi: '분양수지', hold: '보유기간변경', pref: '우선주', scen: '시나리오' };
const DEAL_LABEL = { office: '오피스', logistics: '물류', dev: '개발·PF', refi: '리파이낸싱' };

function main() {
  const text = readInput();
  const evs = extractEvents(text);
  if (!evs.length) {
    console.error('이벤트를 찾지 못했습니다.\n  사용: node tools/modelter-funnel.js <로그파일>\n  또는: wrangler tail --format=json | node tools/modelter-funnel.js');
    process.exit(1);
  }
  const t = tally(evs);
  const S = t.byEv.session || 0, A = t.byEv.activate || 0, C = t.byEv.computed || 0, O = t.outputs;

  const L = [];
  L.push('');
  L.push('╔══════════════════════════════════════════════════╗');
  L.push('║  모델터 계기판 — 익명 사용 집계 (수치·PII 없음)     ║');
  L.push('╚══════════════════════════════════════════════════╝');
  L.push('  이벤트 ' + t.total + '건 · 이벤트 종류 ' + Object.keys(t.byEv).length + '개');

  L.push('');
  L.push('■ 활성화 퍼널 (세션당 1회 신호 기준)');
  const fmax = Math.max(S, A, C, O, 1);
  const fline = (label, n, base) => '   ' + label.padEnd(22) + String(n).padStart(6) + '  ' + bar(n, fmax, 20) + '  ' + (base != null ? pct(n, base) : '');
  L.push(fline('방문 (session)', S, null));
  L.push(fline('→ 직접 입력 (activate)', A, S) + (S ? '  of 방문' : ''));
  L.push(fline('→ 결과 도달 (computed)', C, A) + (A ? '  of 입력' : ''));
  L.push(fline('→ 산출물 (output)', O, C) + (C ? '  of 결과' : ''));
  L.push('   ' + '전환(방문→산출물)'.padEnd(22) + ' '.repeat(6) + '  ' + pct(O, S));

  L.push('');
  L.push('■ 산출물 종류');
  const outObj = {};
  for (const e of OUTPUT_EVENTS) if (t.byEv[e]) outObj[e] = t.byEv[e];
  L.push(Object.keys(outObj).length ? rows(outObj, { pad: 16, denom: O }).join('\n') : '   (없음)');

  L.push('');
  L.push('■ 딜 유형 분포 (이벤트 기준)');
  const dealObj = {}; for (const k in t.byDeal) dealObj[(DEAL_LABEL[k] || k)] = t.byDeal[k];
  L.push(rows(dealObj, { pad: 12 }).join('\n') || '   (없음)');

  L.push('');
  L.push('■ 활성 기능 채택 (feats 플래그 빈도)');
  const featObj = {}; for (const k in t.byFeat) featObj[(FEAT_LABEL[k] || k)] = t.byFeat[k];
  L.push(rows(featObj, { pad: 14 }).join('\n') || '   (없음)');

  L.push('');
  L.push('■ 모델 깊이 · 기기 · 유입');
  L.push('  [깊이] ' + (Object.entries(t.byDepth).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(' · ') || '—'));
  L.push('  [기기] ' + (Object.entries(t.byDev).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v + ' (' + pct(v, t.total) + ')').join(' · ') || '—'));
  L.push('  [유입] ' + (Object.entries(t.byRef).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k + ' ' + v).join(' · ') || '직접/미상'));

  L.push('');
  L.push('■ 전체 이벤트');
  L.push(rows(t.byEv, { pad: 18 }).join('\n'));
  L.push('');
  console.log(L.join('\n'));
}

if (require.main === module) main();
module.exports = { extractEvents, tally };
