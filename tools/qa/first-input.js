#!/usr/bin/env node
'use strict';
// Local browser regression: first numeric input, truthful wizard review, actual XLSX
// files and explicit saved-version restores. No production events leave this harness.
const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'dart-search/web/modelter/index.html'));
const evidence=process.env.MODELTER_QA_EVIDENCE?path.resolve(process.env.MODELTER_QA_EVIDENCE):null;
if(evidence)fs.mkdirSync(evidence,{recursive:true});
const checks=[],downloads=[],pageErrors=[],externalRequests=[];
const navigationDiagnostics=[],diagnose=process.env.MODELTER_QA_DIAGNOSTICS==='1';
let eventRequests=0;
const server=http.createServer((q,r)=>{if(q.url.startsWith('/e')){eventRequests++;r.writeHead(204);r.end();return;}r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(source);});
const check=(v,message)=>{assert.ok(v,message);checks.push(message);};
const eventCount=(p,t)=>p.evaluate(t=>auditEvents.filter(e=>e.t===t).length,t);
async function finish(p){
  for(let i=0;i<10&&await p.locator('#wizIn').count();i++)await p.locator('[data-w=next]').click();
  await p.locator('[data-w=done]').waitFor({state:'visible'});
}
async function shot(p,name){if(evidence)await p.screenshot({path:path.join(evidence,name+'.png')});}
async function numericFocused(p,id){
  try{
    await p.waitForFunction(id=>document.activeElement&&document.activeElement.id===id,id);
    await p.evaluate(()=>{window.__qaFocusSettled=null;});
    // Seeing the input for one frame is not completion of smooth scrolling. Wait
    // for focused, fully visible and stationary geometry before the next click;
    // otherwise Playwright's automatic scroll to the next button can cancel it.
    await p.waitForFunction(id=>{
      const e=document.getElementById(id),b=e&&e.getBoundingClientRect();
      if(!b||document.activeElement!==e||b.top<0||b.bottom>innerHeight){window.__qaFocusSettled=null;return false;}
      const signature=[scrollX,scrollY,b.x,b.y,b.width,b.height,innerWidth,innerHeight].join(','),previous=window.__qaFocusSettled;
      const same=previous&&previous.signature===signature?previous.same+1:0;
      window.__qaFocusSettled={signature,same};return same>=3;
    },id);
  }catch(e){
    const detail=await p.evaluate(id=>({id,width:innerWidth,height:innerHeight,scrollY,active:document.activeElement&&document.activeElement.id,bounds:document.getElementById(id)?.getBoundingClientRect().toJSON(),trace:window.__qaNavigationTrace||[]}),id);
    if(evidence){fs.writeFileSync(path.join(evidence,'focus-failure-diagnostic.json'),JSON.stringify(detail,null,2));await shot(p,'focus-failure-diagnostic');}
    throw e;
  }
  if(diagnose)navigationDiagnostics.push(await p.evaluate(()=>({label:window.__qaNavigationLabel,trace:window.__qaNavigationTrace,final:window.__qaNavigationRead('condition-met')})));
  check(await p.locator('#'+id).getAttribute('inputmode')==='decimal',id+' numeric keyboard');
}
(async()=>{
 let browser;
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port+'/';
  browser=await chromium.launch(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{});
  async function fresh(width=390){
    const ctx=await browser.newContext({viewport:{width,height:900},acceptDownloads:true,serviceWorkers:'block'});
    await ctx.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===new URL(url).origin)return route.continue();externalRequests.push(u.origin+u.pathname);return route.abort();});
    const p=await ctx.newPage();p.on('pageerror',e=>pageErrors.push(String(e)));
    p.on('dialog',d=>d.type()==='prompt'?d.accept('QA_PRIVATE_DEAL'):d.accept());
    await p.addInitScript(diag=>{
      window.auditEvents=[];navigator.sendBeacon=(u,b)=>{auditEvents.push(JSON.parse(b));return true;};
      if(!diag)return;
      window.__qaNavigationTrace=[];
      window.__qaNavigationRead=kind=>({kind,at:performance.now(),scrollY,active:document.activeElement&&document.activeElement.id,width:innerWidth,height:innerHeight,input:(document.getElementById('f_price')||document.getElementById('f_landcost')||document.getElementById('f_noi'))?.getBoundingClientRect().toJSON()});
      const record=kind=>{__qaNavigationTrace.push(__qaNavigationRead(kind));if(__qaNavigationTrace.length>500)__qaNavigationTrace.shift();};
      window.__qaNavigationMark=label=>{window.__qaNavigationLabel=label;window.__qaNavigationTrace=[];record('before-click');};
      for(const type of ['scroll','scrollend','resize','focusin'])addEventListener(type,()=>record(type),true);
      const original=Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView=function(options){record('scrollIntoView:'+this.id+':'+JSON.stringify(options));return original.apply(this,arguments);};
    },diagnose);
    await p.goto(url);await p.waitForFunction(()=>typeof window.__wizOpen==='function'&&document.getElementById('f_price'));
    return {ctx,p};
  }
  for(const width of (process.env.MODELTER_QA_NAV_ONLY?[390,390,390,390,390,390]:[320,390,768,1280])){
    const {ctx,p}=await fresh(width);
    check(await p.evaluate(()=>document.activeElement.tagName!=='INPUT'),width+' no automatic input focus on arrival');
    for(const deal of ['office','logistics','dev','refi']){
      await p.evaluate(d=>{cur=d;fillExample();},deal);
      const id={office:'f_price',logistics:'f_price',dev:'f_landcost',refi:'f_noi'}[deal];
      const snapshot=await p.evaluate(()=>JSON.stringify(state));
      if(diagnose)await p.evaluate(label=>window.__qaNavigationMark(label),width+' '+deal+' sample');
      await p.locator('#sampleStartBtn').click();await numericFocused(p,id);
      check(await p.evaluate(()=>JSON.stringify(state))===snapshot,width+' '+deal+' first input navigation preserves values');
      if(diagnose)await p.evaluate(label=>window.__qaNavigationMark(label),width+' '+deal+' hero');
      await p.locator('a.intro-cta[href="#builder-start"]').click();await numericFocused(p,id);
      check(await p.evaluate(()=>JSON.stringify(state))===snapshot,width+' '+deal+' hero navigation preserves values');
    }
    if(process.env.MODELTER_QA_NAV_ONLY){await ctx.close();continue;}
    await p.evaluate(()=>{cur='office';fillExample();state.asset='QA_PRIVATE_ASSET';window.auditEvents=[];window.__wizOpen();});
    check((await p.locator('.wiz-lab').innerText()).includes('매입가'),width+' wizard starts at price');
    check(await p.locator('#wizIn').getAttribute('inputmode')==='decimal',width+' wizard opens numeric keyboard');
    if(width===390||width===1280)await shot(p,'numeric-first-'+width);
    await p.locator('#wizIn').fill('127000');
    await p.locator('[data-w=next]').click();await p.locator('[data-w=prev]').click();
    check(await p.locator('#wizIn').inputValue()==='127000',width+' previous step retains input');
    await p.locator('[data-w=close]').first().click();await p.evaluate(()=>window.__wizOpen());
    check(await p.locator('#wizIn').inputValue()==='127000',width+' reopen retains input');
    await finish(p);
    check(await p.locator('.wiz-lab').innerText()==='입력 내용 확인',width+' review title never claims mandatory completion');
    check((await p.locator('.wiz-sheet').innerText()).includes('아직 예시값'),width+' edited model discloses remaining example values');
    check(await p.locator('[data-w=done]').innerText()==='결과 보기',width+' calculable model has results action');
    await p.locator('[data-w=prev]').click();await p.locator('[data-w=next]').click();
    check(await eventCount(p,'wizard_open')===2&&await eventCount(p,'wizard_finish')===1,width+' open and last-step events distinguish abandoned opening and dedupe revisit');
    const b=await p.locator('.wiz-sheet').boundingBox();
    check(b.x>=-1&&b.x+b.width<=width+1&&b.y>=-1&&b.y+b.height<=901,width+' wizard review fits viewport');
    await shot(p,'partial-review-'+width);
    await p.locator('[data-w=done]').click();await p.locator('.wiz-ov').waitFor({state:'detached'});
    check(await p.evaluate(()=>state.asset==='QA_PRIVATE_ASSET'&&state.price==='127000'&&document.getElementById('f_price').value==='127000'),width+' name and changed form value remain');
    check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+' no horizontal document overflow');
    await p.evaluate(()=>{document.body.classList.add('mt-ro');window.__mtReadonly=true;document.activeElement.blur();startOwnDeal();window.__wizOpen();});
    check(await p.locator('.wiz-ov').count()===0&&await p.evaluate(()=>document.activeElement.tagName!=='INPUT'),width+' read-only model prevents edit entry');
    await ctx.close();
  }
  if(process.env.MODELTER_QA_NAV_ONLY){if(evidence)fs.writeFileSync(path.join(evidence,'navigation-diagnostics.json'),JSON.stringify(navigationDiagnostics,null,2));console.log('NAVIGATION DIAGNOSTIC OK — '+checks.length+' assertions');return;}
  const {ctx,p}=await fresh();
  for(const mode of ['office','logistics','dev','refi','noi']){
    await p.evaluate(mode=>{cur=mode==='noi'?'office':mode;fillExample();if(mode==='noi'){state.noimode='NOI 직접 입력';state.noi1='6000';renderForm();restoreInputs();update();}window.__wizOpen();},mode);
    check(!(await p.locator('.wiz-lab').innerText()).includes('자산명')&&await p.locator('#wizIn').getAttribute('inputmode')==='decimal',mode+' numeric first');
    if(mode==='noi'){
      await p.locator('[data-w=next]').click();
      check((await p.locator('.wiz-lab').innerText()).includes('NOI'),'direct NOI wizard asks NOI after price');
    }
    await finish(p);
    check(await p.locator('[data-w=done]').innerText()==='결과 보기',mode+' supplied example computes');
    check((await p.locator('.wiz-sheet').innerText()).includes('예시값'),mode+' untouched model identifies sample');
    if(mode==='dev')check((await p.locator('.wiz-sheet').innerText()).includes('분양 수입'),'development directs user to remaining sales grid');
    if(mode==='office')await shot(p,'all-example-review-390');
    await p.locator('[data-w=done]').click();
  }
  await p.evaluate(()=>{cur='office';fillExample();exampleKeys.clear();exUserEdited=true;window.__wizOpen();});await finish(p);
  check(!(await p.locator('.wiz-sheet').innerText()).includes('아직 예시값'),'fully entered model has no stale remaining-example warning');
  await p.locator('[data-w=done]').click();
  await p.evaluate(()=>{cur='office';state={};stackState={};refiState={};exampleKeys.clear();window.rrModel=null;renderForm();restoreInputs();update();window.__wizOpen();});await finish(p);
  check((await p.locator('.wiz-sheet').innerText()).includes('계산에 필요한 입력이 더 있습니다'),'empty model explicitly needs additional input');
  check(!(await p.locator('.wiz-sheet').innerText()).includes('모두 채웠습니다'),'empty model never claims completeness');
  check(await p.locator('[data-w=done]').innerText()==='입력 화면으로','empty model sends user to form');await shot(p,'missing-input-review-390');
  await p.locator('[data-w=done]').click();
  await p.evaluate(()=>{fillExample();window.__wizOpen();});await p.locator('#wizIn').fill('not-a-number');await p.locator('[data-w=next]').click();
  check((await p.locator('.wiz-ref').innerText()).includes('숫자')&&await p.locator('#wizIn').inputValue()==='not-a-number','invalid numeric input does not advance');
  await p.locator('#wizIn').fill('-1');await p.locator('[data-w=next]').click();
  check((await p.locator('.wiz-ref').innerText()).includes('이상'),'negative acquisition price shows allowed minimum');
  await p.locator('#wizIn').fill('127000');
  // This emulates the available viewport above a keyboard, not native keyboard UI.
  await p.setViewportSize({width:320,height:360});
  check(await p.locator('.wiz-sheet').evaluate(e=>e.getBoundingClientRect().height<=window.visualViewport.height+1),'keyboard-sized viewport constrains sheet height');
  await p.locator('[data-w=next]').click();await p.locator('[data-w=prev]').click();
  check(await p.locator('#wizIn').inputValue()==='127000','keyboard-sized viewport allows navigation without losing input');
  await p.locator('[data-w=next]').scrollIntoViewIfNeeded();
  const nav=await p.locator('[data-w=next]').boundingBox();check(nav.y>=0&&nav.y+nav.height<=361,'keyboard-sized viewport can expose next button');
  await shot(p,'keyboard-sized-320');await p.locator('[data-w=close]').first().click();await p.setViewportSize({width:1280,height:900});
  // Actual browser downloads for every supported export route, not serializer-only mocks.
  for(const deal of ['office','logistics','dev','refi']){
    await p.evaluate(d=>{cur=d;fillExample();state.asset='QA_PRIVATE_ASSET';auditEvents=[];sessionStorage.setItem('mt_ex_ack','1');},deal);
    const downloadPromise=p.waitForEvent('download');await p.locator('#xlDownload').click();const download=await downloadPromise;
    const target=evidence?path.join(evidence,deal+'.xlsx'):await download.path();if(evidence)await download.saveAs(target);
    check(await download.failure()===null,deal+' browser download completes');
    const bytes=fs.readFileSync(target);check(bytes.length>10000&&bytes[0]===80&&bytes[1]===75,deal+' output is nonempty XLSX ZIP');
    check(download.suggestedFilename().endsWith('.xlsx'),deal+' output extension correct');
    check(await eventCount(p,'xlsx_ready')===1&&await eventCount(p,'xlsx_error')===0,deal+' one ready event after workbook generation');
    check(!JSON.stringify(await p.evaluate(()=>auditEvents)).includes('QA_PRIVATE_ASSET'),deal+' telemetry excludes asset name');
    downloads.push({deal,filename:download.suggestedFilename(),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),path:evidence?target:undefined});
  }
  await p.evaluate(()=>{cur='office';fillExample();auditEvents=[];sessionStorage.removeItem('mt_ex_ack');const realConfirm=confirm;window.confirm=()=>false;try{window.__downloadXlsx();}finally{window.confirm=realConfirm;}});
  check(await eventCount(p,'xlsx_ready')===0&&await eventCount(p,'xlsx_error')===0,'declined example confirmation is not generation success or error');
  for(const failure of ['throw','empty']){
    await p.evaluate(kind=>{auditEvents=[];sessionStorage.setItem('mt_ex_ack','1');const real=XLSXGEN.buildXlsx;XLSXGEN.buildXlsx=()=>{if(kind==='throw')throw new Error('QA_PRIVATE_ERROR_123456');return new Uint8Array();};try{window.__downloadXlsx();}finally{XLSXGEN.buildXlsx=real;}},failure);
    check(await eventCount(p,'xlsx_error')===1&&await eventCount(p,'xlsx_ready')===0,failure+' workbook records failure only');
    check(!JSON.stringify(await p.evaluate(()=>auditEvents)).includes('QA_PRIVATE_'),failure+' telemetry excludes raw error and deal details');
  }
  await p.evaluate(()=>{cur='office';fillExample();state.asset='QA_PRIVATE_ASSET';});
  await p.locator('#slotSave').click();
  await p.waitForFunction(()=>WS.dealId&&wsDB().deals[WS.dealId]);
  const savedId=await p.evaluate(()=>WS.dealId);
  await p.evaluate(()=>{auditEvents=[];state.price='144444';update();});
  await p.locator('#slotSel').selectOption(savedId);
  check(await eventCount(p,'ws_restore')===1,'selecting saved deal records one completed restore');
  check(await p.evaluate(()=>state.price!=='144444'&&state.asset==='QA_PRIVATE_ASSET'),'restore applies saved inputs and preserves name');
  await p.evaluate(()=>{auditEvents=[];wsLoadVersion('missing',null,true);});
  check(await eventCount(p,'ws_restore')===0,'missing saved deal is not a completed restore');
  // Damaged storage or a stale selected version must not overwrite the open model
  // or silently fall back to another version and then report a successful restore.
  for(const kind of ['missing-version','empty-snapshot','unknown-deal-type','prototype-deal-type','array-state','apply-failure']){
    const result=await p.evaluate(({id,kind})=>{
      const deal=wsDB().deals[id],version=deal.versions[0],original=version.snap,apply=wsApplySnapshot;
      state.price='155555';update();auditEvents=[];document.getElementById('toast').textContent='';
      const capture=()=>JSON.stringify({ws:WS,snap:wsSnapshot(),stored:Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))});
      const before=capture();
      if(kind==='empty-snapshot')version.snap={};
      if(kind==='unknown-deal-type')version.snap=Object.assign({},original,{c:'not-a-supported-deal'});
      if(kind==='prototype-deal-type')version.snap=Object.assign({},original,{c:'constructor'});
      if(kind==='array-state')version.snap=Object.assign({},original,{s:[]});
      if(kind==='apply-failure')wsApplySnapshot=function(snap){apply(snap);throw new Error('QA_PRIVATE_APPLY_FAILURE');};
      try{
        wsLoadVersion(id,kind==='missing-version'?'missing-selected-version':version.id,true);
        return {unchanged:before===capture(),events:auditEvents.filter(e=>e.t==='ws_restore').length,message:document.getElementById('toast').textContent};
      }finally{version.snap=original;wsApplySnapshot=apply;}
    },{id:savedId,kind});
    check(result.unchanged,kind+' preserves current workspace, values and all local storage');
    check(result.events===0,kind+' never emits successful restore');
    check(result.message.length>0&&!result.message.includes('불러옴'),kind+' explains why restore did not happen');
  }
  const emptyRestore=await p.evaluate(id=>{
    const deal=wsDB().deals[id],version=deal.versions[0],original=version.snap;
    version.snap=Object.assign({},original,{c:'office',s:{},k:{},r:{},rr:null,ek:[],ue:1,st:{},sc:{on:false,s:{}}});
    auditEvents=[];
    try{
      wsLoadVersion(id,version.id,true);
      return {empty:Object.keys(state).length===0,events:auditEvents.filter(e=>e.t==='ws_restore').length,message:document.getElementById('toast').textContent};
    }finally{version.snap=original;wsLoadVersion(id,version.id,false);}
  },savedId);
  check(emptyRestore.empty,'valid saved empty inputs are restored rather than treated as damaged data');
  check(emptyRestore.events===1&&emptyRestore.message.includes('불러옴'),'successful explicit empty-input restore is counted once');
  const legacyRestore=await p.evaluate(id=>{
    const deal=wsDB().deals[id],version=deal.versions[0],original=version.snap;
    version.snap={c:'office',s:Object.assign({},original.s,{price:'133333'})};auditEvents=[];
    try{wsLoadVersion(id,version.id,true);return {value:state.price,events:auditEvents.filter(e=>e.t==='ws_restore').length};}
    finally{version.snap=original;wsLoadVersion(id,version.id,false);}
  },savedId);
  check(legacyRestore.value==='133333'&&legacyRestore.events===1,'older valid snapshot without optional metadata still restores');
  await p.evaluate(id=>{auditEvents=[];const snapshot=wsDB().deals[id].versions[0].snap;wsWithSnapshot(snapshot,()=>simModel());},savedId);
  check(await eventCount(p,'ws_restore')===0,'temporary snapshot calculation is not a user restore');
  await p.reload();await p.waitForFunction(()=>typeof window.__wizOpen==='function');
  check(await eventCount(p,'ws_restore')===0,'automatic reload recovery does not count as user restore');
  check(!JSON.stringify(await p.evaluate(()=>auditEvents)).includes('QA_PRIVATE_'),'automatic recovery events contain no private labels');
  check(pageErrors.length===0,'no browser exceptions: '+pageErrors.join('; '));
  check(eventRequests===0,'telemetry intercepted locally; collector receives no requests');
  await ctx.close();
  const report={status:'pass',generatedAt:new Date().toISOString(),sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),assertions:checks.length,checks,downloads,pageErrors,externalRequestsBlocked:externalRequests,eventRequests,limits:['Keyboard coverage uses a reduced browser viewport, not a physical iOS/Android keyboard.','Downloaded bytes prove browser generation; OS user-save completion is not an application event.']};
  if(evidence){fs.writeFileSync(path.join(evidence,'first-input-verification.json'),JSON.stringify(report,null,2));if(diagnose)fs.writeFileSync(path.join(evidence,'navigation-diagnostics.json'),JSON.stringify(navigationDiagnostics,null,2));}
  console.log('FIRST INPUT OK — '+checks.length+' assertions; '+downloads.length+' actual XLSX downloads');
 }catch(e){
   if(evidence)fs.writeFileSync(path.join(evidence,'first-input-failure.json'),JSON.stringify({status:'fail',message:e.message,checks,downloads,pageErrors},null,2));
   throw e;
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
