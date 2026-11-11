/* Actual mouse/touch shaping: broad clay movement, local polishing and reversible gestures. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {enterGame}=require('./game-entry.cjs');
const base=process.env.BASE_URL||'http://127.0.0.1:4173',KEY='celadon-tycoon-v2';
const draft=(modelId='pomegranatePitcher',shape='pitcher')=>({id:'shaping-controls',orderId:'royal-rest',shape,modelId,step:0,knead:0,width:1,technique:'inlay',pattern:'cloud',placements:[],strokes:[],decorPhase:0,decorDone:false,firing:[],accepted:true,clay:{body:true,slip:'white',kneads:6,prepared:true},stationView:'game'});
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).draft,KEY);
const state=page=>page.locator('.sculpt-canvas').evaluate(el=>({points:JSON.parse(el.dataset.current),guide:JSON.parse(el.dataset.guide),locked:JSON.parse(el.dataset.locked),selected:+el.dataset.selected,fraction:+el.dataset.coverage,range:el.dataset.gripRange}));
const near=(a,b,message,tolerance=1e-8)=>{const delta=a.flatMap((p,i)=>p.map((v,j)=>({i,j,delta:Math.abs(v-b[i][j]),actual:v,expected:b[i][j]}))).sort((x,y)=>y.delta-x.delta);assert.ok(delta.every(d=>d.delta<(typeof tolerance==='function'?tolerance(d.i):tolerance)),`${message}: ${JSON.stringify(delta.slice(0,4))}`);};
async function enter(page,work=draft()){
 await page.goto(new URL('/game',base).href);
 await page.evaluate(({key,work})=>localStorage.setItem(key,JSON.stringify({history:['royal-rest'],gallery:[],draft:work,sound:false,retentionStartedAt:Date.now()})),{key:KEY,work});
 await page.reload();await page.locator('#game-loading').waitFor({state:'detached'});await enterGame(page);
 await page.waitForFunction(()=>JSON.parse(document.querySelector('.sculpt-canvas')?.dataset.current||'[]').length===40);
 await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(100);
}
async function input(page,mobile){
 const cdp=mobile?await page.context().newCDPSession(page):null;
 const send=(type,points=[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(p=>({...p,id:1,radiusX:7,radiusY:7,force:1}))});
 return async(from,to)=>{
  const canvas=page.locator('.sculpt-canvas');await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox(),scroll=await page.evaluate(()=>scrollY);
  const a={x:box.x+from[0]*box.width,y:box.y+from[1]*box.height},b={x:box.x+to[0]*box.width,y:box.y+to[1]*box.height};
  if(mobile){await send('touchStart',[a]);for(let i=1;i<=8;i++)await send('touchMove',[{x:a.x+(b.x-a.x)*i/8,y:a.y+(b.y-a.y)*i/8}]);await send('touchEnd');}
  else{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();}
  assert.equal(await page.evaluate(()=>scrollY),scroll,'moving clay does not scroll the page');
  return box;
 };
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const mobile of process.env.SHAPING_ASSIST_ONLY?[false]:[false,true]){
  const viewport=mobile?{width:390,height:844}:{width:1024,height:600};
  const page=await browser.newPage({viewport,isMobile:mobile,hasTouch:mobile}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const drag=await input(page,mobile);await enter(page);
  const initial=await state(page);assert.equal(initial.range,'wide','broad clay movement is the initial setting');
  const initialSaved=(await saved(page)).sculpt.points;
  if(!mobile){
   const box=await page.locator('.sculpt-canvas').boundingBox(),point=initial.points[10];
   await page.mouse.click(box.x+point[0]*box.width,box.y+point[1]*box.height);
   const chosen=await state(page),i=chosen.selected;
   await page.mouse.move(box.x+chosen.points[20][0]*box.width,box.y+chosen.points[20][1]*box.height,{steps:5});
   assert.equal((await state(page)).selected,i,'moving across other clay toward the tool keeps the chosen grip');
   const distance=s=>Math.hypot((s.points[i][0]-s.guide[i][0])*box.width,(s.points[i][1]-s.guide[i][1])*box.height);
   await page.locator('[data-sculpt-assist=toward]').click();
   assert.ok(distance(await state(page))<distance(chosen),'visible desktop assistance moves the selected clay toward its outline');
   await page.locator('[data-sculpt-history=undo]').click();near((await state(page)).points,chosen.points,'assistance can be undone as one action');
   await page.locator('[data-sculpt-history=redo]').click();const edited=(await saved(page)).sculpt,editedLocal=edited.points;
   await page.setViewportSize({width:1124,height:600});await page.waitForTimeout(150);
   await page.locator('[data-sculpt-history=undo]').click();near((await saved(page)).sculpt.points,initialSaved,'undo after resize restores the original vessel coordinates',i=>initial.locked[i]?1e-4:1e-8);
   await page.locator('[data-sculpt-history=redo]').click();near((await saved(page)).sculpt.points,editedLocal,'redo after resize restores the edited vessel coordinates',i=>edited.locked[i]?1e-4:1e-8);
   await page.locator('[data-sculpt-history=undo]').click();await page.setViewportSize(viewport);await page.waitForTimeout(150);
   const toolFit=await page.locator('.sculpt-shaping-tools').evaluate(el=>{const r=el.getBoundingClientRect(),scene=el.closest('.station-scene').getBoundingClientRect(),nav=el.closest('.station-scene').querySelector('.station-nav').getBoundingClientRect();return{fits:r.top>=scene.top&&r.left>=scene.left&&r.right<=scene.right+1&&r.bottom<=nav.top+1&&el.scrollWidth<=el.clientWidth+1,tool:r.toJSON(),scene:scene.toJSON(),nav:nav.toJSON(),scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};});
   await page.screenshot({path:'/tmp/shaping-final-assist-1024.png'});
   assert.ok(toolFit.fits,`desktop shaping tools fit above navigation without clipping: ${JSON.stringify(toolFit)}`);
   if(process.env.SHAPING_ASSIST_ONLY){await page.screenshot({path:'/tmp/shaping-final-assist-1024.png'});assert.deepEqual(errors,[]);await page.close();console.log('Desktop shaping assistance: stable grip selection, actual movement, undo and short-screen fit passed');continue;}
  }
  const spread={};
  for(const range of ['wide','part','fine']){
   await page.locator(`[data-sculpt-range=${range}]`).click();
   const before=await state(page),canvas=page.locator('.sculpt-canvas');await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();
   // Grabbing inside the mound, rather than an exact hidden vertex, must move a meaningful area.
   const free=before.locked.findIndex(locked=>!locked),grip=before.points[free],centre=[grip[0],grip[1]+2/box.height];
   const dy=grip[1]>=before.guide[free][1]?48:-48;
   await drag(centre,[centre[0]+42/box.width,centre[1]+dy/box.height]);
   const after=await state(page),i=after.selected;
   assert.ok(Math.abs((after.points[i][0]-before.points[i][0])*box.width-42)<1.5,'selected clay follows the horizontal pointer');
   assert.ok(Math.abs((after.points[i][1]-before.points[i][1])*box.height-dy)<1.5,'selected clay follows the vertical pointer');
   const moved=after.points.map((p,i)=>Math.hypot((p[0]-before.points[i][0])*box.width,(p[1]-before.points[i][1])*box.height));
   spread[range]=moved.filter(d=>d>8).length;
   assert.ok(after.fraction<.9,'one broad pull cannot pass an incomplete vessel');
   await page.locator('[data-sculpt-history=undo]').click();near((await state(page)).points,before.points,'one undo reverses the entire drag');
   assert.equal(await page.locator('[data-sculpt-history=undo]').isDisabled(),true,'a drag creates one history entry, not one per event');
   await page.locator('[data-sculpt-history=redo]').click();near((await state(page)).points,after.points,'redo restores the exact edited clay');
   await page.locator('[data-sculpt-history=undo]').click();
  }
  assert.ok(spread.wide>spread.part&&spread.part>spread.fine,`ranges materially change affected clay: ${JSON.stringify(spread)}`);
  assert.ok(spread.wide>=13,'a normal broad pull moves at least a third of the 40-point mound');
  near((await saved(page)).sculpt.points,initialSaved,'range changes and undo preserve saved normalized geometry');
  // Top, left and right regions can be moved in either direction, even away from the guide.
  await page.locator('[data-sculpt-range=fine]').click();
  for(const choose of [p=>p.reduce((best,q,i)=>q[1]<p[best][1]?i:best,0),p=>p.reduce((best,q,i)=>q[0]<p[best][0]?i:best,0),p=>p.reduce((best,q,i)=>q[0]>p[best][0]?i:best,0)]){
   const before=await state(page),i=choose(before.points),canvas=page.locator('.sculpt-canvas');await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();
   await drag(before.points[i],[before.points[i][0]+24/box.width,before.points[i][1]+18/box.height]);const after=await state(page);
   assert.ok(Math.abs((after.points[i][0]-before.points[i][0])*box.width-24)<1.5&&Math.abs((after.points[i][1]-before.points[i][1])*box.height-18)<1.5,'each chosen body region follows the hand freely');
   const opposite=(i+20)%40;assert.ok(Math.hypot((after.points[opposite][0]-before.points[opposite][0])*box.width,(after.points[opposite][1]-before.points[opposite][1])*box.height)<1,'fine edits leave the opposite body region alone');
  }
  if(!mobile){await page.locator('.sculpt-canvas').focus();const before=await state(page);await page.keyboard.press('Control+z');assert.notDeepEqual((await state(page)).points,before.points);await page.keyboard.press('Control+Shift+z');near((await state(page)).points,before.points,'keyboard redo restores the drag');}
  await page.screenshot({path:`/tmp/shaping-controls-${mobile?'phone':'desktop'}.png`,fullPage:mobile});
  // Build a vessel by first moving broad regions, then polishing its contour.
  for(const [model,shape]of mobile?[['pomegranatePitcher','pitcher']]:[['pomegranatePitcher','pitcher'],['pillow','pillow'],['stool','stool']]){
   await enter(page,draft(model,shape));let count=0;
   for(let i=0;i<40;i+=5){const s=await state(page);if(s.fraction>=.9)break;await drag(s.points[i],s.guide[i]);count++;}
   if((await state(page)).fraction<.9)await page.locator('[data-sculpt-range=fine]').click();
   let prior;
   for(let pass=0;pass<3&&(await state(page)).fraction<.9;pass++)for(let i=0;i<40;i++){
    const s=await state(page);if(s.fraction>=.9)break;prior=s;await drag(s.points[i],s.guide[i]);count++;
   }
   assert.ok((await saved(page)).sculpt.fraction>=.9,`${model}: normal broad-then-fine shaping can meet the unchanged 90% match`);
   assert.equal(await page.locator('[data-action=next-shape]').isEnabled(),true);
   await page.screenshot({path:`/tmp/shaping-complete-${model}-${mobile?'phone':'desktop'}.png`,fullPage:mobile});
   if(prior){await page.locator('[data-sculpt-history=undo]').click();near((await state(page)).points,prior.points,'undo remains available after completing a vessel');assert.equal(await page.locator('[data-action=next-shape]').isDisabled(),true,'undo completion requires matching the shape again');await page.locator('[data-sculpt-history=redo]').click();assert.equal(await page.locator('[data-action=next-shape]').isEnabled(),true);}
   console.log(`${mobile?'Touch':'Mouse'} ${model}: broad/fine completion in ${count} drags; strict score ${(await saved(page)).sculpt.fraction.toFixed(3)}`);
  }
  assert.deepEqual(errors,[]);await page.close();
  console.log(`Shaping ${viewport.width}: broad/part/fine ${JSON.stringify(spread)}, hand tracking, local editing, undo/redo and completion passed`);
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
