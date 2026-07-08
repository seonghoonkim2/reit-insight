#!/usr/bin/env node
/* 모델터 스모크 QA — 실제 브라우저(Playwright/Chromium)로 핵심 사용자 경로를 회귀 검사
 *
 * 사용:   node tools/qa/smoke.js
 * 준비물: playwright 모듈 + Chromium 실행 파일
 *   · 모듈: 전역(npm i -g playwright) 또는 로컬 node_modules
 *   · 브라우저: PLAYWRIGHT_BROWSERS_PATH의 chromium, 또는 CHROME_BIN 환경변수로 지정
 *
 * 검사 대상은 배포 파일(dart-search/web/modelter/)이며, 내장 http 서버로 서빙합니다
 * (다운로드·클립보드 때문에 file:// 로는 동작하지 않음).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

/* ── playwright + chromium 해석 ── */
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
  return null; // playwright 기본 탐색에 맡김
}

const ROOT = path.resolve(__dirname, '..', '..');
const WEB = path.join(ROOT, 'dart-search', 'web', 'modelter');
const PORT = 8977;
let pass = 0, fail = 0;
const failures = [];
function ok(c, msg) { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; failures.push(msg); console.log('  ✗ FAIL: ' + msg); } }

const server = http.createServer((rq, rs) => {
  let p = rq.url.split('?')[0].split('#')[0]; if (p === '/') p = '/index.html';
  const f = path.join(WEB, p);
  if (!fs.existsSync(f)) { rs.writeHead(404); rs.end(); return; }
  rs.writeHead(200, { 'Content-Type': p.endsWith('.xml') ? 'application/xml' : 'text/html; charset=utf-8' });
  rs.end(fs.readFileSync(f));
});
const URL0 = `http://127.0.0.1:${PORT}/`;

async function fresh(browser, opt) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 } }, opt || {}));
  const page = await ctx.newPage();
  return { ctx, page };
}
async function closeOverlays(page) {
  try { const ob = page.locator('[data-role="acq"]'); if (await ob.first().isVisible({ timeout: 1500 }).catch(() => false)) { await ob.first().click(); await page.waitForTimeout(250); } } catch (e) {}
  try { const wn = page.locator('#wnClose'); if (await wn.isVisible({ timeout: 700 }).catch(() => false)) { await wn.click(); } } catch (e) {}
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const exe = chromePath();
  const browser = await pw.chromium.launch(exe ? { executablePath: exe } : {});

  // ── [1] 4개 딜 회귀 + 자동 판정 ──
  console.log('\n[1] 4개 딜 회귀');
  {
    const { ctx, page } = await fresh(browser);
    await page.goto(URL0); await closeOverlays(page); await page.waitForTimeout(300);
    for (const d of ['office', 'logistics', 'dev', 'refi']) {
      const r = await page.evaluate((dd) => {
        cur = dd; fillExample();
        const c = document.getElementById('simCard'); const v = document.getElementById('simVerdict');
        return { shown: c && !c.hidden && !c.classList.contains('noresult'), verdict: v ? v.textContent.trim().length : 0 };
      }, d);
      ok(r.shown && r.verdict > 5, d + ' 예시 → 결과 + 판정');
    }
    // 공유 링크 왕복 + 한 줄 보고
    const rt = await page.evaluate(() => {
      cur = 'office'; fillExample();
      const url = shareLink(true); const back = JSON.parse(mtLZ.decompress(url.split('#v=')[1]));
      const ol = oneLineReport();
      return { same: back.c === 'office' && back.s.price === state.price, ol: typeof ol === 'string' && ol.startsWith('[모델터]') && /#v=/.test(ol) };
    });
    ok(rt.same, '공유 링크 인코딩 왕복');
    ok(rt.ol, '한 줄 보고 생성');
    // 용어 도움말 링크
    const links = await page.evaluate(() => Array.from(document.querySelectorAll('#simCard .k-help')).map(a => a.getAttribute('href')));
    ok(links.length >= 3 && links.every(h => /^\/guide\.html#[a-z]+$/.test(h)), 'KPI 용어 ? 링크 (' + links.length + '개)');
    // IC 원페이저 판정
    const psv = await page.evaluate(() => { buildPrintSummary(); return document.getElementById('printSummary').innerHTML.includes('ps-verdict'); });
    ok(psv, 'IC 원페이저 ps-verdict');
    await ctx.close();
  }

  // ── [2] 빈 상태 · 침묵 기본값 차단 ──
  console.log('\n[2] 빈 상태');
  {
    const { ctx, page } = await fresh(browser);
    await page.goto(URL0); await closeOverlays(page); await page.waitForTimeout(300);
    const e1 = await page.evaluate(() => {
      cur = 'office'; fillExample(); state.price = ''; renderSim();
      const el = document.querySelector('.sim-empty');
      return { empty: !!el, label: el ? /매입가/.test(el.textContent) : false };
    });
    ok(e1.empty && e1.label, '매입가 삭제 → 빈 상태 + 라벨');
    const e2 = await page.evaluate(() => {
      fillExample(); state.gfa = ''; renderSim();
      const el = document.querySelector('.sim-empty');
      return el && /연면적/.test(el.textContent);
    });
    ok(e2, '연면적 삭제 → 빈 상태 (침묵 기본값 차단)');
    const e3 = await page.evaluate(() => { fillExample(); renderSim(); return !document.querySelector('.sim-empty'); });
    ok(e3, '예시 복원 → 결과 복귀');
    await ctx.close();
  }

  // ── [3] 딥링크 ──
  console.log('\n[3] 딥링크');
  {
    const { ctx, page } = await fresh(browser);
    await page.goto(URL0 + '#t=refi'); await page.waitForTimeout(900);
    const st = await page.evaluate(() => ({
      cur: cur,
      ob: (() => { const o = document.getElementById('obOverlay'); return o ? !o.hidden : false; })(),
      wn: (() => { const o = document.getElementById('wnOverlay'); return o ? !o.hidden : false; })(),
      res: (() => { const c = document.getElementById('simCard'); return c && !c.hidden && !c.classList.contains('noresult'); })(),
    }));
    ok(st.cur === 'refi' && st.res, '#t=refi → 탭 + 예시 결과');
    ok(!st.ob && !st.wn, '딥링크 진입 시 온보딩·What\'s new 억제');
    await ctx.close();
  }

  // ── [4] 모바일: 위저드 + 가로 스크롤 ──
  console.log('\n[4] 모바일');
  {
    const { ctx, page } = await fresh(browser, { viewport: { width: 390, height: 844 } });
    await page.goto(URL0 + '#t=office'); await page.waitForTimeout(900);
    const hs = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(hs <= 2, '가로 스크롤 없음 (' + hs + 'px)');
    ok(await page.locator('#wizBtn').isVisible(), '⚡핵심만 버튼 표시');
    await page.evaluate(() => window.__wizOpen());
    await page.waitForTimeout(250);
    // asset 스킵 → price 입력·환산 → 나머지 스킵 → 완료
    await page.locator('[data-w="next"]').click(); await page.waitForTimeout(120);
    await page.locator('#wizIn').fill('120000'); await page.locator('#wizIn').dispatchEvent('input');
    const conv = await page.evaluate(() => document.getElementById('wizConv').textContent);
    ok(conv === '= 1,200억', '위저드 억조 환산 (' + conv + ')');
    const steps = await page.evaluate(() => document.querySelectorAll('.wiz-dot').length);
    for (let i = 1; i < steps - 1; i++) { await page.locator('[data-w="next"]').click(); await page.waitForTimeout(100); }
    const finTxt = await page.evaluate(() => document.querySelector('.wiz-sheet').textContent);
    ok(/입력 완료/.test(finTxt), '위저드 완료 화면');
    await page.locator('[data-w="done"]').click(); await page.waitForTimeout(500);
    const sync = await page.evaluate(() => ({ closed: !document.querySelector('.wiz-ov'), price: state.price, form: (document.getElementById('f_price') || {}).value }));
    ok(sync.closed && sync.price === '120000' && sync.form === '120000', '위저드 → 폼 상태 동기화');
    await ctx.close();
  }

  // ── [5] 성능 가드: dev 키 입력당 재계산 ──
  console.log('\n[5] 성능 가드');
  {
    const { ctx, page } = await fresh(browser);
    await page.goto(URL0); await closeOverlays(page); await page.waitForTimeout(300);
    const perf = await page.evaluate(() => {
      cur = 'dev'; fillExample(); update(); update();
      const runs = [];
      for (let i = 0; i < 7; i++) { const t0 = performance.now(); update(); runs.push(performance.now() - t0); }
      runs.sort((a, b) => a - b);
      return runs[3];
    });
    ok(perf < 500, 'dev update 중앙값 ' + perf.toFixed(0) + 'ms (<500ms — 민감도 셀에서 simDevResi 호출 금지 회귀 가드)');
    await ctx.close();
  }

  // ── [6] What's new: 재방문 자동 노출 + v3 라벨 ──
  console.log('\n[6] What\'s new');
  {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => { localStorage.setItem('mt_onboarded', '1'); });
    const page = await ctx.newPage();
    await page.goto(URL0); await page.waitForTimeout(800);
    const wn = await page.evaluate(() => {
      const ov = document.getElementById('wnOverlay');
      return { shown: ov && !ov.hidden, v3: /What's new · v3/.test(ov ? ov.textContent : '') };
    });
    ok(wn.shown && wn.v3, '재방문 What\'s new 자동 노출 + v3 라벨');
    await ctx.close();
  }

  // ── [7] 배포 안전: 테스트 훅 부재 ──
  console.log('\n[7] 배포 안전');
  {
    const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
    ok(!html.includes('__mtCalc'), '__mtCalc 훅 없음');
    ok(fs.existsSync(path.join(WEB, 'guide.html')) && fs.existsSync(path.join(WEB, 'og.png')), 'guide.html·og.png 존재');
  }

  await browser.close(); server.close();
  console.log('\n결과: ' + pass + ' 통과, ' + fail + ' 실패' + (fail ? '\n' + failures.map(f => ' - ' + f).join('\n') : ''));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('QA 예외:', e); try { server.close(); } catch (e2) {} process.exit(1); });
