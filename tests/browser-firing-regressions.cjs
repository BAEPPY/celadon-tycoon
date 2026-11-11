/* Real keyboard/pointer regression: continuous fan, pause focus, cooling progress. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {build}=require('esbuild');
const {chromium}=require('playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:4173';
(async()=>{
 const code=await build({entryPoints:[path.join(__dirname,'../kiln-game.js')],bundle:true,write:false,format:'iife',globalName:'KilnTest'});
 const css=(await Promise.all(['style.css','arcade.css','stations.css','kiln-workshop.css','mobile-game.css'].map(name=>fs.readFile(path.join(__dirname,'..',name),'utf8')))).join('\n');
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const viewport of [{width:1366,height:768},{width:1024,height:600},{width:390,height:844}]){
   const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.setContent(`<html lang="ko"><head><base href="${base}/"></head><body><main id="host"></main></body></html>`);
   await page.addStyleTag({content:css+'\nbody{margin:0;background:#ead0ac}#host{position:relative;width:100vw;height:100vh}'});
   await page.addScriptTag({content:code.outputFiles[0].text});
   for(const kind of ['biscuit','fire']){
    await page.evaluate(kind=>{window.game?.dispose();window.game=new KilnTest.KilnGame(document.querySelector('#host'),kind);cancelAnimationFrame(game.frame);},kind);
    await page.waitForFunction(()=>[...document.querySelectorAll('.kiln-fanning-scene img')].every(i=>i.complete&&i.naturalWidth>0));
    const pause=page.locator('[data-mini=pause]'),button=page.locator('.bellows-button');
    const taps=()=>page.evaluate(()=>game.fanTaps);
    await page.keyboard.press('Space');assert.equal(await taps(),1);
    await page.evaluate(()=>game.update(.14));
    const phase=await page.evaluate(()=>game.fanPhase),transform=await page.locator('.kiln-fanning-hand').evaluate(el=>el.style.transform);
    await page.keyboard.press('Space');assert.equal(await taps(),2);
    assert.equal(await page.evaluate(()=>game.fanPhase),phase,'tap does not restart a moving fan');
    assert.equal(await page.locator('.kiln-fanning-hand').evaluate(el=>el.style.transform),transform,'no tap-time pose snap');
    await pause.click();assert.equal(await page.evaluate(()=>game.paused),true);
    assert.equal(await page.evaluate(()=>game.fanPhase),phase,'pausing freezes the current pose');
    await pause.click();assert.equal(await page.evaluate(()=>document.activeElement===game.button),true,'mouse resume returns keyboard focus to bellows');
    const before=await taps();await page.keyboard.press('Space');assert.equal(await taps(),before+1);assert.equal(await page.evaluate(()=>game.paused),false);
    await pause.click();await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>game.paused),false,'Space on Continue resumes');
    const resumed=await taps();await page.keyboard.press('Space');assert.equal(await taps(),resumed+1,'next Space fans instead of pausing again');
    await page.keyboard.down('Space');const once=await taps();await page.keyboard.down('Space');assert.equal(await taps(),once,'key repeat is still one impulse');await page.keyboard.up('Space');
    await page.evaluate(()=>{game.kiln={...game.kiln,heat:.55,steady:2,overheat:0,failed:false,complete:false};game.fanPhase=.25;game.fanQueued=false;game.updateFanning();});
    await page.screenshot({path:`/tmp/firing-fixed-${kind}-${viewport.width}.png`});
    const body=await page.locator('.kiln-fanning-body').boundingBox();
    const angles=await page.evaluate(()=>{const angles=[];for(let i=0;i<80;i++){game.updateFanning(.01);angles.push(parseFloat(game.fanHand.style.transform.match(/[-\d.]+/)[0]));}return angles;});
    assert.ok(angles.every((a,i)=>!i||Math.abs(a-angles[i-1])<2.3),'smooth fan return without frame jumps');
    assert.equal(angles.at(-1),0,'fan finishes at its original rest pose');
    assert.deepEqual(await page.locator('.kiln-fanning-body').boundingBox(),body,'fixed child stays in the same box');
    assert.equal(await page.locator('.kiln-fanning-body').evaluate(el=>getComputedStyle(el).transform),'none');
    await page.evaluate(()=>{for(let i=0;i<50;i++)game.update(.1);});
    assert.equal(await page.evaluate(()=>game.kiln.steady),0,'stopping fanning drains accumulated progress to zero');
    assert.equal(await page.locator('.mini-progress-track').getAttribute('aria-valuenow'),'0');
    assert.equal(await page.evaluate(()=>scrollY),0,'Space does not scroll the screen');
    await page.locator('[data-mini=cancel]').click();assert.equal(await page.locator('.kiln-minigame').count(),0);
   }
   assert.deepEqual(errors,[]);console.log(`Firing regressions ${viewport.width}: tap continuity, pause/resume focus, rigid fan, progress reset passed`);await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
