/* Native phone layout: scrollable workbenches, full-size art and reachable touch controls. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const {enterGame}=require('./game-entry.cjs');
const base=process.env.BASE_URL||'http://127.0.0.1:4173',key='celadon-tycoon-v2';
const draft=extra=>({id:'phone-layout',orderId:'royal-rest',customerId:'king',accepted:true,clay:{body:true,slip:'white',kneads:6,prepared:true},shape:'stool',modelId:'stool',width:1,knead:3,step:1,stationView:'game',technique:'inlay',pattern:'lotus',placements:[{uv:[.5,.43],surfaceAngle:0,surfaceV:.4,surfaceRadius:.25,pattern:'lotus',stampSize:1.1}],strokes:[],decorPhase:0,decorDone:false,firing:[],viewFrame:0,...extra});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const viewport of [{width:360,height:844},{width:390,height:844},{width:430,height:844},{width:844,height:390}].filter(v=>!process.env.MOBILE_WIDTH||v.width===Number(process.env.MOBILE_WIDTH))){
   const page=await browser.newPage({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:1,reducedMotion:'reduce'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   if(process.env.LIVE_CSS)await page.route('**/mobile-game.css',async route=>route.fulfill({contentType:'text/css',body:await fs.readFile(path.join(__dirname,'../mobile-game.css'),'utf8')}));
   async function noOverflow(label){
    const state=await page.evaluate(()=>({width:innerWidth,visual:visualViewport.width,scroll:document.documentElement.scrollWidth}));
    assert.ok(state.scroll<=viewport.width+1,`${label}: horizontal document overflow ${JSON.stringify(state)}`);assert.ok(Math.abs(state.visual-viewport.width)<1,`${label}: viewport is not scaled desktop`);
   }
   async function controls(selector){
    for(const el of await page.locator(selector).all()){
     if(!await el.isVisible())continue;await el.scrollIntoViewIfNeeded();
     const info=await el.evaluate(e=>{const r=e.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{label:e.getAttribute('aria-label')||e.textContent.trim(),height:r.height,left:r.left,right:r.right,hit:h===e||e.contains(h),disabled:e.disabled,cssHeight:getComputedStyle(e).height,minHeight:getComputedStyle(e).minHeight,query:matchMedia('(max-width:600px), (max-width:1023px) and (pointer:coarse)').matches,innerWidth,visual:visualViewport.width,parent:e.parentElement.className};});
     if(info.height<43.9){console.log(info);await page.screenshot({path:'/tmp/mobile-game-small-target.png'});}
     assert.ok(info.height>=43.9,`${info.label}: small tap target ${info.height}`);assert.ok(info.left>=-1&&info.right<=viewport.width+1,`${info.label}: outside phone width`);if(!info.disabled)assert.ok(info.hit,`${info.label}: covered control`);
    }
   }
   // fullPage screenshots disable Chromium's coarse-pointer emulation; preserve the real phone viewport.
   async function snapshot(name){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`/tmp/mobile-game-${viewport.width}-${name}.png`});const bench=page.locator('.station-workspace,.kneading-area');if(await bench.count()&&await bench.first().isVisible()){await bench.first().scrollIntoViewIfNeeded();await page.screenshot({path:`/tmp/mobile-game-${viewport.width}-${name}-workbench.png`});}assert.equal(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches),true,'screenshots must preserve phone input emulation');}
   async function mount(extra){
    await page.goto(`${base}/game`);await page.evaluate(({key,work})=>localStorage.setItem(key,JSON.stringify({history:['royal-rest'],gallery:[],draft:work})),{key,work:draft(extra)});await page.reload();await enterGame(page);await page.evaluate(()=>document.fonts.ready);if(await page.locator('.illustration-viewport').count())await page.waitForSelector('.illustration-viewport[data-status=ready]');await page.evaluate(()=>scrollTo(0,0));
   }
   await page.goto(`${base}/game`);await noOverflow('cover');await controls('.cover-actions button,.hud-tools button');await snapshot('cover');
   await page.locator('[data-action=new-order]').tap();await noOverflow('tutorial');await controls('.tutorial-arrow,.tutorial-popup .close');await snapshot('tutorial');await page.locator('.tutorial-popup .close').tap();
   await mount({stationView:'counter',accepted:false});await noOverflow('customer');await controls('.counter-responses button,.counter-order');await snapshot('customer');
   await mount({stationView:'clay',clay:{body:true,slip:'white',kneads:0,prepared:false}});await noOverflow('clay');await controls('.station-heading button,.station-nav button');await snapshot('clay');
   await page.locator('.knead-pad').tap();assert.equal(await page.locator('.knead-pad').getAttribute('data-kneads'),'1','phone touch kneads real clay');
   await mount({step:0,knead:0,placements:[]});await noOverflow('shaping');await controls('.station-heading button,.shape-family button,.sculpt-touch-controls button,.station-nav button');assert.equal(await page.locator('.sculpt-touch-controls button').evaluateAll(buttons=>buttons.every(b=>b.scrollHeight<=b.clientHeight+1&&b.scrollWidth<=b.clientWidth+1)),true,'touch-grip labels fit their buttons');
   const sculpt=await page.locator('.sculpt-canvas').boundingBox();assert.ok(sculpt.width>=Math.min(viewport.width-56,700)&&sculpt.height>=260,'phone sculpture has a usable touch canvas');await snapshot('shaping');
   await page.locator('[data-shape=incense]').tap();await page.waitForSelector('.variant-shelf');await noOverflow('variants');await controls('.variant-card');await snapshot('variants');
   await mount({});await noOverflow('decoration');await controls('.hand-tools button,.help-dot,.technique-option>.small-button,.station-nav button');
   const canvas=page.locator('.illustration-viewport>canvas').first(),canvasBox=await canvas.boundingBox();assert.ok(canvasBox.width>=Math.min(viewport.width-56,700)&&canvasBox.height>=300,'pottery canvas uses native phone width');
   const last=page.locator('.pattern-bin').last();await last.tap();assert.equal(await last.getAttribute('class').then(c=>c.includes('selected')),true,'horizontal tray remains selectable');await noOverflow('scrolled pattern tray');await snapshot('decoration');
   await mount({inlayMode:'fill',inlay:{slip:'white',fillDone:false,wipeDone:false,fill:[],wipe:[]}});await noOverflow('inlay');await controls('.inlay-choice,.station-nav button');await snapshot('inlay');
   await mount({step:2,decorPhase:2,decorDone:true});await noOverflow('kiln');await controls('.firing-bin,.station-nav button');
   const potBefore=await page.locator('.illustration-viewport').boundingBox();await page.locator('[data-fire=dry]').tap();await page.locator('.kiln-inplace-canvas').waitFor();await noOverflow('inline drying');
   const potAfter=await page.locator('.illustration-viewport').boundingBox();assert.equal(potAfter.width,potBefore.width);assert.equal(potAfter.height,potBefore.height);await controls('.kiln-gesture-dock button');await snapshot('drying');await page.locator('[data-mini=cancel]').tap();
   await mount({step:2,decorPhase:2,decorDone:true,firing:['dry']});await page.locator('[data-fire=biscuit]').tap();await page.waitForFunction(()=>[...document.querySelectorAll('.kiln-fanning-scene img')].every(i=>i.complete&&i.naturalWidth));await noOverflow('firing');assert.equal((await page.locator('.kiln-minigame .mini-instruction').innerText()).includes('스페이스바'),false,'phone firing gives touch-button guidance');await controls('.bellows-button,.mini-controls button');await snapshot('firing');await page.locator('[data-mini=cancel]').tap();
   await mount({step:3,stationView:'counter-delivery',decorPhase:2,decorDone:true,firing:['dry','biscuit','glaze','fire']});await noOverflow('delivery');await controls('.counter-responses button');await snapshot('delivery');
   await mount({step:3,stationView:'reaction',decorPhase:2,decorDone:true,firing:['dry','biscuit','glaze','fire'],title:'연꽃 의자',explanationUse:'연꽃무늬 의자로 앉아서 쉬어요.',explanationBeauty:'연꽃을 새기고 흰 흙으로 상감했어요.'});await noOverflow('reaction');await snapshot('reaction');await controls('.review-actions button,.review-score button');await snapshot('reaction');
   assert.deepEqual(errors,[]);console.log(`Game mobile ${viewport.width}×${viewport.height}: native viewport, flow, trays, artwork and touch controls passed`);await page.close();
  }
  const desktop=await browser.newPage({viewport:{width:1024,height:600}});await desktop.goto(`${base}/game`);assert.equal(await desktop.evaluate(()=>matchMedia('(max-width:600px), (max-width:1023px) and (pointer:coarse)').matches),false,'Chromebook retains desktop rules');await desktop.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
