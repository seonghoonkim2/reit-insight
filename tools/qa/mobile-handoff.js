#!/usr/bin/env node
'use strict';
// User flows: numeric-first wizard, local-only PC handoff, and completion telemetry.
const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');
const html=fs.readFileSync(path.resolve(__dirname,'../../dart-search/web/modelter/index.html'));
const server=http.createServer((q,r)=>{if(q.url.startsWith('/e')){r.writeHead(204);r.end();return;}r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);});
(async()=>{let browser,n=0; const errors=[];const check=(v,m)=>{assert.ok(v,m);n++;};
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{});
  const url='http://127.0.0.1:'+server.address().port+'/';
  async function fresh(width=390){
   const ctx=await browser.newContext({viewport:{width,height:844},acceptDownloads:true});const p=await ctx.newPage();
   p.on('pageerror',e=>errors.push(String(e)));p.on('dialog',d=>d.type()==='prompt'?d.dismiss():d.accept());
   await p.addInitScript(()=>{window.auditEvents=[];navigator.sendBeacon=(u,b)=>{auditEvents.push(JSON.parse(b));return true;};window.copied=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async s=>{copied.push(s);}}});});
   await p.goto(url);return {ctx,p};
  }
  const finish=async p=>{for(let i=0;i<8&&await p.locator('#wizIn').count();i++)await p.locator('[data-w=next]').click();};
  for(const width of [320,390,768,1280]){
   const {ctx,p}=await fresh(width);
   await p.evaluate(()=>{state.asset='Preserved name';window.__wizOpen();});
   check(await p.locator('#wizIn').getAttribute('inputmode')==='decimal',width+' first step numeric');
   check((await p.locator('.wiz-lab').innerText()).includes('매입가'),width+' first step price');
   await p.locator('#wizIn').fill('127000');await p.locator('[data-w=close]').first().click();
   await p.evaluate(()=>window.__wizOpen());check(await p.locator('#wizIn').inputValue()==='127000',width+' reopen preserves input');
   await finish(p);check((await p.locator('.wiz-lab').innerText())==='입력 내용 확인',width+' completion title');
   check((await p.locator('.wiz-sheet').innerText()).includes('아직 예시값'),width+' partial example disclosure');
   check(await p.locator('[data-w=done]').innerText()==='결과 보기',width+' valid result action');
   await p.locator('[data-w=prev]').click();await p.locator('[data-w=next]').click();
   check(await p.evaluate(()=>auditEvents.filter(e=>e.t==='wizard_open').length===2&&auditEvents.filter(e=>e.t==='wizard_finish').length===1),width+' finish deduped on revisiting last step');
   const bounds=await p.locator('.wiz-sheet').boundingBox();check(bounds.x>=-1&&bounds.x+bounds.width<=width+1&&bounds.y>=-1,width+' wizard fits viewport');
   if(process.env.MODELTER_QA_SHOTS){fs.mkdirSync(process.env.MODELTER_QA_SHOTS,{recursive:true});await p.screenshot({path:path.join(process.env.MODELTER_QA_SHOTS,'wizard-'+width+'.png')});}
   await p.locator('[data-w=done]').click();await p.waitForTimeout(600);check(await p.evaluate(()=>state.asset==='Preserved name'&&state.price==='127000'&&document.getElementById('f_price').value==='127000'),width+' name and form retained');
   await p.evaluate(()=>shareInputs(document.getElementById('shareBtn')));
   const pop=await p.locator('#sharePop').boundingBox();check(pop.x>=-1&&pop.x+pop.width<=width+1&&pop.y>=-1&&pop.y+pop.height<=845,width+' share fits viewport '+JSON.stringify(pop));
   await p.locator('[data-resume]').click();await p.waitForFunction(()=>copied.length===1);
   check(await p.evaluate(()=>copied[0].includes('#v=')&&copied[0].endsWith('&src=resume')&&auditEvents.filter(e=>e.t==='resume_copy').length===1),width+' readonly resume copy succeeds once');
   await ctx.close();
  }
  const {ctx,p}=await fresh();
  for(const mode of ['office','logistics','dev','refi','noi']){
   await p.evaluate(mode=>{cur=mode==='noi'?'office':mode;fillExample();if(mode==='noi'){state.noimode='직접 입력';state.noi1='6000';}window.__wizOpen();},mode);
   const first=await p.locator('.wiz-lab').innerText();check(!first.includes('자산명')&&await p.locator('#wizIn').getAttribute('inputmode')==='decimal',mode+' numeric first');
   await finish(p);check(await p.locator('[data-w=done]').innerText()==='결과 보기',mode+' example computes');
   if(mode==='dev')check((await p.locator('.wiz-sheet').innerText()).includes('분양 수입'),mode+' grid warning preserved');
   await p.locator('[data-w=done]').click();
  }
  await p.evaluate(()=>{cur='office';state={};stackState={};refiState={};exampleKeys.clear();window.rrModel=null;renderForm();restoreInputs();update();window.__wizOpen();});await finish(p);
  check((await p.locator('.wiz-sheet').innerText()).includes('계산에 필요한 입력이 더 있습니다'),'missing inputs never assert complete');
  check(await p.locator('[data-w=done]').innerText()==='입력 화면으로','missing results return to form');await p.locator('[data-w=done]').click();
  // Reduced visual viewport represents the area available above a software keyboard.
  await p.setViewportSize({width:320,height:360});await p.evaluate(()=>{fillExample();window.__wizOpen();});
  check(await p.locator('.wiz-sheet').evaluate(e=>e.getBoundingClientRect().height<=window.visualViewport.height+1),'keyboard-sized viewport has scrollable sheet');await p.locator('[data-w=next]').click();await p.locator('[data-w=close]').first().click();
  await p.setViewportSize({width:390,height:844});
  // Failure, cancellation and overlength must not report a completed copy or mutate a snapshot.
  await p.evaluate(()=>{auditEvents=[];copied=[];sessionStorage.removeItem('mt_ex_ack');const real=window.confirm;window.confirm=()=>false;copyResumeLink();window.confirm=real;});
  check(await p.evaluate(()=>!copied.length&&!auditEvents.some(e=>e.t==='resume_copy')),'declining example warning cancels without copy');
  await p.evaluate(()=>{cur='office';fillExample();sessionStorage.setItem('mt_ex_ack','1');auditEvents=[];copied=[];navigator.clipboard.writeText=async()=>{throw new Error('denied');};copyResumeLink();});await p.waitForTimeout(100);
  check(await p.evaluate(()=>!auditEvents.some(e=>e.t==='resume_copy')),'denied clipboard/manual prompt not success');
  await p.evaluate(()=>{navigator.clipboard.writeText=async s=>copied.push(s);state.asset=Array.from({length:4000},(_,i)=>String.fromCharCode(33+(i*7919%89))).join('')+Array.from({length:4000},()=>Math.random().toString(36).slice(2)).join('');window.beforeLong=JSON.stringify(sharePayload());copyResumeLink();});
  check(await p.evaluate(()=>copied.length===0&&!auditEvents.some(e=>e.t==='resume_copy')&&JSON.stringify(sharePayload())===beforeLong),'oversize neither truncates nor copies nor mutates');
  check((await p.locator('#toast').innerText()).includes('새 딜 또는 새 버전'),'oversize instructs save before backup');
  await p.evaluate(()=>{fillExample();sessionStorage.setItem('mt_ex_ack','1');document.getElementById('recoverChk').checked=false;copyResumeLink();});await p.waitForTimeout(50);
  check(await p.evaluate(()=>copied.length===1&&recoverLinkInfo('xlsx').reason==='disabled'),'explicit copy independent of artifact link checkbox');
  const link=await p.evaluate(()=>copied[0]),snap=await p.evaluate(()=>sharePayload());
  const {ctx:pcCtx,p:pc}=await fresh(1280);
  await pc.evaluate(()=>{state.asset='Existing local draft';state.price='133333';exTouch('price');update();});
  const before=await pc.evaluate(()=>localStorage.getItem('mt_state'));
  await pc.goto(link.replace(url,url+'?resume=1'));
  check(await pc.evaluate(()=>window.__mtReadonly===true),'PC opens read-only');
  check(await pc.evaluate(()=>sharePayload()).then(s=>JSON.stringify(s)===JSON.stringify(snap)),'PC restores full snapshot and example state');
  check(await pc.evaluate(()=>localStorage.getItem('mt_state'))===before,'PC opening preserves unsaved local draft');
  check(await pc.evaluate(()=>auditEvents.some(e=>e.t==='landing'&&e.src==='resume')),'resume landing is tagged');
  await pc.reload();check(await pc.evaluate(()=>localStorage.getItem('mt_state'))===before,'readonly reload preserves previous draft');
  await pc.locator('#roOpen').click();
  check(await pc.evaluate(()=>window.__mtReadonly&&!document.getElementById('resumeBack').hidden&&localStorage.getItem('mt_state'))===before,'unbound edited draft blocks adoption without overwrite');
  await Promise.all([pc.waitForEvent('load'),pc.locator('#resumeBack').click()]);
  check(await pc.evaluate(()=>!window.__mtReadonly&&state.asset==='Existing local draft'&&state.price==='133333'),'return restores exact prior inputs');
  check(await pc.evaluate(()=>localStorage.getItem('mt_state'))===before,'return preserves draft data exactly');
  check(await pc.locator('#resumeReopen').isVisible(),'incoming link remains available in this tab');
  await pc.evaluate(()=>{window.prompt=()=> 'Existing saved deal';wsSaveDeal();window.existingDealId=WS.dealId;});
  const originalDealId=await pc.evaluate(()=>WS.dealId);
  await Promise.all([pc.waitForEvent('load'),pc.locator('#resumeReopen').click()]);
  await pc.locator('#roOpen').click();
  check(await pc.evaluate(id=>!window.__mtReadonly&&!WS.dealId&&wsDB().deals[id].versions[0].snap.s.price==='133333'&&!sessionStorage.getItem('mt_resume_pending'),originalDealId),'saved prior workspace allows detached adoption and preserves original version');
  // A modified saved version must be protected too, including the secondary adoption CTA.
  await pc.evaluate(id=>{wsLoadVersion(id);state.price='144444';exTouch('price');update();},originalDealId);
  const dirty=await pc.evaluate(()=>localStorage.getItem('mt_state'));
  await pc.goto(link.replace(url,url+'?resume=2'));await pc.locator('#roCtaBtn').click();
  check(await pc.evaluate(()=>window.__mtReadonly&&localStorage.getItem('mt_state'))===dirty,'dirty saved version blocks secondary CTA');
  check(!(await pc.locator('#toast').innerText()).includes('편집 모드입니다'),'blocked CTA never reports successful edit');
  await Promise.all([pc.waitForEvent('load'),pc.locator('#resumeBack').click()]);
  check(await pc.evaluate(id=>WS.dealId===id&&wsDirty()&&state.price==='144444',originalDealId),'return restores dirty saved identity');
  await pc.evaluate(()=>{window.prompt=()=>null;wsSaveVersion();});
  check(await pc.evaluate(()=>wsDirty()),'cancelling version save leaves edited draft intact');
  await Promise.all([pc.waitForEvent('load'),pc.locator('#resumeReopen').click()]);await pc.locator('#roOpen').click();
  check(await pc.evaluate(()=>window.__mtReadonly&&localStorage.getItem('mt_state'))===dirty,'cancelled save cannot unlock adoption');
  await pcCtx.close();
  // Actual XLSX Blob production for every supported export route; injected serializer failure.
  await p.evaluate(()=>{cur='office';fillExample();auditEvents=[];sessionStorage.setItem('mt_ex_ack','1');});
  for(const deal of ['office','logistics','dev','refi']){
   await p.evaluate(d=>{cur=d;fillExample();auditEvents=[];},deal);
   const dl=p.waitForEvent('download');await p.evaluate(()=>window.__downloadXlsx());const download=await dl;
   check((await download.suggestedFilename()).endsWith('.xlsx'),deal+' XLSX downloadable');
   check(await p.evaluate(()=>auditEvents.filter(e=>e.t==='xlsx_ready').length===1&&!auditEvents.some(e=>e.t==='xlsx_error')),deal+' Blob ready once');
  }
  await p.evaluate(()=>{cur='office';fillExample();auditEvents=[];window.realBuild=XLSXGEN.buildXlsx;XLSXGEN.buildXlsx=()=>{throw new Error('PRIVATE_ERROR_1234');};window.__downloadXlsx();XLSXGEN.buildXlsx=realBuild;});
  check(await p.evaluate(()=>auditEvents.filter(e=>e.t==='xlsx_error').length===1&&!auditEvents.some(e=>e.t==='xlsx_ready')&&!JSON.stringify(auditEvents).includes('PRIVATE_ERROR')),'generation error records no raw error');
  await p.evaluate(()=>{auditEvents=[];XLSXGEN.buildXlsx=()=>new Uint8Array();window.__downloadXlsx();XLSXGEN.buildXlsx=realBuild;});
  check(await p.evaluate(()=>auditEvents.filter(e=>e.t==='xlsx_error').length===1&&!auditEvents.some(e=>e.t==='xlsx_ready')),'zero byte workbook not success');
  // Stored version restore, no automatic reopen counting.
  await p.evaluate(()=>{window.prompt=()=> 'Private audit deal';wsSaveDeal();window.savedId=WS.dealId;auditEvents=[];wsLoadVersion(savedId,null,true);wsLoadVersion('missing',null,true);wsLoadVersion(savedId);});
  check(await p.evaluate(()=>auditEvents.filter(e=>e.t==='ws_restore').length===1),'only successful explicit restore counted');
  const freshEvents=await p.evaluate(()=>auditEvents);check(!JSON.stringify(freshEvents).includes('Private audit deal'),'restore excludes asset name');await p.reload();
  check(await p.evaluate(()=>!auditEvents.some(e=>e.t==='ws_restore')),'automatic draft restoration not counted');
  // Worker must accept only finite event/channel names and discard input-shaped extra properties.
  const source=fs.readFileSync(path.resolve(__dirname,'../../worker.js'),'utf8');const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
  for(const event of ['xlsx_ready','xlsx_error','wizard_open','wizard_finish','ws_restore','resume_copy']){
   const logs=[],points=[];const oldLog=console.log;console.log=s=>logs.push(s);
   try{await worker.fetch({url:'https://modelter.com/e',method:'POST',json:async()=>({t:event,deal:'office',src:'resume',asset:'PRIVATE_ASSET',price:123456,error:'PRIVATE_ERROR'}),headers:new Headers({'user-agent':'Mozilla/5.0',referer:'https://modelter.com/'}),cf:{country:'KR'}},{AE:{writeDataPoint:p=>points.push(p)}});}finally{console.log=oldLog;}
   check(points.length===1&&JSON.parse(logs[0]).ev===event&&JSON.parse(logs[0]).src==='resume'&&!JSON.stringify([logs,points]).includes('PRIVATE_')&&!JSON.stringify([logs,points]).includes('123456'),event+' worker accepts tokens only');
  }
  check(errors.length===0,'no browser errors: '+errors.join('; '));await ctx.close();
  console.log('MOBILE HANDOFF OK — '+n+' assertions');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
