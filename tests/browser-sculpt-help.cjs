/* Easier clay shaping: a grip let go near its own spot lands on it, a grip near (not on) a green one can still be
   pulled, the 85% target, and "남은 부분 다듬기" offered after ten pulls that do not pass. Mouse and touch. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {enterGame}=require('./game-entry.cjs');
const base=process.env.BASE_URL||'http://127.0.0.1:4173',KEY='celadon-tycoon-v2';
const draft=()=>({id:'sculpt-help',orderId:'royal-rest',customerId:'king',shape:'pitcher',modelId:'peonyPitcher',step:0,knead:0,width:1,technique:'inlay',pattern:'cloud',placements:[],strokes:[],decorPhase:0,decorDone:false,firing:[],accepted:true,clay:{body:true,slip:'white',kneads:6,prepared:true},stationView:'game'});
const state=page=>page.locator('.sculpt-canvas').evaluate(el=>({points:JSON.parse(el.dataset.current),guide:JSON.parse(el.dataset.guide),locked:JSON.parse(el.dataset.locked),selected:+el.dataset.selected,fraction:+el.dataset.coverage,pulls:+(el.dataset.pulls||0)}));
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).draft,KEY);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const mobile of [false,true]){
  const viewport=mobile?{width:844,height:390}:{width:1366,height:768};
  const page=await browser.newPage({viewport,isMobile:mobile,hasTouch:mobile}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const cdp=mobile?await page.context().newCDPSession(page):null;
  const touch=(type,points=[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(p=>({...p,id:1,radiusX:7,radiusY:7,force:1}))});
  async function drag(from,to){
   const canvas=page.locator('.sculpt-canvas');await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox(),pixel=p=>({x:box.x+p[0]*box.width,y:box.y+p[1]*box.height}),a=pixel(from),b=pixel(to);
   if(mobile){await touch('touchStart',[a]);for(let i=1;i<=10;i++)await touch('touchMove',[{x:a.x+(b.x-a.x)*i/10,y:a.y+(b.y-a.y)*i/10}]);await touch('touchEnd');}
   else{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:10});await page.mouse.up();}
   return box;
  }
  await page.goto(`${base}/game`);
  await page.evaluate(({key,work})=>localStorage.setItem(key,JSON.stringify({history:['royal-rest'],gallery:[],draft:work,retentionStartedAt:Date.now()})),{key:KEY,work:draft()});
  await page.reload();await enterGame(page,'start');await page.waitForFunction(()=>JSON.parse(document.querySelector('.sculpt-canvas')?.dataset.locked||'[]').length===40);
  assert.match(await page.locator('.sculpt-goal').innerText(),/85%/);assert.match(await page.locator('#sculpt-status').innerText(),/목표 85%/);
  const help=page.locator('[data-sculpt-assist=rest]');assert.equal(await help.isVisible(),false,'the help is not offered at first');
  // The magnet: dragged to a spot a little short of its own (4% of the target's diagonal away), a grip lands on it.
  await page.locator('[data-sculpt-range=fine]').click();
  let s=await state(page);const box=await page.locator('.sculpt-canvas').boundingBox();
  const xs=s.guide.map(p=>p[0]*box.width),ys=s.guide.map(p=>p[1]*box.height),diagonal=Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys));
  const top=s.guide.reduce((best,p,i)=>p[1]<s.guide[best][1]?i:best,0),short=[s.guide[top][0],s.guide[top][1]+diagonal*.04/box.height];
  await drag(s.points[top],short);s=await state(page);
  assert.equal(s.locked[top],true,'let go near its own spot, the grip turns green');assert.deepEqual(s.points[top],s.guide[top],'and lands exactly on its spot');
  // Pressing right on the green grip still moves nothing (it is fixed).
  const before=await state(page);await drag(before.points[top],[before.points[top][0]+30/box.width,before.points[top][1]+24/box.height]);
  assert.deepEqual((await state(page)).points,before.points,'pressing right on a green grip moves nothing');
  // Pressing the clay next to it (not on it) pulls the nearest unfinished grip instead.
  const neighbour=(top+1)%40,between=[(before.points[top][0]*.4+before.points[neighbour][0]*.6),(before.points[top][1]*.4+before.points[neighbour][1]*.6)];
  const pointer=[between[0]*box.width,between[1]*box.height],onGreen=Math.hypot(pointer[0]-before.points[top][0]*box.width,pointer[1]-before.points[top][1]*box.height);
  if(onGreen>(mobile?14:10)&&!before.locked[neighbour]){
   await drag(between,[between[0]+20/box.width,between[1]+16/box.height]);const moved=await state(page);
   assert.ok(moved.points.some((p,i)=>!before.locked[i]&&(p[0]!==before.points[i][0]||p[1]!==before.points[i][1])),'the unfinished clay next to a green grip can still be pulled');
   assert.deepEqual(moved.points[top],before.points[top],'the green grip stays');
  }
  // Ten pulls that do not pass bring "남은 부분 다듬기".
  while((await state(page)).pulls<10){const now=await state(page),free=now.locked.findIndex((locked,i)=>!locked&&i!==top);await drag(now.points[free],[now.points[free][0]+(now.points[free][0]<.5?-12:12)/box.width,now.points[free][1]]);}
  assert.equal((await saved(page)).sculpt.complete,false);await help.waitFor({state:'visible'});
  // Each press brings the unfinished clay half way; a few presses pass, and a press can be undone.
  const beforeHelp=await state(page);await help.click();const afterHelp=await state(page);
  const gap=st=>st.points.reduce((sum,p,i)=>sum+Math.hypot((p[0]-st.guide[i][0])*box.width,(p[1]-st.guide[i][1])*box.height),0);
  assert.ok(gap(afterHelp)<gap(beforeHelp)*.55,`one press halves what is left (${gap(beforeHelp).toFixed(0)} → ${gap(afterHelp).toFixed(0)} px)`);
  beforeHelp.locked.forEach((locked,i)=>{if(locked)assert.deepEqual(afterHelp.points[i],beforeHelp.points[i],'green grips stay');});
  await page.locator('[data-sculpt-history=undo]').click();const undone=await state(page);
  assert.ok(undone.points.every((p,i)=>Math.abs(p[0]-beforeHelp.points[i][0])<1e-6&&Math.abs(p[1]-beforeHelp.points[i][1])<1e-6),'the help can be undone');assert.deepEqual(undone.locked,beforeHelp.locked);
  let presses=0;while(!(await saved(page)).sculpt.complete&&presses<6){await help.click();presses++;}
  const done=await saved(page);assert.equal(done.sculpt.complete,true);assert.ok(done.sculpt.fraction>=.85);assert.ok(presses<=5,`passes after ${presses} presses`);
  await page.locator('.sculpt-success').waitFor();assert.match(await page.locator('.sculpt-success').innerText(),/85% 이상/);
  assert.equal(await page.locator('[data-action=next-shape]').isEnabled(),true);assert.deepEqual(errors,[]);
  console.log(`${mobile?'Touch':'Mouse'}: magnet onto its own spot, green grip fixed when pressed, clay beside it still pulled, help after 10 pulls (passes after ${presses} presses), undo, 85% passed.`);
  await page.close();
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
