#!/usr/bin/env node
'use strict';
// Result saving reuses workspace persistence; no new storage or event payloads.
const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');
const html=fs.readFileSync(process.env.MODELTER_HTML||path.resolve(__dirname,'../../dart-search/web/modelter/index.html'));
const server=http.createServer((q,r)=>{if(q.url.startsWith('/e')){r.writeHead(204);r.end();return;}r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);});
(async()=>{let browser,n=0;const check=(v,m)=>{assert.ok(v,m);n++;};
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    browser=await chromium.launch(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{});
    const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],prompts=[];let answer='Saved result';
    page.on('pageerror',e=>errors.push(String(e)));
    page.on('dialog',d=>{if(d.type()==='prompt'){prompts.push(d.message());return answer===null?d.dismiss():d.accept(answer);}return d.accept();});
    await page.addInitScript(()=>{
      window.auditEvents=[];navigator.sendBeacon=(u,b)=>{auditEvents.push(JSON.parse(b));return true;};
      window.auditNudges=[];const nativeTimeout=window.setTimeout;
      window.setTimeout=function(fn,ms,...args){if(ms===25000){auditNudges.push(fn);return 0;}return nativeTimeout(fn,ms,...args);};
    });
    const url='http://127.0.0.1:'+server.address().port+'/';
    const hidden=()=>page.locator('#resultSave').isHidden();
    const reset=()=>page.evaluate(()=>{cur='office';fillExample();});
    const edit=async(v='125000')=>{await page.locator('#f_price').fill(v);await page.locator('#f_price').press('Tab');};
    const events=()=>page.evaluate(()=>({click:auditEvents.filter(e=>e.t==='slot_save').length,save:auditEvents.filter(e=>e.t==='ws_save').length}));
    const resetEvents=()=>page.evaluate(()=>{auditEvents=[];});
    await page.goto(url);
    check(await hidden(),'full example has no result save action');
    await page.evaluate(()=>document.getElementById('resultSave').click());check(prompts.length===0,'hidden sample action is guarded');
    await edit();check(!(await hidden()),'direct edit exposes result saving');
    check((await page.locator('#modelState').innerText()).includes('일부 수정'),'remaining example warning remains visible');
    check(await page.evaluate(()=>auditNudges.length===0),'no delayed save reminder is scheduled');
    await page.evaluate(()=>auditNudges.forEach(f=>f()));
    check(await page.evaluate(()=>!auditEvents.some(e=>e.t==='nudge_save')),'25-second reminder does not duplicate result action');
    await reset();check(await hidden(),'example reset clears previous session activation');
    await page.evaluate(()=>document.getElementById('rrDemoA').click());check(await hidden(),'sample rentroll stays an example');
    await reset();await page.locator('#f_asset').fill('Named sample');await page.locator('#f_asset').press('Tab');
    check(!(await hidden())&&(await page.locator('#modelState').innerText()).includes('일부 수정'),'named sample is a saveable draft with example warning');
    await reset();await edit();const irr=await page.evaluate(()=>simModel().raw.IRR);
    for(const cancelled of [null,'   ']){
      answer=cancelled;await resetEvents();const before=prompts.length;
      await page.locator('#resultSave').click();
      check(prompts.length===before+1&&!(await hidden())&&await page.evaluate(()=>!WS.dealId),'cancel/empty name leaves draft and action');
      check(JSON.stringify(await events())===JSON.stringify({click:1,save:0}),'cancel/empty name records one click and no save');
    }
    answer='Saved result';await resetEvents();const p0=prompts.length;
    await page.locator('#resultSave').focus();await page.keyboard.press('Enter');
    check(prompts.length===p0+1&&await page.evaluate(()=>wsDeal().versions.length===1&&wsDeal().versions[0].name===''),'first save asks for name once and creates v1');
    check(await hidden()&&await page.evaluate(()=>document.activeElement.id==='xlDownload'),'successful save hides action and retains result-area focus');
    check(JSON.stringify(await events())===JSON.stringify({click:1,save:1}),'keyboard save has one click and one success event');
    await page.reload();check(await hidden()&&await page.evaluate(()=>!wsDirty()&&simModel().raw.IRR)===irr,'reload retains clean identity and unchanged result');
    await edit('130000');await page.reload();check(!(await hidden()),'persisted dirty edit exposes result action');
    answer=null;await page.locator('#resultSave').click();
    check(await page.evaluate(()=>wsDeal().versions.length===1&&wsDirty()&&document.activeElement.id==='resultSave'),'version cancellation retains dirty version and focus');
    answer='Changed assumptions';await resetEvents();await page.locator('#resultSave').click();
    check(prompts.at(-1).startsWith('v0.2 ')&&await page.evaluate(()=>wsDeal().versions.length===2&&wsDeal().versions.at(-1).label==='v0.2'),'existing deal saves exactly one next version');
    check(await hidden()&&JSON.stringify(await events())===JSON.stringify({click:1,save:1}),'clean saved version has no duplicate action');
    await edit('135000');
    const prior=await page.evaluate(()=>({db:localStorage.getItem('mt_deals'),deal:JSON.stringify(wsDeal()),ws:JSON.stringify(WS)}));
    await page.evaluate(()=>{window.auditSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='mt_deals')throw new DOMException('full','QuotaExceededError');return auditSet.call(this,k,v);};});
    await resetEvents();await page.locator('#resultSave').click();
    check(await page.evaluate(p=>p.db===localStorage.getItem('mt_deals')&&p.deal===JSON.stringify(wsDeal())&&p.ws===JSON.stringify(WS)&&wsDirty(),prior),'quota failure rolls back versions, sequence, identity and storage');
    check(!(await hidden())&&await page.evaluate(()=>document.activeElement.id==='resultSave')&&JSON.stringify(await events())===JSON.stringify({click:1,save:0}),'quota failure retains retry action/focus and no success event');
    await reset();await edit();await resetEvents();await page.locator('#resultSave').click();
    check(await page.evaluate(p=>!WS.dealId&&localStorage.getItem('mt_deals')===p.db&&Object.keys(wsDB().deals).length===Object.keys(JSON.parse(p.db).deals).length,prior),'new-deal quota failure leaves no phantom deal');
    await page.evaluate(()=>{Storage.prototype.setItem=auditSet;});
    await edit('-1');check(await hidden(),'invalid financial input hides saving');
    const pi=prompts.length;await page.evaluate(()=>document.getElementById('resultSave').click());check(prompts.length===pi,'invalid result cannot invoke save through hidden action');
    await page.reload();check(await hidden(),'invalid persisted input stays blocked on revisit');
    await page.evaluate(()=>clearAll());check(await hidden(),'empty result has no save action');
    await reset();await page.evaluate(()=>{document.getElementById('adjBar').open=true;renderAdjBar();});
    check(await hidden(),'opening adjustment tools is not an edit');
    await page.locator('[data-adj="3"][data-dir="1"]').click();check(!(await hidden()),'actual interest adjustment is an edit');
    await reset();await page.evaluate(()=>{document.getElementById('scenOn').click();});
    check(!(await hidden()),'scenario activation is an edit');
    await page.evaluate(()=>{exUserEdited=false;update();document.querySelector('[data-scen]').value='7.25';document.querySelector('[data-scen]').dispatchEvent(new Event('input',{bubbles:true}));});
    check(!(await hidden()),'scenario value input is an edit');
    await reset();await page.evaluate(()=>window.__rrOpen());check(await hidden(),'opening rentroll tools is not an edit');
    await page.locator('#rrPaste').fill('임차인,임대면적(평),보증금(원),월임대료(원),월관리비(원),계약만기\nPRIVATE_TENANT,2000,1440000000,120000000,42000000,2030-12');
    await page.locator('#rrParse').click();await page.locator('#rrApply').click();
    check(!(await hidden())&&await page.evaluate(()=>rrModel.on&&!exampleKeys.has('rentpp')&&!exampleKeys.has('campp')),'real rentroll application exposes saving and clears affected example markers');
    check(await page.evaluate(()=>!localStorage.getItem('mt_state').includes('PRIVATE_TENANT')),'rentroll source name stays out of local snapshot');
    await reset();await page.evaluate(()=>MTIM.quick());check(await hidden(),'opening IM tool is not an edit');
    await page.locator('.imx-ov textarea').fill('매매대금 1,300억원, 연면적 8,400평, 평당 월 임대료 62,000원, Exit Cap 4.8%');
    await page.locator('[data-im="qgo"]').click();await page.locator('[data-im="qapply"]').click();
    check(!(await hidden())&&await page.evaluate(()=>exUserEdited),'applying IM values exposes saving');
    const payload=await page.evaluate(()=>mtLZ.compress(JSON.stringify(sharePayload())));
    await page.goto(url+'?readonly=1#v='+payload);check(await hidden()&&await page.evaluate(()=>window.__mtReadonly),'readonly share does not expose saving');
    const pr=prompts.length;await page.evaluate(()=>document.getElementById('resultSave').click());check(prompts.length===pr,'readonly handler is guarded');
    await page.goto(url);await reset();await edit();
    for(const size of [{width:1280,height:900},{width:390,height:844}]){
      await page.setViewportSize(size);await page.locator('#resultSave').scrollIntoViewIfNeeded();
      check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow at '+size.width);
      const boxes=await Promise.all(['#xlDownload','#resultSave','#outputsFold summary'].map(s=>page.locator(s).boundingBox()));
      check(boxes.every(b=>b&&b.width>0&&b.x>=0&&b.x+b.width<=size.width),'all result actions remain within viewport at '+size.width);
    }
    await resetEvents();await page.locator('#resultSave').click();
    check(await hidden()&&await page.evaluate(()=>document.activeElement.id==='xlDownload'),'mobile save retains focus in results');
    check(JSON.stringify(await events())===JSON.stringify({click:1,save:1}),'mobile result save emits exactly one click and one success');
    const dl=page.waitForEvent('download');await page.locator('#xlDownload').click();const download=await dl;
    check(download.suggestedFilename().endsWith('.xlsx')&&!(await download.failure()),'Excel download remains available after saving');
    for(const [deal,key,value] of [['office','price','129000'],['logistics','price','220000'],['dev','landcost','190000'],['refi','noi','4700']]){
      await page.evaluate(d=>{cur=d;fillExample();},deal);
      await page.locator('#f_'+key).fill(value);await page.locator('#f_'+key).press('Tab');
      check(!(await hidden()),deal+' first financial edit exposes saving');
      const before=prompts.length;await page.locator('#resultSave').click();
      check(prompts.length===before+1&&await hidden()&&await page.evaluate(()=>!wsDirty()&&wsDeal().versions.length===1),deal+' first save asks once and becomes clean');
    }
    await reset();
    const depthCheck=await page.evaluate(()=>{
      state.acqtax='50';exTouch('acqtax');update();
      const standard={can:wsCanSaveResult(),irr:simModel().raw.IRR};
      depth='quick';renderForm();restoreInputs();update();
      return {standard,quick:{can:wsCanSaveResult(),irr:simModel().raw.IRR}};
    });
    check(depthCheck.standard.can&&depthCheck.quick.can&&depthCheck.standard.irr===depthCheck.quick.irr,'same draft and result have identical saving eligibility across input depths');
    check(errors.length===0,'no uncaught browser errors: '+errors.join('; '));
    console.log('RESULT SAVE OK - '+n+' checks');
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
