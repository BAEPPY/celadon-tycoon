/* Name a real completed work while its original order and rotating preview stay visible. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {build}=require('esbuild');
const {chromium}=require('playwright');
const {enterGame}=require('./game-entry.cjs');
const base=process.env.BASE_URL||'http://127.0.0.1:4173',key='celadon-tycoon-v2';
const work={id:'naming-reference',orderId:'royal-rest',customerId:'king',accepted:true,
 shape:'pillow',modelId:'pillow',step:3,stationView:'counter-delivery',width:1,knead:3,viewFrame:0,
 technique:'inlay',pattern:'crane',placements:[{x:180,y:180,uv:[.45,.5],pattern:'cloud'},{x:190,y:190,uv:[.6,.5],pattern:'crane'}],strokes:[],
 decorPhase:2,decorDone:true,firing:['dry','biscuit','glaze','fire'],clay:{body:true,slip:'white',kneads:6,prepared:true},inspection:{done:true},explanationUse:'',explanationBeauty:''};
(async()=>{
 const bundle=await build({entryPoints:[path.join(__dirname,'../app-v3.js')],bundle:true,write:false,format:'esm',target:'es2022'});
 const css=Object.fromEntries(await Promise.all(['finish-workshop.css','mobile-game.css'].map(async name=>[name,await fs.readFile(path.join(__dirname,'..',name),'utf8')])));
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/app.js',route=>route.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text}));
  for(const [name,body] of Object.entries(css))await page.route('**/'+name,route=>route.fulfill({contentType:'text/css',body}));
  await page.goto(new URL('/game',base).href);
  await page.evaluate(({key,work})=>localStorage.setItem(key,JSON.stringify({history:[work.orderId],gallery:[],draft:work})),{key,work});
  await page.reload();await enterGame(page);await page.click('[data-action=explain]');
  await page.waitForSelector('#explanation-preview [data-status=ready]');
  assert.equal(await page.inputValue('#work-title'),'');
  assert.match(await page.locator('.explanation-order').innerText(),/누워서 쉴 때 머리를 받칠.*학 무늬를 다른 색의 흙/);
  assert.doesNotMatch(await page.locator('.name-workshop').innerText(),/상감|운학문|베개/,'no solved title is supplied');
  await page.locator('.naming-help summary').click();
  assert.equal(await page.locator('.naming-help').getAttribute('open'),'');
  assert.equal(await page.locator('.naming-help li').count(),3);
  await page.fill('#work-title','구름이 쉬어 가는 곳');
  await page.locator('.naming-help summary').click();
  await page.locator('#explanation-preview [data-turn="1"]').click();
  await page.waitForFunction(()=>document.querySelector('#explanation-preview .turn-label').textContent!=='0°');
  assert.equal(await page.inputValue('#work-title'),'구름이 쉬어 가는 곳');
  assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).draft.viewFrame,key),0,'reference rotation never changes the saved work');
  for(const [width,height] of [[1366,768],[1024,600]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready);
   const ref=await page.locator('.explanation-reference').boundingBox(),form=await page.locator('.explanation-writing').boundingBox();
   assert.ok(ref.x+ref.width<=form.x,'reference stays beside the writing form');
   assert.ok(Math.abs(ref.y-form.y)<2,'reference and form start together');
   const bounds=await page.locator('[data-action=submit]').boundingBox();
   assert.ok(bounds.y>=0&&bounds.y+bounds.height<=height,'submit remains visible on Chromebook');
   assert.equal(await page.locator('.explanation-popup').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  }
  await page.screenshot({path:'/tmp/naming-reference-1024.png'});
  await page.setViewportSize({width:390,height:844});
  const ref=await page.locator('.explanation-reference').boundingBox(),form=await page.locator('.explanation-writing').boundingBox();
  assert.ok(ref.y+ref.height<=form.y,'phone stacks reference above form');
  assert.equal(await page.locator('.explanation-popup').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'phone has no horizontal overflow');
  await page.locator('#work-title').scrollIntoViewIfNeeded();await page.fill('#work-title','내가 지은 이름');
  await page.locator('[data-action=submit]').scrollIntoViewIfNeeded();
  await page.screenshot({path:'/tmp/naming-reference-mobile.png'});
  await page.click('[data-action=close-popup]');await page.click('[data-action=explain]');
  await page.waitForSelector('#explanation-preview [data-status=ready]');
  assert.equal(await page.inputValue('#work-title'),'내가 지은 이름','reopening keeps the learner title and recreates the preview');
  assert.deepEqual(errors,[]);
  console.log('Order reference, authored rotating preview, blank title, optional hints, saved-work isolation, Chromebook fit and phone stacking passed.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
