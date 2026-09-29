#!/usr/bin/env node
'use strict';
// Independent refinancing ledger and editable-workbook regressions. Node only.
// The annuity oracle discounts unit payments; it does not reuse the app PMT.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const html = fs.readFileSync(path.resolve(__dirname, '../../dart-search/web/modelter/index.html'), 'utf8');
function section(from, to) {
  const start = html.indexOf(from), end = html.indexOf(to, start);
  assert.ok(start >= 0 && end > start, 'Missing production section: ' + from);
  return html.slice(start, end);
}
const code = section('function refiInputs()', 'function simDev()') +
  section('  function refiTemplate(ctx)', '  window.__refiTemplate=') +
  ['colIdx','colLet','splitRef'].map(name=>html.match(new RegExp('^  function '+name+'\\(.*$','m'))[0]).join('\n') + '\n' +
  section('  function cacheWorkbookFormulas(t)', '  function buildSheetXml(');
const parse = html.match(/^function parseNum\(v\).*$/m)[0];
const state = {asset:'Independent refi fixture',noi:4300,noig:1.7,appraisal:80000,dscrmin:1.25,
  oldbal:44000,oldrate:5.8,oldmat:0.6,oldrepay:'만기일시',prepayfee:0.7,newfee:0.8};
const defaults = {...state}, alternatives = {};
const engine = new Function('state','refiState', parse +
  '\nfunction mnum(k){return parseNum(state[k]);} function mfmt(v){return String(v);}\n' + code +
  ';return {inputs:refiInputs,ledger:refiSchedule,sim:simRefi,template:refiTemplate,cache:cacheWorkbookFormulas};')(state,alternatives);
const labels = {1:'만기일시',2:'원리금균등',3:'원금균등'};
let checks = 0;
function equal(got,want,label){assert.equal(got,want,label);checks++;}
function near(got,want,label){
  if(want===null){equal(got===''?null:got,null,label);return;}
  assert.ok(Number.isFinite(got) && Math.abs(got-want)<=1e-7*Math.max(1,Math.abs(want)),`${label}: got ${got}, expected ${want}`);checks++;
}
function setup(changes={}, alts=[{n:1,ltv:55,rate:4.9,mat:3,code:1},{n:2,ltv:60,rate:5.2,mat:5,code:3},{n:3,ltv:62,rate:5.1,mat:7,code:2}]){
  for(const k of Object.keys(state))delete state[k];Object.assign(state,defaults,changes);
  for(const k of Object.keys(alternatives))delete alternatives[k];
  for(const a of alts)for(const k of ['ltv','rate','mat','repay'])alternatives['a'+a.n+'_'+k]=k==='repay'?labels[a.code]:a[k];
}
function oracle(I,a){
  const principal=I.app*a.ltv/100,rate=a.rate/100;
  const payment=principal/Array.from({length:a.mat},(_,i)=>(1+rate)**-(i+1)).reduce((x,y)=>x+y,0);
  let balance=principal;const rows=[];
  for(let y=1;y<=a.mat;y++){
    const interest=balance*rate;
    const paid=a.code===1?0:a.code===3?principal/a.mat:payment-interest;
    const service=interest+paid,noi=I.noi*(1+I.g/100)**(y-1);
    rows.push({open:balance,intr:interest,prin:paid,ds:service,close:balance-paid,dscr:service>0?noi/service:null});
    balance-=paid;
  }
  const dscr=rows.map(r=>r.dscr).filter(x=>x!==null),fees=I.oldbal*I.prepay/100+principal*I.newfee/100;
  return {rows,loan:principal,fees,net:principal-I.oldbal-fees,totInt:rows.reduce((s,r)=>s+r.intr,0),balloon:balance,minDSCR:dscr.length?Math.min(...dscr):null};
}
function cell(t,s,r){return t.sheets.find(x=>x.name===s).cells.find(x=>x.r===r);}
function value(t,s,r){const c=cell(t,s,r);return c?('f'in c?c.cv:'n'in c?c.n:c.s):null;}
function workbook(){const t=engine.template();engine.cache(t);return t;}
function verify(label){
  const I=engine.inputs(),web=engine.sim(),t=workbook();
  for(const a of I.alts){
    const ref=oracle(I,a),got=engine.ledger(I,a),X=String.fromCharCode(66+a.n),b=7+(a.n-1)*9;
    for(const k of ['loan','fees','net','totInt','balloon','minDSCR'])near(got[k],ref[k],label+' web '+a.n+' '+k);
    ref.rows.forEach((r,i)=>{
      for(const [k,offset]of [['open',1],['intr',2],['prin',3],['ds',4],['close',5],['dscr',6]]){
        near(got.yrs[i][k],r[k],label+' web '+a.n+' Y'+(i+1)+' '+k);
        near(value(t,'03_Debt_Schedule',String.fromCharCode(67+i)+(b+offset)),r[k],label+' Excel '+a.n+' Y'+(i+1)+' '+k);
      }
      assert.ok(got.yrs[i].close>=0 && got.yrs[i].prin<=got.yrs[i].open,label+' nonnegative conserved balance');checks++;
    });
    if(a.code!==1){equal(got.balloon,0,label+' exact amortized balance');near(got.yrs.reduce((s,r)=>s+r.prin,0),got.loan,label+' principal conservation');}
    for(const [r,k]of [[5,'loan'],[10,'net'],[14,'minDSCR'],[15,'totInt'],[16,'balloon']])near(value(t,'02_Term_Sheets',X+r),ref[k],label+' terms '+X+r);
    equal(value(t,'01_Assumptions',X+'19'),a.n+'안',label+' input identity');
    equal(value(t,'02_Term_Sheets',X+'4'),a.n+'안',label+' terms identity');
    const expectedStatus=ref.minDSCR===null||!Number.isFinite(I.dmin)?'해당 없음':ref.minDSCR>=I.dmin?'충족':'미달';
    equal(value(t,'02_Term_Sheets',X+'17'),expectedStatus,label+' DSCR status');
    near(value(t,'02_Term_Sheets',X+'18'),Number.isFinite(I.oldrate)?ref.rows[0].intr-I.oldbal*I.oldrate/100:null,label+' existing interest change');
    equal(web.rows.find(r=>r.n===a.n).pass,expectedStatus==='해당 없음'?null:expectedStatus==='충족',label+' web status');
  }
  return t;
}
setup();verify('mixed repayment');
setup({noi:6500,noig:-8,appraisal:120000,oldbal:60000,oldrate:6.8},[{n:1,ltv:65,rate:6.2,mat:7,code:2},{n:2,ltv:62,rate:5.9,mat:5,code:3},{n:3,ltv:57,rate:6.5,mat:3,code:1}]);verify('declining NOI');
setup({noi:3000,noig:0,appraisal:50000,oldbal:20000,prepayfee:0,newfee:0},[{n:1,ltv:50,rate:0,mat:5,code:2},{n:2,ltv:50,rate:0,mat:5,code:3},{n:3,ltv:0,rate:4,mat:5,code:1}]);
verify('zero rate and no debt');equal(engine.sim().rows[0].yrs[0].prin,5000,'zero-rate principal');equal(engine.sim().rows[0].minDSCR,0.6,'zero-rate DSCR');
setup({dscrmin:'',oldrate:''});verify('missing optional benchmarks');
setup({},[{n:2,ltv:53,rate:4.7,mat:4,code:1},{n:3,ltv:61,rate:5.3,mat:6,code:3}]);
const missing=verify('missing first option');equal(cell(missing,'01_Assumptions','C20'),undefined,'missing option stays absent');equal(value(missing,'03_Debt_Schedule','B16'),'2안 상환계획','schedule retains option number');
for(const code of [1,2,3])for(const mat of [1,3,10])for(const rate of [0,0.01,12.5,30]){
  setup({},[{n:1,ltv:61.73,rate,mat,code}]);verify(`boundary ${code}/${mat}/${rate}`);
}
setup();const baseline=workbook();
const dv=baseline.sheets.find(s=>s.name==='01_Assumptions').validations;
assert.ok(dv.some(v=>v.ref==='C22:E22'&&v.type==='whole'&&v.f1==='1'&&v.f2==='10'),'term Excel validation');checks++;
assert.ok(dv.some(v=>v.ref==='C23:E23'&&v.type==='list'&&v.f1==='"1,2,3"'),'repayment Excel validation');checks++;
for(const [ref,bad]of [['C22',0],['C22',0.5],['C22',1.5],['C22',11],['C22','invalid'],['C23',0],['C23',2.5],['C23',4],['C23','invalid']]){
  const t=engine.template(),input=cell(t,'01_Assumptions',ref);delete input.n;delete input.s;
  input[typeof bad==='number'?'n':'s']=bad;engine.cache(t);
  equal(value(t,'01_Assumptions','C24'),'입력 확인','pasted invalid '+ref+' '+bad);
  equal(value(t,'02_Term_Sheets','C17'),'입력 확인','invalid verdict');
  for(let row=5;row<=18;row++)if(row!==17)equal(value(t,'02_Term_Sheets','C'+row),'','no invalid financial output '+row);
  equal(value(t,'03_Debt_Schedule','C8'),'','invalid ledger suppressed');
  near(value(t,'02_Term_Sheets','D10'),value(baseline,'02_Term_Sheets','D10'),'other option unaffected');
}
for(const mat of [0,0.5,1.5,11,12,'','1x',NaN]){
  setup();alternatives.a1_mat=mat;
  assert.match(engine.inputs().error,/1~10년.*정수/,'invalid web maturity');checks++;
  equal(engine.sim(),null,'invalid web results suppressed');
  assert.throws(()=>engine.template(),/1~10년.*정수/,'invalid download blocked');checks++;
}
setup();alternatives.a1_repay='invalid';assert.match(engine.inputs().error,/상환방식/);checks++;
setup();const rateChange=engine.template();cell(rateChange,'01_Assumptions','C12').n=7.1;engine.cache(rateChange);
for(const X of ['C','D','E'])near(value(rateChange,'02_Term_Sheets',X+'18')-value(baseline,'02_Term_Sheets',X+'18'),-44000*(7.1-5.8)/100,'existing rate is live formula '+X);
for(const [ref,n,target]of [['C5',6000,'C14'],['C21',6.2,'C11'],['C16',2,'C10'],['C22',7,'C15']]){
  const t=engine.template();cell(t,'01_Assumptions',ref).n=n;engine.cache(t);
  assert.notEqual(value(t,'02_Term_Sheets',target),value(baseline,'02_Term_Sheets',target),'editable assumption drives output '+ref);checks++;
}
equal(value(baseline,'01_Assumptions','C13'),0.6,'existing remaining maturity recorded');
equal(value(baseline,'01_Assumptions','C14'),'만기일시','existing repayment recorded');
console.log('REFI MODEL OK - '+checks+' independent ledger, formula, identity and invalid-input checks');
