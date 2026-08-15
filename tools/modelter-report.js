#!/usr/bin/env node
/* 모델터 계기판 대시보드 — data/ae-snapshots/*.json 을 읽어 자기완결 HTML 한 장으로 렌더
 *
 * 누적 원리: Analytics Engine 은 ~90일만 보관하므로, modelter-ae.js --snapshot 으로
 *           주기적(주 1회 권장) 집계를 저장소에 커밋한다. 이 스크립트는 그 스냅샷들을
 *           읽어 시간에 따른 추세·퍼널·분해를 하나의 정적 HTML 로 만든다(외부 의존 0).
 *
 * 사용:
 *   node tools/modelter-report.js                       # data/dashboard.html 생성
 *   node tools/modelter-report.js --out /경로/x.html    # 출력 위치 지정
 *   node tools/modelter-report.js --dir /스냅샷/폴더     # 스냅샷 폴더 지정(데모/검증용)
 *
 * 수집 원칙(불변): 이벤트명·딜유형·기능플래그·기기·유입호스트만. 수치·PII 없음.
 */
'use strict';
const fs = require('fs');
const path = require('path');

function arg(name, def) { const i = process.argv.indexOf('--' + name); return (i >= 0 && process.argv[i + 1]) ? process.argv[i + 1] : def; }
const ROOT = path.join(__dirname, '..');
const SNAP_DIR = arg('dir', path.join(ROOT, 'data', 'ae-snapshots'));
const OUT = arg('out', path.join(ROOT, 'data', 'dashboard.html'));

// 산출물 목록·라벨은 공용 모듈에서(ae.js 와 단일 진실 공유 — 드리프트 방지)
const { OUTPUT_EVENTS, FIRST_NUMBER_BUCKETS, DEAL_LABEL, FEAT_LABEL, EV_LABEL, DEVICE_LABEL } = require('./modelter-labels');

function loadSnapshots() {
  let files = [];
  try { files = fs.readdirSync(SNAP_DIR).filter(f => f.endsWith('.json')); } catch (_) { return []; }
  const snaps = [];
  for (const f of files) {
    try { const s = JSON.parse(fs.readFileSync(path.join(SNAP_DIR, f), 'utf8')); if (s && s.events && s.endDate) snaps.push(s); } catch (_) {}
  }
  snaps.sort((a, b) => String(a.endDate).localeCompare(String(b.endDate)));
  return snaps;
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = n => Math.round(Number(n) || 0).toLocaleString();
const dnum = v => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? n : '?'; };  // days 를 안전한 정수로(HTML 삽입 무해화)
const pct = (a, b) => { a = Number(a) || 0; b = Number(b) || 0; return b > 0 ? (a / b * 100).toFixed(1) + '%' : '—'; };  // 부분/누락 값도 NaN% 대신 안전한 수치로
const utcDay = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? Date.parse(String(s) + 'T00:00:00Z') : NaN;
const addDays = (s, n) => { const t = utcDay(s); return Number.isFinite(t) ? new Date(t + n * 86400000).toISOString().slice(0, 10) : ''; };

// ── 인라인 SVG 차트 (외부 의존 없음) ──
function lineChart(series, opt) {
  opt = opt || {};
  const W = 720, H = 200, P = { l: 40, r: 12, t: 12, b: 26 };
  const labels = series.labels, sets = series.sets;
  const allVals = sets.reduce((a, s) => a.concat(s.data), []);
  const max = Math.max(1, ...allVals);
  const n = labels.length;
  const x = i => P.l + (n <= 1 ? 0 : (W - P.l - P.r) * i / (n - 1));
  const y = v => H - P.b - (H - P.t - P.b) * (v / max);
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">`;
  for (let g = 0; g <= 4; g++) { const gy = P.t + (H - P.t - P.b) * g / 4; const gv = Math.round(max * (1 - g / 4)); svg += `<line x1="${P.l}" y1="${gy}" x2="${W - P.r}" y2="${gy}" class="grid"/><text x="${P.l - 5}" y="${gy + 3}" class="axis" text-anchor="end">${gv}</text>`; }
  labels.forEach((lb, i) => { if (n <= 12 || i % Math.ceil(n / 12) === 0) svg += `<text x="${x(i)}" y="${H - 8}" class="axis" text-anchor="middle">${esc(lb)}</text>`; });
  sets.forEach(s => {
    const pts = s.data.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    svg += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-dasharray="${s.dash || ''}"/>`;
    s.data.forEach((v, i) => { svg += `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${s.color}"/>`; });
  });
  svg += `</svg>`;
  // 범례 스와치를 색+점선패턴 미니 라인으로 → 적록색맹도 계열 구분 가능(색만으로 구분 금지)
  const legend = sets.map(s => `<span class="lg"><svg width="16" height="8" class="lgln"><line x1="0" y1="4" x2="16" y2="4" stroke="${s.color}" stroke-width="2.5" stroke-dasharray="${s.dash || ''}"/></svg>${esc(s.name)}</span>`).join('');
  return `<div class="ln">${svg}<div class="legend">${legend}</div></div>`;
}
function barList(obj, opt) {
  opt = opt || {};
  const ents = Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, opt.top || 12);
  if (!ents.length) return '<p class="empty">(데이터 없음)</p>';
  const max = ents[0][1], denom = opt.denom || ents.reduce((s, e) => s + e[1], 0);
  return '<div class="bars">' + ents.map(([k, v]) =>
    `<div class="brow"><span class="bk">${esc(opt.label ? (opt.label[k] || k) : k)}</span><span class="btrack"><span class="bfill" style="width:${max ? (v / max * 100) : 0}%"></span></span><span class="bn">${num(v)}<i>${pct(v, denom)}</i></span></div>`
  ).join('') + '</div>';
}

function mergeFeat(featMap) {
  const out = {};
  for (const combo in featMap) { const n = featMap[combo]; for (const f of String(combo).split(',')) { if (f) out[FEAT_LABEL[f] || f] = (out[FEAT_LABEL[f] || f] || 0) + n; } }
  return out;
}
function dealLabelMap(deals) { const o = {}; for (const k in deals) o[DEAL_LABEL[k] || k] = deals[k]; return o; }

// 채널별 퍼널 표 (attribution.bySrc / byRef → 방문·결과·산출·전환)
function attrTable(byGroup, emptyMsg) {
  const groups = Object.entries(byGroup || {}).sort((a, b) => (b[1].session || 0) - (a[1].session || 0)).slice(0, 12);
  if (!groups.length) return `<p class="empty">${esc(emptyMsg || '(데이터 없음)')}</p>`;
  return `<table class="snt"><tr><th>채널</th><th>방문</th><th>결과</th><th>산출</th><th>전환</th></tr>` +
    groups.map(([k, f]) => `<tr><td>${esc(k)}</td><td>${num(f.session)}</td><td>${num(f.computed)}</td><td>${num(f.output)}</td><td>${pct(f.output, f.session)}</td></tr>`).join('') +
    `</table>`;
}

function build(snaps) {
  const genAt = new Date().toISOString().replace('T', ' ').slice(0, 16);
  if (!snaps.length) {
    return page(genAt, `<div class="card empty-state"><h2>아직 스냅샷이 없습니다</h2>
      <p>먼저 계기판 집계를 저장하세요:</p>
      <pre>CF_ACCOUNT_ID=... CF_API_TOKEN=... node tools/modelter-ae.js --days 30 --snapshot</pre>
      <p>그 뒤 이 스크립트를 다시 실행하면 여기에 누적 대시보드가 그려집니다. 주 1회 스냅샷을 커밋하면 시간에 따른 추세가 쌓입니다.</p></div>`);
  }
  const last = snaps[snaps.length - 1];
  const rawF = last.funnel || {};                    // 부분 funnel(키 일부 누락)도 NaN 없이: 키별 Number 강제
  const f = { session: Number(rawF.session) || 0, activate: Number(rawF.activate) || 0, computed: Number(rawF.computed) || 0, output: Number(rawF.output) || 0 };

  // KPI 타일 (최신 스냅샷)
  //   산출물은 "매 산출 행동 합계"라 결과(세션당 1회)로 나눈 백분율이 100%를 넘을 수 있다 →
  //   퍼널 전환처럼 오독되지 않게 '결과당 N.N건'(결과 세션당 평균 산출 건수)으로 표기.
  const perResult = f.computed > 0 ? '결과당 ' + (f.output / f.computed).toFixed(1) + '건' : '총 ' + num(f.output) + '건';
  const kpis = [
    ['방문 (session)', num(f.session), '최근 ' + dnum(last.days) + '일'],
    ['직접 입력', num(f.activate), pct(f.activate, f.session) + ' of 방문'],
    ['결과 도달', num(f.computed), pct(f.computed, f.session) + ' of 방문'],
    ['산출물', num(f.output), perResult],
    ['방문→산출물 전환', pct(f.output, f.session), '핵심 지표'],
  ].map(k => `<div class="kpi"><div class="kv">${k[1]}</div><div class="kl">${esc(k[0])}</div><div class="ks">${esc(k[2])}</div></div>`).join('');

  // 추세: 스냅샷별 session/computed/output (누적 이력)
  //   집계범위(days)가 다른 스냅샷을 한 선에 섞으면(7일 vs 30일) 원시 카운트가 급증 아티팩트로 오독됨 →
  //   최신 스냅샷과 같은 윈도우만 플롯. 계열은 색 + 점선패턴으로 이중 구분(색맹 대비).
  const win = last.days;
  const trendSnaps = snaps.filter(s => s.days === win);
  const dropped = snaps.length - trendSnaps.length;
  let trend = '';
  if (trendSnaps.length >= 2) {
    trend = lineChart({
      labels: trendSnaps.map(s => String(s.endDate).slice(5)),
      sets: [
        { name: '방문', color: '#a9792b', dash: '', data: trendSnaps.map(s => (s.funnel || {}).session || 0) },
        { name: '결과도달', color: '#2e7d4f', dash: '5 3', data: trendSnaps.map(s => (s.funnel || {}).computed || 0) },
        { name: '산출물', color: '#b4552d', dash: '1.5 3', data: trendSnaps.map(s => (s.funnel || {}).output || 0) },
      ],
    });
    trend += `<p class="note">최근 ${dnum(win)}일 집계 스냅샷 ${trendSnaps.length}개${dropped ? ` · 집계범위가 다른 ${dropped}개는 왜곡 방지 위해 제외` : ''}.</p>`;
  } else if (last.daily && last.daily.length >= 2) {
    // 스냅샷이 1개뿐이면 그 안의 일자별 시계열로 대체
    trend = lineChart({
      labels: last.daily.map(d => String(d.day).slice(5)),
      sets: [
        { name: '방문', color: '#a9792b', dash: '', data: last.daily.map(d => d.session || 0) },
        { name: '결과도달', color: '#2e7d4f', dash: '5 3', data: last.daily.map(d => d.computed || 0) },
      ],
    });
    trend += `<p class="note">스냅샷 1개 — 그 안의 일자별 추이. 주 1회 스냅샷을 커밋하면 주간 추세로 바뀝니다.</p>`;
  } else {
    trend = '<p class="empty">추세는 같은 집계범위 스냅샷이 2개 이상 쌓이면 표시됩니다 (주 1회 커밋 권장).</p>';
  }

  // 퍼널 바
  const fmax = Math.max(f.session, f.activate, f.computed, f.output, 1);
  const funnelHtml = [['방문', f.session], ['직접 입력', f.activate], ['결과 도달', f.computed], ['산출물', f.output]]
    .map(([lb, v]) => `<div class="frow"><span class="fk">${lb}</span><span class="ftrack"><span class="ffill" style="width:${v / fmax * 100}%"></span></span><span class="fn">${num(v)}</span></div>`).join('');

  // 산출물 종류
  const outObj = {}; for (const e of OUTPUT_EVENTS) if (last.events[e]) outObj[EV_LABEL[e] || e] = last.events[e];

  // 첫 숫자 속도 — 정확한 경과시간 대신 4개 구간 이벤트만 수집한다(2026-08-15 계측 개시).
  const firstValues = FIRST_NUMBER_BUCKETS.map(b => Number((last.events || {})[b.event]) || 0);
  const firstTotal = firstValues.reduce((a, b) => a + b, 0);
  const firstFast = firstValues[0] + firstValues[1];
  const firstRows = FIRST_NUMBER_BUCKETS.map((b, i) => {
    const v = firstValues[i];
    return `<div class="frow"><span class="fk">${esc(b.label)}</span><span class="ftrack"><span class="ffill" style="width:${firstTotal ? v / firstTotal * 100 : 0}%"></span></span><span class="fn">${num(v)} <i>${pct(v, firstTotal)}</i></span></div>`;
  }).join('');
  const firstNumberCard = `<div class="card"><h2>첫 숫자 속도 <span>페이지 진입 → 첫 자기 딜 결과 · 2026-08-15 이후</span></h2>
    <div class="decision"><b>${firstTotal >= 20 ? `15분 이내 ${pct(firstFast, firstTotal)}` : `표본 대기 · ${num(firstTotal)} / 20`}</b><span>사전 기준: n≥20일 때 15분 이내 70% 이상</span></div>
    <div class="funnel">${firstRows}</div><p class="note">세션당 한 번만 집계합니다. 정확한 시간·딜 수치·사용자 식별자는 보내지 않고 네 개 시간 구간 중 하나만 기록합니다.</p></div>`;

  // 북극성 팀 전달 — 2026-08-15 오계측 분리 이후, 자기 숫자 세션(act=1)만 판정한다.
  const th = last.teamHandoffByAct || null;
  const ho = (th && th.handoff_open) || { act: 0, nonact: 0, unknown: 0 };
  const sl = (th && th.share_link) || { act: 0, nonact: 0, unknown: 0 };
  const teamWin = th && th.window;
  const hasTeamWin = !!teamWin && Number.isFinite(Number(teamWin.session)) && Number.isFinite(Number(teamWin.activate));
  const expSince = (th && th.since) || '';
  const decisionDate = (th && th.decisionDate) || addDays(expSince, 14);
  const elapsedRaw = Math.floor((utcDay(last.endDate) - utcDay(expSince)) / 86400000) + 1;
  const elapsed = Number.isFinite(elapsedRaw) ? Math.max(0, Math.min(14, elapsedRaw)) : 0;
  const ready = !!decisionDate && String(last.endDate) >= decisionDate;
  const activation = hasTeamWin ? (Number(teamWin.activate) || 0) : 0;
  const sessions = hasTeamWin ? (Number(teamWin.session) || 0) : 0;
  const activationOk = sessions > 0 && activation / sessions >= 0.1;
  let verdict = `판정 보류 · ${elapsed}/14일 · ${decisionDate || '종료일 미정'} 판정`;
  if (!hasTeamWin) verdict = '판정 보류 · 동일 창 활성화 집계 대기';
  else if (ready) {
    if ((Number(ho.act) || 0) < 3 || !activationOk) verdict = '철회 기준 도달';
    else if ((Number(ho.act) || 0) >= 10 && (Number(sl.act) || 0) >= 5) verdict = '정량 통과 · 정성 증거 확인 필요';
    else verdict = '부분 채택 후보 · 정성 증거 확인 필요';
  }
  const teamRows = [
    ['공유 메뉴 열기', Number(ho.act) || 0, 10],
    ['실제 공유 링크', Number(sl.act) || 0, 5],
  ].map(([lb, v, target]) => `<div class="frow"><span class="fk">${lb}</span><span class="ftrack"><span class="ffill" style="width:${Math.min(100, v / target * 100)}%"></span></span><span class="fn">${num(v)} / ${target}</span></div>`).join('');
  const teamCard = th
    ? `<div class="card"><h2>북극성 · 팀 전달 <span>실사용(act=1) · ${esc(expSince)} 시작</span></h2><div class="decision"><b>${esc(verdict)}</b><span>${hasTeamWin ? `고정 실험창 활성화 ${num(activation)} / 방문 ${num(sessions)} (${pct(activation, sessions)})` : '고정 실험창 집계는 다음 스냅샷부터 표시'}</span></div><div class="funnel">${teamRows}</div>
      <p class="note">14일 사전 기준: 공유 메뉴 10건, 실제 링크 5건, 활성화율 10% 이상. 종료 전 수치는 진행 신호일 뿐 채택·철회로 판정하지 않습니다. 예시·비활성 세션은 메뉴 ${num(ho.nonact)}건 / 링크 ${num(sl.nonact)}건으로 분리해 성과에 넣지 않습니다.</p></div>`
    : `<div class="card"><h2>북극성 · 팀 전달</h2><p class="empty">새 스냅샷부터 실사용 공유 메뉴·실제 링크가 분리 집계됩니다.</p></div>`;

  const body = `
  <div class="grid5">${kpis}</div>

  <div class="card"><h2>추세 <span>스냅샷별 · 누적 이력</span></h2>${trend}</div>

  <div class="row2">
    <div class="card"><h2>활성화 퍼널 <span>최근 ${dnum(last.days)}일</span></h2><div class="funnel">${funnelHtml}</div>
      <p class="note">방문·직접입력·결과도달은 <b>세션당 1회</b> 신호. 산출물은 <b>매 산출 행동의 합계</b>라 결과보다 클 수 있습니다(한 세션이 엑셀·티저 등 여러 개 생성).</p></div>
    <div class="card"><h2>산출물 종류</h2>${barList(outObj, {})}</div>
  </div>

  ${teamCard}

  ${firstNumberCard}

  <div class="row2">
    <div class="card"><h2>딜 유형</h2>${barList(dealLabelMap(last.deals || {}), {})}</div>
    <div class="card"><h2>기기</h2>${barList(last.device || {}, { label: DEVICE_LABEL })}</div>
  </div>

  <div class="row2">
    <div class="card"><h2>유입 경로 <span>ref 호스트</span></h2>${barList(last.ref || {}, { top: 8 })}
      <p class="note">대부분 <code>modelter.com</code>이면 내부 이동입니다. 링크에 붙은 <code>src</code> 태그로 최초 유입 채널을 봅니다(아래 채널 카드).</p></div>
    <div class="card"><h2>활성 기능 채택 <span>feats</span></h2>${barList(mergeFeat(last.feats || {}), {})}</div>
  </div>

  <div class="row2">
    <div class="card"><h2>채널 <span>src 태그</span></h2>${barList(last.src || {}, { top: 10 })}
      <p class="note">산출물 회수 링크·검색 착지·노트 CTA가 붙인 채널명. 채널명뿐(수치·PII 없음).</p></div>
    <div class="card"><h2>채널별 퍼널 <span>src → 산출물</span></h2>${attrTable((last.attribution || {}).bySrc, '아직 src 태그 유입이 없습니다. 산출물 회수 링크(E2)·노트(E8)가 채널을 붙이기 시작하면 채워집니다.')}
      <p class="note">어느 링크가 방문→산출물까지 가나. 전환 높은 채널에 시간을 집중.</p></div>
  </div>

  <div class="card sn"><h2>스냅샷 이력 <span>${snaps.length}개</span></h2>
    <table class="snt"><tr><th>기준일</th><th>범위</th><th>방문</th><th>결과도달</th><th>산출물</th><th>전환</th></tr>
    ${snaps.slice().reverse().map(s => { const ff = s.funnel || {}; return `<tr><td>${esc(s.endDate)}</td><td>${dnum(s.days)}일</td><td>${num(ff.session)}</td><td>${num(ff.computed)}</td><td>${num(ff.output)}</td><td>${pct(ff.output, ff.session)}</td></tr>`; }).join('')}
    </table></div>

  <p class="foot">봇·크롤러 주의: 자동 스캐너가 많은 요청을 만들지만 이 집계는 <b>앱이 직접 보낸 이벤트(mtevent)만</b> 셉니다 — 취약점 탐색 GET, og.png 크롤링 등은 포함되지 않습니다. 수치·임차인명·개인정보는 애초에 수집하지 않습니다.</p>`;

  return page(genAt, body, last);
}

function page(genAt, body, last) {
  const sub = last ? `최신 스냅샷 ${esc(last.endDate)} · 최근 ${dnum(last.days)}일 기준` : '스냅샷 대기 중';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>모델터 계기판</title>
<style>
:root{--bg:#f3f1ec;--panel:#fdfcf9;--ink:#1b2230;--ink2:#46505f;--ink3:#6a7280;--muted:#8b8f98;--line:#e3e0d8;--line2:#efece4;--gold:#a9792b;--green:#2e7d4f;--red:#b4552d}
@media(prefers-color-scheme:dark){:root{--bg:#14171d;--panel:#1c2027;--ink:#e8eaef;--ink2:#b6bcc7;--ink3:#8a909b;--muted:#8b919c;--line:#2a3039;--line2:#20252d}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,"Malgun Gothic","Apple SD Gothic Neo",sans-serif;padding:22px}
.wrap{max-width:960px;margin:0 auto}
h1{font-size:22px;margin:0 0 2px}.sub{color:var(--ink3);font-size:12.5px;margin:0 0 18px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:15px 17px;margin-bottom:14px}
.card h2{font-size:14px;margin:0 0 11px;font-weight:700}.card h2 span{font-weight:500;color:var(--muted);font-size:11.5px;margin-left:6px}
.grid5{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:14px}
@media(max-width:720px){.grid5{grid-template-columns:repeat(2,1fr)}}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 13px}
.kv{font-size:23px;font-weight:800;color:var(--gold);font-variant-numeric:tabular-nums;line-height:1.1}
.kl{font-size:12px;font-weight:600;color:var(--ink2);margin-top:4px}.ks{font-size:10.5px;color:var(--muted);margin-top:1px}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media(max-width:720px){.row2{grid-template-columns:1fr}}
.chart{width:100%;height:auto}.grid{stroke:var(--line2)}.axis{fill:var(--muted);font-size:9px}
.legend{display:flex;gap:14px;margin-top:6px;font-size:11.5px;color:var(--ink2)}.lg .lgln{margin-right:5px;vertical-align:-1px}
.bars,.funnel{display:flex;flex-direction:column;gap:7px}
.brow,.frow{display:flex;align-items:center;gap:9px}.bk,.fk{min-width:96px;font-size:12px;color:var(--ink2)}
.btrack,.ftrack{flex:1;height:9px;background:var(--line2);border-radius:6px;overflow:hidden}
.bfill{display:block;height:100%;background:var(--gold);border-radius:6px}.ffill{display:block;height:100%;background:linear-gradient(90deg,var(--gold),var(--green));border-radius:6px}
.bn{min-width:72px;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;font-size:12.5px}.bn i{font-style:normal;color:var(--muted);font-weight:500;font-size:10.5px;margin-left:5px}
.fn{min-width:56px;text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.note{font-size:11px;color:var(--muted);margin:9px 0 0}.note code,pre{background:var(--line2);border-radius:4px;padding:1px 5px;font-size:11px}
.decision{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:-2px 0 11px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);font-size:11.5px}.decision span{color:var(--ink3);text-align:right}
@media(max-width:560px){.decision{align-items:flex-start;flex-direction:column}.decision span{text-align:left}}
.snt{width:100%;border-collapse:collapse;font-size:12px}.snt th,.snt td{border:1px solid var(--line2);padding:4px 8px;text-align:right}.snt th{color:var(--ink3);font-weight:600;background:var(--bg)}.snt td:first-child,.snt th:first-child{text-align:left}
.empty,.empty-state{color:var(--muted)}.empty-state pre{display:block;padding:9px 12px;margin:8px 0;white-space:pre-wrap}
.foot{font-size:11px;color:var(--muted);margin-top:16px;line-height:1.6}
</style></head><body><div class="wrap">
<h1>모델터 계기판</h1><p class="sub">${sub} · 생성 ${genAt} · 익명 집계(수치·PII 없음)</p>
${body}
</div></body></html>`;
}

if (require.main === module) {
  const snaps = loadSnapshots();
  try {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, build(snaps));
  } catch (e) {
    console.error('대시보드 파일을 쓰지 못했습니다: ' + OUT + '\n  → ' + e.message +
      '\n  쓰기 권한이 있는 경로로 --out 을 지정하세요. 예: node tools/modelter-report.js --out ./dashboard.html');
    process.exit(1);
  }
  console.log('✅ 대시보드 생성: ' + path.relative(ROOT, OUT) + '  (스냅샷 ' + snaps.length + '개)');
  console.log('   브라우저로 열기: file://' + OUT);
}

module.exports = { build, loadSnapshots };
