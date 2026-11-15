#!/usr/bin/env node
'use strict';
// Production UI at mobile/desktop sizes; synthetic inputs, local-only requests.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),web=path.join(root,'dart-search/web/modelter');
const evidence=path.resolve(process.env.MODELTER_QA_EVIDENCE||path.join(root,'tools/parity/out/ux-mobile'));
fs.mkdirSync(evidence,{recursive:true});
const server=http.createServer((q,r)=>{if(q.url.startsWith('/e')){r.writeHead(204);return r.end();}r.setHeader('Content-Type','text/html; charset=utf-8');r.end(fs.readFileSync(path.join(web,'index.html')));});
let browser,count=0;const results=[],errors=[];
function check(v,m){assert.ok(v,m);count++;results.push(m);}
async function shot(p,name){await p.screenshot({path:path.join(evidence,name+'.png'),animations:'disabled'});}
async function visible(p,sel){await p.locator(sel).scrollIntoViewIfNeeded();const good=await p.waitForFunction(sel=>{const e=document.querySelector(sel),b=e.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return b.x>=0&&b.right<=innerWidth+1&&b.y>=0&&b.bottom<=innerHeight+1&&(e===hit||e.contains(hit));},sel,{timeout:2500}).then(()=>true,()=>false);if(!good){await shot(p,'covered-control');fs.writeFileSync(path.join(evidence,'covered-control.json'),JSON.stringify(await p.locator(sel).evaluate(e=>{const b=e.getBoundingClientRect();return {selector:e.outerHTML,rect:b.toJSON(),hit:document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.outerHTML,viewport:[innerWidth,innerHeight]};}),null,2));}return good;}
(async()=>{try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{});
 for(const width of [360,390,430,1280])for(const deal of ['office','logistics','dev','refi']){
  const label=deal+'-'+width,ctx=await browser.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block'});
  await ctx.route('**/*',r=>new URL(r.request().url()).origin===url?r.continue():r.abort());
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(label+': '+e.message));p.on('dialog',d=>d.accept());
  await p.goto(url+'/#t='+deal);await p.waitForFunction(()=>typeof startOwnDeal==='function');
  check(await p.evaluate(()=>document.activeElement.tagName!=='INPUT'),label+' arrival has no keyboard focus');
  await p.evaluate(d=>{cur=d;fillExample();},deal);
  await p.locator('#inputGuide summary').click();await p.locator('#guideStart').click();
  const id={office:'f_price',logistics:'f_price',dev:'f_landcost',refi:'f_noi'}[deal];
  await p.waitForFunction(id=>document.activeElement.id===id,id);
  await p.waitForTimeout(400);
  check(await visible(p,'#'+id),label+' first numeric input reachable');
  check(await p.locator('#'+id).getAttribute('inputmode')==='decimal',label+' decimal keyboard requested');
  await p.locator('#'+id).fill(deal==='refi'?'6000':deal==='dev'?'110000':'125000');await p.locator('#'+id).press('Tab');
  check(await p.evaluate(()=>!document.getElementById('simCard').classList.contains('noresult')),label+' edited first number reaches result');
  check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' form has no document overflow');
  await p.waitForTimeout(1900);await shot(p,label+'-input');
  await p.locator('#simCard').scrollIntoViewIfNeeded();await p.evaluate(()=>document.getElementById('simCard').scrollIntoView({block:'start'}));await p.waitForTimeout(300);
  if(width<600)check(await p.locator('.tip-fx').evaluateAll(es=>es.every(e=>getComputedStyle(e).opacity==='0')),label+' scrolled help does not cover result');
  await shot(p,label+'-result');
  await p.locator('#outputsFold summary').click();
  for(const sel of ['#xlDownload','#handoffBtn','#outputsFold summary','#resultSave','#tzDownload','#icDownload'])if(await p.locator(sel).isVisible()){
   check(await visible(p,sel),label+' '+sel+' reachable and not covered');
   if(width<600)check((await p.locator(sel).boundingBox()).height>=44,label+' '+sel+' touch height >=44px');
  }
  await p.locator('#handoffBtn').click();check(await p.locator('#sharePop').isVisible(),label+' existing result sharing opens');
  check(await p.evaluate(()=>document.getElementById('sharePop').getBoundingClientRect().right<=innerWidth+1),label+' sharing menu fits width');
  await p.locator('#handoffBtn').click();await p.locator('#outputsFold summary').click();
  check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' result has no document overflow');
  await p.locator('#xlDownload').scrollIntoViewIfNeeded();await shot(p,label+'-actions');
  const pending=p.waitForEvent('download');await p.locator('#xlDownload').click();const dl=await pending;check((await dl.failure())===null,label+' actual XLSX download');
  check(!/받기 완료|저장 완료/.test(await p.locator('#toast').innerText()),label+' no disk-save claim');
  // Small available viewport approximates a keyboard; does not assert native keyboard behavior.
  if(width<600){await p.evaluate(()=>__wizOpen());await p.setViewportSize({width,height:360});await p.waitForFunction(()=>document.querySelector('.wiz-sheet').getBoundingClientRect().height<=visualViewport.height+1);check(await visible(p,'[data-w=next]'),label+' keyboard-sized next button reachable');await shot(p,label+'-keyboard');await p.locator('[data-w=close]').first().click();}
  await ctx.close();console.log('PASS '+label);
 }
 check(errors.length===0,'no uncaught page errors: '+errors.join(';'));
 fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify({checks:count,results,errors},null,2));
 console.log('UX MOBILE OK '+count+' checks; '+evidence);
}finally{if(browser)await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
