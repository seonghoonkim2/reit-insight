/* 모델터 로딩 성능 실측 — 저사양 모바일 근사(CPU 감속 + 네트워크 스로틀)
 * 사용: node tools/qa/perf-load.js
 * 예산(docs/STRATEGY.md): 저가 모바일 근사 첫 결과 ≤ 5s (경보성 — 초과 시 에스컬레이션 사다리 검토)
 * 외부 CDN 요청은 즉시 차단(실서비스에선 KR 엣지 수십 ms — 샌드박스 프록시 지연 아티팩트 제거) */
function req(m){ try{ return require(m); }catch(e){} for (const b of ['/opt/node22/lib/node_modules','/usr/lib/node_modules']) { try{ return require(require('path').join(b,m)); }catch(e){} } throw new Error('playwright 없음'); }
const { chromium } = req('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path'); const zlib = require('zlib');
const path0 = require('path');
const ROOT = path0.resolve(__dirname, '..', '..', 'dart-search', 'web', 'modelter');
const PORT = 8955;
// gzip 전송을 시뮬레이션하는 서버 (CF와 유사)
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0].split('#')[0]; if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  const body = zlib.gzipSync(fs.readFileSync(f), { level: 6 });
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Encoding': 'gzip' });
  res.end(body);
});
(async () => {
  await new Promise(r => server.listen(PORT, r));
  const fs2=require('fs');
  let exe=process.env.CHROME_BIN||null;
  if(!exe){ try{ for(const d of fs2.readdirSync('/opt/pw-browsers')){ if(/^chromium/.test(d)){ const c='/opt/pw-browsers/'+d+'/chrome-linux/chrome'; if(fs2.existsSync(c)){ exe=c; break; } } } }catch(e){} }
  const browser = await chromium.launch(exe?{ executablePath: exe }:{});
  let budgetFail = false;

  for (const [label, cpu, net, firstResultBudget] of [
    ['데스크톱·무제한', 1, null, null],
    ['중급 모바일 근사 (CPU 4x 감속 + 4G)', 4, { downloadThroughput: 4 * 1024 * 1024 / 8, uploadThroughput: 1 * 1024 * 1024 / 8, latency: 60 }, null],
    ['저가 모바일 근사 (CPU 6x 감속 + Fast3G)', 6, { downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8, latency: 150 }, 5000],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    // 외부 CDN(폰트 등)은 즉시 차단 — 샌드박스 프록시 지연 아티팩트 제거 (실서비스에선 KR 엣지에서 수십 ms)
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    if (net) { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', Object.assign({ offline: false }, net)); }
    const t0 = Date.now();
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
    const dcl = Date.now() - t0;
    // 첫 결과(예시 KPI) 표시까지 — 제거된 역할 선택 온보딩을 기다리지 않고 현재 진입 경로 그대로 잰다.
    await page.waitForFunction(() => {
      const c = document.getElementById('simCard');
      return c && !c.hidden && !c.classList.contains('noresult') && document.querySelectorAll('#simKpis .sim-kpi').length > 0;
    }, null, { timeout: 30000 });
    const firstResult = Date.now() - t0;
    const nav = await page.evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0];
      return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), transfer: n.transferSize };
    });
    console.log(`[${label}]`);
    console.log(`  DOMContentLoaded ${nav.dcl}ms · load ${nav.load}ms · 첫 결과 표시 ${firstResult}ms`);
    if (firstResultBudget) {
      const pass = firstResult <= firstResultBudget;
      console.log(`  ${pass ? '✓' : '✗'} 첫 결과 예산 ${firstResultBudget}ms ${pass ? '통과' : '초과'}`);
      if (!pass) budgetFail = true;
    }
    await ctx.close();
  }
  await browser.close(); server.close();
  if (budgetFail) process.exitCode = 1;
})().catch(e => { console.error(e); server.close(); process.exit(1); });
