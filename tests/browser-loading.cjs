/* Real startup resources drive footstep cadence; the loader never adds a wait. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:4173';
const root=path.join(__dirname,'..');
const trackedAssets=[
 '/assets/loading/girl-run.webp','/assets/loading/boy-run.webp','/assets/loading/dust.webp',
 '/assets/scenes/counter.webp','/assets/scenes/workbench.webp',
 '/assets/fonts/Hakgyoansim-BoardmarkerR.woff2'
];
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};

(async()=>{
 assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use a local test server.');
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 async function controlled({viewport={width:1024,height:600},reducedMotion='no-preference',failAsset,failApp=false}={}){
  let appBroken=failApp;
  const page=await browser.newPage({viewport,reducedMotion,hasTouch:viewport.width<600}),errors=[],requests=new Set(),gates=new Map(trackedAssets.map(name=>[name,deferred()])),appGate=deferred();
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const pathname=new URL(route.request().url()).pathname;
   if(gates.has(pathname)){
    requests.add(pathname);await gates.get(pathname).promise;
    if(pathname===failAsset){await route.abort('failed');return;}
    await route.fulfill({path:path.join(root,pathname.slice(1)),contentType:pathname.endsWith('.woff2')?'font/woff2':'image/webp'});return;
   }
   if(pathname==='/app.js'){
    requests.add(pathname);await appGate.promise;
    if(appBroken){await route.abort('failed');return;}
   }
   await route.continue();
  });
  await page.goto(new URL('/game',base).href,{waitUntil:'commit'});
  await page.locator('#game-loading').waitFor();
  const release=name=>gates.get(name)?.resolve();
  const releaseAssets=()=>{for(const gate of gates.values())gate.resolve();};
  const snap=()=>page.locator('#game-loading').evaluate(el=>({progress:Number(el.dataset.progress||0),rate:Number(el.dataset.playbackRate||0),phase:el.dataset.phase,frames:[...el.querySelectorAll('.loading-runner')].map(sprite=>getComputedStyle(sprite).backgroundPosition)}));
  return {page,errors,requests,gates,release,releaseAssets,releaseApp:appGate.resolve,allowApp:()=>{appBroken=false;},snap};
 }
 try{
  const rates={};
  for(const [label,cadence] of [['slow',500],['fast',80]]){
   const test=await controlled();const {page}=test;
   assert.equal(await page.locator('#app').evaluate(el=>el.inert),true,'game controls are inert while loading');
   assert.equal(await page.locator('.loading-runner').count(),2);
   // Fonts may gate the bootstrap itself. Release them before measuring motion.
   test.release('/assets/fonts/Hakgyoansim-BoardmarkerR.woff2');
   await page.waitForFunction(()=>Number(document.querySelector('#game-loading')?.dataset.playbackRate)>0);
   await page.waitForTimeout(900);
   let previous=(await test.snap()).progress;
   const assets=trackedAssets.filter(name=>!name.endsWith('.woff2'));
   for(const asset of assets){
    test.release(asset);await page.waitForTimeout(cadence);
    const state=await test.snap();assert.ok(state.progress>=previous,'reported progress stays monotonic');assert.ok(state.progress<1,'a held app import cannot report completion');previous=state.progress;assert.ok(Math.abs(state.progress*7-Math.round(state.progress*7))<.01,'progress reflects completed preparation tasks');
   }
   const active=await test.snap();rates[label]=active.rate;
   const before=active.frames;await page.waitForFunction(previous=>JSON.stringify([...document.querySelectorAll('#game-loading .loading-runner')].map(sprite=>getComputedStyle(sprite).backgroundPosition))!==JSON.stringify(previous),before,{timeout:1500});
   await page.screenshot({path:`/tmp/loading-${label}-1024.png`});
   const stuck=(await test.snap()).progress;await page.waitForTimeout(2200);const stalled=await test.snap();
   assert.equal(stalled.progress,stuck,'time alone never invents loading progress');assert.ok(stalled.rate<active.rate,'a download stall slows the footsteps');
   test.releaseApp();await page.locator('#game-loading').waitFor({state:'detached',timeout:10000});
   assert.equal(await page.locator('#app').evaluate(el=>el.inert),false);await page.locator('.shop-cover').waitFor();assert.deepEqual(test.errors,[]);await page.close();
  }
  assert.ok(rates.fast>rates.slow+.15,`fast loading (${rates.fast}) must visibly outrun slow loading (${rates.slow})`);

  for(const reducedMotion of ['no-preference','reduce']){
   const test=await controlled({viewport:{width:390,height:844},reducedMotion}),{page}=test;
   test.releaseAssets();await page.waitForFunction(()=>Number(document.querySelector('#game-loading')?.dataset.progress)>0);
   const bounds=await page.locator('#game-loading').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};});
   assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.right<=390&&bounds.bottom<=844);assert.ok(bounds.scrollWidth<=bounds.clientWidth+1,'phone loader does not overflow horizontally');
   for(const runner of await page.locator('.loading-runner').all()){
    const box=await runner.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=390&&box.y+box.height<=844,'complete runner fits the phone');
   }
   const before=await test.snap();await page.waitForTimeout(500);const after=await test.snap();
   if(reducedMotion==='reduce')assert.deepEqual(after.frames,before.frames,'reduced motion keeps a still illustration');
   await page.screenshot({path:`/tmp/loading-phone-${reducedMotion}.png`});
   const released=Date.now();test.releaseApp();await page.locator('#game-loading').waitFor({state:'detached',timeout:10000});
   assert.ok(Date.now()-released<1600,'ready resources never wait for a decorative animation cycle');
   await page.locator('.shop-cover').waitFor();assert.deepEqual(test.errors,[]);await page.close();
  }

  const restored=await controlled();
  await restored.page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
  restored.releaseAssets();restored.releaseApp();
  await restored.page.locator('#game-loading').waitFor({state:'detached',timeout:10000});
  assert.equal(await restored.page.locator('#app').evaluate(el=>el.inert),false,'restoring an unfinished startup does not leave a permanent loader');await restored.page.close();

  const broken=await controlled({failAsset:'/assets/loading/girl-run.webp'});broken.releaseAssets();broken.releaseApp();
  await broken.page.locator('#game-loading').waitFor({state:'detached',timeout:10000});await broken.page.locator('.shop-cover').waitFor();assert.deepEqual(broken.errors,[]);await broken.page.close();
  const failed=await controlled({failApp:true});failed.releaseAssets();failed.releaseApp();
  await failed.page.waitForFunction(()=>document.querySelector('#game-loading')?.dataset.phase==='error');
  const retry=failed.page.locator('#game-loading button');assert.ok(await retry.isVisible(),'an app-load failure offers retry rather than an endless spinner');assert.match(await retry.innerText(),/다시|재시도/);await failed.page.screenshot({path:'/tmp/loading-error.png'});failed.allowApp();await retry.click();await failed.page.locator('.shop-cover').waitFor();await failed.page.locator('#game-loading').waitFor({state:'detached',timeout:10000});assert.equal(await failed.page.locator('#app').evaluate(el=>el.inert),false,'retry recovers the game after a transient module failure');await failed.page.close();
  console.log(`Loading: measured fast/slow footsteps (${rates.fast.toFixed(2)} / ${rates.slow.toFixed(2)}), stable progress, sprite frames, immediate readiness, phone fit, reduced motion and failure recovery passed.`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
