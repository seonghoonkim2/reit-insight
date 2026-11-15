#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{Worker:NodeWorker}=require('node:worker_threads');
const html=fs.readFileSync(process.env.MODELTER_HTML||path.resolve(__dirname,'../../dart-search/web/modelter/index.html'),'utf8');
const start=html.indexOf('  var xlsxJob=null;'),end=html.indexOf('  async function downloadXlsx(ctx)',start);
assert(start>0&&end>start);
const genStart=html.indexOf('(function(global){',html.indexOf('const XLTMPL='));
const suffix="})(typeof window!=='undefined'?window:globalThis);";
const generator=html.slice(genStart,html.indexOf(suffix,genStart)+suffix.length);
let count=0;
function context(mode){
 const els={},urls=new Map();let active=0,terminated=0;
 function element(){return {hidden:false,disabled:false,textContent:'',setAttribute(){},removeAttribute(){},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;}};}
 const document={scripts:[{textContent:html}],getElementById(id){return els[id]||null;},createElement(){const e=element();Object.defineProperty(e,'innerHTML',{set(){for(const id of ['xlsxProgressText','xlsxCancel','xlsxRetry','xlsxFix','xlsxClose'])els[id]=element();}});return e;},body:{appendChild(e){els[e.id]=e;}}};els.xlDownload=element();
 const c={document,TextEncoder,Uint8Array,Blob,console,setTimeout:(f,t)=>setTimeout(f,t===60000?1200:t),clearTimeout,URL:{createObjectURL(blob){const u='blob:'+urls.size;urls.set(u,blob);return u;},revokeObjectURL(u){urls.delete(u);}},$id:id=>document.getElementById(id)};
 c.window=c;
 c.Worker=class{
  constructor(url){if(mode==='startup')throw Error('startup');this.stopped=false;active++;const blob=urls.get(url);blob.text().then(code=>{if(this.stopped)return;this.w=new NodeWorker('const {parentPort}=require("worker_threads");module=undefined;globalThis.self=globalThis;self.postMessage=(d)=>parentPort.postMessage(d);parentPort.on("message",data=>self.onmessage({data}));'+code,{eval:true});this.w.on('message',data=>this.onmessage?.({data}));this.w.on('error',e=>this.onerror?.(e));if(this.data)this.w.postMessage(this.data);});}
  postMessage(data){if(mode==='hung')return;if(mode==='empty'){setTimeout(()=>this.onmessage({data:{bytes:new Uint8Array()}}),0);return;}if(mode==='error'){setTimeout(()=>this.onmessage({data:{error:'formula failure'}}),0);return;}if(mode==='message'){setTimeout(()=>this.onmessageerror(),0);return;}this.data=data;if(this.w)this.w.postMessage(data);}
  terminate(){if(this.stopped)return;this.stopped=true;active--;terminated++;this.w?.terminate();}
 };
 vm.createContext(c);vm.runInContext(generator,c);vm.runInContext(html.slice(start,end),c);
 return {c,els,urls,get active(){return active;},get terminated(){return terminated;}};
}
const tpl={sheets:[{name:'Test',cells:[{r:'A1',n:2},{r:'A2',f:'A1+3'}]}]};
async function test(name,f){await f();count++;console.log('PASS '+name);}
(async()=>{
 await test('real worker byte parity with production sync serializer',async()=>{const h=context(),j=h.c.xlsxStart();const expected=h.c.XLSXGEN.buildXlsx(tpl);const bytes=await h.c.xlsxBuild(j,[tpl]);assert.deepEqual(Buffer.from(bytes),Buffer.from(expected));assert.equal(h.active,0);assert.equal(h.urls.size,0);});
 await test('large workbook completes off-thread',async()=>{const h=context(),cells=Array.from({length:12000},(_,i)=>({r:'A'+(i+1),n:i}));const bytes=await h.c.xlsxBuild(h.c.xlsxStart(),[{sheets:[{name:'Large',cells}]}]);assert(bytes.length>500000);assert.equal(h.active,0);});
 await test('masked restoration payload preserved in worker',async()=>{const h=context();h.c.__mtSnapForXlsx=()=> 'MASKED';const t={sheets:[...tpl.sheets,{name:'Other',cells:[]}]};const expected=h.c.XLSXGEN.buildXlsx(t);const bytes=await h.c.xlsxBuild(h.c.xlsxStart(),[t]);assert.deepEqual(Buffer.from(bytes),Buffer.from(expected));assert(Buffer.from(bytes).includes(Buffer.from('MTSNAP1:MASKED:PANSTM')));});
 await test('real stages and completed controls',async()=>{const h=context(),j=h.c.xlsxStart();assert.match(h.els.xlsxProgressText.textContent,/1\/3/);await h.c.xlsxBuild(j,[tpl]);assert.match(h.els.xlsxProgressText.textContent,/2\/3/);h.c.xlsxFinish(j,'done',false);assert.equal(h.els.xlDownload.disabled,false);assert.equal(h.els.xlsxCancel.hidden,true);});
 await test('cancellation terminates hung worker',async()=>{const h=context('hung'),j=h.c.xlsxStart(),p=h.c.xlsxBuild(j,[tpl]);j.cancelled=true;j.abort();await assert.rejects(p,{name:'AbortError'});assert.equal(h.active,0);assert.equal(h.urls.size,0);});
 await test('timeout terminates hung worker',async()=>{const h=context('hung');await assert.rejects(h.c.xlsxBuild(h.c.xlsxStart(),[tpl]),{name:'TimeoutError'});assert.equal(h.active,0);assert.equal(h.urls.size,0);});
 for(const [mode,re]of [['startup',/startup/],['empty',/비어/],['error',/formula/],['message',/읽지/]])await test(mode+' failure releases resources',async()=>{const h=context(mode);await assert.rejects(h.c.xlsxBuild(h.c.xlsxStart(),[tpl]),re);assert.equal(h.active,0);assert.equal(h.urls.size,0);});
 await test('pre-cancelled job never starts worker',async()=>{const h=context(),j=h.c.xlsxStart();j.cancelled=true;assert.throws(()=>h.c.xlsxBuild(j,[tpl]),{name:'AbortError'});assert.equal(h.active,0);});
 await test('missing generator fails closed',async()=>{const h=context();h.c.document.scripts=[];assert.throws(()=>h.c.xlsxBuild(h.c.xlsxStart(),[tpl]),/찾지/);});
 await test('unsupported worker synchronous fallback exposes limitation',async()=>{const h=context();h.c.Worker=undefined;const bytes=h.c.xlsxBuild(h.c.xlsxStart(),[tpl]);assert(bytes.length>0);assert.match(h.els.xlsxProgressText.textContent,/취소·시간 제한을 지원하지/);});
 await test('late completion cannot overwrite a newer job',async()=>{const h=context(),old=h.c.xlsxStart(),current=h.c.xlsxStart();h.c.xlsxFinish(old,'stale',true);assert.notEqual(h.els.xlsxProgressText.textContent,'stale');h.c.xlsxFinish(current,'new',false);assert.equal(h.els.xlsxProgressText.textContent,'new');});
 console.log('EXCEL PROGRESS UNIT OK: '+count+' cases');
})().catch(e=>{console.error(e);process.exitCode=1;});
