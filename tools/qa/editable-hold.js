#!/usr/bin/env node
'use strict';
// Export five-year files, then prepare independent web expectations for edits.
const fs=require('fs'),path=require('path');
const {generate,workbook}=require('./excel-format');
const out=path.resolve((process.argv[2]==='--out'?process.argv[3]:process.argv[2])||'tools/parity/out/editable-hold');fs.mkdirSync(out,{recursive:true});
const cases=[
  {name:'office',deal:'office'},
  {name:'logistics',deal:'logistics'},
  {name:'direct',deal:'logistics',state:{noimode:'NOI 직접 입력',noi1:'7500',noig:'3',noideposit:'4500',taxmode:'비도관',taxrate:'22'}},
  {name:'amortizing',deal:'office',state:{maturity:'4'},stack:{senior_extra:'원리금균등'}},
  {name:'mezzpik',deal:'office',stack:{mezz_on:true,mezz_ltv:'10',mezz_rate:'9',mezz_extra:'만기일시상환(이자 누적)'}},
  {name:'nodebt',deal:'office',stack:{senior_on:false,mezz_on:false,pref_on:false}}
];
let checks=0;const manifest=[];
function ok(x,m){checks++;if(!x)throw new Error(m);}
function near(a,b,m){ok(Number.isFinite(+a)&&Math.abs(+a-b)<1e-7*Math.max(1,Math.abs(b)),m+': '+a+' != '+b);}
for(const config of cases){
  const g=generate({...config,hold:5}),w=workbook(g.bytes);
  const cell=(s,r)=>w.sheets.find(x=>x.name===s).cells.get(r);
  ok(!cell('A&R','C79').formula,config.name+' editable hold');
  ok(w.styles[cell('A&R','C79').s].font.content.includes('FF0000FF'),config.name+' holding input is blue');
  ok(w.sheets.find(s=>s.name==='A&R').xml.includes('sqref="C79"><formula1>3</formula1><formula2>10</formula2>'),config.name+' 3–10 integer validation');
  ok(cell('A&R','G48').formula.includes('C79'),config.name+' dynamic heading');
  for(let y=6;y<=10;y++)ok(cell('지분 현금흐름',String.fromCharCode(67+y)+'7').value==='',config.name+' no trailing cash flow');
  for(const [ref,k] of [['J5','IRR'],['J7','EM'],['H5','commonIRR'],['I5','prefIRR'],['H8','commonCoC'],['H13','minDSCR']]){
    if(Number.isFinite(g.expected[k]))near(cell('A&R',ref).value,g.expected[k],config.name+' '+k);
  }
  for(const sh of w.sheets)for(const c of sh.cells.values())ok(c.t!=='e',config.name+' error '+sh.name+'!'+c.r);
  fs.writeFileSync(path.join(out,config.name+'.xlsx'),g.bytes);
  const expected={};
  for(const hold of [3,5,7,10]){
    const fresh=generate({...config,hold}),fw=workbook(fresh.bytes);
    expected[hold]={raw:fresh.expected,sensitivity:{}};
    for(const [ref,c] of fw.sheets.find(s=>s.name==='A&R').cells)if(/^([H-L])(5[2-4]|59|6[0-3])$/.test(ref))expected[hold].sensitivity[ref]=c.value;
  }
  manifest.push({name:config.name,expected});
}
fs.writeFileSync(path.join(out,'expected.json'),JSON.stringify(manifest,null,2));
for(const [name,rentroll] of [['fixed-lease','model'],['source-only','source']]){
  const g=generate({deal:'office',hold:5,rentroll}),w=workbook(g.bytes),ar=w.sheets.find(s=>s.name==='A&R');
  ok(name==='fixed-lease'?ar.cells.get('C57').formula.replace(/\$/g,'').includes('C16'):w.styles[ar.cells.get('C79').s].font.content.includes('FF0000FF'),name+' period editing contract');
  fs.writeFileSync(path.join(out,name+'.xlsx'),g.bytes);
}
console.log('PASS: '+checks+' checks; '+cases.length+' five-year workbooks, 24 edit expectations');
