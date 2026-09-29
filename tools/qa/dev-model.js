#!/usr/bin/env node
'use strict';
// Real download generator, with a deliberately simple independent cost ledger.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {generate,workbook}=require('./excel-format.js');
const arg=process.argv.indexOf('--out'),out=path.resolve(arg>=0?process.argv[arg+1]:path.join(__dirname,'../parity/out/dev-model'));
fs.mkdirSync(out,{recursive:true});
const state={asset:'개발 월별 수지 회귀검사',devtype:'공동주택 분양',landcost:'250',conscost:'500',othercost:'20',preperiod:'2',landdp:'10',landpay:'1',consperiod:'12',saleopen:'0',absorb:'12',aptsold:'100',aptinit:'25',dpct:'10',mpct:'60',mcount:'6',rpct:'30',taxpct:'0',engpct:'0',rsvpct:'0',salespct:'0',hugpct:'0',midfree:'미반영',midrate:'0',equity:'100',brate:'12',pfrate:'6',pffee:'1',conscurve:'균등 기성',aptrows:JSON.stringify([{t:'A',a:'20',n:'100',p:'12'}]),retrows:'[]'};
const cases=[];let checks=0;
const bridge=generate({deal:'dev',download:false,state:{...state,preperiod:'1',landdp:'100',landpay:'0',equity:'0',othercost:'0'}}).expected;
assert.ok(Math.abs(bridge.intBr-2.5)<1e-10,'one month of bridge interest = 250 × 12% / 12 before PF conversion');checks++;
const late=generate({deal:'dev',state:{...state,landpay:'100'}}),lateBook=workbook(late.bytes),lateProfit=lateBook.sheets.find(s=>s.name==='04_Profitability');
assert.ok(Math.abs(Number(lateProfit.cells.get('C27').value)-(100+late.expected.profit))<1e-8,'late land payment is not omitted from equity recovery');checks++;
fs.writeFileSync(path.join(out,'land-late.xlsx'),late.bytes);
for(const count of [1,4,6,8,12]){
  const name='count'+count,generated=generate({deal:'dev',state:{...state,mcount:String(count)}}),wb=workbook(generated.bytes);
  const a=wb.sheets.find(s=>s.name==='01_Assumptions'),m=wb.sheets.find(s=>s.name==='03_Monthly_CF'),p=wb.sheets.find(s=>s.name==='04_Profitability');
  assert.ok(a.xml.includes('sqref="C19"')&&a.xml.includes('<formula2>12</formula2>'),'bounded count validation');checks++;
  assert.equal([...m.cells.entries()].filter(([ref,c])=>/^X(?:[5-9]|1[0-6])$/.test(ref)&&c.formula).length,12,'all 12 supported instalments remain editable');checks++;
  assert.ok(Math.abs(Number(p.cells.get('C5').value)-1200)<1e-8,'contractual revenue conservation');checks++;
  assert.ok(p.cells.get('C29').formula.includes('IF(C28>0,'),'Excel must not take a fractional power of nonpositive equity recovery');checks++;
  const file=name+'.xlsx';fs.writeFileSync(path.join(out,file),generated.bytes);cases.push({name,file,count,expected:generated.expected});
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({state,cases},null,2));
console.log('DEV GENERATOR OK - '+checks+' checks; '+cases.length+' files in '+out);
