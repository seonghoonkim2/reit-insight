#!/usr/bin/env node
/* 모델터 오프라인 실증 QA — "페이지 로드 이후에는 네트워크 없이 전 기능 동작" 주장(trust.html)을
 * 실제 브라우저에서 재현 검증. 망분리·외부 통신 차단 사내망 검토에 제시하는 신뢰 자산.
 *
 * 사용:   node tools/qa/offline.js
 * 시나리오: 로드 완료 → 네트워크 완전 차단(setOffline) →
 *   (1) 오피스 예시 + update → KPI·판정 렌더
 *   (2) 엑셀 생성(__downloadXlsx) → Blob(zip) 캡처
 *   (3) 공유 링크(shareLink) 문자열 생성 + 인코딩 왕복
 *   (4) /e 비콘은 조용히 실패, 페이지 에러 0건
 *
 * smoke.js와 같은 이유로 내장 http 서버로 서빙(file:// 불가). 준비물도 동일(playwright + Chromium).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

/* ── playwright + chromium 해석 (smoke.js와 동일 부트 패턴) ── */
function req(mod) {
  try { return require(mod); } catch (e) {}
  for (const base of ['/opt/node22/lib/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules']) {
    try { return require(path.join(base, mod)); } catch (e) {}
  }
  return null;
}
const pw = req('playwright');
if (!pw) { console.error('playwright 모듈을 찾지 못했습니다 (npm i -g playwright)'); process.exit(1); }
function chromePath() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(Boolean);
  for (const r of roots) {
    try {
      for (const d of fs.readdirSync(r)) {
        if (!/^chromium/.test(d)) continue;
        for (const c of [path.join(r, d, 'chrome-linux', 'chrome'), path.join(r, d, 'chrome-linux', 'headless_shell'), path.join(r, d)]) {
          if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
        }
      }
    } catch (e) {}
  }
  return null;
}

const ROOT = path.resolve(__dirname, '..', '..');
const WEB = path.join(ROOT, 'dart-search', 'web', 'modelter');
const PORT = 8978;   // smoke.js(8977)와 겹치지 않게
let pass = 0, fail = 0;
const failures = [];
function ok(c, msg) { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; failures.push(msg); console.log('  ✗ FAIL: ' + msg); } }

const server = http.createServer((rq, rs) => {
  let p = rq.url.split('?')[0].split('#')[0]; if (p === '/') p = '/index.html';
  if (p === '/e') { rs.writeHead(204); rs.end(); return; }
  let f = path.join(WEB, p);
  if (!path.extname(f) && fs.existsSync(f + '.html')) f += '.html';
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); rs.end(); return; }
  rs.writeHead(200, { 'Content-Type': p.endsWith('.xml') ? 'application/xml' : 'text/html; charset=utf-8' });
  rs.end(fs.readFileSync(f));
});
const URL0 = `http://127.0.0.1:${PORT}/`;

async function closeOverlays(page) {
  try { const ob = page.locator('[data-role="acq"]'); if (await ob.first().isVisible({ timeout: 1500 }).catch(() => false)) { await ob.first().click(); await page.waitForTimeout(250); } } catch (e) {}
  try { const wn = page.locator('#wnClose'); if (await wn.isVisible({ timeout: 700 }).catch(() => false)) { await wn.click(); } } catch (e) {}
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const exe = chromePath();
  const browser = await pw.chromium.launch(exe ? { executablePath: exe } : {});
  // 서비스 워커 차단 — SW 캐시 폴백이 setOffline 차단을 우회하면 "무네트워크 동작"이 아닌
  // "캐시 동작"을 재는 셈이라, 순수 앱 자체의 오프라인 동작만 검증
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();

  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String((e && e.message) || e)));
  let beaconFail = 0; const otherFail = [];
  page.on('requestfailed', r => { const u = r.url().split('?')[0]; if (u.endsWith('/e')) beaconFail++; else otherFail.push(u); });
  page.on('dialog', d => d.accept().catch(() => {}));   // 예시값 잔존 confirm — 수락해야 산출물 진행

  // ── [0] 온라인 로드(1회) — 이후 모든 검사는 네트워크 차단 상태 ──
  console.log('\n[0] 로드');
  await page.goto(URL0); await closeOverlays(page); await page.waitForTimeout(400);
  const boot = await page.evaluate(() => typeof fillExample === 'function' && typeof update === 'function' && typeof shareLink === 'function' && typeof window.__downloadXlsx === 'function');
  ok(boot, '앱 로드 완료 (핵심 전역 함수 존재)');

  await ctx.setOffline(true);
  const netDead = await page.evaluate(() => fetch('/robots.txt', { cache: 'no-store' }).then(() => false).catch(() => true));
  ok(netDead, '네트워크 차단 적용 확인 (fetch 실패)');

  // ── [1] 오프라인 계산: 오피스 예시 → KPI·판정 렌더 ──
  console.log('\n[1] 오프라인 계산');
  const r1 = await page.evaluate(() => {
    cur = 'office'; fillExample(); update();
    const c = document.getElementById('simCard'), v = document.getElementById('simVerdict'), k = document.getElementById('simKpis');
    return {
      shown: c && !c.hidden && !c.classList.contains('noresult'),
      verdict: v ? v.textContent.trim().length : 0,
      kpis: k ? k.querySelectorAll('.sim-kpi').length : 0,
    };
  });
  ok(r1.shown && r1.verdict > 5 && r1.kpis >= 3, '오피스 예시 → KPI ' + r1.kpis + '개 + 판정 렌더');

  // ── [2] 오프라인 엑셀 생성: Blob(zip) 캡처 ──
  console.log('\n[2] 오프라인 엑셀 생성');
  const r2 = await page.evaluate(async () => {
    try { sessionStorage.setItem('mt_ex_ack', '1'); } catch (e) {}   // 예시값 confirm 생략 — 대화상자 아닌 생성 자체가 검증 대상
    const orig = URL.createObjectURL; let blob = null;
    URL.createObjectURL = function (b) { blob = b; return orig.call(URL, b); };
    const oc = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) return; return oc.call(this); };  // 파일 저장 클릭만 흡수 — Blob 생성까지가 검증 대상
    try { window.__downloadXlsx(); } finally { URL.createObjectURL = orig; HTMLAnchorElement.prototype.click = oc; }
    if (!blob) return { got: false };
    const u8 = new Uint8Array(await blob.arrayBuffer());
    return { got: true, size: blob.size, zip: u8[0] === 0x50 && u8[1] === 0x4b, type: blob.type };
  });
  ok(r2.got && r2.zip && r2.size > 10000 && /spreadsheetml/.test(r2.type || ''),
    '__downloadXlsx → xlsx Blob 생성 (' + (r2.got ? Math.round(r2.size / 1024) + 'KB, zip 시그니처 ' + (r2.zip ? 'OK' : 'X') : '캡처 실패') + ')');

  // ── [3] 오프라인 공유 링크: 문자열 생성 + 인코딩 왕복 ──
  console.log('\n[3] 오프라인 공유 링크');
  const r3 = await page.evaluate(() => {
    const url = shareLink(true, 'share');
    let round = false;
    try {
      const enc = url.split('#v=')[1].split('&')[0];
      const back = JSON.parse(mtLZ.decompress(enc));
      round = back.c === 'office' && back.s && back.s.price === state.price;
    } catch (e) {}
    return { str: typeof url === 'string' && url.indexOf('#v=') > 0 && /[&#]src=share/.test(url), round };
  });
  ok(r3.str, 'shareLink(true,\'share\') → #v=…&src=share 문자열 생성');
  ok(r3.round, '공유 링크 인코딩 왕복 (딜·매입가 일치)');

  // ── [4] 비콘 침묵 실패 + 페이지 에러 0 ──
  console.log('\n[4] 네트워크 실패 격리');
  const r4 = await page.evaluate(() => { try { if (window.mtTrack) mtTrack('qa_offline'); return true; } catch (e) { return false; } });
  await page.waitForTimeout(500);   // 비콘 실패 이벤트 수집 여유
  ok(r4, 'track() 오프라인 호출이 예외 없이 반환 (조용한 실패)');
  ok(pageErrors.length === 0, '오프라인 작업 전체에서 페이지 에러 0건' + (pageErrors.length ? ' — ' + pageErrors.slice(0, 3).join(' | ') : ''));
  console.log('  · /e 비콘 실패 ' + beaconFail + '건 (무시됨 — 정상)' + (otherFail.length ? ' · 기타 요청 실패 ' + otherFail.length + '건: ' + otherFail.slice(0, 3).join(', ') : ''));

  await ctx.close(); await browser.close(); server.close();
  console.log('\n결과: ' + pass + ' 통과, ' + fail + ' 실패' + (fail ? '\n' + failures.map(f => ' - ' + f).join('\n') : ''));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('QA 예외:', e); try { server.close(); } catch (e2) {} process.exit(1); });
