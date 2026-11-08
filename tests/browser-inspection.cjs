const {enterGame}=require('./game-entry.cjs');
/* Run after npm run build + npm start, using an isolated browser profile. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:4173',KEY='celadon-tycoon-v2';
const work={id:'inspection-browser',orderId:'royal-rest',accepted:true,shape:'stool',modelId:'stool',step:3,stationView:'inspection',knead:3,width:1,technique:'openwork',pattern:'cloud',placements:[],strokes:[],decorPhase:2,decorDone:true,firing:['dry','biscuit','glaze','fire'],clay:{body:true,slip:'white',kneads:6,prepared:true},preview:'/assets/vessels/stool.webp',inspection:{version:2,items:['crack','warped','glaze','sound'],broken:[],failed:false,done:false,attempts:0,correct:0}};
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});try{
 for(const [width,height]of [[1366,768],[1024,600],[1280,720],[1536,864]]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:width===1024?'reduce':'no-preference'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  if(process.env.INSPECTION_SOURCE_BUNDLE){await page.route('**/app.js',route=>route.fulfill({contentType:'text/javascript',path:process.env.INSPECTION_SOURCE_BUNDLE}));await page.route('**/inspection-workshop.css',route=>route.fulfill({contentType:'text/css',path:require('node:path').join(__dirname,'../inspection-workshop.css')}));}
  await page.goto(new URL('/game',base).href);
  await page.evaluate(({key,work})=>localStorage.setItem(key,JSON.stringify({history:['royal-rest'],gallery:[],draft:work})),{key:KEY,work});await page.reload();await enterGame(page,'start');await page.waitForSelector('[data-inspection-ready=true]');
  assert.equal(await page.locator('.inspection-pot').count(),4);
  assert.equal(new Set(await page.locator('.inspection-pot-art img').evaluateAll(imgs=>imgs.map(img=>img.src))).size,4,'each defect changes the actual pictured vessel');
  await page.locator('[data-sample-kind=sound]').click();await page.waitForSelector('.is-shattering');
  assert.equal(await page.locator('.inspection-pot:not([disabled])').count(),0,'hammer impact locks additional strikes');
  await page.waitForSelector('.inspection-outcome');assert.match(await page.locator('.inspection-outcome').innerText(),/실패…[\s\S]*다시 골라볼까요/);
  const failed=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).draft,KEY);assert.equal(failed.inspection.failed,true);assert.equal(failed.preview,work.preview,'breaking a sample never destroys the original artwork');
  await page.reload();await enterGame(page,'start');await page.waitForSelector('.inspection-outcome');
  await page.click('[data-inspection-retry]');await page.waitForSelector('[data-inspection-ready=true]');assert.equal(await page.locator('.is-broken').count(),0);
  for(const kind of ['crack','warped','glaze']){await page.locator(`[data-sample-kind=${kind}]`).focus();await page.keyboard.press('Enter');await page.waitForSelector(`[data-sample-kind=${kind}].is-broken`);await page.waitForSelector('[data-inspection-ready=true]');}
  assert.equal(await page.locator('.inspection-pot.is-kept').count(),1);assert.equal(await page.locator('.inspection-pot.is-broken').count(),3);assert.equal(await page.locator('.is-kept').getAttribute('data-sample-kind'),'sound');
  const state=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).draft,KEY);assert.equal(state.inspection.done,true);assert.equal(state.inspection.attempts,1);assert.equal(state.preview,work.preview);
  const fit=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight,controls:[...document.querySelectorAll('button:not([disabled])')].map(b=>{const r=b.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})}));assert.equal(fit.scroll,false);assert.ok(fit.controls.every(Boolean));
  await page.click('[data-action=inspection-finish]');await page.waitForSelector('.is-counter-delivery');assert.deepEqual(errors,[]);await page.close();console.log(`Inspection ${width}×${height}: four pots, hammer, failure/retry/reload, three broken/one kept, delivery passed`);
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
