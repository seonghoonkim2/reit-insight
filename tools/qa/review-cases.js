#!/usr/bin/env node
'use strict';
// Check changes against the canonical examples, then restore real generated links
// in a browser and compare calculated results with the published numbers.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const {readExamples, calcPage, extractTerms, getReviewCases, reviewMetrics} = require('../gen-pages');
const {createCaseEngine} = require('../review-case-engine');
const WEB = path.resolve(__dirname,'../../dart-search/web/modelter');
const html = fs.readFileSync(path.join(WEB,'index.html'),'utf8');
const examples=readExamples(html), cases=getReviewCases(), terms=extractTerms();
let checks=0;
const check=(yes,message)=>{assert.ok(yes,message);checks++;};
const clone=x=>JSON.parse(JSON.stringify(x));
const number=x=>Number(String(x).replace(/,/g,''));
const near=(a,b,message)=>check(Number.isFinite(a)&&Math.abs(a-b)<1e-9,message);
const changed=(a,b)=>Object.keys({...a,...b}).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k])).sort();

for (const deal of ['office','dev']) {
  const group=cases[deal], base=group[0];
  check(group.length===3,deal+' has exactly three conditions');
  for (const [key,value] of Object.entries(examples[deal].state)) check(base.payload.s[key]===value,deal+' baseline state '+key);
  for (const [key,value] of Object.entries(examples[deal].stack)) check(base.payload.k[key]===value,deal+' baseline stack '+key);
  const rendered=calcPage(deal,terms);
  check((rendered.match(/class="case-open"/g)||[]).length===3,deal+' one CTA per condition');
  for (const c of group) {
    check(c.url.startsWith('https://modelter.com/#v=')&&c.url.endsWith('&src=seo'),deal+'/'+c.id+' read-only link');
    check(c.payload.ue===0&&c.payload.ek.length>0,deal+'/'+c.id+' retains example markers');
    for (const [,value] of reviewMetrics(deal,c.raw)) check(rendered.includes('<dd>'+value+'</dd>'),deal+'/'+c.id+' published metric '+value);
  }
}
check(changed(cases.office[0].payload.s,cases.office[1].payload.s).join(',')==='price','office discount changes price only');
check(changed(cases.office[0].payload.k,cases.office[1].payload.k).length===0,'office discount leaves loan conditions unchanged');
near(number(cases.office[1].payload.s.price),number(examples.office.state.price)*.95,'office price -5%');
check(changed(cases.office[0].payload.s,cases.office[2].payload.s).length===0,'rate scenario leaves all property inputs unchanged');
check(changed(cases.office[0].payload.k,cases.office[2].payload.k).join(',')==='senior_rate','rate scenario changes senior rate only');
near(number(cases.office[2].payload.k.senior_rate),number(examples.office.stack.senior_rate)+1,'rate +1%p');
check(changed(cases.dev[0].payload.s,cases.dev[1].payload.s).join(',')==='conscost','dev cost changes construction cost only');
near(number(cases.dev[1].payload.s.conscost),number(examples.dev.state.conscost)*1.1,'construction cost +10%');
check(changed(cases.dev[0].payload.s,cases.dev[2].payload.s).join(',')==='aptrows,retrows','dev price changes real apartment and retail grids, not unused scalar');
for(const key of ['aptrows','retrows']) {
  const original=JSON.parse(examples.dev.state[key]), actual=JSON.parse(cases.dev[2].payload.s[key]);
  check(original.length===actual.length,key+' row count retained');
  actual.forEach((row,i)=>{
    check(changed(original[i],row).join(',')==='p',key+' only unit price changes');
    near(number(row.p),number(original[i].p)*.95,key+' row '+i+' price -5%');
  });
}
for(const c of cases.dev) check(changed(cases.dev[0].payload.k,c.payload.k).length===0,'dev financing terms unchanged');
check(cases.office[1].raw.IRR>cases.office[0].raw.IRR,'price discount improves IRR');
check(cases.office[2].raw.minDSCR<cases.office[0].raw.minDSCR,'higher rate reduces coverage');
check(cases.dev[1].raw.profit<cases.dev[0].raw.profit&&cases.dev[2].raw.profit<cases.dev[0].raw.profit,'dev cost/price downside reduces profit');
const engine=createCaseEngine(html);
for(const group of Object.values(cases)) for(const c of group) {
  const decoded=engine.decode(new URL(c.url).hash.slice(3).split('&')[0]);
  assert.deepEqual(clone(decoded),clone(c.payload));checks++;
  const restored=engine.restore(decoded);
  for(const key of decoded.c==='office'?['IRR','minDSCR','equity']:['profit','margin','loan']) near(restored.raw[key],c.raw[key],decoded.c+'/'+c.id+' encoded engine result '+key);
}
for(const deal of ['logistics','refi']) check(!calcPage(deal,terms).includes('data-review-case='),deal+' unchanged content scope');

async function browserChecks() {
  const {chromium}=require('playwright');
  const server=http.createServer((req,res)=>{
    const p=new URL(req.url,'http://localhost').pathname;
    if(p==='/e'){res.writeHead(204);res.end();return;}
    const deal=p.match(/^\/calc\/(office|dev)$/);
    if(deal){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(calcPage(deal[1],terms));return;}
    if(p==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);return;}
    res.writeHead(404);res.end();
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  let browser;
  try {
    browser=await chromium.launch(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{});
    for(const width of [320,390,768,1280]) for(const deal of ['office','dev']) {
      const context=await browser.newContext({viewport:{width,height:844},isMobile:width<768,hasTouch:width<768});
      await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
      await context.addInitScript(()=>localStorage.setItem('mt_qa','1'));
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(String(e)));
      try {
        await page.goto(origin+'/');
        await page.evaluate(()=>{cur='office';fillExample();state.price='111000';state.asset='Existing local draft';exTouch('price');resumeLocal();update();saveLocal();});
        const before=await page.evaluate(()=>localStorage.getItem('mt_state'));
        for(const c of cases[deal]) {
          await page.goto(origin+'/calc/'+deal,{referer:'https://www.google.com/'});
          check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+'/'+deal+' page no horizontal overflow');
          if(process.env.QA_SCREENSHOT_DIR && c.id==='base') {
            fs.mkdirSync(process.env.QA_SCREENSHOT_DIR,{recursive:true});
            await page.locator('.review-cases').screenshot({path:path.join(process.env.QA_SCREENSHOT_DIR,deal+'-'+width+'.png')});
          }
          const card=page.locator('[data-review-case="'+deal+'-'+c.id+'"]');
          check(await card.locator('a').count()===1,width+'/'+deal+'/'+c.id+' single action');
          await card.locator('a').click();
          await page.waitForFunction(()=>typeof simModel==='function'&&!!window.__mtReadonly);
          const actual=await page.evaluate(()=>({payload:sharePayload(),raw:simModel().raw,draft:localStorage.getItem('mt_state'),ref:sessionStorage.getItem('mt_ref0')}));
          assert.deepEqual(actual.payload,clone(c.payload));checks++;
          for(const key of deal==='office'?['IRR','minDSCR','equity']:['profit','margin','loan']) near(actual.raw[key],c.raw[key],width+'/'+deal+'/'+c.id+' real browser '+key);
          check(actual.draft===before,width+'/'+deal+'/'+c.id+' preserves existing local draft');
          check(actual.ref==='www.google.com',width+'/'+deal+'/'+c.id+' preserves external source');
        }
        check(errors.length===0,width+'/'+deal+' browser errors: '+errors.join('; '));
      } finally {await context.close();}
    }
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
(async()=>{
  if(process.argv.includes('--browser'))await browserChecks();
  console.log('REVIEW CASES OK — '+checks+' checks');
})().catch(error=>{console.error(error);process.exitCode=1;});
