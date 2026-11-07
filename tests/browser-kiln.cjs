/* Isolated gesture and kiln controls. Does not touch player saves. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {build}=require('esbuild');
const {chromium}=require('playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:4173';
(async()=>{
 const code=await build({entryPoints:[path.join(__dirname,'../kiln-game.js')],bundle:true,write:false,format:'iife',globalName:'KilnTest'});
 const css=(await Promise.all(['style.css','arcade.css','stations.css','kiln-workshop.css'].map(name=>fs.readFile(path.join(__dirname,'..',name),'utf8')))).join('\n');
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try{
  for(const viewport of [{width:1366,height:768},{width:1024,height:600}]){
   const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.setContent(`<html lang="ko"><head><base href="${base}/"></head><body><div id="host"></div></body></html>`);
   await page.addStyleTag({content:css});await page.addScriptTag({content:code.outputFiles[0].text});
   const mount=async kind=>{await page.evaluate(kind=>{window.game?.dispose();window.calls={complete:0,cancel:0,glaze:[]};window.game=new KilnTest.KilnGame(document.querySelector('#host'),kind,{onComplete:()=>window.calls.complete++,onCancel:()=>window.calls.cancel++,onGlaze:v=>window.calls.glaze.push(v)});},kind);};
   const coverage=()=>page.locator('.minigame-overlay').getAttribute('data-progress').then(Number);
   const sweep=async(y,x1=.12,x2=.88)=>{const b=await page.locator('.kiln-gesture-canvas').boundingBox();await page.mouse.move(b.x+b.width*x1,b.y+b.height*y);await page.mouse.down();await page.mouse.move(b.x+b.width*x2,b.y+b.height*y,{steps:12});await page.mouse.up();};
   const fit=async()=>assert.deepEqual(await page.locator('.minigame-card').evaluate(el=>{const r=el.getBoundingClientRect();return[r.left>=0,r.top>=0,r.right<=innerWidth,r.bottom<=innerHeight,el.scrollHeight<=el.clientHeight+1];}),[true,true,true,true,true]);
   await mount('dry');await fit();await page.keyboard.press('Space');await page.waitForTimeout(100);assert.equal(await coverage(),0,'Space and idle must not dry the pot');
   await page.click('[data-mini=pause]');await sweep(.27);assert.equal(await coverage(),0,'paused gestures cannot score');await page.click('[data-mini=pause]');
   await sweep(.27);const zones=JSON.parse(await page.locator('canvas').getAttribute('data-zone-progress'));assert.ok(zones[0]>=1&&zones[1]===0&&zones[2]===0,'fan must visit each damp region');
   await page.screenshot({path:`/tmp/kiln-dry-${viewport.width}.png`});await sweep(.52);await sweep(.77);await page.waitForFunction(()=>window.calls.complete===1);await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>window.calls.complete),1);
   await mount('glaze');await fit();await page.keyboard.down('Space');await page.waitForTimeout(120);await page.keyboard.up('Space');assert.equal(await coverage(),0,'glaze requires brush movement');
   const cells=JSON.parse(await page.locator('canvas').getAttribute('data-paint-cells'));assert.ok(cells.length>50&&cells.length<200,'painting mask follows ceramic silhouette');
   await sweep(.25,.05,.15);assert.equal(await coverage(),0,'painting outside ceramic must not count');
   await sweep(.25,.24,.76);assert.ok(await coverage()>0&&await coverage()<.9);await page.screenshot({path:`/tmp/kiln-glaze-${viewport.width}.png`});
   await page.click('[data-mini=pause]');const frozen=await coverage();await sweep(.5,.24,.76);assert.equal(await coverage(),frozen);await page.click('[data-mini=pause]');
   for(const y of [.12,.38,.51,.64,.77,.9]){if(await page.locator('.mini-won').count())break;await sweep(y,.24,.76);}
   await page.waitForFunction(()=>window.calls.complete===1);assert.equal(await page.evaluate(()=>window.calls.glaze.at(-1)),1,'finished glazing reports full glaze');
   // Keyboard alternatives use arrows and Enter, without repeated Space.
   await mount('dry');await page.locator('canvas').focus();for(let i=0;i<3;i++)await page.keyboard.press('ArrowUp');for(let i=0;i<3;i++)await page.keyboard.press('Enter');for(let i=0;i<3;i++)await page.keyboard.press('ArrowDown');for(let i=0;i<3;i++)await page.keyboard.press('Enter');for(let i=0;i<4;i++)await page.keyboard.press('ArrowDown');for(let i=0;i<3;i++)await page.keyboard.press('Enter');await page.waitForFunction(()=>window.calls.complete===1);
   for(const kind of ['biscuit','fire']){await mount(kind);await fit();await page.screenshot({path:`/tmp/kiln-${kind}-${viewport.width}.png`});await page.click('[data-mini=pause]');const paused=await coverage();await page.keyboard.down('Space');await page.waitForTimeout(150);await page.keyboard.up('Space');assert.equal(await coverage(),paused);await page.click('[data-mini=pause]');let held=false;for(let i=0;i<250;i++){if(await page.evaluate(()=>window.calls.complete===1))break;const state=await page.locator('.minigame-overlay').evaluate(el=>({heat:Number(el.dataset.value),won:el.classList.contains('mini-won')}));if(state.won){await page.waitForFunction(()=>window.calls.complete===1);break;}const next=state.heat<.52;if(next!==held){held=next;await page.keyboard[held?'down':'up']('Space');}await page.waitForTimeout(60);}await page.keyboard.up('Space');assert.equal(await page.evaluate(()=>window.calls.complete),1);}
   await mount('glaze');await page.click('[data-mini=cancel]');assert.equal(await page.evaluate(()=>window.calls.cancel),1);assert.equal(await page.locator('.minigame-overlay').count(),0);assert.deepEqual(errors,[]);
   console.log(`Kiln ${viewport.width}×${viewport.height}: fan, brush coverage, pause, keyboard, heat controls, layout passed`);await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
