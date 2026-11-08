const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {enterGame,completeTutorial}=require('./game-entry.cjs');
const BASE=process.env.BASE_URL||'http://127.0.0.1:4173',KEY='celadon-tycoon-v2';
const NOW=Date.UTC(2026,10,8,12);
const draft={id:'onboarding-resume',customerId:'king',orderId:'royal-rest',accepted:true,shape:'stool',modelId:'stool',step:1,stationView:'game',clay:{body:true,slip:'white',kneads:6,prepared:true},knead:3,width:1,viewFrame:3,technique:'inlay',pattern:'cloud',placements:[],strokes:[],decorPhase:0,decorDone:false,firing:[],explanationUse:'',explanationBeauty:''};
async function clock(page){await page.clock.install({time:new Date(NOW)});await page.clock.pauseAt(new Date(NOW+1000));}
async function state(page,key=KEY){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);}
async function advance(page,ms){await page.clock.runFor(ms);}
async function ready(page){await page.locator('.counter-scene[data-customer-arrival=ready]').waitFor();}
async function checkTutorialLayout(page,width){
  const details=await page.locator('.tutorial-popup').evaluate(dialog=>{const image=dialog.querySelector('.tutorial-process'),start=dialog.querySelector('[data-action=tutorial-start]'),box=image.getBoundingClientRect(),b=start.getBoundingClientRect(),content=dialog.querySelector('.tutorial-content');return{imageWidth:box.width,imageLoaded:image.complete&&image.naturalWidth>0,filter:getComputedStyle(image).filter,button:{top:b.top,bottom:b.bottom},height:innerHeight,scrolls:content.scrollHeight>content.clientHeight,steps:dialog.querySelectorAll('.tutorial-steps li').length};});
  assert.ok(details.imageLoaded,'the actual generated tutorial image loads');assert.ok(details.imageWidth>width*.85,'poster text keeps a readable full-width image');assert.equal(details.filter,'none');assert.ok(details.scrolls);assert.equal(details.steps,6);assert.ok(details.button.top>=0&&details.button.bottom<=details.height,'acknowledgement stays visible while the poster scrolls');
}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 const errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1024,height:600},reducedMotion:'no-preference'});page.on('pageerror',e=>errors.push(e.message));await clock(page);await page.goto(new URL('/game',BASE).href);
  await page.click('[data-action=new-order]');await page.locator('.tutorial-popup[open]').waitFor();
  await page.locator('.tutorial-process').evaluate(image=>image.decode());
  assert.equal(await page.locator('[data-action=tutorial-start]').isDisabled(),true);assert.equal(await state(page),null,'opening the tutorial does not create a customer or mutate saves');
  assert.match(await page.locator('#tutorial-title').innerText(),/상감 청자/);assert.doesNotMatch(await page.locator('.tutorial-steps').innerText(),/주문|전달/);
  await checkTutorialLayout(page,1024);await page.screenshot({path:'/tmp/game-tutorial-1024.png'});
  await page.setViewportSize({width:1366,height:768});await checkTutorialLayout(page,1200);
  await page.setViewportSize({width:390,height:844});const footerFits=await page.locator('.tutorial-footer').evaluate(footer=>[...footer.children].every(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));assert.equal(footerFits,true,'download, acknowledgement and start fit a narrow phone');await page.screenshot({path:'/tmp/game-tutorial-390.png'});await page.setViewportSize({width:1024,height:600});
  await completeTutorial(page);await page.locator('.counter-scene[data-customer-arrival=waiting]').waitFor();
  const first=await state(page);assert.equal(first.draft.accepted,false);assert.equal(await page.locator('[data-action=accept]').isDisabled(),true);
  await advance(page,3300);assert.equal(await page.locator('.counter-scene').getAttribute('data-customer-arrival'),'waiting','no customer before the 3.5-second wait');
  await advance(page,400);assert.equal(await page.locator('.counter-scene').getAttribute('data-customer-arrival'),'walking');
  const pose=await page.locator('.counter-walker').evaluate(el=>({position:el.style.backgroundPosition,transform:el.style.transform,image:getComputedStyle(el).backgroundImage}));assert.match(pose.image,/\/assets\/characters\/walk\/(king|queen|noble|noblewoman|artisan)\.png/);
  await advance(page,220);const moved=await page.locator('.counter-walker').evaluate(el=>({position:el.style.backgroundPosition,transform:el.style.transform}));assert.notEqual(moved.position,pose.position,'walking changes actual sprite poses');assert.notEqual(moved.transform,pose.transform,'the walking customer advances toward the counter');
  await advance(page,650);await page.screenshot({path:'/tmp/game-customer-walking-1024.png'});await advance(page,800);await ready(page);assert.equal(await page.locator('[data-action=accept]').isDisabled(),false);
  const hud=await page.locator('.hud').evaluate(el=>({logo:parseFloat(getComputedStyle(el.querySelector('.mini-logo')).fontSize),menu:parseFloat(getComputedStyle(el.querySelector('.hud-tools button')).fontSize),height:el.getBoundingClientRect().height}));assert.ok(hud.logo>=25&&hud.menu>=17&&hud.height>=68);
  await page.click('[data-action=guide]');assert.equal(await page.locator('#tutorial-understood').count(),0,'help revisits the poster without a mandatory checkbox');await page.click('.tutorial-footer [data-action=close-popup]');
  await page.click('[data-action=home]');await enterGame(page,'new-order');assert.equal(await page.locator('.tutorial-popup[open]').count(),0,'fresh customers do not repeat an acknowledged tutorial in the same page');assert.notEqual((await state(page)).draft.id,first.draft.id);assert.equal(await page.locator('.counter-scene').getAttribute('data-customer-arrival'),'waiting');
  const saved={history:['royal-rest'],gallery:[],draft,retentionStartedAt:NOW};await page.evaluate(({key,saved})=>localStorage.setItem(key,JSON.stringify(saved)),{key:KEY,saved});await page.reload();
  await page.click('[data-action=start]');await page.locator('.tutorial-popup[open]').waitFor();assert.deepEqual(await state(page),saved);await completeTutorial(page);await page.locator('.illustration-viewport[data-status=ready]').waitFor();assert.equal(await page.locator('.counter-walker').count(),0,'resuming existing work has no arrival delay');assert.deepEqual(await state(page),saved,'acknowledgement never alters the saved artwork');
  await page.close();

  for(const mode of ['reduced','missing','hanging']){
   const p=await browser.newPage({viewport:{width:1024,height:600},reducedMotion:mode==='reduced'?'reduce':'no-preference'});p.on('pageerror',e=>errors.push(e.message));await clock(p);
   if(mode!=='reduced')await p.route('**/assets/characters/walk/*.png',route=>mode==='missing'?route.abort():undefined);
   await p.goto(new URL('/game',BASE).href);await enterGame(p,'new-order');await advance(p,3300);assert.equal(await p.locator('.counter-scene').getAttribute('data-customer-arrival'),'waiting');await advance(p,mode==='hanging'?2900:400);await ready(p);assert.equal(await p.locator('[data-action=accept]').isDisabled(),false,`${mode} always reaches a usable customer`);await p.close();
  }

  const host=await browser.newPage({viewport:{width:1100,height:700}});host.on('pageerror',e=>errors.push(e.message));await clock(host);
  await host.route('**/__onboarding-host',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><iframe style="width:1024px;height:600px;border:0" src="/game?classroom=1&room=ABCDEF&student=7&run=onboarding"></iframe>'}));await host.goto(new URL('/__onboarding-host',BASE).href);
  const frame=host.frames().find(f=>f.url().includes('classroom=1'));await frame.locator('#classroom-game-pause').waitFor();
  const teacher=async active=>{await host.evaluate(active=>document.querySelector('iframe').contentWindow.postMessage({type:'celadon:classroom-state',active,runId:'onboarding'},location.origin),active);await frame.waitForFunction(active=>document.querySelector('#classroom-game-pause').style.display===(active?'none':'grid'),active);};
  await teacher(true);await frame.click('[data-action=new-order]');await frame.locator('.tutorial-popup[open]').waitFor();await teacher(false);assert.equal(await frame.locator('.tutorial-popup[open]').count(),0);await teacher(true);await frame.locator('.tutorial-popup[open]').waitFor();await completeTutorial(frame);
  await advance(host,1700);const pausedId=(await state(frame,`${KEY}:classroom:ABCDEF:7:run:onboarding`)).draft.id;await teacher(false);await advance(host,5000);await teacher(true);assert.equal(await frame.locator('.counter-scene').getAttribute('data-customer-arrival'),'waiting');await advance(host,1700);assert.equal(await frame.locator('.counter-scene').getAttribute('data-customer-arrival'),'waiting','teacher pause does not consume arrival time');await advance(host,1700);await ready(frame);assert.equal((await state(frame,`${KEY}:classroom:ABCDEF:7:run:onboarding`)).draft.id,pausedId);await host.close();
  assert.deepEqual(errors,[]);console.log('Onboarding: six-step readable poster, required page-local acknowledgement, unchanged resume saves, larger HUD, delayed real walking sprites, teacher pause/resume, reduced motion and missing/hanging image fallback passed.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
