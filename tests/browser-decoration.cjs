/* Run after build against the actual app; isolated storage, pointer-only filling and wiping. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const KEY='celadon-tycoon-v2',base=process.env.BASE_URL||'http://127.0.0.1:4173';
const draft=extra=>({id:'decoration-browser-check',orderId:'royal-rest',customerId:'king',accepted:true,clay:{body:true,slip:'white',kneads:6,prepared:true},shape:'stool',modelId:'stool',width:1,knead:3,step:1,stationView:'game',technique:'inlay',pattern:'cloud',tool:'stamp',placements:[],strokes:[],decorPhase:0,decorDone:false,firing:[],viewFrame:0,...extra});
async function saved(page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)).draft,KEY);}
async function seed(page,work){await page.goto(new URL('/game',base).href);await page.evaluate(({key,work})=>localStorage.setItem(key,JSON.stringify({history:['royal-rest'],gallery:[],draft:work})),{key:KEY,work});await page.reload();await page.click('[data-action=start]');await page.waitForSelector('.illustration-viewport[data-status=ready]');await page.evaluate(()=>document.fonts.ready);}
async function point(page,u,v){return page.locator('.illustration-viewport>canvas').first().evaluate((canvas,{u,v})=>{const r=canvas.getBoundingClientRect(),b=JSON.parse(canvas.parentElement.dataset.objectBox);return {x:r.x+(b[0]+u*b[2])*r.width,y:r.y+(b[1]+v*b[3])*r.height};},{u,v});}
async function pixel(page,u=.5,v=.55){return page.locator('.illustration-viewport>canvas').first().evaluate((canvas,{u,v})=>{const b=JSON.parse(canvas.parentElement.dataset.objectBox);return [...canvas.getContext('2d').getImageData(Math.round((b[0]+u*b[2])*canvas.width),Math.round((b[1]+v*b[3])*canvas.height),1,1).data];},{u,v});}
async function rotate(page,n){for(let i=0;i<n;i++){await page.click('[data-turn="1"]');await page.waitForSelector('.illustration-viewport[data-status=ready]');}await page.waitForTimeout(100);}
async function sweep(page,mode){
  const from=await point(page,.13,.18),to=await point(page,.87,.9);
  for(let row=0;row<15;row++){
    if((await saved(page)).inlay?.[mode+'Done'])break;
    const y=from.y+(to.y-from.y)*row/14,x0=row%2?to.x:from.x,x1=row%2?from.x:to.x;
    await page.mouse.move(x0,y);await page.mouse.down();await page.mouse.move(x1,y,{steps:12});await page.mouse.up();
  }
}
async function pixels(page){return page.locator('.illustration-viewport>canvas').first().evaluate(canvas=>{const b=JSON.parse(canvas.parentElement.dataset.objectBox),x=Math.floor((b[0]+b[2]*.22)*canvas.width),y=Math.floor((b[1]+b[3]*.2)*canvas.height),w=Math.floor(b[2]*.56*canvas.width),h=Math.floor(b[3]*.63*canvas.height),d=canvas.getContext('2d').getImageData(x,y,w,h).data;let bright=0,dark=0;for(let i=0;i<d.length;i+=4){if(d[i+3]<220)continue;if(d[i]>220&&d[i+1]>200&&d[i+2]>160)bright++;if(d[i]<85&&d[i+1]<85&&d[i+2]<85)dark++;}return {bright,dark};});}
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});try{
 for(const viewport of [{width:1366,height:768},{width:1024,height:600}]){
  const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await seed(page,draft({placements:[{uv:[.5,.55],surfaceAngle:0,pattern:'cloud'},{uv:[.68,.38],surfaceAngle:.7,pattern:'lotus'},{uv:[.5,.55],surfaceAngle:Math.PI,pattern:'cloud'}]}));
  assert.match(await page.locator('[data-pattern=cloud]').innerText(),/구름.*운/s);
  const help=page.getByRole('button',{name:'상감 설명',exact:true});await help.hover();await page.waitForSelector('#tip-inlay',{state:'visible'});
  const tooltip=await page.locator('#tip-inlay').boundingBox();assert.ok(tooltip.width>=220&&tooltip.height>=55,'large readable technique help');await page.mouse.move(5,5);
  assert.equal(await page.locator('[data-action=inlay-fill]').isDisabled(),false);
  await page.screenshot({path:`/tmp/decoration-integrated-${viewport.width}.png`});
  await page.click('[data-action=inlay-fill]');await page.waitForSelector('.inlay-canvas[data-mode=fill]');await page.click('[data-slip=dark]');
  assert.equal((await saved(page)).clay.slip,'dark');assert.equal(await page.locator('[data-action=inlay-wipe]').isDisabled(),true);
  await sweep(page,'fill');let first=await saved(page);assert.ok(first.inlay.fill.length>0);assert.equal(first.inlay.fillDone,false,'back-facing marks still need filling');
  await rotate(page,12);await sweep(page,'fill');assert.equal((await saved(page)).inlay.fillDone,true);
  assert.equal(await page.locator('[data-action=inlay-wipe]').isDisabled(),false);await page.click('[data-action=inlay-wipe]');await page.waitForSelector('.inlay-canvas[data-mode=wipe]');
  assert.equal(await page.locator('[data-action=next-decor]').isDisabled(),true);assert.equal(await page.locator('[data-slip=white]').isDisabled(),true);
  await sweep(page,'wipe');assert.equal((await saved(page)).inlay.wipeDone,false);await rotate(page,12);await sweep(page,'wipe');
  const finished=await saved(page);assert.equal(finished.inlay.wipeDone,true);assert.equal(finished.decorDone,true);assert.equal(finished.decorPhase,2);assert.equal(await page.locator('[data-action=next-decor]').isDisabled(),false);
  await page.screenshot({path:`/tmp/inlay-integrated-wiped-${viewport.width}.png`});await page.click('[data-action=next-decor]');assert.equal((await saved(page)).step,2);assert.ok(await page.locator('.kiln-scene').count());
  await seed(page,{...finished,step:2,firing:['dry','biscuit','glaze','fire'],viewFrame:0});await page.waitForTimeout(200);const dark=await pixels(page);
  await seed(page,{...finished,step:2,firing:['dry','biscuit','glaze','fire'],viewFrame:0,clay:{...finished.clay,slip:'white'},inlay:{...finished.inlay,slip:'white'}});await page.waitForTimeout(200);const white=await pixels(page);
  assert.ok(white.bright>dark.bright+100,'white slip remains light after firing');assert.ok(dark.dark>white.dark+100,'dark slip remains dark after firing');
  await seed(page,draft({technique:'openwork'}));const before=await pixel(page);const spot=await point(page,.5,.55);await page.mouse.click(spot.x,spot.y);await page.waitForTimeout(220);const inside=await pixel(page);assert.ok(inside[3]>240&&inside[0]<before[0]-10);
  await rotate(page,12);assert.ok((await pixel(page))[0]>inside[0]+10);const far=await point(page,.5,.55);await page.mouse.click(far.x,far.y);await page.waitForTimeout(220);assert.ok((await pixel(page))[3]<20,'both walls must be cut before background shows');
  const layout=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollX:document.documentElement.scrollWidth,scrollY:document.documentElement.scrollHeight}));assert.ok(layout.scrollX<=layout.width&&layout.scrollY<=layout.height);assert.deepEqual(errors,[]);
  console.log(`Decoration ${viewport.width}×${viewport.height}: motif labels/help, curved walls, pointer fill/wipe around front/back, kiln gating, fired slip colors passed`);await page.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
