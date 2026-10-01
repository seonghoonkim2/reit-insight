#!/usr/bin/env node
'use strict';
// Development schedule inputs must survive both parsing and editing unchanged.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {generate,workbook}=require('./excel-format.js');
const html=fs.readFileSync(path.resolve(__dirname,'../../dart-search/web/modelter/index.html'),'utf8');
function section(a,b){const i=html.indexOf(a),j=html.indexOf(b,i);assert.ok(i>=0&&j>i);return html.slice(i,j);}
const parse=html.match(/^function parseNum\(v\).*$/m)[0];
const format=html.match(/^function formatNumField\(el\).*$/m)[0];
const state={landcost:'250',conscost:'500',othercost:'20',preperiod:'2',landdp:'10',landpay:'1',consperiod:'12',saleopen:'0',absorb:'12',aptsold:'100',aptinit:'25',dpct:'10',mpct:'60',mcount:'6',rpct:'30',taxpct:'0',engpct:'0',rsvpct:'0',salespct:'0',hugpct:'0',midfree:'미반영',midrate:'0',equity:'100',brate:'12',pfrate:'6',pffee:'1',conscurve:'균등 기성',aptrows:JSON.stringify([{t:'A',a:'20',n:'100',p:'12'}]),retrows:'[]'};
const base={...state};
const engine=new Function('state',parse+'\nvar cur="dev";function devResi(){return true;} function mnum(k){return parseNum(state[k]);}function devRows(k){return JSON.parse(state[k]||"[]");}function meok(n){return String(n);}\n'+format+'\n'+section('function devResiInputError(', '/* 분양률 역산')+'\nreturn {inputs:devResiInputs,error:devResiInputError,compute:devResiCompute,format:formatNumField};')(state);
let checks=0;
function check(v,msg){assert.ok(v,msg);checks++;}
function reset(patch){for(const k of Object.keys(state))delete state[k];Object.assign(state,base,patch);}
for(const [key,min,max]of [['consperiod',1,200],['saleopen',0,200],['absorb',1,200],['preperiod',0,120],['landpay',0,120],['mcount',1,12]]){
  for(const bad of [String(min-1),'1.5',String(max+1),'1000000000','Infinity','NaN','12abc','0x10']){
    reset({[key]:bad});check(engine.error(key).includes('정수'),key+' '+bad+' explains whole-month constraint');
    check(engine.inputs()===null,key+' '+bad+' cannot reach monthly loops');
    const el={dataset:{num:'1',k:key},value:bad};engine.format(el);
    check(el.value===bad&&state[key]===bad,key+' '+bad+' is not silently rewritten on blur');
  }
  for(const good of [min,max]){reset({[key]:String(good)});check(!engine.error(),key+' endpoint '+good+' allowed');check(engine.inputs()!==null,key+' endpoint preserves inputs');}
  reset({[key]:''});check(!engine.error(),key+' blank retains documented default path');
}
reset({preperiod:'120',consperiod:'200',saleopen:'200',absorb:'200',landpay:'120',mcount:'12'});
check(engine.inputs().T===520,'published maximum schedule is bounded to 520 months');
reset({preperiod:'0',landpay:'0',saleopen:'0',equity:'0',pfrate:'0',brate:'0'});
const zero=engine.inputs();check(zero.pre===0&&zero.s0===0&&zero.landpay===0&&zero.E===0&&zero.rate===0,'legitimate zero schedules, equity and rates survive');
reset({saleopen:'18',absorb:'6'});const delayed=engine.inputs();
check(delayed.M===12&&delayed.s0===18&&delayed.T===26,'post-completion sales retain opening month and horizon');
const r=engine.compute(delayed);check(Math.abs(r.cumIn-1200)<1e-9,'post-completion sales collect exactly the contracted consideration');
const outArg=process.argv.indexOf('--out'),out=path.resolve(outArg>=0?process.argv[outArg+1]:path.join(__dirname,'../parity/out/input-contract'));
fs.mkdirSync(out,{recursive:true});
const delayedFile=generate({deal:'dev',state:{...base,saleopen:'18',absorb:'6'}}),wb=workbook(delayedFile.bytes);
const sheet=name=>wb.sheets.find(s=>s.name===name),value=(s,c)=>sheet(s).cells.get(c).value;
check(Number(value('01_Assumptions','C11'))===18,'download preserves post-completion sales month');
check(Number(value('03_Monthly_CF','C24'))===0,'no contract cash before opening');
check(Number(value('03_Monthly_CF','C25'))===300,'first 25 percent contracts occur at month 20');
check(Math.abs(Number(value('04_Profitability','C5'))-1200)<1e-8,'download consideration conservation');
check(sheet('01_Assumptions').xml.includes('sqref="C37"')&&sheet('01_Assumptions').xml.includes('<formula2>120</formula2>'),'land payment validation matches web limit');
check(sheet('01_Assumptions').cells.get('C10').s!==sheet('01_Assumptions').cells.get('C19').s,'fixed schedule is visually distinct from editable count');
check(String(value('01_Assumptions','B3')).includes('C10:C13'),'editable-range notice sits above assumptions');
check(String(value('02_Unit_Mix','B3')).includes('행을 추가'),'unit-mix structural changes are explained');
function near(a,b,label){check(Number.isFinite(a)&&Math.abs(a-b)<1e-8,label+': '+a+' versus '+b);}
let debt=0,cash=100,peak=0,interest=0;
for(let month=0;month<=26;month++){
  // All contractual dates precede this post-completion sales opening, so each
  // new buyer settles 10%+60%+30% in the contract month, never before month 20.
  const receipts=month===20?300:month>20?150:0;
  const land=month===0?25:month===1?225:0,construction=month>=3&&month<=14?500/12:0;
  const other=20/27,intr=debt*(month<=2?.12:.06)/12,available=cash+receipts-land-construction-other-intr;
  const payment=Math.min(debt,Math.max(0,available));debt=debt-payment+Math.max(0,-available);cash=Math.max(0,available-payment);
  if(month>=2)peak=Math.max(peak,debt);interest+=intr;
  const row=5+month;
  for(const [col,want]of [['C',receipts],['D',receipts*.1],['E',receipts*.6],['F',receipts*.3],['G',receipts],['H',land],['I',construction],['J',other],['N',intr],['P',debt],['Q',cash]])near(Number(value('03_Monthly_CF',col+row)),want,'independent month '+month+' '+col);
}
near(Number(value('04_Profitability','C21')),1200-770-interest-peak*.01,'independent profit after interest and final PF fee');
near(Number(value('04_Profitability','C27')),cash-debt-peak*.01,'independent distributable recovery');
near(delayedFile.expected.profit,1200-770-interest-peak*.01,'web independent profit');
fs.writeFileSync(path.join(out,'dev-after-completion.xlsx'),delayedFile.bytes);
const refi=generate({deal:'refi'}),refiWb=workbook(refi.bytes),refiA=refiWb.sheets.find(s=>s.name==='01_Assumptions');
check(refiA.cells.get('B3').value.includes('참고용'),'refi reference-only inputs explained');
check(refiA.cells.get('B25').value.includes('빈 대안'),'missing refinancing alternatives are explained');
fs.writeFileSync(path.join(out,'refi-editing.xlsx'),refi.bytes);
for(const hold of [3,5,10])for(const mode of ['source','model']){
  const generated=generate({deal:'office',hold,rentroll:mode}),book=workbook(generated.bytes);
  const ar=book.sheets.find(s=>s.name==='A&R'),rr=book.sheets.find(s=>s.name==='Rent Roll'),linked=mode==='model';
  check(ar.cells.get('E23').value.includes(linked?'Rent Roll 계약표':'C23에서 수정'),mode+' '+hold+' correct rent-edit location');
  check(ar.cells.get('E27').value.includes('Rent Roll')===linked,mode+' '+hold+' correct growth-edit location');
  check(Boolean(ar.cells.get('C23').formula)===linked,mode+' '+hold+' instructions match actual rent linkage');
  if(linked){
    for(const [ref,label,want]of [['C5','전용면적',2800],['D5','임대면적',3500],['E5','임대료',85000],['F5','관리비',30000],['G5','보증금',2500000000],['H5','렌트프리',1],['I5','잔여만기',1.5],['J5','상승률',.03]]){
      check(rr.cells.get(ref[0]+'4').value.includes(label),mode+' '+hold+' header '+ref);
      near(Number(rr.cells.get(ref).value),want,mode+' '+hold+' value '+ref);
    }
  }else{
    check(rr.cells.get('B2').value.includes('참고용')&&rr.cells.get('B2').value.includes('반영되지 않습니다'),mode+' '+hold+' reference-only notice');
    check(![...rr.cells.values()].some(c=>c.value==='시장 가정'),mode+' '+hold+' no inactive market section');
    check(!rr.cells.has('I4')&&!rr.cells.has('J4'),mode+' '+hold+' retains seven-column source schema');
    for(const [ref,label,want]of [['C5','임대면적',3500],['D5','임대료',85000],['E5','관리비',30000],['F5','보증금',2500000000],['H5','잔여만기',1.5]]){
      check(rr.cells.get(ref[0]+'4').value.includes(label),mode+' '+hold+' header '+ref);
      near(Number(rr.cells.get(ref).value),want,mode+' '+hold+' value '+ref);
    }
    check(rr.cells.get('G4').value==='계약만기'&&rr.cells.get('G5').value==='—',mode+' '+hold+' unknown expiry remains date field');
  }
  if(hold===5)fs.writeFileSync(path.join(out,'office-rentroll-'+mode+'.xlsx'),generated.bytes);
}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,expected:delayedFile.expected,delayedInput:delayed},null,2));
console.log('INPUT CONTRACT OK - '+checks+' checks');
