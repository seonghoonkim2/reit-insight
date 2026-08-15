#!/usr/bin/env node
/* 네이버 IM 첫 검토 글용 샘플 화면 4장 재현 캡처.
 * - 배포 서버가 아니라 로컬 정적 파일만 연다: 실제 /e 전송 0
 * - 매번 새 브라우저 컨텍스트를 써 기존 사용자 저장값 0
 * - 앱에 내장된 예시 딜만 사용: 실제 딜명·수치·PII 0
 *
 * 실행: NODE_PATH=<playwright node_modules> node tools/capture-naver-assets.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

function req(mod) {
  try { return require(mod); } catch (_) {}
  for (const base of ['/opt/node22/lib/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules']) {
    try { return require(path.join(base, mod)); } catch (_) {}
  }
  return null;
}

const pw = req('playwright');
if (!pw) { console.error('playwright 모듈을 찾지 못했습니다'); process.exit(1); }

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'dart-search', 'web', 'modelter');
const OUT = path.join(ROOT, 'docs', 'assets', 'naver-im-first-look');
const PORT = 8978;
const URL0 = `http://127.0.0.1:${PORT}/`;

const server = http.createServer((rq, rs) => {
  let p = rq.url.split('?')[0].split('#')[0];
  if (p === '/') p = '/index.html';
  if (p === '/e') { rs.writeHead(204); rs.end(); return; }
  let f = path.join(WEB, p);
  if (!path.extname(f) && fs.existsSync(f + '.html')) f += '.html';
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); rs.end(); return; }
  const ext = path.extname(f).toLowerCase();
  const type = ext === '.png' ? 'image/png' : ext === '.svg' ? 'image/svg+xml' : ext === '.css' ? 'text/css' : ext === '.js' ? 'application/javascript' : 'text/html; charset=utf-8';
  rs.writeHead(200, { 'Content-Type': type });
  rs.end(fs.readFileSync(f));
});

async function settle(page) {
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}html{scroll-behavior:auto!important}' });
  await page.evaluate(() => { try { localStorage.setItem('mt_qa', '1'); } catch (_) {} });
  await page.waitForTimeout(350);
}

async function capture(page, name) {
  const out = path.join(OUT, name);
  await page.screenshot({ path: out, type: 'jpeg', quality: 88, fullPage: false });
  const b = fs.readFileSync(out);
  if (b.length < 30000 || b[0] !== 0xff || b[1] !== 0xd8) throw new Error(name + ': JPEG 생성 검증 실패');
  console.log(`  ✓ ${name} (${Math.round(b.length / 1024)}KB · 1440×960)`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(resolve => server.listen(PORT, resolve));
  const browser = await pw.chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1, colorScheme: 'light' });
  const page = await ctx.newPage();
  try {
    console.log('네이버 게시용 샘플 화면 캡처');

    await page.goto(URL0, { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.evaluate(() => scrollTo(0, 0));
    await capture(page, '01-home-first-number.jpg');

    await page.goto(URL0 + 'im-checklist', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.evaluate(() => scrollTo(0, 0));
    await capture(page, '02-im-checklist.jpg');

    await page.goto(URL0 + '?publish_asset=1#t=office&src=sns', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.evaluate(() => { const el = document.getElementById('builder-start'); if (el) el.scrollIntoView({ block: 'start' }); scrollBy(0, -70); });
    await page.waitForTimeout(550);
    await capture(page, '03-office-first-number.jpg');

    await page.locator('#handoffBtn').scrollIntoViewIfNeeded();
    await page.locator('#handoffBtn').click();
    const visible = await page.locator('#sharePop').isVisible();
    if (!visible) throw new Error('팀 전달 메뉴가 열리지 않았습니다');
    await page.locator('#sharePop').scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await capture(page, '04-team-handoff.jpg');

    console.log('✅ 실제 딜·계정 정보 없는 게시 자산 4장 생성');
  } finally {
    await ctx.close();
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(err => { console.error(err); process.exit(1); });
