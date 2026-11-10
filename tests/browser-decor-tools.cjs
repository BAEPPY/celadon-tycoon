/* Decoration helpers in the game: 크게 보기 (the vessel fills the station), white and dark slip used together,
   repainting a place with the other colour, and 색흙 다시 채우기. Run after npm run build + npm start. */
const {enterGame}=require('./game-entry.cjs');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');

const KEY='celadon-tycoon-v2',base=process.env.BASE_URL||'http://127.0.0.1:4173';
const draft=(extra={})=>({id:'decor-tools',orderId:'royal-rest',shape:'pillow',modelId:'pillow',step:1,knead:3,width:1,technique:'inlay',pattern:'crane',
  placements:[],strokes:[],decorPhase:0,decorDone:false,firing:[],...extra});
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).draft,KEY);
const surfacePoint=(page,u,v)=>page.locator('.illustration-viewport>canvas').first().evaluate((canvas,{u,v})=>{
  const r=canvas.getBoundingClientRect(),box=JSON.parse(canvas.parentElement.dataset.objectBox);
  return {x:r.x+(box[0]+u*box[2])*r.width,y:r.y+(box[1]+v*box[3])*r.height};
},{u,v});
// Brush back and forth over one part of the vessel (u0..u1 across, the whole height).
async function brush(page,u0,u1){
  const from=await surfacePoint(page,u0,.2),to=await surfacePoint(page,u1,.92);
  for(let row=0;row<13;row++){
    const y=from.y+(to.y-from.y)*row/12,x0=row%2?to.x:from.x,x1=row%2?from.x:to.x;
    await page.mouse.move(x0,y);await page.mouse.down();await page.mouse.move(x1,y,{steps:10});await page.mouse.up();
  }
  await page.waitForTimeout(150);
}
// Slip colours on the vessel: cream for white slip, near black for dark slip (the clay itself is brown).
const slipPixels=page=>page.locator('.illustration-viewport>canvas').first().evaluate(canvas=>{
  const box=JSON.parse(canvas.parentElement.dataset.objectBox),x=Math.floor(box[0]*canvas.width),y=Math.floor(box[1]*canvas.height);
  const data=canvas.getContext('2d').getImageData(x,y,Math.floor(box[2]*canvas.width),Math.floor(box[3]*canvas.height)).data;let light=0,dark=0;
  for(let i=0;i<data.length;i+=4){if(data[i+3]<200)continue;const [r,g,b]=[data[i],data[i+1],data[i+2]];if(r>235&&g>220&&b>185)light++;else if(r<75&&g<70&&b<75)dark++;}
  return {light,dark};
});
const reachable=(page,selector)=>page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
  return r.width>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&(hit===el||el.contains(hit));});

(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
  try{
    const page=await browser.newPage({viewport:{width:1366,height:768},reducedMotion:'reduce'});page.setDefaultTimeout(60000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const seed=async work=>{await page.evaluate(({key,work})=>localStorage.setItem(key,JSON.stringify({history:[],gallery:[],draft:work})),{key:KEY,work});
      await page.reload();await enterGame(page,'start');await page.waitForSelector('.illustration-viewport[data-status=ready]');};
    await page.goto(new URL('/game',base).href);await seed(draft());
    const frameHeight=()=>page.locator('.illustration-viewport').evaluate(el=>JSON.parse(el.dataset.objectBox)[3]*el.getBoundingClientRect().height);

    // 크게 보기: the vessel grows to fill the station, stamping lands on it, and the choice trays come back afterwards.
    for(const [width,height] of [[1024,600],[1366,768]]){
      await page.setViewportSize({width,height});await page.waitForTimeout(250);
      assert.ok(await reachable(page,'[data-action=toggle-zoom]'),`크게 보기 is reachable at ${width}×${height}`);
      const before=await frameHeight();
      await page.click('[data-action=toggle-zoom]');
      await page.waitForSelector('.station-scene.is-zoomed .illustration-viewport[data-zoom="1.18"][data-status=ready]');await page.waitForTimeout(250);
      assert.ok(await frameHeight()>=before*1.3,`the vessel is clearly larger at ${width}×${height}`);
      assert.equal(await page.locator('.station-rack').evaluate(el=>getComputedStyle(el).visibility),'hidden');
      for(const selector of ['[data-action=toggle-zoom]','[data-tool=stamp]','[data-action=undo]','.station-nav .small-button','#stamp-size'])assert.ok(await reachable(page,selector),`${selector} stays usable while zoomed at ${width}×${height}`);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight),true);
      if(width===1366){
        const spot=await surfacePoint(page,.3,.6);await page.mouse.click(spot.x,spot.y);
        await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).draft.placements.length===1,KEY);
      }
      await page.click('[data-action=toggle-zoom]');
      await page.waitForSelector('.station-scene:not(.is-zoomed) .illustration-viewport[data-zoom="1"][data-status=ready]');
      assert.equal(await page.locator('.station-rack').evaluate(el=>getComputedStyle(el).visibility),'visible');
    }
    assert.equal((await saved(page)).placements.length,1,'the stamp made while zoomed stays in place');
    assert.equal('zoom' in await saved(page),false,'zoom is a view setting, not part of the work');
    const second=await surfacePoint(page,.7,.6);await page.mouse.click(second.x,second.y);
    await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).draft.placements.length===2,KEY);

    // Two colours together: white on the left motif, dark on the right one.
    await page.click('[data-action=inlay-fill]');await page.waitForSelector('.inlay-canvas[data-mode=fill]');
    assert.equal(await page.locator('[data-action=inlay-refill]').isDisabled(),true,'nothing to redo yet');
    const bare=await slipPixels(page);
    assert.equal(await page.locator('[data-slip=white]').getAttribute('aria-pressed'),'true');
    await brush(page,.12,.46);
    await page.click('[data-slip=dark]');await page.waitForSelector('.inlay-canvas[data-mode=fill]');
    assert.equal(await page.locator('[data-slip=dark]').getAttribute('aria-pressed'),'true');
    await brush(page,.54,.88);
    let work=await saved(page);
    assert.ok(work.inlay.dark.length>0&&work.inlay.dark.length<work.inlay.fill.length,'some places are dark and some are white');
    assert.equal(work.clay.slip,'mixed');
    let colours=await slipPixels(page);assert.ok(colours.light>bare.light+40&&colours.dark>bare.dark+40,`both slips show on the vessel: ${JSON.stringify({bare,colours})}`);

    // Brushing a filled place with the other colour changes it.
    const darkBefore=work.inlay.dark.length;
    await brush(page,.12,.46);
    work=await saved(page);assert.ok(work.inlay.dark.length>darkBefore,'the left motif turned dark');

    // 색흙 다시 채우기 lifts everything and keeps the colour on the brush.
    assert.equal(await page.locator('[data-action=inlay-refill]').isDisabled(),false);
    await page.click('[data-action=inlay-refill]');
    await page.waitForFunction(key=>{const draft=JSON.parse(localStorage.getItem(key)).draft;return draft.inlay.fill.length===0&&draft.inlay.dark.length===0;},KEY);
    work=await saved(page);assert.equal(work.inlay.fillDone,false);assert.equal(work.inlay.slip,'dark');assert.equal(work.placements.length,2,'the carved motifs stay');
    assert.match(await page.locator('.inlay-status').innerText(),/0% 채웠어요/);
    assert.equal(await page.locator('[data-action=inlay-refill]').isDisabled(),true);
    colours=await slipPixels(page);assert.ok(Math.abs(colours.light-bare.light)<20&&Math.abs(colours.dark-bare.dark)<20,`no slip is left on the vessel: ${JSON.stringify({bare,colours})}`);

    // Fill everything (dark right, white left) while zoomed; the last unbrushed places follow their neighbours.
    await page.click('[data-action=toggle-zoom]');await page.waitForSelector('.station-scene.is-zoomed .inlay-canvas[data-mode=fill]');await page.waitForTimeout(300);
    // The colour choices and the redo tile stay within reach while the vessel is enlarged, on both screen sizes.
    for(const [width,height] of [[1024,600],[1366,768]]){
      await page.setViewportSize({width,height});await page.waitForTimeout(250);
      for(const selector of ['[data-slip=white]','[data-slip=dark]','[data-action=toggle-zoom]','[data-action=inlay-refill]','.station-nav .small-button','.station-nav .primary'])
        assert.ok(await reachable(page,selector),`${selector} stays usable while filling enlarged at ${width}×${height}`);
      assert.equal(await page.evaluate(()=>{const a=document.querySelector('[data-action=inlay-refill]').getBoundingClientRect(),b=document.querySelector('.station-nav .primary').getBoundingClientRect();return a.bottom<=b.top;}),true,'the redo tile sits above the next button');
    }
    await brush(page,.54,.88);
    await page.click('[data-slip=white]');await page.waitForSelector('.inlay-canvas[data-mode=fill]');
    await brush(page,.12,.46);
    await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).draft.inlay.fillDone===true,KEY);
    work=await saved(page);
    assert.equal(work.inlay.fill.length,work.inlay.targets.length);assert.equal(work.clay.slip,'mixed');
    assert.ok(work.inlay.dark.length>0&&work.inlay.dark.length<work.inlay.targets.length);
    assert.equal(await page.locator('[data-action=inlay-wipe]').isDisabled(),false);
    // Even after it is complete, a place can still be repainted before wiping.
    const afterFill=work.inlay.dark.length;
    await brush(page,.54,.88);
    work=await saved(page);assert.ok(work.inlay.dark.length<afterFill,'white slip replaced dark slip on the right motif');assert.equal(work.inlay.fillDone,true);
    await page.click('[data-slip=dark]');await page.waitForSelector('.inlay-canvas[data-mode=fill]');await brush(page,.54,.88);
    work=await saved(page);assert.equal(work.clay.slip,'mixed');

    // Wiping keeps both colours; the classroom copy of the design carries every cell's colour.
    await page.click('[data-action=inlay-wipe]');await page.waitForSelector('.inlay-canvas[data-mode=wipe]');
    assert.equal(await page.locator('[data-slip=white]').isDisabled(),true);assert.equal(await page.locator('[data-action=inlay-refill]').count(),0);
    await brush(page,.1,.9);
    await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).draft.decorDone===true,KEY);
    colours=await slipPixels(page);assert.ok(colours.light>40&&colours.dark>40,`both slips remain after wiping: ${JSON.stringify({bare,colours})}`);
    work=await saved(page);
    const root=pathToFileURL(path.resolve(__dirname,'..')+path.sep),{sanitizeWorkDesign}=await import(new URL('work-design.js',root));
    const design=sanitizeWorkDesign(work);
    assert.ok(design,'the mixed design is accepted for the classroom');assert.equal(design.clay.slip,'mixed');assert.deepEqual([...design.inlay.dark].sort(),[...new Set(work.inlay.dark)].sort());
    await page.click('[data-action=next-decor]');await page.waitForSelector('.kiln-scene');
    assert.equal(await page.locator('.illustration-viewport').getAttribute('data-zoom'),'1','the kiln shows the vessel at its usual size');
    assert.deepEqual(errors,[]);
    console.log('Decoration tools: 크게 보기 at two Chromebook sizes with stamping, two slips together, repainting, 색흙 다시 채우기, completion and wiping with both colours passed.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
