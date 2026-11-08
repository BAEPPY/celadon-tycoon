const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {enterGame}=require('./game-entry.cjs');
const base=process.env.BASE_URL||'http://127.0.0.1:4173',key='celadon-tycoon-v2';
const draft=firing=>({id:'inplace-kiln-test',orderId:'royal-rest',customerId:'king',accepted:true,clay:{body:true,slip:'white',kneads:6,prepared:true},shape:'stool',modelId:'stool',width:1.1,knead:3,step:2,stationView:'game',technique:'inlay',pattern:'lotus',placements:[{uv:[.5,.43],surfaceAngle:0,surfaceV:.4,surfaceRadius:.25,pattern:'lotus',stampSize:1.4},{uv:[.6,.65],surfaceAngle:.35,surfaceV:.62,surfaceRadius:.25,pattern:'bamboo',stampSize:.7}],strokes:[],decorPhase:2,decorDone:true,inlay:{slip:'white',fillDone:true,wipeDone:true,fill:[],wipe:[]},firing,viewFrame:0});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:600},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const original=()=>page.locator('.illustration-viewport>canvas:not(.kiln-inplace-canvas)');
  const overlay=()=>page.locator('.kiln-inplace-canvas');
  async function mount(firing){
   await page.goto(`${base}/game`);await page.evaluate(({key,work})=>localStorage.setItem(key,JSON.stringify({history:['royal-rest'],gallery:[],draft:work})),{key,work:draft(firing)});
   await page.reload();await enterGame(page);await page.waitForSelector('.illustration-viewport[data-status=ready]');await page.evaluate(()=>document.fonts.ready);
   await page.waitForTimeout(100);
  }
  const progress=()=>page.locator('.kiln-gesture-dock').getAttribute('data-progress').then(Number);
  async function sweep(y,x1,x2){const r=await overlay().boundingBox();await page.mouse.move(r.x+r.width*x1,r.y+r.height*y);await page.mouse.down();await page.mouse.move(r.x+r.width*x2,r.y+r.height*y,{steps:12});await page.mouse.up();}
  async function aligned(){const a=await original().boundingBox(),b=await overlay().boundingBox();for(const k of ['x','y','width','height'])assert.ok(Math.abs(a[k]-b[k])<1,`overlay ${k} remains on original workbench`);}
  async function reachable(){const controls=await page.locator('.kiln-gesture-dock button').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&(b===hit||b.contains(hit));}));if(!controls.every(Boolean)){await page.screenshot({path:'/tmp/kiln-inline-controls-fail.png'});console.log(await page.locator('.kiln-gesture-dock button').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {text:b.textContent,rect:r.toJSON(),hit:hit?.outerHTML.slice(0,220)};})));}assert.ok(controls.every(Boolean),'inplace controls remain reachable');}
  for(const kind of ['dry','glaze']){
   await page.setViewportSize({width:1024,height:600});await mount(kind==='dry'?[]:['dry','biscuit']);
   const before=await original().evaluate(c=>c.toDataURL()),box=await original().boundingBox();
   await page.click(`[data-fire=${kind}]`);await overlay().waitFor();await aligned();await reachable();
   assert.deepEqual(await original().boundingBox(),box,'starting a tool never moves or enlarges the pottery');
   assert.equal(await page.locator('.gesture-stage').count(),0,'the app does not open a separate gesture stage');
   assert.equal(await overlay().getAttribute('data-work-surface'),'authored');
   assert.equal(await original().evaluate(c=>c.toDataURL()),before,'starting tools preserves authored surface');
   let bounds=JSON.parse(await overlay().getAttribute('data-surface-bounds'));
   for(let i=0;i<3&&await progress()===0;i++)await sweep(bounds.y+bounds.height*.25,bounds.x-.04,bounds.x+bounds.width+.04);
   assert.ok(await progress()>0&&await progress()<.9,'pointer work advances only part of the task');
   assert.equal(await original().evaluate(c=>c.toDataURL()),before,'partial work leaves the base canvas and student motifs unchanged');
   await page.screenshot({path:`/tmp/kiln-inline-${kind}-1024.png`});
   await page.click('[data-mini=pause]');const paused=await progress();await sweep(bounds.y+bounds.height*.5,bounds.x,bounds.x+bounds.width);assert.equal(await progress(),paused);
   await page.locator('[data-mini=pause]').focus();await page.keyboard.press('Space');assert.equal(await page.locator('.kiln-gesture-dock.paused').count(),0,'keyboard can resume the tool');
   await page.setViewportSize({width:1366,height:768});await page.waitForTimeout(150);await aligned();await reachable();assert.equal(await progress(),paused,'resize preserves progress');
   bounds=JSON.parse(await overlay().getAttribute('data-surface-bounds'));
   for(let pass=0;pass<8&&await overlay().count();pass++){
    for(const fraction of kind==='dry'?[1/6,.5,5/6]:[.03,.18,.34,.5,.66,.82,.97]){
     if(!await overlay().count()||await page.locator('.mini-won').count())break;
     await sweep(bounds.y+bounds.height*fraction,bounds.x-.03,bounds.x+bounds.width+.03);
    }
    if(await page.locator('.mini-won').count())break;
   }
   await page.waitForFunction(({key,kind})=>JSON.parse(localStorage.getItem(key)).draft.firing.includes(kind),{key,kind});
   assert.equal(await overlay().count(),0);assert.equal(await page.locator('.illustration-viewport').evaluate(el=>el.inert),true,'finishing restores display-only pottery');
   const work=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).draft,key);
   assert.deepEqual(work.placements,draft([]).placements);assert.equal(work.width,1.1);
  }
  await page.setViewportSize({width:1024,height:600});await page.click('[data-fire=fire]');
  await page.waitForFunction(()=>{const images=[...document.querySelectorAll('.kiln-fanning-scene img')];return images.length===21&&images.every(image=>image.complete&&image.naturalWidth>0);});
  const fits=await page.locator('.kiln-minigame .minigame-card').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.left>=0&&r.bottom<=innerHeight&&r.right<=innerWidth&&el.scrollHeight<=el.clientHeight+1;});
  assert.equal(fits,true,'20-frame kiln and heat controls fit the real game fonts on a Chromebook');
  await page.keyboard.press('Space');await page.screenshot({path:'/tmp/kiln-real-firing-1024.png'});await page.click('[data-mini=cancel]');
  assert.deepEqual(errors,[]);console.log('Actual workbench: in-place drying/glazing, exact artwork and placement, partial coverage, keyboard pause, live resize, completion and 20-frame firing layout passed.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
