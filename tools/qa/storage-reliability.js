#!/usr/bin/env node
/* 모델터 엔진 불변식(property) QA — 경제적 단조성 검사
 *
 * 사용:   node tools/qa/invariants.js
 * 방식:   배포 index.html의 계산 엔진을 Node에서 직접 로드(tools/parity/gen-xlsx.js의
 *         DOM 스텁 패턴 재사용, 브라우저 불필요). 딜별로 fillExample()로 기준을 잡고
 *         state를 한 축씩 바꿔 재계산 → "방향이 경제 상식과 맞는지"를 검사한다.
 * 원칙:   각 검사는 스윕 값마다 fillExample()로 원복 후 해당 축만 변경 — 검사 간 오염 없음.
 *         불변식이 깨지면 테스트를 완화하지 말 것(엔진 버그 신호) — exit 1.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = path.join(ROOT, 'dart-search', 'web', 'modelter', 'index.html');
const html = fs.readFileSync(HTML, 'utf8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const main = blocks.find(b => b.includes('function fillExample'));
const inj = blocks.find(b => b.includes('const XLTMPL='));
if (!main || !inj) { console.error('index.html에서 스크립트 블록을 찾지 못했습니다'); process.exit(1); }

/* ── 최소 DOM 스텁 — gen-xlsx.js와 동일: 앱 스크립트가 예외 없이 로드될 만큼만 ── */
function stub() { const s = {}; const f = function () { return el; };
  const el = new Proxy(f, { get(t, p) {
    if (p === 'querySelectorAll') return () => [];
    if (p === 'querySelector' || p === 'closest') return () => null;
    if (p === 'getBoundingClientRect') return () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 });
    if (p === 'classList') return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    if (p === 'style') return s.__s || (s.__s = {});
    if (p === 'dataset') return s.__d || (s.__d = {});
    if (['addEventListener','removeEventListener','appendChild','removeChild','insertBefore','setAttribute','removeAttribute','click','focus','blur','select','remove','scrollIntoView','setSelectionRange'].includes(p)) return () => {};
    if (p === 'getAttribute') return () => null;
    if (p === 'getContext') return () => stub();
    if (['value','innerHTML','textContent','className','href','placeholder','id','name','type'].includes(p)) return (p in s) ? s[p] : '';
    if (['hidden','checked','disabled'].includes(p)) return (p in s) ? s[p] : false;
    if (p === Symbol.toPrimitive) return () => '';
    if (p in s) return s[p];
    return el;
  }, set(t, p, v) { s[p] = v; return true; }, apply() { return el; } }); return el; }

const G = globalThis;
G.window = G; G.addEventListener = () => {}; G.matchMedia = () => ({ matches: false, addEventListener() {} });
G.innerWidth = 1200; G.innerHeight = 800; G.scrollTo = () => {};
const elements={}; G.document = { getElementById: id => elements[id]||(elements[id]=stub()), querySelector: () => null, querySelectorAll: () => [], createElement: () => stub(), addEventListener: () => {}, body: stub(), documentElement: stub(), readyState: 'complete', fonts: { ready: Promise.resolve() } };
G.location = { hash: '', origin: 'https://modelter.com', pathname: '/', href: '' };
const store=Object.create(null);let rejectKey=null;G.localStorage={getItem:k=>store[k]===undefined?null:store[k],setItem:(k,v)=>{if(rejectKey===k){const e=new Error('full');e.name='QuotaExceededError';throw e;}store[k]=String(v);},removeItem:k=>{delete store[k];}};
G.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
G.alert = () => {}; G.confirm = () => true;
G.Blob = function (parts) { this.parts = parts; };
G.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
G.IntersectionObserver = function () { this.observe = () => {}; this.disconnect = () => {}; };
G.fetch = () => Promise.resolve({ ok: true });G.prompt=()=> 'QA Deal';G.setTimeout=()=>0;G.clearTimeout=()=>{};  // 익명 비콘이 호출돼도 네트워크로 나가지 않게


const assert=require('node:assert/strict');let passed=0;
function check(value,message){assert.ok(value,message);passed++;console.log('PASS '+message);}
const api=new Function(main+'\n'+inj+`;return {run:function(fn){return eval('('+fn+')()');}};`)();
const run=fn=>api.run(fn.toString());
const fresh=()=>{Object.keys(store).forEach(k=>delete store[k]);rejectKey=null;run(()=>{_wsCache=null;_wsBlocked=false;_wsDiskRaw=null;_localDiskRaw=undefined;_localBlocked=false;_localSkipBackup=false;localPause=false;window.__mtReadonly=false;cur='office';fillExample();});};
fresh();
for(const deal of ['office','logistics','dev','refi']){run(eval('()=>{cur="'+deal+'";fillExample();saveLocal();}'));check(run(()=>tryRestoreLocal()&&wsValidSnapshot(wsSnapshot())),'normal '+deal+' save and restore');}
fresh();run(()=>{state.price='127000';exTouch('price');wsSaveDeal();});
check(run(()=>!!WS.dealId&&wsDeal().versions.length===1),'normal named deal save');
const exported=run(()=>wsExportFile(WS.dealId));run(()=>{state.price='130000';exTouch('price');wsSaveVersion();});
check(run(()=>wsDeal().versions.length===2&&wsLoadVersion(WS.dealId,wsDeal().versions[0].id)!==false&&state.price==='127000'),'normal version roundtrip');
check(run(()=>{const data=wsExportFile(WS.dealId),d=wsImportFile(data);return d.id!==WS.dealId&&d.versions.length===2;}),'normal backup import with fresh identity');
let before=store.mt_deals;rejectKey='mt_deals';run(()=>{state.price='140000';exTouch('price');wsSaveVersion();});check(store.mt_deals===before&&run(()=>wsDeal().versions.length===2&&wsDirty()),'edge quota rolls back version and retains dirty input');rejectKey=null;run(()=>wsSaveVersion());check(run(()=>wsDeal().versions.length===3),'normal retry after quota succeeds once');
rejectKey='mt_state';before=store.mt_state;run(()=>{state.price='150000';exTouch('price');saveLocal();});check(store.mt_state===before&&elements.saveRetry.hidden===false,'edge autosave quota retains stored draft and exposes retry');rejectKey=null;check(run(()=>saveLocal())&&JSON.parse(store.mt_state).s.price==='150000','normal autosave retry');
const safe=store.mt_state;store.mt_state_backup=safe;store.mt_state='{broken';check(run(()=>tryRestoreLocal())&&JSON.parse(store.mt_state).s.price==='150000'&&store.mt_state_backup===safe,'edge corrupt draft recovers valid copy without destroying it');
store.mt_state='{broken';store.mt_state_backup='{also broken';check(run(()=>!tryRestoreLocal()&&!saveLocal())&&store.mt_state==='{broken','edge both corrupt copies preserved');
fresh();run(()=>{state.price='126000';exTouch('price');wsSaveDeal();});const goodDB=store.mt_deals;store.mt_deals_backup=goodDB;store.mt_deals='{broken';check(run(()=>{_wsCache=null;return Object.keys(wsDB().deals).length===1;})&&store.mt_deals===goodDB,'edge corrupt workspace recovers valid backup');
store.mt_deals='{broken';store.mt_deals_backup='{broken backup';check(run(()=>{_wsCache=null;wsDB();return !wsPersist();})&&store.mt_deals==='{broken','edge corrupt workspace blocked without overwrite');
fresh();run(()=>{state.price='125000';exTouch('price');wsSaveDeal();});before=store.mt_deals;store.mt_deals=JSON.stringify({...JSON.parse(before),changedByOtherTab:true});check(run(()=>!wsPersist())&&store.mt_deals!==before,'edge workspace concurrent-tab write does not overwrite');
fresh();before=store.mt_state;store.mt_state=JSON.stringify({...JSON.parse(before),s:{price:'999'}});check(run(()=>!saveLocal())&&JSON.parse(store.mt_state).s.price==='999','edge draft concurrent-tab write does not overwrite');
fresh();run(()=>{state.price='125000';exTouch('price');wsSaveDeal();});
for(const mutation of [d=>d.deal.versions=[],d=>d.schema='9.0',d=>d.deal.versions[0].snap.c='bad',d=>d.deal.versions[0].snap.s.price={nested:1},d=>d.deal.versions.push(d.deal.versions[0]),d=>d.deal.name='x'.repeat(501),d=>d.deal.versions[0].snap.s.asset='x'.repeat(50001)]){
 const d=run(()=>wsExportFile(WS.dealId));mutation(d);globalThis.badBackup=d;before=store.mt_deals;check(run(()=>{try{wsImportFile(badBackup);return false;}catch(e){return true;}})&&store.mt_deals===before,'edge invalid import rejected atomically');
}
globalThis.badBackup=JSON.parse(JSON.stringify(exported).replace('"s":{','"s":{"__proto__":{"polluted":true},'));
check(run(()=>{try{wsImportFile(badBackup);return false;}catch(e){return true;}})&&{}.polluted===undefined,'edge prototype pollution rejected');
run(()=>{state.asset='x'.repeat(50001);});before=store.mt_state;check(run(()=>!saveLocal())&&store.mt_state===before,'edge oversized own snapshot cannot create unrecoverable save');
fresh();run(()=>{state.price='123456';exTouch('price');});globalThis.confirm=()=>false;check(run(()=>{useExampleSafely();return state.price==='123456';}),'edge cancelled sample preserves user input');globalThis.confirm=()=>true;
check(run(()=>{useExampleSafely();return state.price!=='123456'&&!exUserEdited;}),'normal confirmed sample reset');
fresh();before=store.mt_state;check(run(()=>{localPause=true;state.price='111';return !saveLocal();})&&store.mt_state===before,'edge shared link cannot overwrite local draft');
fresh();run(()=>{state.price='127000';exTouch('price');wsSaveDeal();});globalThis.recoveryFile=run(()=>wsExportFile(WS.dealId));store.mt_deals='{corrupt';store.mt_deals_backup='{corrupt backup';run(()=>{_wsCache=null;wsDB();});
globalThis.confirm=()=>false;check(run(()=>wsImportWithRecovery(recoveryFile)===null)&&store.mt_deals==='{corrupt','edge declined recovery preserves corrupt original');globalThis.confirm=()=>true;
check(run(()=>!!wsImportWithRecovery(recoveryFile))&&store.mt_deals_damaged==='{corrupt'&&JSON.parse(store.mt_deals).deals,'normal validated backup recovers damaged workspace and preserves original');
store.mt_state='{corrupt draft';store.mt_state_backup='{broken';run(()=>tryRestoreLocal());check(run(()=>{const d=Object.values(wsDB().deals)[0];wsLoadVersion(d.id,null,true);return !_localBlocked&&saveLocal();})&&store.mt_state_damaged==='{corrupt draft','normal explicit saved-version load recovers damaged draft');
fresh();check(run(()=>{const saved=wsSnapshot();saved.st={price:{s:'saved',d:'2026-01-01'}};saved.ek=['price'];saved.ue=1;srcTags={price:{s:'current'}};exampleKeys=new Set(['exitcap']);exUserEdited=false;let correct=false;wsWithSnapshot(saved,()=>{correct=srcTags.price.s==='saved'&&exampleKeys.has('price')&&exUserEdited;});return correct&&srcTags.price.s==='current'&&exampleKeys.has('exitcap')&&!exUserEdited;}),'normal saved-version generation uses original provenance and restores current metadata');
check(run(()=>{const before=JSON.stringify(wsSnapshot());try{wsWithSnapshot({c:'office',s:{price:'99'},st:{},ek:[],ue:1},()=>{throw Error('fail');});}catch(e){}return JSON.stringify(wsSnapshot())===before;}),'edge failed regeneration restores all current metadata');
console.log('STORAGE RELIABILITY OK: '+passed+' checks');
