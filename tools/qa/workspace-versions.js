#!/usr/bin/env node
'use strict';
// Deal-local version numbers must never be reused after deletion.
const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');
const file=process.env.MODELTER_HTML||path.resolve(__dirname,'../../dart-search/web/modelter/index.html');
const html=fs.readFileSync(file);
const server=http.createServer((q,r)=>{if(q.url.startsWith('/e')){r.writeHead(204);r.end();return;}r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);});
(async()=>{let browser,n=0;const check=(v,m)=>{assert.ok(v,m);n++;};
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    browser=await chromium.launch(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{});
    const page=await browser.newPage(),errors=[],prompts=[];
    page.on('pageerror',e=>errors.push(String(e)));
    page.on('dialog',d=>{if(d.type()==='prompt')prompts.push(d.message());return d.accept(d.type()==='prompt'?'Version audit':'');});
    await page.goto('http://127.0.0.1:'+server.address().port);
    for(let i=0;i<3;i++){await page.locator('#f_price').fill(String(120000+i*1000));await page.locator('#f_price').press('Tab');await page.locator('#slotSave').click();}
    const id=await page.evaluate(()=>WS.dealId);
    const originalIds=await page.evaluate(()=>wsDeal().versions.map(v=>v.id));
    await page.evaluate(()=>wsLoadVersion(WS.dealId,wsDeal().versions[0].id));
    check((await page.locator('#slotSel option:checked').innerText()).endsWith('v0.1'),'selected v1 label is not latest count v3');
    await page.evaluate(()=>wsLoadVersion(WS.dealId,wsDeal().versions[2].id));
    check((await page.locator('#slotSel option:checked').innerText()).endsWith('v0.3'),'selected v3 label is correct');
    const irr=await page.evaluate(()=>simModel().raw.IRR);
    await page.reload();check(await page.evaluate(()=>simModel().raw.IRR)===irr,'version identity display change leaves financial result unchanged');
    await page.evaluate(()=>wsDeleteVersion(WS.dealId,wsDeal().versions[1].id));
    check(await page.evaluate(()=>wsDeal().versions.map(v=>v.label).join(',')==='v0.1,v0.3'&&wsDeal().versionSeq===3),'middle deletion preserves original numbers and sequence');
    check((await page.locator('#slotSave').innerText()).includes('v0.4'),'next-save button uses maximum issued number');
    await page.locator('#slotSave').click();
    check(prompts[prompts.length-1].startsWith('v0.4 '),'save prompt matches displayed next number');
    check(await page.evaluate(()=>wsDeal().versions.at(-1).label==='v0.4'),'middle deletion does not create another v3');
    await page.evaluate(()=>wsDeleteVersion(WS.dealId,WS.versionId));await page.reload();
    check(await page.evaluate(()=>wsDeal().versionSeq===4)&& (await page.locator('#slotSave').innerText()).includes('v0.5'),'latest deletion and reload retain sequence');
    await page.locator('#slotSave').click();
    check(await page.evaluate(()=>wsDeal().versions.at(-1).label==='v0.5'),'deleted latest number is not reused');
    const prior=await page.evaluate(()=>({deal:JSON.stringify(wsDeal()),ws:JSON.stringify(WS),db:localStorage.getItem('mt_deals')}));
    await page.evaluate(()=>{window.realSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='mt_deals')throw new DOMException('full','QuotaExceededError');return realSetItem.call(this,k,v);};});
    await page.locator('#slotSave').click();
    check(await page.evaluate(p=>JSON.stringify(wsDeal())===p.deal&&JSON.stringify(WS)===p.ws&&localStorage.getItem('mt_deals')===p.db,prior),'quota failure rolls back sequence, version, selection and persisted data');
    await page.evaluate(()=>{Storage.prototype.setItem=realSetItem;});await page.locator('#slotSave').click();
    check(await page.evaluate(()=>wsDeal().versions.at(-1).label==='v0.6'&&wsDeal().versionSeq===6),'successful retry issues next number once');
    check(await page.evaluate(ids=>wsDeal().versions[0].id===ids[0]&&wsDeal().versions[1].id===ids[2],originalIds),'existing version ids stay unchanged');
    await page.evaluate(()=>wsDupDeal(WS.dealId));
    check(await page.evaluate(()=>wsDeal().versions.length===1&&wsDeal().versionSeq===1&&wsDeal().versions[0].label==='v0.1'),'duplicate starts a separate sequence at v1');
    const imported=await page.evaluate(source=>{const data=wsExportFile(source);data.deal.versionSeq=12;const d=wsImportFile(data);wsLoadVersion(d.id);return d.id;},id);
    check(await page.evaluate(()=>wsDeal().versionSeq===12),'import preserves deleted-number high water mark');
    await page.locator('#slotSave').click();check(await page.evaluate(()=>wsDeal().versions.at(-1).label==='v0.13'),'import continues at v13 without renumbering');
    await page.evaluate(()=>{const d=wsDeal();d.versions=d.versions.slice(0,2);d.versions[0].label='v0.3';delete d.versions[0].n;d.versions[1].label='v0.9';d.versions[1].n=7;delete d.versionSeq;d.currentVersionId=d.versions[1].id;wsPersist();wsLoadVersion(d.id);});
    await page.reload();
    check(await page.evaluate(()=>wsDeal().versionSeq===9&&wsDeal().versions[0].label==='v0.3'&&wsDeal().versions[1].n===7),'legacy migration takes numeric/label maximum without renumbering');
    await page.evaluate(()=>wsDeleteVersion(WS.dealId,WS.versionId));await page.reload();await page.locator('#slotSave').click();
    check(await page.evaluate(()=>wsDeal().versions.at(-1).label==='v0.10'),'legacy latest deletion keeps maximum label number');
    check(await page.evaluate(source=>wsDB().deals[source].versionSeq===6,id),'import and duplicate do not change original counter');
    for(const bad of [1.5,-1,Infinity,Number.MAX_SAFE_INTEGER+1,'broken','',true,{}]){
      check(await page.evaluate(v=>{const data=wsExportFile(WS.dealId);data.deal.versionSeq=v;const before=Object.keys(wsDB().deals).length;try{wsImportFile(data);return false;}catch(e){return /버전 번호/.test(e.message)&&before===Object.keys(wsDB().deals).length;}},bad),'invalid imported counter rejected: '+String(bad));
    }
    check(await page.evaluate(()=>{const data=wsExportFile(WS.dealId);data.deal.versions[0].label='v0.99999999999999999999';try{wsImportFile(data);return false;}catch(e){return /버전 번호/.test(e.message);}}),'unsafe legacy label cannot silently wrap or reset');
    await page.evaluate(()=>{wsDeal().versionSeq=Number.MAX_SAFE_INTEGER-1;renderWorkspace();});
    check((await page.locator('#slotSave').innerText()).includes('v0.'+Number.MAX_SAFE_INTEGER),'last safe version is shown consistently');
    await page.locator('#slotSave').click();
    check(await page.evaluate(()=>wsDeal().versionSeq===Number.MAX_SAFE_INTEGER&&wsDeal().versions.at(-1).n===Number.MAX_SAFE_INTEGER),'last safe integer can be issued');
    const ceiling=await page.evaluate(()=>{const d=wsImportFile(wsExportFile(WS.dealId));wsLoadVersion(d.id);return {id:d.id,count:d.versions.length};});
    await page.reload();
    check(await page.evaluate(()=>wsVersionSeq(wsDeal())===Number.MAX_SAFE_INTEGER&&wsNextVersion(wsDeal())===-1),'self-export at maximum can be imported and reopened');
    const ceilingPromptCount=prompts.length;
    await page.locator('#slotSave').click();
    check(await page.evaluate(c=>wsDeal().versions.length===c,ceiling.count)&&prompts.length===ceilingPromptCount,'next save at maximum is blocked before prompt or mutation');
    await page.evaluate(()=>wsDeleteVersion(WS.dealId,WS.versionId));await page.reload();
    check(await page.evaluate(c=>wsDeal().versions.length===c-1&&wsDeal().versionSeq===Number.MAX_SAFE_INTEGER&&wsNextVersion(wsDeal())===-1,ceiling.count),'maximum counter allows deletion and retains issued-number ceiling');
    await page.evaluate(()=>{wsDeal().versionSeq=1.5;renderWorkspace();});
    check((await page.locator('#slotSave').innerText())==='버전 번호 확인 필요','corrupt current counter has clear save label');
    const beforeBad=await page.evaluate(()=>wsDeal().versions.length),promptCount=prompts.length;
    await page.locator('#slotSave').click();check(await page.evaluate(()=>wsDeal().versions.length)===beforeBad&&prompts.length===promptCount,'invalid current counter blocks save without an invalid-number prompt');
    check(errors.length===0,'no uncaught browser errors: '+errors.join('; '));
    console.log('WORKSPACE VERSIONS OK - '+n+' checks');
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
