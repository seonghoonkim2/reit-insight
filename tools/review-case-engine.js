'use strict';
// Commit-time examples use the shipped app's calculation and share encoder.
// No runtime hook or second implementation of financial formulas is published.
const vm = require('vm');

function stub() {
  const values = {};
  const el = new Proxy(function () {}, {
    get(_, key) {
      if (key === 'querySelectorAll') return () => [];
      if (key === 'querySelector' || key === 'closest' || key === 'getAttribute') return () => null;
      if (key === 'getBoundingClientRect') return () => ({top:0,bottom:0,left:0,right:0,width:0,height:0});
      if (key === 'classList') return {add(){},remove(){},toggle(){},contains(){return false;}};
      if (key === 'style' || key === 'dataset') return values[key] || (values[key] = {});
      if (key === Symbol.toPrimitive) return () => '';
      if (['value','innerHTML','textContent','className','href','placeholder','id','name','type'].includes(key)) return values[key] || '';
      if (['hidden','checked','disabled'].includes(key)) return values[key] || false;
      if (key in values) return values[key];
      return el;
    },
    set(_, key, value) { values[key] = value; return true; },
    apply() { return el; }
  });
  return el;
}

function createCaseEngine(html) {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const main = blocks.find(b => b.includes('function fillExample'));
  const calc = blocks.find(b => b.includes('const XLTMPL='));
  if (!main || !calc) throw new Error('검토 예시에 필요한 앱 엔진을 찾지 못했습니다.');
  const storage = {getItem:()=>null,setItem(){},removeItem(){}};
  const sandbox = {
    console, TextEncoder, TextDecoder, URL, Uint8Array, Buffer,
    setTimeout:()=>0, clearTimeout(){}, setInterval:()=>0, clearInterval(){},
    requestAnimationFrame:()=>0, addEventListener(){}, matchMedia:()=>({matches:false,addEventListener(){}}),
    innerWidth:1280, innerHeight:800, scrollTo(){}, alert(){}, confirm:()=>true,
    localStorage:storage, sessionStorage:storage,
    location:{hash:'',origin:'https://modelter.com',pathname:'/',href:'https://modelter.com/'},
    navigator:{}, performance:{now:()=>0},
    document:{getElementById:()=>stub(),querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>stub(),addEventListener(){},body:stub(),documentElement:stub(),readyState:'complete',fonts:{ready:Promise.resolve()}},
    IntersectionObserver:function(){this.observe=()=>{};this.disconnect=()=>{};},
    // Network access is deliberately absent; generators cannot send QA events.
    fetch:()=>Promise.reject(new Error('No network in the example generator'))
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(main + '\n' + calc + `
    globalThis.caseEngine = {
      load: function(deal, patch) {
        cur=deal; fillExample();
        Object.assign(state, patch.state||{}); Object.assign(stackState, patch.stack||{});
        exMarkExample();
        return this.read();
      },
      read: function() {
        var result=simModel();
        return JSON.parse(JSON.stringify({payload:sharePayload(),raw:result&&result.raw,rows:result&&result.rows,url:shareLink(true,'seo')}));
      },
      decode: function(encoded) { return JSON.parse(mtLZ.decompress(encoded)); },
      restore: function(payload) { applySharedPayload(payload); return this.read(); }
    };`, context, {timeout:30000});
  return sandbox.caseEngine;
}

function reviewCases(html, examples) {
  const engine = createCaseEngine(html);
  const number = value => Number(String(value).replace(/,/g,''));
  const scaled = (value, scale) => String(Math.round(number(value) * scale * 100) / 100);
  const definitions = {
    office:[
      {id:'base',title:'기준 조건',note:'위 표의 조건입니다.',patch:{}},
      {id:'price',title:'매입가 5% 낮추기',note:'매입가만 낮춥니다. 감정가와 대출 조건은 같습니다.',patch:{state:{price:scaled(examples.office.state.price,.95)}}},
      {id:'rate',title:'대출금리 1%p 높이기',note:'선순위 대출금리만 높입니다. 매입가와 나머지 조건은 같습니다.',patch:{stack:{senior_rate:String(number(examples.office.stack.senior_rate)+1)}}}
    ],
    dev:[
      {id:'base',title:'기준 조건',note:'위 표와 같은 공동주택 분양 사업입니다.',patch:{}},
      {id:'cost',title:'공사비 10% 늘리기',note:'공사비만 늘립니다. 공사기간과 기성 곡선은 같습니다.',patch:{state:{conscost:scaled(examples.dev.state.conscost,1.1)}}},
      {id:'price',title:'분양가 5% 낮추기',note:'아파트 각 평형과 상가의 분양가만 낮춥니다. 물량과 분양률은 같습니다.',patch:{state:Object.fromEntries(['aptrows','retrows'].map(key=>[key,JSON.stringify(JSON.parse(examples.dev.state[key]).map(row=>({...row,p:scaled(row.p,.95)})))]))}}
    ]
  };
  return Object.fromEntries(Object.entries(definitions).map(([deal, cases])=>[deal,cases.map(c=> {
    const calculated=engine.load(deal,c.patch);
    const keys=deal==='office'?['IRR','minDSCR','equity']:['profit','margin','loan'];
    for (const key of keys) if (!Number.isFinite(calculated.raw && calculated.raw[key])) throw new Error('검토 예시 결과가 유효하지 않습니다: '+deal+'/'+c.id+'/'+key);
    return {...c,...calculated};
  })]));
}
module.exports = {createCaseEngine, reviewCases};
