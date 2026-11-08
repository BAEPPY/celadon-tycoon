/* Phone touch flow: inspection → delivery → actual assessment → rotating saved work.
   Run with the built app and a local server; no mocked assessment response. */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:4173', KEY='celadon-tycoon-v2';
const work={id:'phone-completed-work',orderId:'royal-rest',customerId:'king',accepted:true,shape:'chrysanthemumCup',modelId:'chrysanthemumCup',viewFrame:0,step:3,stationView:'inspection',knead:3,width:1,technique:'inlay',pattern:'chrysanthemum',placements:[{uv:[.42,.48],x:151,y:173,pattern:'chrysanthemum',stampSize:.9}],strokes:[],decorPhase:2,decorDone:true,inlay:{slip:'white',fillDone:true,wipeDone:true,fill:[],wipe:[]},firing:['dry','biscuit','glaze','fire'],clay:{body:true,slip:'white',kneads:6,prepared:true},inspection:{version:2,items:['crack','warped','glaze','sound'],broken:[],failed:false,done:false,attempts:0,correct:0}};
async function tap(page,selector){const target=page.locator(selector);await target.scrollIntoViewIfNeeded();await target.tap();}
async function fit(page,selector){
 const box=await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,overflow:el.scrollWidth>el.clientWidth+2};});
 const width=page.viewportSize().width;
 assert.ok(box.left>=-1&&box.right<=width+1,`${selector} stays inside phone width: ${JSON.stringify(box)}`);
 if(box.overflow){await page.screenshot({path:'/tmp/mobile-game-overflow.png'});console.log(await page.locator(selector).evaluate(el=>[...el.querySelectorAll('*')].map(x=>({tag:x.className,...(()=>{const r=x.getBoundingClientRect();return {left:r.left,right:r.right};})()})).filter(x=>x.left<0||x.right>innerWidth)));}
 assert.equal(box.overflow,false,`${selector} has no clipped sideways content`);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page has no sideways overflow');
}
(async()=>{
 assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use a local server.');
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${base}/game`);
  await page.evaluate(({key,work})=>localStorage.setItem(key,JSON.stringify({history:['royal-rest'],gallery:[],draft:work,retentionStartedAt:Date.now()})),{key:KEY,work});
  await page.reload();await tap(page,'[data-action=start]');
  for(let i=0;i<5;i++)await tap(page,'[data-action=tutorial-next]');
  await tap(page,'#tutorial-understood');await tap(page,'[data-action=tutorial-start]');
  await page.locator('[data-inspection-ready=true]').waitFor();
  for(const [width,height] of [[390,844],[844,390],[956,440],[390,844]]){
   await page.setViewportSize({width,height});
   await page.waitForFunction(()=>document.querySelector('.inspection-scene').dataset.inspectionLayout==='grid');
   const pots=await page.locator('.inspection-pot').evaluateAll(items=>items.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
   assert.ok(pots.every(p=>p.w>=140&&p.w<=181&&Math.abs(p.w-p.h)<2),'four crisp, tappable pots have balanced sizes');
   assert.ok(Math.abs(pots[0].y-pots[1].y)<2&&pots[2].y>pots[0].y+pots[0].h+30,'inspection is a clear two-row grid');
   await fit(page,'.inspection-lineup');
  }
  await page.screenshot({path:'/tmp/mobile-inspection-390.png'});
  await tap(page,'[data-sample-kind=sound]');await page.locator('.inspection-outcome').waitFor();
  await fit(page,'.inspection-outcome');await tap(page,'[data-inspection-retry]');
  await page.locator('[data-inspection-ready=true]').waitFor();
  for(const kind of ['crack','warped','glaze']){
   await tap(page,`[data-sample-kind=${kind}]`);
   await page.locator(`[data-sample-kind=${kind}].is-broken`).waitFor({state:'attached'});
   await page.locator('[data-inspection-ready=true]').waitFor();
  }
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).draft,KEY);
  assert.deepEqual(saved.placements,work.placements,'inspection preserves the student decoration');
  assert.equal(saved.inspection.done,true);assert.equal(saved.inspection.attempts,1);
  await tap(page,'[data-action=inspection-finish]');await page.locator('.is-counter-delivery').waitFor();
  assert.equal(await page.evaluate(()=>scrollY),0,'the next step starts at its heading');
  await tap(page,'[data-action=explain]');await page.locator('.explanation-popup[open]').waitFor();
  for(const selector of ['#work-title','#explain-use','#explain-beauty']){
   assert.ok(await page.locator(selector).evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16),'phone fields avoid tiny zoom-triggering type');
  }
  await page.locator('#work-title').fill('국화가 피어난 잔');
  await page.locator('#explain-use').fill('국화 무늬가 있는 청자 잔을 만들었어요. 차를 담아 마실 때 쓰면 좋겠어요.');
  await page.locator('#explain-beauty').fill('국화 무늬를 파고 흰 흙을 채운 다음 여러 번 닦아서 선명한 상감 무늬가 보이게 했어요.');
  // A keyboard-sized viewport and landscape must retain the same form and allow its button to be reached.
  for(const [width,height] of [[390,460],[844,390],[390,844]]){
   await page.setViewportSize({width,height});await fit(page,'.explanation-popup');
   await page.locator('[data-action=submit]').scrollIntoViewIfNeeded();
   const bounds=await page.locator('[data-action=submit]').boundingBox();
   assert.ok(bounds.y>=0&&bounds.y+bounds.height<=height+1,'submit can be scrolled into the visible viewport');
   assert.equal(await page.locator('#work-title').inputValue(),'국화가 피어난 잔','orientation preserves input');
  }
  await page.screenshot({path:'/tmp/mobile-explanation-390.png'});
  await tap(page,'[data-action=submit]');await page.locator('.customer-review-scene').waitFor();
  const complete=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
  assert.equal(complete.gallery.length,1);assert.equal(complete.draft.assessment.accepted,true);
  await fit(page,'.customer-review-scene');await tap(page,'.hud-tools [data-action=gallery]');
  await tap(page,'[data-gallery-view]');await page.locator('.finished-preview .illustration-viewport[data-status=ready]').waitFor();
  await fit(page,'.finished-popup');
  const viewer=page.locator('.finished-preview');await viewer.scrollIntoViewIfNeeded();
  const before=await viewer.locator('.turn-label').innerText();
  await viewer.locator('[data-turn="1"]').tap();
  await page.waitForFunction(previous=>document.querySelector('.finished-preview .turn-label')?.textContent!==previous,before);
  assert.deepEqual((await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).gallery[0],KEY)).placements,complete.gallery[0].placements,'viewing never edits the saved artwork');
  await page.screenshot({path:'/tmp/mobile-saved-work-390.png'});
  await tap(page,'[data-action=close-popup]');assert.equal(await page.locator('#popup').evaluate(el=>el.open),false);
  assert.deepEqual(errors,[]);
  console.log('Phone touch tutorial, two-row inspection/retry, landscape rotation, keyboard-sized form, real assessment, gallery rotation, original marks, and next-step scroll passed.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
