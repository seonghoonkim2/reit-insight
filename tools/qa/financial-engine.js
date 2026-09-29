#!/usr/bin/env node
'use strict';
/* Independent monetary examples for both DCF engine paths.
 * Runtime-only access to local cash-flow arrays; no hook is written to index.html.
 * Deliberately simple 1,000 acquisition / 300 loan / 70 NOI permits hand checking.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const html = fs.readFileSync(path.resolve(__dirname, '../../dart-search/web/modelter/index.html'), 'utf8');
function section(source, from, to) {
  const start = source.indexOf(from), end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, 'Missing engine section: ' + from);
  return source.slice(start, end);
}
const irr = section(html, 'function _npv(', 'function assumFull(');
const calc = section(html, 'function calcModel(', 'function _fp(')
  .replace('return {IRR:IRR', 'return {prefCF:prefCF,commonCF:commonCF,IRR:IRR');
const income = section(html, 'function leaseIncome(', 'function assumFullV2(');
const lease = section(html, 'function leaseModelV2(', 'function mtHold(')
  .replace('return {IRR:IRR', 'return {prefCF:prefCF,commonCF:commonCF,IRR:IRR');
const engine = new Function(irr + calc + income + lease + '; return {calcModel,leaseModelV2};')();
const V = {C7:100,C8:1,C11:1000,C13:1,C15:0,C16:0,C17:0,C23:70e6/1200,C24:0,C25:1,C26:0,C27:0,C28:0,C29:0,C31:0,C32:0,C34:0,C35:0,C36:0,C37:0,C38:0,C39:0,C40:0,C41:0,C43:0,C45:.3,C46:.1,C47:'만기일시(이자만)',C48:20,C51:.2,C52:.1,C58:.07,C59:0,C61:.3,C62:40,C65:.22,C66:1,C71:0,C72:0,C73:1,C74:0,C76:0,C77:0,C79:5,C80:0,C82:0};
const L = {gfa:100,leaseRatio:1,price:1000,aprR:1,acqtax:0,acqfee:0,finFee:0,sLtv:.3,sRate:.1,mat:20,prefRatio:.2,prefCoc:.1,depMonths:0,depRate:0,otherIncome:0,otherG:0,opexAnnual:0,opexG:0,capexAnnual:0,exitCap:.07,saleFee:0,buildRatio:.3,depLife:40,taxrate:.22,passthru:true,prepayFee:0,perfFee:0,prefCumulative:1,depAssume:0,opFee:0,fixCost:0,mLtv:0};
const market = {repay:'만기일시(이자만)',grace:0,marketPP:70e6/1200,marketCamPP:0,mktStepUp:0,camG:0,renewP:1,mtm:0,downtime:0,newRentFree:0,absorbMonths:12,stabVac:0};
const leases = [{area:100,rentPP:70e6/1200,camPP:0,stepUp:0,yrsToExp:99,deposit:0}];
const paths = [
  {name:'assumption', run:p=>engine.calcModel({...V,...p}), map:{term:'C48',repay:'C47',grace:'C80',rate:'C46',pref:'C51',cum:'C73',cost:'C77'}},
  {name:'rentroll', run:p=>engine.leaseModelV2(leases,{...L,...p},{...market,repay:p.repay||market.repay,grace:p.grace||0},5), map:{term:'mat',repay:'repay',grace:'grace',rate:'sRate',pref:'prefRatio',cum:'prefCumulative',cost:'fixCost'}}
];
let checks = 0;
function near(actual, expected, name) {
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual-expected)<1e-8,
    `${name}: actual=${actual}, expected=${expected}`);
  checks++;
}
function array(actual, expected, name) {
  assert.equal(actual.length, expected.length, name);
  actual.forEach((value,index)=>near(value, expected[index], name+'['+index+']'));
}
for (const p of paths) {
  const run = (changes={}) => p.run(Object.fromEntries(Object.entries(changes).map(([key,value])=>[p.map[key]||key,value])));
  array(run({repay:'원금균등',term:3}).endBal,[200,100,0,0,0],p.name+' principal term 3');
  array(run({repay:'원금균등',term:3}).INT,[30,20,10,0,0],p.name+' interest term 3');
  array(run({repay:'거치후 원리금균등',term:3,grace:2}).endBal,[300,300,0,0,0],p.name+' grace term 3');
  array(run({repay:'거치후 원리금균등',term:2,grace:5}).endBal,[300,0,0,0,0],p.name+' grace over term');
  array(run({repay:'원금균등',term:0}).endBal,[0,0,0,0,0],p.name+' minimum term');
  array(run({repay:'원금균등',term:2.6}).endBal,[200,100,0,0,0],p.name+' rounded term');
  for (const repay of ['원금균등','원리금균등','거치후 원리금균등']) {
    for (const rate of [0,.1]) {
      const r = run({repay,term:3,grace:1,rate});
      assert.ok(r.endBal.every(x=>x>=0) && r.INT.every(x=>x>=0),p.name+' nonnegative balance/interest');checks++;
      array(r.endBal.slice(2),[0,0,0],p.name+' fully repaid '+repay+' '+rate);
      near(r.DS.reduce((sum,x)=>sum+x,0)-r.INT.reduce((sum,x)=>sum+x,0),300,p.name+' principal conservation');
    }
  }
  // Five years of 70 NOI - 30 interest leaves 40 to divide. At exit the
  // property sells for 1,000 and repays 300 debt; preferred principal is 200.
  const normal = run();
  array(normal.prefCF,[20,20,20,20,220],p.name+' independent normal preferred');
  array(normal.commonCF,[20,20,20,20,520],p.name+' independent normal common');
  for (const cum of [0,1]) {
    const noPref = run({pref:0,cost:80,cum});
    array(noPref.prefCF,[0,0,0,0,0],p.name+' no preferred');
    array(noPref.commonCF,[-40,-40,-40,-40,660],p.name+' common funds deficit');
    near(noPref.IRR,noPref.commonIRR,p.name+' only-common IRR equals total');
    // Initial equity 700 plus four calls of 40 is 860 invested; only the
    // final 660 is received. Netting calls against proceeds understates capital.
    near(noPref.EM,660/860,p.name+' total EM includes all funding calls');
    near(noPref.commonEM,660/860,p.name+' common EM includes all funding calls');
    const r = run({cost:80,cum});
    array(r.prefCF,[0,0,0,0,cum?300:220],p.name+' preferred after loss years '+cum);
    array(r.commonCF,[-40,-40,-40,-40,cum?360:440],p.name+' common after loss years '+cum);
    r.dist.forEach((value,index)=>near(value,r.prefCF[index]+r.commonCF[index],p.name+' distribution conservation'));
  }
  const loss = run({cost:1000});
  array(loss.prefCF,[0,0,0,0,0],p.name+' no preferred payment in total loss');
  array(loss.commonCF,loss.dist,p.name+' common funds total loss');
}
// IRR must be invariant to amount units and cover losses close to -100%.
// These one-payment examples have a closed-form answer, independent of NPV code.
const irrPaths = [
  {name:'legacy',code:section(html,'function npv(', 'function simDcf('),nameOfFunction:'irr'},
  {name:'assumption',code:irr,nameOfFunction:'_irr'},
  {name:'rentroll',code:section(html.slice(html.indexOf('// ── 임차인별 NOI 엔진')),'function npv(', '// lease별'),nameOfFunction:'irr'}
];
for(const path of irrPaths){
  const solve=new Function(path.code+';return '+path.nameOfFunction+';')();
  for(const scale of [1e-6,1,1e6]){
    near(solve([-scale,100*scale]),99,path.name+' small-capital IRR scale '+scale);
    near(solve([-100*scale,scale]),-.99,path.name+' near-total loss scale '+scale);
    near(solve([-100*scale,0,0,0,0,161.051*scale]),.1,path.name+' five-year IRR scale '+scale);
  }
  for(const cash of [[0,0],[1,2],[-1,-2],[-1,NaN],[-1,Infinity]]){
    assert.equal(solve(cash),null,path.name+' undefined or invalid cash flow');checks++;
  }
}
console.log('FINANCIAL ENGINE OK - '+checks+' independent checks, assumption and rentroll paths');
