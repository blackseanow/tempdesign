/* Production smoke check; requires an existing Playwright installation. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const base=(process.env.PREVIEW_URL || 'https://182.61.30.47').replace(/\/$/,'');
const out=process.env.TEST_OUTPUT_DIR || '/tmp/tempdesign-preview-check';
fs.mkdirSync(out,{recursive:true});
const expected404=u=>/\/home-pano\/audio\/[^/]+\.mp3(?:\?|$)|\/anatomy\/(daqi|huojian|jitang)\//.test(u);
(async()=>{
 const browser=await chromium.launch({headless:true, ...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--enable-unsafe-swiftshader']});
 const report={base,devices:{},headers:[]};
 try {
 for(const [name,type] of [['/home-pano/','text/html'],['/home-pano/img/tiles/manifest.json','application/json'],['/home-pano/src/render/worker.js','text/javascript'],['/home-pano/fonts/pano-kai.woff2','font/woff2'],['/anatomy/dabing/dabing.html','text/html']]) {
   const req=await browser.newContext(); const res=await req.request.get(base+name);
   assert.equal(res.status(),200,name);assert.ok(res.headers()['content-type'].startsWith(type),name+' MIME');
   report.headers.push({path:name,status:res.status(),type:res.headers()['content-type']});await req.close();
 }
 for(const [device,opts] of Object.entries({desktop:{viewport:{width:1440,height:900},deviceScaleFactor:1},mobile:{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}})){
   const ctx=await browser.newContext(opts);const page=await ctx.newPage();
   const errors=[],badResponses=[],consoleErrors=[],expected=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('response',r=>{if(r.status()>=400)(r.status()===404&&expected404(r.url())?expected:badResponses).push({url:r.url(),status:r.status()});});
   page.on('console',m=>{if(m.type()==='error'&&!expected404(m.location().url||''))consoleErrors.push({text:m.text(),location:m.location()});});
   await page.addInitScript(()=>{window.__doorPaint=null;new PerformanceObserver(l=>{for(const e of l.getEntries())if(e.identifier==='door')window.__doorPaint=e.renderTime||e.loadTime;}).observe({type:'element',buffered:true});});
   await page.goto(base+'/home-pano/',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.__doorPaint!==null,{},{timeout:15000});
   const doorMs=await page.evaluate(()=>window.__doorPaint);console.log(device,'door',doorMs,'ms');
   const timings=await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>/door\/|pano-kai|pano.css/.test(e.name)).map(e=>({url:e.name,start:e.startTime,end:e.responseEnd,duration:e.duration}))); 
   assert.equal(await page.evaluate(()=>isSecureContext),true);
   await page.screenshot({path:path.join(out,device+'-door.png')});
   await page.waitForFunction(()=>window.__pano&&window.__pano.frameCount>2,null,{timeout:45000});
   await page.locator('.door-btn').click();
   await page.waitForFunction(()=>window.__pano.step==='reach'||window.__pano.flat,null,{timeout:45000});
   if(!await page.evaluate(()=>window.__pano.flat)){
     await page.locator('.hot[data-id="recorder"]').click({force:true});
     await page.waitForFunction(()=>window.__pano.step==='free'||window.__pano.flat,null,{timeout:30000});
   }
   const first=await page.evaluate(()=>({step:window.__pano.step,flat:!!window.__pano.flat,seen:localStorage.getItem('home-pano:seen')}));
   await page.screenshot({path:path.join(out,device+'-room.png')});
   await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__pano&&window.__pano.frameCount>2);
   const t=Date.now();await page.locator('.door-btn').click();
   await page.waitForFunction(()=>window.__pano.step==='free'||window.__pano.flat,null,{timeout:10000});
   const repeatMs=Date.now()-t;
   await page.evaluate(()=>window.__pano.aim('dabing'));
   await page.evaluate(()=>window.__pano.rendered());
   await page.locator('.hot[data-id="dabing"]').click({force:true});
   await page.waitForFunction(()=>document.querySelector('#viewer iframe').src.includes('/anatomy/dabing/dabing.html'));
   const frame=page.frameLocator('#viewer iframe');await frame.locator('body').waitFor();
   assert.equal(await page.locator('#viewer').isVisible(),true);
   // Verify private source assets and repository metadata were not published.
   for(const p of ['/home-pano/img/src/','/home-pano/img/pano.png'])assert.equal((await page.request.get(base+p)).status(),404,p);
   assert.deepEqual(errors,[],device+' JS exceptions');assert.deepEqual(badResponses,[],device+' unexpected HTTP errors');assert.deepEqual(consoleErrors,[],device+' console errors');
   report.devices[device]={doorMs,doorWithin1s:doorMs<=1000,timings,secureContext:true,first,repeatMs,anatomyViewer:true,errors,badResponses,consoleErrors,expected404:expected};
   console.log(device,JSON.stringify(report.devices[device]));await ctx.close();
 }
 report.functionalPass=true;
 report.doorWithin1s=Object.values(report.devices).every(d=>d.doorWithin1s);
 report.pass=report.functionalPass&&report.doorWithin1s;
 if(!report.pass)process.exitCode=1;
 }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
