#!/usr/bin/env node
'use strict';
// 검색 페이지가 약속한 예시와 실제로 열리는 입력을 대조한다.
// --browser: 생성 파일을 쓰지 않고 로컬 서버에서 데스크톱·모바일 CTA를 검사한다.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { readExamples, exampleRows, calcPage, extractTerms } = require('../gen-pages');
const WEB = path.resolve(__dirname, '../../dart-search/web/modelter');
const app = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const examples = readExamples(app), terms = extractTerms();
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
const escape = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

for (const deal of ['office', 'logistics', 'dev', 'refi']) {
  const page = calcPage(deal, terms), ex = examples[deal];
  check(page.includes(escape(ex.state.asset)), deal + ': 앱 예시 자산명');
  check(page.includes('/#t=' + deal + '&src=seo'), deal + ': 같은 딜 CTA');
  for (const row of exampleRows(deal)) {
    check(page.includes('<td>' + escape(row[0]) + '</td><td class="r">' + escape(row[1]) + '</td>'), deal + ': 입력 행 ' + row[0]);
  }
  check(!page.includes('<tr class="out">'), deal + ': 별도 저장한 결과 숫자 없음');
  check(page.includes('실제 거래가 아닌 연습용 예시') || page.includes('실제 사업장이 아닌 연습용 예시'), deal + ': 가상 예시 명시');
  check(page.includes('엑셀에서 이어서 검토하기'), deal + ': 실제 편집 범위 안내');
  const ld = page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  check(JSON.parse(ld[1])['@graph'].length >= 2, deal + ': JSON-LD');
}

// 예시가 바뀌었을 때 이전 값에 고정되지 않는지, 0과 빈 값이 혼동되지 않는지 확인한다.
const changed = JSON.parse(JSON.stringify(examples));
changed.logistics.state.price = '123,456';
changed.logistics.state.exitcap = '6.7';
changed.logistics.stack.senior_rate = '0';
changed.logistics.stack.senior_extra = '원금균등';
let rows = Object.fromEntries(exampleRows('logistics', changed));
check(rows['매입가 · 감정가'].startsWith('1,234.56억'), '예시 매입가 변경·백만원→억원');
check(rows['Exit Cap · 보유기간'].startsWith('6.7%'), '예시 Exit Cap 변경');
check(rows['선순위 LTV · 금리'].includes('0% (원금균등)'), '금리 0과 상환방식 보존');
changed.logistics.stack.senior_on = false;
check(Object.fromEntries(exampleRows('logistics', changed))['선순위 LTV · 금리'] === '선순위 대출 미사용', '꺼진 대출의 저장 LTV를 표시하지 않음');
changed.office.state.noimode = 'NOI 직접 입력'; changed.office.state.noi1 = '0';
rows = Object.fromEntries(exampleRows('office', changed));
check(rows['1차연도 NOI'] === '0억' && !rows['평당 임대료 · 관리비'], '직접 NOI 0 입력 경로');
changed.office.state.noi1 = '';
assert.throws(() => exampleRows('office', changed), /숫자가 아닙니다/); checks++;
assert.throws(() => readExamples('const EXAMPLES={\n};'), /누락/); checks++;
const logistics = calcPage('logistics', terms), refi = calcPage('refi', terms), dev = calcPage('dev', terms);
check(!logistics.includes('평당 임대료(저층·고층 구분)') && !logistics.includes('<li>마스터리스 여부</li>'), '존재하지 않는 물류 입력 항목 약속 없음');
check(logistics.includes('별도 마스터리스 선택 항목은 없습니다') && logistics.includes('공동주택 분양 사업수지'), '책임임대차·물류 개발 지원 범위');
check(refi.includes('기존 잔존 만기와 상환방식은 참고 항목'), '리파이 기록용 항목 구분');
check(dev.includes('사업 일정이나 민감도를 바꾸려면 웹에서'), '개발 재생성 범위');

async function browserChecks() {
  const { chromium } = require('playwright');
  const server = http.createServer((req, res) => {
    let p = new URL(req.url, 'http://localhost').pathname;
    if (p === '/e') { res.writeHead(204); res.end(); return; }
    const calc = p.match(/^\/calc\/(office|logistics|dev|refi)$/);
    if (calc) { res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); res.end(calcPage(calc[1], terms)); return; }
    if (p === '/') p = '/index.html';
    const file = path.resolve(WEB, '.' + p);
    if (!file.startsWith(WEB + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, {'Content-Type':file.endsWith('.js') ? 'application/javascript' : 'text/html; charset=utf-8'});
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch(process.env.CHROME_BIN ? {executablePath:process.env.CHROME_BIN} : {});
    for (const width of [1280, 390]) for (const deal of ['office', 'logistics', 'dev', 'refi']) {
      const ctx = await browser.newContext({viewport:{width,height:844},isMobile:width===390,hasTouch:width===390});
      await ctx.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
      await ctx.addInitScript(() => localStorage.setItem('mt_qa', '1'));
      const page = await ctx.newPage();
      try {
        await page.goto(origin + '/calc/' + deal, {referer:'https://www.google.com/'});
        await page.locator('a.cta').first().click();
        await page.waitForFunction(expected => typeof cur !== 'undefined' && cur === expected && document.getElementById('formBody').textContent.length > 0, deal);
        await page.waitForTimeout(750);
        const actual = await page.evaluate(() => {
          const key = {office:'price',logistics:'price',dev:'landcost',refi:'noi'}[cur];
          const el = document.getElementById('f_' + key), box = el.getBoundingClientRect();
          return {deal:cur,value:el.value,focus:document.activeElement.tagName,ref:sessionStorage.getItem('mt_ref0'),overflow:document.documentElement.scrollWidth > innerWidth+1,
            field:{key,top:Math.round(box.top),bottom:Math.round(box.bottom),visible:box.width>0&&box.height>0},example:state.asset};
        });
        const name = width + 'px ' + deal;
        check(actual.deal === deal && actual.example === examples[deal].state.asset, name + ': CTA 딜·예시');
        check(actual.value === examples[deal].state[actual.field.key], name + ': 실제 첫 입력');
        check(actual.ref === 'www.google.com', name + ': 검색 유입 호스트 보존');
        check(actual.field.visible && !actual.overflow, name + ': 입력 렌더·가로 넘침 없음');
        if (width === 390) {
          check(!/^(INPUT|TEXTAREA|SELECT)$/.test(actual.focus), name + ': 자동 키보드 포커스 없음');
          check(actual.field.top >= 0 && actual.field.bottom <= 844, name + ': 첫 입력이 화면 안에 위치');
        }
        console.log('HANDOFF', JSON.stringify({viewport:width,...actual}));
      } finally { await ctx.close(); }
    }
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}

(async () => {
  if (process.argv.includes('--browser')) await browserChecks();
  console.log('SEARCH HANDOFF OK — ' + checks + ' checks');
})().catch(error => { console.error(error); process.exitCode = 1; });
