/* Matched green grips stay fixed through subsequent mouse/touch shaping and saved sessions. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {enterGame}=require('./game-entry.cjs');
const base=process.env.BASE_URL||'http://127.0.0.1:4173',KEY='celadon-tycoon-v2';
const draft=()=>({id:'green-grip-locks',orderId:'royal-rest',customerId:'king',shape:'pitcher',modelId:'pomegranatePitcher',step:0,knead:0,width:1,technique:'inlay',pattern:'cloud',placements:[],strokes:[],decorPhase:0,decorDone:false,firing:[],accepted:true,clay:{body:true,slip:'white',kneads:6,prepared:true},stationView:'game'});
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).draft,KEY);
const state=page=>page.locator('.sculpt-canvas').evaluate(el=>({points:JSON.parse(el.dataset.current),guide:JSON.parse(el.dataset.guide),locked:JSON.parse(el.dataset.locked),selected:+el.dataset.selected,fraction:+el.dataset.coverage}));
const near=(a,b,message,tolerance=1e-8)=>{const delta=a.flatMap((p,i)=>p.map((v,j)=>({i,j,delta:Math.abs(v-b[i][j]),actual:v,expected:b[i][j]}))).sort((x,y)=>y.delta-x.delta);assert.ok(delta.every(d=>d.delta<(typeof tolerance==='function'?tolerance(d.i):tolerance)),`${message}: ${JSON.stringify(delta.slice(0,4))}`);};
async function ready(page){await page.locator('#game-loading').waitFor({state:'detached'});await enterGame(page,'start');await page.waitForFunction(()=>JSON.parse(document.querySelector('.sculpt-canvas')?.dataset.locked||'[]').length===40);await page.evaluate(()=>document.fonts.ready);}
async function seed(page){await page.goto(`${base}/game`);await page.evaluate(({key,work})=>localStorage.setItem(key,JSON.stringify({history:['royal-rest'],gallery:[],draft:work,retentionStartedAt:Date.now()})),{key:KEY,work:draft()});await page.reload();await ready(page);}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const mobile of [false,true]){
  const viewport=mobile?{width:390,height:844}:{width:1024,height:600};
  const page=await browser.newPage({viewport,isMobile:mobile,hasTouch:mobile}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const cdp=mobile?await page.context().newCDPSession(page):null;
  const touch=(type,points=[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(p=>({...p,id:1,radiusX:7,radiusY:7,force:1}))});
  async function drag(from,to,through){
   const canvas=page.locator('.sculpt-canvas');await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox(),y=await page.evaluate(()=>scrollY);
   const pixel=p=>({x:box.x+p[0]*box.width,y:box.y+p[1]*box.height}),route=[from,...(through?[through]:[]),to].map(pixel);
   if(mobile){await touch('touchStart',[route[0]]);for(let k=1;k<route.length;k++)for(let i=1;i<=12;i++)await touch('touchMove',[{x:route[k-1].x+(route[k].x-route[k-1].x)*i/12,y:route[k-1].y+(route[k].y-route[k-1].y)*i/12}]);await touch('touchEnd');}
   else{await page.mouse.move(route[0].x,route[0].y);await page.mouse.down();for(const p of route.slice(1))await page.mouse.move(p.x,p.y,{steps:12});await page.mouse.up();}
   assert.equal(await page.evaluate(()=>scrollY),y,'shaping does not scroll the page');return box;
  }
  await seed(page);await page.locator('[data-sculpt-range=fine]').click();
  const initial=await state(page);
  const top=initial.guide.reduce((best,p,i)=>p[1]<initial.guide[best][1]?i:best,0);
  assert.equal(initial.locked[top],false,'the unfinished upper grip starts movable');
  const initialBox=await page.locator('.sculpt-canvas').boundingBox();
  await drag(initial.points[top],[initial.guide[top][0]+26/initialBox.width,initial.guide[top][1]+24/initialBox.height],initial.guide[top]);
  const landed=await state(page),landedSaved=(await saved(page)).sculpt;
  assert.equal(landed.locked[top],true,'reaching the guide fixes the grip');
  assert.deepEqual(landed.points[top],landed.guide[top],'the fixed grip lands exactly on its guide');
  assert.ok(landed.fraction<.9,'locking one grip does not bypass the real shape score');
  assert.equal(landedSaved.lockVersion,1);assert.deepEqual(landedSaved.locked,landed.locked);
  // The continued movement above leaves the reached point locked within the same gesture.
  await page.locator('[data-sculpt-history=undo]').click();
  near((await state(page)).points,initial.points,'one undo restores the entire pre-lock shape');
  assert.deepEqual((await state(page)).locked,initial.locked,'undo releases only locks acquired by that gesture');
  await page.locator('[data-sculpt-history=redo]').click();
  near((await state(page)).points,landed.points,'redo restores exact placement');assert.deepEqual((await state(page)).locked,landed.locked,'redo restores fixed grips');
  // A broad neighbour pull must not move any established green point.
  await page.locator('[data-sculpt-range=wide]').click();
  const beforeNeighbour=await state(page),candidate=[...Array(40).keys()].filter(i=>!beforeNeighbour.locked[i]).sort((a,b)=>Math.min(Math.abs(a-top),40-Math.abs(a-top))-Math.min(Math.abs(b-top),40-Math.abs(b-top)))[0];
  assert.ok(Number.isInteger(candidate));
  const box=await page.locator('.sculpt-canvas').boundingBox(),from=beforeNeighbour.points[candidate],goal=beforeNeighbour.guide[candidate];
  const to=[Math.max(.04,Math.min(.96,from[0]+(from[0]>=goal[0]?36:-36)/box.width)),Math.max(.04,Math.min(.96,from[1]+(from[1]>=goal[1]?30:-30)/box.height))];
  await drag(from,to);const pulled=await state(page);
  assert.notDeepEqual(pulled.points[candidate],beforeNeighbour.points[candidate],'unmatched neighbouring clay still moves');
  beforeNeighbour.locked.forEach((locked,i)=>{if(locked){assert.deepEqual(pulled.points[i],beforeNeighbour.points[i],'broad movement cannot displace a fixed grip');assert.equal(pulled.locked[i],true);}});
  await page.locator('[data-sculpt-history=undo]').click();near((await state(page)).points,beforeNeighbour.points,'undo neighbouring pull leaves the earlier shape intact');assert.deepEqual((await state(page)).locked,beforeNeighbour.locked);
  // Pressing a fixed point must not redirect movement into unrelated clay.
  const fixed=await state(page),p=fixed.points[top];await drag(p,[p[0]+28/box.width,p[1]+26/box.height]);
  near((await state(page)).points,fixed.points,'dragging a green grip cannot move it or other clay');assert.deepEqual((await state(page)).locked,fixed.locked);
  const beforeResize=(await saved(page)).sculpt;
  await page.setViewportSize(mobile?{width:844,height:390}:{width:1124,height:600});await page.waitForTimeout(200);
  const resized=(await saved(page)).sculpt;
  near(resized.points,beforeResize.points,'resize preserves local geometry',i=>beforeResize.locked[i]?1e-4:1e-8);assert.deepEqual(resized.locked,beforeResize.locked,'resize preserves established locks');
  const resizedState=await state(page);resizedState.locked.forEach((locked,i)=>{if(locked)assert.deepEqual(resizedState.points[i],resizedState.guide[i],'fixed points stay exactly on the resized guide');});
  await page.setViewportSize(viewport);await page.waitForTimeout(200);await page.reload();await ready(page);
  const restored=(await saved(page)).sculpt;near(restored.points,beforeResize.points,'reload restores the actual edited clay',i=>beforeResize.locked[i]?1e-4:1e-8);assert.deepEqual(restored.locked,beforeResize.locked,'reload restores locks');
  const afterReload=await state(page);await drag(afterReload.points[top],[afterReload.points[top][0]+20/box.width,afterReload.points[top][1]+20/box.height]);near((await state(page)).points,afterReload.points,'restored locks remain immovable');
  await page.screenshot({path:`/tmp/sculpt-locks-${mobile?'phone':'desktop'}.png`,fullPage:mobile});
  // Complete only unfinished regions. Locks must never strand an otherwise reachable outline.
  await page.locator('[data-sculpt-range=fine]').click();let gestures=0;
  for(let pass=0;pass<3&&(await state(page)).fraction<.9;pass++)for(let i=0;i<40;i++){const current=await state(page);if(current.fraction>=.9)break;if(current.locked[i])continue;await drag(current.points[i],current.guide[i]);gestures++;}
  assert.ok((await saved(page)).sculpt.fraction>=.9,`locked outline still reaches the unchanged 90% score (${mobile?'touch':'mouse'})`);
  assert.equal(await page.locator('[data-action=next-shape]').isEnabled(),true);assert.deepEqual(errors,[]);
  console.log(`${mobile?'Touch':'Mouse'} green locks: neighbour/direct protection, undo/redo, save/reload, resize and 90% completion (${gestures} remaining drags) passed.`);
  await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
