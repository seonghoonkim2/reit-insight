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
  if (p === '/e') { rs.writeHead(204); rs.end(); return; }              // 익명 이벤트 수집 흉내(비콘 검사용)
  let f = path.join(WEB, p);
  if (!path.extname(f) && fs.existsSync(f + '.html')) f += '.html';      // Cloudflare 에셋처럼 무확장 → .html 해석
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); rs.end(); return; }
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
      return { same: back.c === 'office' && back.s.price === state.price, ol: typeof ol === 'string' && ol.startsWith('[모델터]') && /#v=/.test(ol), branded: /^\[모델터\] 1차 검토/.test(ol) };
    });
    ok(rt.same, '공유 링크 인코딩 왕복');
    ok(rt.ol, '한 줄 보고 생성');
    ok(rt.branded, '한 줄 보고에 1차 검토 용어 고정');
    const hb = page.locator('#handoffBtn');
    const hbShown = await hb.isVisible();
    await hb.click();
    const hpText = await page.locator('#sharePop').innerText();
    ok(hbShown && /팀에 1차 검토 보내기/.test(hpText), '결과 직후 팀 전달 버튼 → 공유 메뉴');
    await hb.click();
    // 용어 도움말 링크
    const links = await page.evaluate(() => Array.from(document.querySelectorAll('#simCard .k-help')).map(a => a.getAttribute('href')));
    ok(links.length >= 3 && links.every(h => /^\/guide#[a-z]+$/.test(h)), 'KPI 용어 ? 링크·무확장 URL (' + links.length + '개)');
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
    const e3 = await page.evaluate(() => {
      fillExample(); renderSim(); renderInpProg();
      return { result: !document.querySelector('.sim-empty'), sample: !document.getElementById('sampleStart').hidden, progress: /예시 입력/.test(document.getElementById('ipTxt').textContent) };
    });
    await page.locator('#sampleStartBtn').click();
    const ownFocus = await page.evaluate(() => document.activeElement && document.activeElement.id === 'f_price' && sessionStorage.getItem('mt_sample_start') === '1');
    ok(e3.result && e3.sample && e3.progress && ownFocus, '예시 복원 → 예시 상태 공개 → 내 딜 첫 숫자 포커스');
    await ctx.close();
  }

  // ── [3] 딥링크 ──
  console.log('\n[3] 딥링크');
  {
    const { ctx, page } = await fresh(browser);
    // 검색 → 정적 안내면 → 앱 CTA에서도 원 외부 호스트가 자기참조로 사라지지 않아야 한다.
    await page.goto(URL0 + 'im-checklist', { referer: 'https://www.google.com/search?q=cre+im' });
    await page.locator('a[href="/#t=office&src=imcheck"]').first().click(); await page.waitForTimeout(700);
    const refCarry = await page.evaluate(() => sessionStorage.getItem('mt_ref0'));
    const sources = ['seo', 'dscr', 'imcheck', 'howto', 'sns'];
    const states = [];
    for (const src of sources) {
      // 쿼리를 달리해 hashchange가 아닌 실제 새 방문으로 초기화 코드를 매번 검증한다.
      await page.goto(URL0 + '?smoke_src=' + src + '#t=refi&src=' + src); await page.waitForTimeout(900);
      states.push(await page.evaluate(() => ({
        cur: cur,
        ob: !!document.getElementById('obOverlay'),
        wn: (() => { const o = document.getElementById('wnOverlay'); return o ? !o.hidden : false; })(),
        res: (() => { const c = document.getElementById('simCard'); return c && !c.hidden && !c.classList.contains('noresult'); })(),
        hi: !!document.querySelector('#formBody .core-g.core-hi'),
        toast: /첫 입력부터 내 딜 숫자로/.test(document.getElementById('toast').textContent),
        src: sessionStorage.getItem('mt_src'),
      })));
    }
    const st = states[states.length - 1];
    ok(refCarry === 'www.google.com' && states.every((s, i) => s.cur === 'refi' && s.res && s.hi && s.toast && s.src === sources[i]), '정적 착지 외부 유입원 보존 + 고의도 콘텐츠 5채널 → 탭·예시·첫 입력 인계');
    ok(!st.ob && !st.wn, '딥링크 진입 시 자동 팝업 없음');
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

  // ── [6] What's new: 자동으로 뜨지 않고, 배너 버튼으로만 열림 + v3 라벨 ──
  console.log('\n[6] What\'s new');
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(URL0); await page.waitForTimeout(1200);
    const before = await page.evaluate(() => {
      const ov = document.getElementById('wnOverlay'), bar = document.getElementById('announce');
      return { auto: !!(ov && !ov.hidden), bar: !!(bar && !bar.hidden) };
    });
    ok(!before.auto, '도착 시 What\'s new 자동 팝업 없음');
    ok(before.bar, '공지 배너는 표시됨(팝업 진입로)');
    await page.click('#annMore'); await page.waitForTimeout(400);
    const wn = await page.evaluate(() => {
      const ov = document.getElementById('wnOverlay');
      return { shown: ov && !ov.hidden, v3: /What's new · v3/.test(ov ? ov.textContent : '') };
    });
    ok(wn.shown && wn.v3, '배너 버튼 클릭 → What\'s new 열림 + v3 라벨');
    await ctx.close();
  }

  // ── [6-b] 재방문 착지: 소개 접힘 → 딜 탭이 첫 화면에 ──
  console.log('\n[6-b] 재방문 착지');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('mt_used', '1'); } catch (e) {} });
    const page = await ctx.newPage();
    await page.goto(URL0); await page.waitForTimeout(1200);
    const st = await page.evaluate(() => ({
      why: getComputedStyle(document.querySelector('.why')).display !== 'none',
      tabsY: Math.round(document.getElementById('builder-start').getBoundingClientRect().top + scrollY),
      toggle: getComputedStyle(document.getElementById('introBack')).display !== 'none',
    }));
    ok(!st.why && st.tabsY < 400, `재방문: 소개 접고 딜 탭이 첫 화면에 (y=${st.tabsY})`);
    ok(st.toggle, '소개 펼치기 토글 노출');
    await page.click('#introBack'); await page.waitForTimeout(400);
    ok(await page.evaluate(() => getComputedStyle(document.querySelector('.why')).display !== 'none'), '펼치기 → 소개 복원');
    await ctx.close();
  }

  // ── [6-c] 도구 · 저장 블록: 기본 닫힘, 열면 깊이·IM·보관함이 그 안에 ──
  console.log('\n[6-c] 도구 · 저장 블록');
  {
    const { ctx, page } = await fresh(browser);
    await page.goto(URL0 + '#t=office'); await page.waitForTimeout(1400);
    const st = await page.evaluate(() => {
      const tf = document.getElementById('toolsFold');
      const panel = document.querySelector('#formBody').closest('.panel');
      const first = document.querySelector('#formBody input[data-k]');
      return {
        closed: tf && !tf.open,
        summary: tf ? tf.querySelector('#tfNow').textContent : '',
        gap: Math.round(first.getBoundingClientRect().top - panel.getBoundingClientRect().top),
        depthOutside: !!document.querySelector('#formBody #depthSeg'),
      };
    });
    ok(st.closed, '도구 블록 기본 닫힘');
    ok(/시트/.test(st.summary), `닫힌 채로 현재 깊이 표시 (${st.summary})`);
    ok(st.gap < 320, `패널 상단→첫 입력칸 ${st.gap}px (<320)`);
    ok(!st.depthOutside, '깊이 선택이 입력 폼 위에 없음');
    await page.evaluate(() => { document.getElementById('toolsFold').open = true; });
    await page.waitForTimeout(300);
    const inside = await page.evaluate(() => {
      const tf = document.getElementById('toolsFold');
      return ['#depthSeg', '.imfold', '#slotSel', '#srcBtn', '#chkBtn', '#myDefBtn', '#shareBtn', '#clearBtn']
        .filter(s => !tf.querySelector(s));
    });
    ok(inside.length === 0, '도구 블록 안에 깊이·IM·보관함·출처·점검·기본값·공유·비우기 모두 존재' + (inside.length ? ' — 누락 ' + inside.join(',') : ''));
    await page.click('#toolsFold .depth-opt[data-depth="deep"]'); await page.waitForTimeout(900);
    ok(await page.evaluate(() => /심층/.test(document.getElementById('tfNow').textContent)), '도구 블록 안에서 깊이 전환 동작');
    await ctx.close();
  }

  // ── [7] 산출물: IC 패키지 7장 + BYOK 진입점 ──
  console.log('\n[7] IC 패키지 · BYOK');
  {
    const { ctx, page } = await fresh(browser);
    await page.goto(URL0); await closeOverlays(page); await page.waitForTimeout(300);
    const ic = await page.evaluate(() => {
      cur = 'office'; fillExample(); update();
      const bytes = ICPPT.build();
      if (!bytes) return { err: 'null' };
      const names = Object.keys(XLSXREAD.readZip(bytes));
      return { slides: names.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length, size: bytes.length };
    });
    ok(ic.slides === 7, 'IC 패키지 7장 생성 (' + ic.slides + '장, ' + Math.round(ic.size / 1024) + 'KB)');
    const im = await page.evaluate(() => ({ btn: !!document.querySelector('.im-btn'), mod: typeof MTIM === 'object' }));
    ok(im.btn && im.mod, 'IM 추출(BYOK) 진입점 + 모듈');
    await ctx.close();
  }

  // ── [8] 에픽 표면 (E1~E8): 신뢰·회수·팀기준·착지·노트 ──
  console.log('\n[8] 에픽 표면 (신뢰·회수·팀기준·착지·노트)');
  {
    // E1 신뢰 센터 + E6 검증 페이지 — 무확장 URL로 렌더
    const { ctx, page } = await fresh(browser);
    await page.goto(URL0 + 'trust'); await page.waitForTimeout(200);
    const tr = await page.evaluate(() => ({ rows: document.querySelectorAll('table.fields tr[data-field]').length, print: !!document.querySelector('.printbtn') }));
    ok(tr.rows >= 10 && tr.print, '신뢰 센터(/trust) 렌더 — 수집 필드 표 ' + tr.rows + '행 + 인쇄');
    await page.goto(URL0 + 'verification'); await page.waitForTimeout(200);
    const vf = await page.evaluate(() => ({ badges: document.querySelectorAll('.pass,.fail,.na').length, build: !!document.querySelector('.build') }));
    ok(vf.badges >= 3 && vf.build, '파리티 공표(/verification) 렌더 — 판정 배지 + 빌드 식별자');
    await ctx.close();
  }
  {
    // E5 수요 가짜 문 + E2 회수 착지 CTA + src 어트리뷰션
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const beacons = [];
    page.on('request', r => { if (r.url().endsWith('/e') && r.method() === 'POST') { try { beacons.push(JSON.parse(r.postData() || '{}')); } catch (e) {} } });
    await page.goto(URL0); await closeOverlays(page); await page.waitForTimeout(300);
    await page.locator('.deal-soon').first().click(); await page.waitForTimeout(250);
    const want = beacons.find(b => b.t === 'deal_want');
    ok(want && want.deal && !('price' in want), '수요 가짜 문 클릭 → deal_want(딜명만) 비콘');
    // 읽기전용 착지: 마스킹 공유 링크 열기 → landing(src)·CTA·편집 전환
    const link = await page.evaluate(() => { cur = 'office'; fillExample(); return shareLink(true, 'share'); });
    const p2 = await ctx.newPage();
    const b2 = [];
    p2.on('request', r => { if (r.url().endsWith('/e') && r.method() === 'POST') { try { b2.push(JSON.parse(r.postData() || '{}')); } catch (e) {} } });
    await p2.goto(URL0.slice(0, -1) + link.substring(link.indexOf('#'))); await p2.waitForTimeout(700);
    const cta = await p2.evaluate(() => { const c = document.getElementById('roCta'); return c && !c.hidden; });
    await p2.evaluate(() => document.getElementById('roCtaBtn').click()); await p2.waitForTimeout(250);
    const landing = b2.find(b => b.t === 'landing'), rec = b2.find(b => b.t === 'recover_cta');
    const exited = await p2.evaluate(() => !window.__mtReadonly);
    ok(cta && landing && landing.src === 'share', '읽기전용 착지 → landing(src=share) + 하단 CTA');
    ok(rec && exited, '착지 CTA 클릭 → recover_cta + 편집 전환');
    await ctx.close();
  }
  {
    // E4 팀 기준 #h= 왕복: 내보내기 → 새 컨텍스트 미리보기 → 적용
    const c1 = await browser.newContext(); const p1 = await c1.newPage();
    await p1.goto(URL0); await p1.waitForTimeout(400);
    const hlink = await p1.evaluate(() => {
      localStorage.setItem('mt_house', JSON.stringify({ irr: '9', dscr: '1.3', team: '스모크팀', ver: 'v1' }));
      return houseShareLink();
    });
    await c1.close();
    const c2 = await browser.newContext(); const p2 = await c2.newPage();
    await p2.goto(URL0.slice(0, -1) + hlink.substring(hlink.indexOf('#'))); await p2.waitForTimeout(900);
    const preview = await p2.evaluate(() => [...document.querySelectorAll('.imx h3')].some(h => /팀 기준 설치/.test(h.textContent)));
    const before = await p2.evaluate(() => localStorage.getItem('mt_house'));
    await p2.evaluate(() => { const b = document.querySelector('[data-hi=apply]'); if (b) b.click(); }); await p2.waitForTimeout(250);
    const after = await p2.evaluate(() => JSON.parse(localStorage.getItem('mt_house') || '{}'));
    ok(preview && before === null && after.team === '스모크팀' && after.dscr === '1.3', '#h= 팀 기준: 미리보기(자동적용 금지) → 적용 왕복');
    await c2.close();
  }
  {
    // E8 분기 노트: 사전 입력 링크 → 가정 적용 (노트 파일은 분기별 — 최신 1개 검사)
    const note = fs.readdirSync(path.join(WEB, 'notes')).filter(f => f.endsWith('.html')).sort().pop();
    const { ctx, page } = await fresh(browser);
    await page.goto(URL0 + 'notes/' + note.replace(/\.html$/, '')); await page.waitForTimeout(200);
    const href = await page.$eval('a.cta', a => a.getAttribute('href'));
    const ov = /exitcap|pfrate/.test(href) ? null : href;  // 링크는 압축돼 있어 해시로 판별 불가 — 착지로 검증
    await page.goto(URL0.slice(0, -1) + href.substring(href.indexOf('#'))); await page.waitForTimeout(700);
    const applied = await page.evaluate(() => ({ deal: cur, exitcap: state.exitcap, hasResult: !!(document.getElementById('simKpis') || {}).textContent }));
    ok(applied.deal === 'office' && parseFloat(applied.exitcap) > 0 && applied.hasResult, '분기 노트(' + note + ') 사전 입력 링크 → 가정 적용 + 결과');
    await ctx.close();
  }

  // ── [9] 방법론 모달 — '내 숫자 대입'이 화면 KPI 문자열과 일치 (4딜, 모달 내 재계산 금지 검증) ──
  console.log('\n[9] 방법론 모달 대입 파리티');
  {
    const { ctx, page } = await fresh(browser);
    await page.goto(URL0); await page.waitForTimeout(700); await closeOverlays(page);
    for (const deal of ['office', 'logistics', 'dev', 'refi']) {
      await page.evaluate(d => { cur = d; fillExample(); update(); }, deal);
      await page.waitForTimeout(400);
      await page.evaluate(() => document.getElementById('mdOpen').click());
      const r = await page.evaluate(() => {
        const sec = document.getElementById('mdMineSec');
        const rows = [...document.querySelectorAll('#mdMineBody .md-f[data-kpi]')].map(el => ({ k: el.getAttribute('data-kpi'), v: el.getAttribute('data-v') }));
        const kmap = {};
        document.querySelectorAll('#simCard .sim-kpi').forEach(t => { const l = t.querySelector('.sk-l'), v = t.querySelector('.sk-v'); if (l && v) kmap[l.textContent.replace(/\?$/, '').trim()] = v.textContent.trim(); });
        document.querySelectorAll('#simCard .mx-item').forEach(t => { const l = t.querySelector('.mx-l'), v = t.querySelector('.mx-v'); if (l && v) kmap[l.textContent.replace(/\?$/, '').trim()] = v.textContent.trim(); });
        const m = (typeof simModel === 'function') ? simModel() : null;
        const emap = {}; if (m && m.kpis) m.kpis.forEach(k => emap[k.l] = k.v);
        return { hidden: sec ? sec.hidden : null, rows, kmap, emap };
      });
      await page.evaluate(() => document.getElementById('mdClose').click());
      if (deal === 'refi') { ok(r.hidden === true && r.rows.length === 0, 'refi: 대입 섹션 숨김(비교표 딜)'); continue; }
      const mm = r.rows.filter(row => (r.kmap[row.k] != null ? r.kmap[row.k] : r.emap[row.k]) !== row.v);
      ok(r.hidden === false && r.rows.length >= 3 && mm.length === 0, deal + ': 모달 대입 ' + r.rows.length + '개 == 화면 KPI 문자열' + (mm.length ? (' (불일치 ' + mm.map(x => x.k).join(',') + ')') : ''));
    }
    await ctx.close();
  }

  // ── [10] 배포 안전: 테스트 훅 부재 + 전송량 예산 ──
  console.log('\n[10] 배포 안전');
  {
    const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
    ok(!html.includes('__mtCalc'), '__mtCalc 훅 없음');
    ok(fs.existsSync(path.join(WEB, 'guide.html')) && fs.existsSync(path.join(WEB, 'howto.html')) && fs.existsSync(path.join(WEB, 'og.png')), 'guide·howto·og.png 존재');
    const gz = require('zlib').gzipSync(Buffer.from(html), { level: 6 }).length;
    ok(gz < 300 * 1024, 'gzip 전송량 ' + Math.round(gz / 1024) + 'KB (<300KB 예산)');
  }

  await browser.close(); server.close();
  console.log('\n결과: ' + pass + ' 통과, ' + fail + ' 실패' + (fail ? '\n' + failures.map(f => ' - ' + f).join('\n') : ''));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('QA 예외:', e); try { server.close(); } catch (e2) {} process.exit(1); });
