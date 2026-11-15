#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{chromium}=require('playwright');
const html=fs.readFileSync(path.resolve(__dirname,'../../dart-search/web/modelter/index.html'));
const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html; charset=utf-8');r.end(html);});
(async()=>{let browser,n=0;const check=(v,m)=>{assert.ok(v,m);n++;console.log('PASS '+m);};
try{await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{});
 const ctx=await browser.newContext({acceptDownloads:true}),p=await ctx.newPage(),errors=[];let confirm=true;
 p.on('pageerror',e=>errors.push(String(e)));p.on('dialog',d=>d.type()==='prompt'?d.accept('QA stored deal'):(confirm?d.accept():d.dismiss()));
 await ctx.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const url='http://127.0.0.1:'+server.address().port;await p.goto(url);
 check(await p.locator('#inputGuide').getAttribute('open')===null,'arrival guide collapsed without popup');
 check(await p.evaluate(()=>document.activeElement.tagName!=='INPUT'),'arrival does not force keyboard');
 for(const d of ['office','logistics','dev','refi']){await p.evaluate(d=>{cur=d;fillExample();},d);await p.locator('#inputGuide summary').click();check((await p.locator('#inputGuideFields').innerText()).includes('백만원'),d+' units visible');await p.locator('#guideStart').click();check(await p.evaluate(()=>document.activeElement.id.startsWith('f_')),d+' first-input CTA focuses numeric field');await p.locator('#inputGuide summary').click();}
 await p.evaluate(()=>{cur='office';fillExample();});await p.locator('#f_price').fill('127000');await p.locator('#f_price').press('Tab');
 check((await p.locator('#saveStatus').innerText()).includes('자동 저장됨'),'edit reports persisted state');
 confirm=false;await p.locator('#fillExample').click();check(await p.locator('#f_price').inputValue()==='127,000','sample cancellation preserves input');confirm=true;
 await p.locator('#slotSave').click();await p.reload();check(await p.evaluate(()=>state.price==='127,000'&&!!WS.dealId),'named save restores after reload');
 const download=p.waitForEvent('download');await p.locator('#saveBackup').click();const f=await download;check(f.suggestedFilename().endsWith('.modelter')&&!(await f.failure()),'current snapshot backup downloads');
 await p.evaluate(()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='mt_state')throw new DOMException('full','QuotaExceededError');return originalSet.call(this,k,v);};});
 await p.locator('#f_price').fill('135000');await p.locator('#f_price').press('Tab');check(await p.locator('#saveRetry').isVisible()&&(await p.locator('#saveStatus').innerText()).includes('실패'),'quota shows failure and retry');
 await p.evaluate(()=>{Storage.prototype.setItem=originalSet;});await p.locator('#saveRetry').click();check(await p.locator('#saveRetry').isHidden(),'successful retry clears error');
 await p.evaluate(()=>{localStorage.setItem('mt_state_backup',localStorage.getItem('mt_state'));localStorage.setItem('mt_state','{broken');});await p.reload();check(await p.evaluate(()=>state.price==='135,000')&&(await p.locator('#saveStatus').innerText()).includes('복구'),'corrupt state automatically recovers');
 const other=await ctx.newPage();await other.goto(url);await other.locator('#f_price').fill('140000');await other.locator('#f_price').press('Tab');
 await p.locator('#f_price').fill('145000');await p.locator('#f_price').press('Tab');check((await p.locator('#saveStatus').innerText()).includes('다른 탭')&&await p.evaluate(()=>JSON.parse(localStorage.getItem('mt_state')).s.price==='140,000'),'concurrent tab changes not overwritten');await other.close();
 await p.reload();await p.evaluate(()=>renderWsPanel());const before=await p.evaluate(()=>localStorage.getItem('mt_deals'));
 await p.locator('#wsImport').setInputFiles({name:'broken.modelter',mimeType:'application/json',buffer:Buffer.from('{invalid')});await p.waitForTimeout(100);check(await p.evaluate(b=>localStorage.getItem('mt_deals')===b,before),'malformed import preserves workspace');
 for(const width of [320,390,1280]){await p.setViewportSize({width,height:900});await p.locator('#inputGuide summary').click();check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'guide fits '+width+'px');await p.locator('#inputGuide summary').click();}
 check(errors.length===0,'no uncaught errors: '+errors.join(';'));console.log('STORAGE ONBOARDING BROWSER OK '+n+' checks');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
