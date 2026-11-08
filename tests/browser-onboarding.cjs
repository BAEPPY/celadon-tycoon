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
async function checkTutorialLayout(page){
  const details=await page.locator('.tutorial-popup').evaluate(dialog=>{const image=dialog.querySelector('.tutorial-process'),content=dialog.querySelector('.tutorial-content'),box=content.getBoundingClientRect();return{imageCount:dialog.querySelectorAll('img').length,imageLoaded:image.complete&&image.naturalWidth>0,filter:getComputedStyle(image).filter,width:box.width,height:box.height,oldList:dialog.querySelectorAll('.tutorial-steps,.tutorial-inlay-tip').length,fits:[...dialog.querySelectorAll('button,a,input')].filter(el=>el.getClientRects().length).every(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})};});
  assert.equal(details.imageCount,1,'only the current scene appears');assert.ok(details.imageLoaded);assert.equal(details.filter,'none');assert.equal(details.oldList,0,'no duplicate six-step list or poster text');assert.ok(details.width>260&&details.height>180);assert.ok(details.fits,'all visible arrows and completion controls fit');
}
async function tutorialStep(target){return Number(await target.locator('.tutorial-content').getAttribute('data-tutorial-step'));}
async function checkBrand(page){
  const brand=await page.locator('.mini-logo').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const rects=[...range.getClientRects()],r=el.getBoundingClientRect();return{text:el.textContent,lines:new Set(rects.map(x=>Math.round(x.top))).size,nowrap:getComputedStyle(el).whiteSpace,fits:r.left>=0&&r.right<=innerWidth&&el.scrollWidth<=el.clientWidth};});
  assert.equal(brand.text,'좋은 청자, 위대한 청자');assert.equal(brand.lines,1);if(page.viewportSize().width>=1024)assert.equal(brand.nowrap,'nowrap','Chromebook screens keep the title on one line');assert.ok(brand.fits);
}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 const errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1024,height:600},reducedMotion:'no-preference'});page.on('pageerror',e=>errors.push(e.message));await clock(page);await page.goto(new URL('/game',BASE).href);
  await page.click('[data-action=new-order]');await page.locator('.tutorial-popup[open]').waitFor();
  await page.locator('.tutorial-process').evaluate(image=>image.decode());
  assert.equal(await page.locator('[data-action=tutorial-start]').isDisabled(),true);assert.equal(await state(page),null,'opening the tutorial does not create a customer or mutate saves');
  assert.equal(await page.locator('#tutorial-title').innerText(),'흙 반죽');assert.equal(await page.locator('[data-action=tutorial-prev]').isDisabled(),true);assert.equal(await page.locator('.tutorial-completion').isVisible(),false);await checkBrand(page);
  await checkTutorialLayout(page);await page.screenshot({path:'/tmp/game-tutorial-1024.png'});
  await page.setViewportSize({width:1366,height:768});await checkTutorialLayout(page);await checkBrand(page);
  await page.setViewportSize({width:390,height:844});await checkTutorialLayout(page);await checkBrand(page);await page.screenshot({path:'/tmp/game-tutorial-390.png'});await page.setViewportSize({width:1024,height:600});
  const sources=new Set();for(let index=1;index<=6;index++){assert.equal(await tutorialStep(page),index);await page.locator('.tutorial-process').evaluate(image=>image.decode());sources.add(await page.locator('.tutorial-process').getAttribute('src'));assert.match(await page.locator('.tutorial-download').getAttribute('href'),new RegExp('0'+index+'-[a-z]+\\.png$'));await checkTutorialLayout(page);if(index===5)assert.match(await page.locator('.tutorial-caption').innerText(),/건조.*초벌.*유약.*재벌/);if(index<6)await page.click('[data-action=tutorial-next]');}assert.equal(sources.size,6,'each page uses a different individually generated scene');
  assert.equal(await page.locator('[data-action=tutorial-next]').isDisabled(),true);assert.equal(await page.locator('.tutorial-completion').isVisible(),true);await page.check('#tutorial-understood');await page.click('[data-action=tutorial-prev]');assert.equal(await page.locator('[data-action=tutorial-start]').isVisible(),false);await page.keyboard.press('ArrowRight');assert.equal(await tutorialStep(page),6);assert.equal(await page.locator('#tutorial-understood').isChecked(),true,'back and next preserve acknowledgement');await page.uncheck('#tutorial-understood');assert.equal(await page.locator('[data-action=tutorial-start]').isDisabled(),true);
  await page.setViewportSize({width:390,height:844});await checkTutorialLayout(page);await page.screenshot({path:'/tmp/game-tutorial-last-390.png'});await page.setViewportSize({width:1024,height:600});

  await completeTutorial(page);await page.locator('.counter-scene[data-customer-arrival=waiting]').waitFor();
  const first=await state(page);assert.equal(first.draft.accepted,false);assert.equal(await page.locator('[data-action=accept]').isDisabled(),true);assert.equal(await page.locator('.customer-arrival-status').count(),0);assert.doesNotMatch(await page.locator('body').innerText(),/곧 손님|공방으로 걸어오고/);
  await advance(page,1300);assert.equal(await page.locator('.counter-scene').getAttribute('data-customer-arrival'),'waiting','no customer before the 1.5-second wait');
  await advance(page,400);assert.equal(await page.locator('.counter-scene').getAttribute('data-customer-arrival'),'walking');
  const pose=await page.locator('.counter-walker').evaluate(el=>({position:el.style.backgroundPosition,transform:el.style.transform,image:getComputedStyle(el).backgroundImage}));assert.match(pose.image,/\/assets\/characters\/walk\/(king|queen|noble|noblewoman|artisan)\.png/);
  await advance(page,220);const moved=await page.locator('.counter-walker').evaluate(el=>({position:el.style.backgroundPosition,transform:el.style.transform}));assert.notEqual(moved.position,pose.position,'walking changes actual sprite poses');assert.notEqual(moved.transform,pose.transform,'the walking customer advances toward the counter');
  await advance(page,650);await page.screenshot({path:'/tmp/game-customer-walking-1024.png'});await advance(page,800);await ready(page);assert.equal(await page.locator('[data-action=accept]').isDisabled(),false);
  const hud=await page.locator('.hud').evaluate(el=>({logo:parseFloat(getComputedStyle(el.querySelector('.mini-logo')).fontSize),menu:parseFloat(getComputedStyle(el.querySelector('.hud-tools button')).fontSize),height:el.getBoundingClientRect().height}));assert.ok(hud.logo>=25&&hud.menu>=17&&hud.height>=68);
  await page.click('[data-action=guide]');assert.equal(await page.locator('#tutorial-understood').count(),0,'help revisits the carousel without a mandatory checkbox');await page.click('.tutorial-footer [data-action=close-popup]');
  await page.click('[data-action=home]');await enterGame(page,'new-order');assert.equal(await page.locator('.tutorial-popup[open]').count(),0,'fresh customers do not repeat an acknowledged tutorial in the same page');assert.notEqual((await state(page)).draft.id,first.draft.id);assert.equal(await page.locator('.counter-scene').getAttribute('data-customer-arrival'),'waiting');
  const saved={history:['royal-rest'],gallery:[],draft,retentionStartedAt:NOW};await page.evaluate(({key,saved})=>localStorage.setItem(key,JSON.stringify(saved)),{key:KEY,saved});await page.reload();
  await page.click('[data-action=start]');await page.locator('.tutorial-popup[open]').waitFor();assert.deepEqual(await state(page),saved);await completeTutorial(page);await page.locator('.illustration-viewport[data-status=ready]').waitFor();assert.equal(await page.locator('.counter-walker').count(),0,'resuming existing work has no arrival delay');assert.deepEqual(await state(page),saved,'acknowledgement never alters the saved artwork');
  await page.close();

  for(const mode of ['reduced','missing','hanging']){
   const p=await browser.newPage({viewport:{width:1024,height:600},reducedMotion:mode==='reduced'?'reduce':'no-preference'});p.on('pageerror',e=>errors.push(e.message));await clock(p);
   if(mode!=='reduced')await p.route('**/assets/characters/walk/*.png',route=>mode==='missing'?route.abort():undefined);
   await p.goto(new URL('/game',BASE).href);await enterGame(p,'new-order');await advance(p,1300);assert.equal(await p.locator('.counter-scene').getAttribute('data-customer-arrival'),'waiting');await advance(p,mode==='hanging'?1900:400);await ready(p);assert.equal(await p.locator('[data-action=accept]').isDisabled(),false,`${mode} always reaches a usable customer`);await p.close();
  }

  const host=await browser.newPage({viewport:{width:1100,height:700}});host.on('pageerror',e=>errors.push(e.message));await clock(host);
  await host.route('**/__onboarding-host',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><iframe style="width:1024px;height:600px;border:0" src="/game?classroom=1&room=ABCDEF&student=7&run=onboarding"></iframe>'}));await host.goto(new URL('/__onboarding-host',BASE).href);
  const frame=host.frames().find(f=>f.url().includes('classroom=1'));await frame.locator('#classroom-game-pause').waitFor();
  const teacher=async active=>{await host.evaluate(active=>document.querySelector('iframe').contentWindow.postMessage({type:'celadon:classroom-state',active,runId:'onboarding'},location.origin),active);await frame.waitForFunction(active=>document.querySelector('#classroom-game-pause').style.display===(active?'none':'grid'),active);};
  await teacher(true);await frame.click('[data-action=new-order]');await frame.locator('.tutorial-popup[open]').waitFor();await frame.click('[data-action=tutorial-next]');await frame.click('[data-action=tutorial-next]');assert.equal(await tutorialStep(frame),3);await teacher(false);assert.equal(await frame.locator('.tutorial-popup[open]').count(),0);await teacher(true);await frame.locator('.tutorial-popup[open]').waitFor();assert.equal(await tutorialStep(frame),3,'teacher pause restores the current tutorial scene');await completeTutorial(frame);
  await advance(host,700);const pausedId=(await state(frame,`${KEY}:classroom:ABCDEF:7:run:onboarding`)).draft.id;await teacher(false);await advance(host,5000);await teacher(true);assert.equal(await frame.locator('.counter-scene').getAttribute('data-customer-arrival'),'waiting');await advance(host,700);assert.equal(await frame.locator('.counter-scene').getAttribute('data-customer-arrival'),'waiting','teacher pause does not consume arrival time');await advance(host,1700);await ready(frame);assert.equal((await state(frame,`${KEY}:classroom:ABCDEF:7:run:onboarding`)).draft.id,pausedId);
  await frame.click('[data-action=guide]');await frame.click('[data-action=tutorial-next]');await frame.click('[data-action=tutorial-next]');await frame.click('[data-action=tutorial-next]');await teacher(false);await teacher(true);assert.equal(await tutorialStep(frame),4,'help carousel also keeps its scene across teacher pause');assert.equal(await frame.locator('#tutorial-understood').count(),0);await frame.click('.tutorial-footer [data-action=close-popup]');await teacher(false);await teacher(true);assert.equal(await frame.locator('.tutorial-popup[open]').count(),0,'an explicitly closed guide stays closed');await host.close();
  assert.deepEqual(errors,[]);console.log('Onboarding: six distinct scene carousel, required page-local acknowledgement, unchanged resume saves, larger HUD, 1.5-second caption-free arrival, teacher pause/resume, reduced motion and missing/hanging image fallback passed.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
