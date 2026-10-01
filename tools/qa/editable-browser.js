#!/usr/bin/env node
'use strict';
// Exercise input and blur in Chromium: parser-only tests miss silent reformatting.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require('playwright');
const web=path.resolve(__dirname,'../../dart-search/web/modelter');
const out=process.env.EDITABLE_BROWSER_OUT;
const server=http.createServer((req,res)=>{
  const name=req.url.split('?')[0];
  if(name==='/e'){res.writeHead(204);res.end();return;}
  const file=path.resolve(web,'.'+(name==='/'?'/index.html':name));
  if(!file.startsWith(web+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':name.endsWith('.js')?'application/javascript':'text/html; charset=utf-8'});res.end(fs.readFileSync(file));
});
(async()=>{
  let browser,checks=0;
  const ok=(value,message)=>{assert.ok(value,message);checks++;};
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    browser=await chromium.launch(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{});
    const page=await browser.newPage(),errors=[],downloads=[];
    page.on('pageerror',e=>errors.push(String(e)));
    page.on('dialog',d=>d.accept());
    page.on('download',d=>downloads.push(d));
    await page.goto('http://127.0.0.1:'+server.address().port+'/');
    await page.evaluate(()=>{cur='dev';fillExample();depth='deep';renderForm();restoreInputs();update();});
    while(await page.locator('#formBody .fgroup.adv.collapsed').count())await page.locator('#formBody .fgroup.adv.collapsed > .fgroup-h').first().click();
    while(await page.locator('#formBody details:not([open])').count())await page.locator('#formBody details:not([open]) > summary').first().click();
    const period=page.locator('#f_consperiod');
    for(const bad of ['1.5','1e9','12abc','0','201']){
      await period.fill(bad);await period.press('Tab');
      await page.waitForFunction(()=>!!document.querySelector('.sim-empty'));
      ok(await period.inputValue()===bad,'blur must preserve invalid input '+bad);
      ok(await page.evaluate(()=>state.consperiod)===bad,'state must preserve invalid input '+bad);
      ok(/공사기간.*1~200.*정수/.test(await page.locator('.sim-empty').innerText()),'specific error for '+bad);
      ok(await page.evaluate(()=>document.querySelector('#simCard').classList.contains('noresult')),'old result removed');
      const count=downloads.length;
      await page.evaluate(()=>window.__downloadXlsx());
      await page.waitForTimeout(100);
      ok(downloads.length===count,'invalid schedule blocks file generation');
    }
    await period.fill('32');await period.press('Tab');
    await page.waitForFunction(()=>!document.querySelector('.sim-empty'));
    ok(await page.evaluate(()=>!!simDevResi()),'correcting schedule restores calculation');
    for(const key of ['preperiod','saleopen']){
      const input=page.locator('#f_'+key);await input.fill('0');await input.press('Tab');
      ok(await page.evaluate(k=>state[k],key)==='0','valid zero survives '+key);
      ok(await page.evaluate(()=>!!simDevResi()),'valid zero calculates '+key);
    }
    if(out)fs.mkdirSync(out,{recursive:true});
    for(const deal of ['logistics','dev','refi']){
      await page.evaluate(d=>{cur=d;fillExample();},deal);
      const next=page.waitForEvent('download');
      await page.locator('#xlDownload').click();
      const download=await next;
      ok(!await download.failure(),deal+' downloads successfully');
      if(out)await download.saveAs(path.join(out,deal+'.xlsx'));
    }
    ok(errors.length===0,'no uncaught browser errors: '+errors.join('; '));
    console.log('EDITABLE BROWSER OK - '+checks+' checks; three actual downloads');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
