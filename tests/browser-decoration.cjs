const {enterGame}=require('./game-entry.cjs');
/* Run after build against the actual app; isolated storage, pointer-only filling and wiping. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const KEY='celadon-tycoon-v2',base=process.env.BASE_URL||'http://127.0.0.1:4173';
const draft=extra=>({id:'decoration-browser-check',orderId:'royal-rest',customerId:'king',accepted:true,clay:{body:true,slip:'white',kneads:6,prepared:true},shape:'stool',modelId:'stool',width:1,knead:3,step:1,stationView:'game',technique:'inlay',pattern:'cloud',tool:'stamp',placements:[],strokes:[],decorPhase:0,decorDone:false,firing:[],viewFrame:0,...extra});
async function saved(page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)).draft,KEY);}
async function seed(page,work){await page.goto(new URL('/game',base).href);await page.evaluate(({key,work})=>localStorage.setItem(key,JSON.stringify({history:['royal-rest'],gallery:[],draft:work})),{key:KEY,work});await page.reload();await enterGame(page,'start');await page.waitForSelector('.illustration-viewport[data-status=ready]');await page.evaluate(()=>document.fonts.ready);}
async function point(page,u,v){return page.locator('.illustration-viewport>canvas').first().evaluate((canvas,{u,v})=>{const r=canvas.getBoundingClientRect(),b=JSON.parse(canvas.parentElement.dataset.objectBox);return {x:r.x+(b[0]+u*b[2])*r.width,y:r.y+(b[1]+v*b[3])*r.height};},{u,v});}
async function pixel(page,u=.5,v=.55){return page.locator('.illustration-viewport>canvas').first().evaluate((canvas,{u,v})=>{const b=JSON.parse(canvas.parentElement.dataset.objectBox);return [...canvas.getContext('2d').getImageData(Math.round((b[0]+u*b[2])*canvas.width),Math.round((b[1]+v*b[3])*canvas.height),1,1).data];},{u,v});}
async function rotate(page,n){for(let i=0;i<n;i++){await page.click('[data-turn="1"]');await page.waitForSelector('.illustration-viewport[data-status=ready]');}await page.waitForTimeout(100);}
async function canvasImage(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));return page.locator('.illustration-viewport>canvas').first().evaluate(canvas=>canvas.toDataURL());}
async function setStampSize(page,percent){await page.locator('#stamp-size').evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));},percent);}
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
  const page=await browser.newPage({viewport,reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await seed(page,draft({placements:[{uv:[.5,.55],surfaceAngle:0,pattern:'cloud'}]}));
  assert.equal(await page.inputValue('#stamp-size'),'100');
  const legacyImage=await canvasImage(page);await setStampSize(page,50);
  assert.equal(await canvasImage(page),legacyImage,'tool size does not resize a legacy stamp');
  assert.equal(await page.locator('#stamp-size-value').innerText(),'50%');
  const hover=await point(page,.5,.7);await page.mouse.move(hover.x,hover.y);
  assert.notEqual(await canvasImage(page),legacyImage,'pointer previews the new stamp size');assert.equal((await saved(page)).placements.length,1);
  await page.mouse.move(5,5);assert.equal(await canvasImage(page),legacyImage,'preview disappears without changing the pottery');
  await page.mouse.click(hover.x,hover.y);await page.mouse.move(5,5);let scaled=await saved(page);
  assert.equal(scaled.placements[1].stampSize,.5,'pointer stamp saves its own size');
  const smallImage=await canvasImage(page);await setStampSize(page,175);assert.equal(await canvasImage(page),smallImage,'new tool size leaves existing marks untouched');
  await page.locator('.illustration-viewport>canvas').first().focus();await page.keyboard.press('Space');scaled=await saved(page);
  assert.deepEqual(scaled.placements.map(p=>p.stampSize),[undefined,.5,1.75],'keyboard stamp saves the selected size');
  const scaledImage=await canvasImage(page);await page.reload();await enterGame(page,'start');await page.waitForSelector('.illustration-viewport[data-status=ready]');
  assert.equal(await page.inputValue('#stamp-size'),'175');assert.equal(await canvasImage(page),scaledImage,'all saved sizes survive reload');
  await rotate(page,17);assert.equal(await page.locator('.turn-label').innerText(),'255°');await rotate(page,7);assert.equal(await page.locator('.turn-label').innerText(),'0°');
  assert.equal(await canvasImage(page),scaledImage,'a full turn preserves the size and position of each stamp');
  await page.click('[data-action=undo]');assert.equal(await canvasImage(page),smallImage,'undo removes only the most recent sized stamp');
  const sizeBounds=await page.locator('.stamp-size-control').boundingBox();assert.ok(sizeBounds.x>=0&&sizeBounds.y>=0&&sizeBounds.x+sizeBounds.width<=viewport.width&&sizeBounds.y+sizeBounds.height<=viewport.height,'stamp size control remains readable on screen');
  // Three motifs of two kinds: one more is needed before the colour slip.
  await seed(page,draft({placements:[{uv:[.5,.55],surfaceAngle:0,pattern:'cloud'},{uv:[.68,.38],surfaceAngle:.7,pattern:'lotus'},{uv:[.5,.55],surfaceAngle:Math.PI,pattern:'cloud'}]}));
  assert.equal(await page.locator('[data-action=inlay-fill]').isDisabled(),true);assert.equal((await page.locator('.motif-check').innerText()).replace(/\s+/g,' '),'무늬 3/4개 종류 2/2가지');
  await seed(page,draft({placements:[{uv:[.5,.55],surfaceAngle:0,pattern:'cloud'},{uv:[.68,.38],surfaceAngle:.7,pattern:'lotus'},{uv:[.5,.55],surfaceAngle:Math.PI,pattern:'cloud'},{uv:[.32,.38],surfaceAngle:-.7,pattern:'lotus'}]}));
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
  const guidePixels=await page.locator('.inlay-canvas').evaluate(canvas=>{const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let painted=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])painted++;return painted;});
  assert.equal(guidePixels,0,'no artificial dots puncture white inlay while the brush is away');
  assert.equal(await page.locator('[data-action=next-decor]').isDisabled(),true);assert.equal(await page.locator('[data-slip=white]').isDisabled(),true);
  await sweep(page,'wipe');assert.equal((await saved(page)).inlay.wipeDone,false);await rotate(page,12);await sweep(page,'wipe');
  const finished=await saved(page);assert.equal(finished.inlay.wipeDone,true);assert.equal(finished.decorDone,true);assert.equal(finished.decorPhase,2);assert.equal(await page.locator('[data-action=next-decor]').isDisabled(),false);
  await page.screenshot({path:`/tmp/inlay-integrated-wiped-${viewport.width}.png`});await page.click('[data-action=next-decor]');assert.equal((await saved(page)).step,2);assert.ok(await page.locator('.kiln-scene').count());
  await seed(page,{...finished,step:2,firing:['dry','biscuit','glaze','fire'],viewFrame:0});await page.waitForTimeout(200);const dark=await pixels(page);
  assert.equal(finished.clay.slip,'dark');assert.deepEqual([...finished.inlay.dark].sort(),finished.inlay.targets.map(target=>target.key).sort(),'every place of a dark work is recorded as dark');
  await seed(page,{...finished,step:2,firing:['dry','biscuit','glaze','fire'],viewFrame:0,clay:{...finished.clay,slip:'white'},inlay:{...finished.inlay,slip:'white',dark:[]}});await page.waitForTimeout(200);const white=await pixels(page);
  assert.ok(white.bright>dark.bright+100,'white slip remains light after firing');assert.ok(dark.dark>white.dark+100,'dark slip remains dark after firing');
  // Works saved before the two colours could be mixed have no per-place colours and keep their single colour.
  const {dark:omitted,...legacyInlay}=finished.inlay;
  await seed(page,{...finished,step:2,firing:['dry','biscuit','glaze','fire'],viewFrame:0,inlay:legacyInlay});await page.waitForTimeout(200);const legacyDark=await pixels(page);
  assert.ok(legacyDark.dark>white.dark+100,'an older dark work still fires dark');
  await seed(page,{...finished,step:2,firing:['dry','biscuit','glaze','fire'],viewFrame:0,clay:{...finished.clay,slip:'white'},inlay:{...legacyInlay,slip:'white'}});await page.waitForTimeout(200);const legacyWhite=await pixels(page);
  assert.ok(legacyWhite.bright>dark.bright+100,'an older white work still fires light');
  await seed(page,draft({technique:'openwork'}));const before=await pixel(page);const spot=await point(page,.5,.55);await page.mouse.click(spot.x,spot.y);await page.waitForTimeout(220);const inside=await pixel(page);assert.ok(inside[3]>240&&inside[0]<before[0]-10);
  await rotate(page,12);assert.ok((await pixel(page))[0]>inside[0]+10);const far=await point(page,.5,.55);await page.mouse.click(far.x,far.y);await page.waitForTimeout(220);assert.ok((await pixel(page))[3]<20,'both walls must be cut before background shows');
  const layout=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollX:document.documentElement.scrollWidth,scrollY:document.documentElement.scrollHeight}));assert.ok(layout.scrollX<=layout.width&&layout.scrollY<=layout.height);assert.deepEqual(errors,[]);
  console.log(`Decoration ${viewport.width}×${viewport.height}: stamp size preview/persistence/rotation/undo, angle-only label, clean inlay, curved openwork, pointer fill/wipe and fired slip colors passed`);await page.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
