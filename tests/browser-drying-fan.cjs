/* Real workbench regression: dry where the visible fan blade moves, including
   short slow finger strokes on a low pillow. Uses actual mouse/CDP touch input. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {enterGame}=require('./game-entry.cjs');
const base=process.env.BASE_URL||'http://127.0.0.1:4173',key='celadon-tycoon-v2';
const draft=(shape,modelId)=>({id:'drying-fan-regression',orderId:'royal-rest',customerId:'king',accepted:true,shape,modelId,step:2,stationView:'game',knead:3,width:1,viewFrame:0,technique:'inlay',pattern:'lotus',placements:[{uv:[.5,.5],surfaceAngle:0,surfaceV:.5,surfaceRadius:.25,pattern:'lotus',stampSize:.8}],strokes:[],decorPhase:2,decorDone:true,inlay:{slip:'white',fillDone:true,wipeDone:true,fill:[],wipe:[]},firing:[],clay:{body:true,slip:'white',kneads:6,prepared:true}});
async function input(page,touch){
 if(!touch)return {down:async p=>{await page.mouse.move(p.x,p.y);await page.mouse.down();},move:p=>page.mouse.move(p.x,p.y),up:()=>page.mouse.up(),cancel:()=>page.dispatchEvent('.kiln-inplace-canvas','pointercancel',{pointerId:1})};
 const cdp=await page.context().newCDPSession(page);
 const send=(type,p)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:p?[{id:1,x:p.x,y:p.y,radiusX:7,radiusY:7,force:1}]:[]});
 return {down:p=>send('touchStart',p),move:p=>send('touchMove',p),up:()=>send('touchEnd'),cancel:()=>send('touchCancel')};
}
(async()=>{
 assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use a local server.');
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const scenario of [
   {width:390,height:844,touch:true,shape:'pillow',model:'pillow'},
   {width:1024,height:600,touch:false,shape:'maebyeong',model:'cloudCraneMaebyeong'},
   {width:390,height:844,touch:true,shape:'maebyeong',model:'cloudCraneMaebyeong'},
  ]){
   const page=await browser.newPage({viewport:{width:scenario.width,height:scenario.height},isMobile:scenario.touch,hasTouch:scenario.touch,deviceScaleFactor:1,reducedMotion:'reduce'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`${base}/game`);const work=draft(scenario.shape,scenario.model);
   await page.evaluate(({key,work})=>localStorage.setItem(key,JSON.stringify({history:['royal-rest'],gallery:[],draft:work})),{key,work});await page.reload();await enterGame(page);
   await page.locator('.illustration-viewport[data-status=ready]').waitFor();
   const original=page.locator('.illustration-viewport>canvas').first(),before=await original.evaluate(c=>c.toDataURL());
   await page.locator('[data-fire=dry]').click();const canvas=page.locator('.kiln-inplace-canvas');await canvas.waitFor();
   await page.waitForFunction(()=>document.querySelector('.kiln-inplace-canvas')?.dataset.toolBounds);
   const gesture=await input(page,scenario.touch),zones=()=>canvas.getAttribute('data-zone-progress').then(JSON.parse);
   await canvas.scrollIntoViewIfNeeded();
   const initialTool=JSON.parse(await canvas.getAttribute('data-tool-bounds')),initialBox=await canvas.boundingBox();
   await gesture.down({x:initialBox.x+initialTool.x+initialTool.width*.5,y:initialBox.y+initialTool.y+initialTool.height*.42});
   const grabbed=JSON.parse(await canvas.getAttribute('data-tool-bounds'));
   for(const axis of ['x','y'])assert.ok(Math.abs(grabbed[axis]-initialTool[axis])<1,'grabbing the visible blade must not make the fan jump');
   await gesture.up();
   const feedback=await page.locator('.dry-zone-progress').boundingBox(),surface=JSON.parse(await canvas.getAttribute('data-surface-bounds'));
   assert.ok(feedback.y+feedback.height<=initialBox.y+surface.y*initialBox.height+1||feedback.y>=initialBox.y+(surface.y+surface.height)*initialBox.height-1,'drying progress stays clear of the vessel');
   const rack=await page.locator('.station-rack').boundingBox();assert.ok(feedback.y>=rack.y+rack.height-1,'the tool tray does not cover progress');
   // Park the idle fan on empty workbench at the left edge, level with the middle.
   // The canvas's top corners are not empty in landscape: the pause and cancel
   // buttons sit there, so a tap in a corner toggles pause instead of moving the fan.
   async function setAside(){
    await canvas.scrollIntoViewIfNeeded();const r=await canvas.boundingBox(),spot={x:r.x+12,y:r.y+r.height/2};
    assert.equal(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.classList.contains('kiln-inplace-canvas'),spot),true,'the fan is set aside on the workbench itself, not on a control');
    await gesture.down(spot);await gesture.up();
   }

   async function atZone(zone,offset=0){
    await canvas.scrollIntoViewIfNeeded();const r=await canvas.boundingBox(),b=JSON.parse(await canvas.getAttribute('data-surface-bounds')),tool=JSON.parse(await canvas.getAttribute('data-tool-bounds'));
    // The artwork's fan blade is above its handle. Aim the visible blade over
    // the vessel, leaving the finger below it instead of hiding the pottery.
    return {x:r.x+(b.x+b.width*.5)*r.width+offset,y:r.y+(b.y+b.height*(zone+.5)/3)*r.height+tool.height*.55};
   }
   async function swipe(zone,width=60,steps=20){
    await setAside();const a=await atZone(zone,-width/2);await gesture.down(a);
    for(let n=1;n<=steps;n++)await gesture.move({x:a.x+width*n/steps,y:a.y});
    await gesture.up();await page.evaluate(()=>new Promise(requestAnimationFrame));
   }
   await setAside();const p=await atZone(2);await gesture.down(p);await page.waitForTimeout(120);assert.deepEqual(await zones(),[0,0,0],'holding the fan still does not dry automatically');await gesture.up();
   await swipe(2,18,72);const slow=await zones();
   console.log(`${scenario.shape} ${scenario.width}: slow visible-blade stroke`,slow);
   await page.screenshot({path:`/tmp/drying-fan-${scenario.shape}-${scenario.width}-slow.png`});
   assert.ok(slow[2]>.005,'small slow strokes with the blade over the bottom of the pot must count');
   assert.ok(slow.some(value=>value<.9),'one short swipe cannot finish the whole pot');
   assert.equal(await original.evaluate(c=>c.toDataURL()),before,'drying preserves the student’s base picture and motifs');
   const away=await canvas.boundingBox(),unchanged=await zones();await gesture.down({x:away.x+12,y:away.y+20});await gesture.move({x:away.x+28,y:away.y+20});await gesture.up();
   assert.deepEqual(await zones(),unchanged,'fanning away from the pottery does not dry it');
   await page.locator('[data-mini=pause]').click();const paused=await zones();await swipe(1);assert.deepEqual(await zones(),paused,'paused drying ignores movement');await page.locator('[data-mini=pause]').click();
   if(scenario.touch){
    await page.setViewportSize({width:844,height:390});await page.evaluate(()=>new Promise(requestAnimationFrame));
    assert.deepEqual(await zones(),paused,'turning the phone retains all three drying amounts');
    await canvas.scrollIntoViewIfNeeded();
    const controls=page.locator('.dry-tool-controls button');
    for(const button of await controls.all()){const r=await button.boundingBox();assert.ok(r.y>=0&&r.y+r.height<=390,'landscape drying controls remain visible beside the work');}
    await page.locator('[data-dry-control=pause]').tap();assert.equal(await page.locator('.kiln-gesture-dock').evaluate(el=>el.classList.contains('paused')),true);
    await page.locator('[data-dry-control=pause]').tap();
   }
   for(let pass=0;pass<12&&await canvas.count();pass++){
    for(const zone of [2,1,0]){
     if(!await canvas.count()||await page.locator('.mini-won').count())break;
     if((await zones())[zone]>=1)continue;
     await swipe(zone,70,20);
    }
    if(await page.locator('.mini-won').count())break;
   }
   await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).draft.firing.includes('dry'),key,{timeout:5000});
   assert.equal(await canvas.count(),0);assert.equal(await page.locator('.dry-zone-progress').count(),0,'finishing removes the drying readout');
   const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).draft,key);assert.deepEqual(saved.placements,work.placements);assert.deepEqual(saved.firing,['dry']);
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Visible fan contact, slow finger/mouse strokes, three drying zones, outside/idle/pause guards, phone rotation, authored work and completion passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
