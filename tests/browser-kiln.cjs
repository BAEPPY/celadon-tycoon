/* Isolated authored-surface gestures and discrete kiln taps. No player saves. */
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
   await page.setContent('<html lang="ko"><head><base href="'+base+'/"></head><body><div id="host"><aside class="station-info" id="dock"></aside><div id="bench" inert><canvas id="original" width="720" height="460" tabindex="-1"></canvas></div></div></body></html>');
   await page.addStyleTag({content:css+'\nhtml,body{margin:0}#host{position:relative;width:100vw;height:100vh;background:#ead0ac}#dock{position:absolute;left:18px;top:82px;width:225px;padding:18px;box-sizing:border-box}#bench{position:absolute;left:275px;right:25px;top:80px;height:calc(100vh - 145px);background:#d8b38a}#original{display:block;width:100%;height:100%}'});
   await page.addScriptTag({content:code.outputFiles[0].text});
   await page.evaluate(()=>{
    window.makeSurface=type=>{
     const wide=type==='wide',width=wide?420:160,height=wide?160:420,make=()=>Object.assign(document.createElement('canvas'),{width,height});
     const image=make(),mask=make(),glazedImage=make();
     for(const [canvas,color] of [[image,'#ba8f64'],[mask,'#fff'],[glazedImage,'#6ca593']]){
      const c=canvas.getContext('2d');c.fillStyle=color;c.fillRect(0,0,width,height);
      if(canvas===mask)c.clearRect(width*.4,height*.4,width*.2,height*.2);
      else {c.fillStyle='#fff3d4';c.fillRect(width*.15,height*.12,width*.7,height*.09);c.fillStyle='#253f78';c.beginPath();c.arc(width*.25,height*.72,Math.min(width,height)*.08,0,Math.PI*2);c.fill();}
     }
     window.currentPlacement=wide?{x:.14,y:.35,width:.72,height:.3}:{x:.35,y:.12,width:.3,height:.76};
     return {image,mask,glazedImage,placement:()=>({...window.currentPlacement})};
    };
    window.mountKiln=(kind,type='wide')=>{
     window.game?.dispose();window.calls={complete:0,cancel:0,glaze:[]};const surface=window.makeSurface(type),original=document.querySelector('#original'),c=original.getContext('2d'),p=surface.placement();
     c.clearRect(0,0,720,460);c.drawImage(surface.image,p.x*720,p.y*460,p.width*720,p.height*460);window.originalBefore=original.toDataURL();window.sourceBefore=surface.image.toDataURL();window.surface=surface;
     window.game=new KilnTest.KilnGame(document.querySelector('#host'),kind,{workSurface:surface,workbench:document.querySelector('#bench'),controlsHost:document.querySelector('#dock'),onComplete:()=>window.calls.complete++,onCancel:()=>window.calls.cancel++,onGlaze:v=>window.calls.glaze.push(v)});
    };
   });
   const mount=(kind,type)=>page.evaluate(([kind,type])=>window.mountKiln(kind,type),[kind,type]);
   const coverage=()=>page.locator('.minigame-overlay').getAttribute('data-progress').then(Number);
   const bounds=()=>page.locator('.kiln-gesture-canvas').getAttribute('data-surface-bounds').then(JSON.parse);
   const sweep=async(y,x1=.02,x2=.98)=>{const canvas=page.locator('.kiln-gesture-canvas');if(await page.locator('.kiln-minigame.dry').count())return require('./drying-gesture.cjs').dryingSweep(page,canvas,y,x1,x2);const b=await canvas.boundingBox();await page.mouse.move(b.x+b.width*x1,b.y+b.height*y);await page.mouse.down();await page.mouse.move(b.x+b.width*x2,b.y+b.height*y,{steps:14});await page.mouse.up();};
   const fit=async()=>assert.deepEqual(await page.locator('.minigame-card').evaluate(el=>{const r=el.getBoundingClientRect();return[r.left>=0,r.top>=0,r.right<=innerWidth+1,r.bottom<=innerHeight+1,el.scrollHeight<=el.clientHeight+1];}),[true,true,true,true,true]);
   const unchanged=async()=>assert.equal(await page.evaluate(()=>document.querySelector('#original').toDataURL()===window.originalBefore&&window.surface.image.toDataURL()===window.sourceBefore),true,'original workbench and supplied decorated surface stay unchanged');
   await mount('dry','wide');await fit();
   assert.equal(await page.locator('.kiln-gesture-dock').count(),1);assert.equal(await page.locator('.gesture-stage').count(),0,'inline drying has no detached workpiece stage');
   const originalRect=await page.locator('#original').boundingBox(),gestureRect=await page.locator('.kiln-gesture-canvas').boundingBox();assert.deepEqual(gestureRect,originalRect,'gesture canvas covers the original canvas exactly');
   assert.equal(await page.locator('#bench').evaluate(el=>el.inert),false);
   await page.keyboard.press('Space');await page.waitForTimeout(100);assert.equal(await coverage(),0,'Space alone does not dry the work');
   let b=await bounds();await page.locator('[data-mini=pause]').click();await sweep(b.y+b.height/6);assert.equal(await coverage(),0,'paused gestures do not score');await page.locator('[data-mini=pause]').click();
   await sweep(b.y+b.height/6);const zones=JSON.parse(await page.locator('.kiln-gesture-canvas').getAttribute('data-zone-progress'));assert.ok(zones[0]>0&&zones[0]>zones[1]&&zones[2]===0,'visible fan contact mainly dries the selected region of a wide vessel');
   await page.waitForFunction(()=>window.game.dryFanFrames.every(image=>image.complete&&image.naturalWidth>0));await page.evaluate(()=>{window.game.cursor=[.01,.01];window.game.drawGesture();});assert.equal(await page.locator('.kiln-gesture-canvas').evaluate(el=>{const b=JSON.parse(el.dataset.toolBounds),r=el.getBoundingClientRect();return b.x>=7.9&&b.y>=7.9&&b.x+b.width<=r.width-7.9&&b.y+b.height<=r.height-7.9;}),true,'fan artwork stays inside the workbench at its upper edge');await page.screenshot({path:'/tmp/kiln-fixture-dry-'+viewport.width+'.png'});await unchanged();
   for(let pass=0;pass<8&&!await page.evaluate(()=>game.finished);pass++)for(const fraction of [1/6,.5,5/6]){if(await page.evaluate(()=>game.finished))break;await sweep(b.y+b.height*fraction);}await page.waitForFunction(()=>window.calls.complete===1);assert.equal(await page.locator('#bench').evaluate(el=>el.inert),true,'completion restores inert workbench');assert.equal(await page.locator('.kiln-inplace-canvas').count(),0);
   for(const shape of ['wide','tall']){
    await mount('glaze',shape);await fit();b=await bounds();
    assert.equal(await page.locator('.kiln-gesture-canvas').getAttribute('data-work-surface'),'authored');assert.ok(shape==='wide'?b.width>b.height:b.height>b.width);
    const cells=JSON.parse(await page.locator('.kiln-gesture-canvas').getAttribute('data-paint-cells'));
    assert.ok(cells.length>100);assert.equal(cells.some(([x,y])=>x>b.x+b.width*.4&&x<b.x+b.width*.6&&y>b.y+b.height*.4&&y<b.y+b.height*.6),false,'openwork hole is excluded from paint targets');
    await sweep(.01,.01,.06);assert.equal(await coverage(),0,'empty workbench space does not count as ceramic');assert.equal(await page.locator('.kiln-gesture-canvas').evaluate(el=>{const b=JSON.parse(el.dataset.toolBounds),r=el.getBoundingClientRect();return b.x>=7.9&&b.y>=7.9&&b.x+b.width<=r.width-7.9&&b.y+b.height<=r.height-7.9;}),true,'brush artwork also stays within the workbench at its edge');
    await sweep(b.y+b.height*.2);assert.ok(await coverage()>0&&await coverage()<.9);
    const before=await coverage();await page.locator('[data-mini=pause]').click();await sweep(b.y+b.height*.7);assert.equal(await coverage(),before);await page.locator('[data-mini=pause]').click();
    await unchanged();
    // The exposed glazed image keeps the student's cream-colored decoration rather than replacing it with flat paint.
    const motif=await page.evaluate(()=>{const p=window.currentPlacement,x=Math.floor((p.x+p.width*.5)*720),y=Math.floor((p.y+p.height*.16)*460);return [...window.game.surfaceOverlay.getContext('2d').getImageData(x,y,1,1).data];});
    assert.ok(motif[0]>210&&motif[1]>190&&motif[2]>150&&motif[3]>0,'painted decoration remains visible');
    await page.screenshot({path:'/tmp/kiln-fixture-glaze-'+shape+'-'+viewport.width+'.png'});
    if(shape==='wide'){
     await page.evaluate(()=>{window.currentPlacement={x:.2,y:.28,width:.6,height:.34};window.game.drawGesture();});
     const moved=await bounds();assert.ok(Math.abs(moved.x-.2)<.001);assert.equal(await coverage(),before,'moving the view does not reset coverage');
     b=moved;
     assert.ok(await page.evaluate(()=>{const p=window.currentPlacement;return window.game.surfaceOverlay.getContext('2d').getImageData(Math.floor((p.x+p.width*.5)*720),Math.floor((p.y+p.height*.16)*460),1,1).data[3]>0;}),'resizing keeps the previously glazed stripe visible');
    }
    for(const f of [.15,.35,.55,.75,.95]){if(await page.locator('.mini-won').count())break;await sweep(b.y+b.height*f);}
    await page.waitForFunction(()=>window.calls.complete===1);assert.equal(await page.evaluate(()=>window.calls.glaze.at(-1)),1);assert.equal(await page.evaluate(()=>{const p=window.currentPlacement;return window.game.surfaceOverlay.getContext('2d').getImageData(Math.floor((p.x+p.width*.5)*720),Math.floor((p.y+p.height*.5)*460),1,1).data[3];}),0,'glaze stays transparent through the authored openwork hole');await unchanged();
   }
   // Keyboard operation acts on the currently shown shape and remains available without dragging.
   await mount('dry','tall');const keyboardCanvas=page.locator('.kiln-gesture-canvas');await keyboardCanvas.focus();await page.keyboard.press('ArrowLeft'); // Aim at solid clay beside the authored central cutout.
   b=await bounds();for(let zone=0;zone<3;zone++){const y=await require('./drying-gesture.cjs').dryingHandleY(keyboardCanvas,b.y+b.height*(zone+.5)/3);for(let move=0;move<14;move++){const cursor=await page.evaluate(()=>game.cursor[1]);if(Math.abs(cursor-y)<.038)break;await page.keyboard.press(cursor<y?'ArrowDown':'ArrowUp');}for(let i=0;i<8&&!await page.evaluate(zone=>game.dryZones[zone]>=1,zone);i++)await page.keyboard.press('Enter');}await page.waitForFunction(()=>window.calls.complete===1);
   await mount('glaze','wide');await page.locator('.kiln-gesture-canvas').focus();await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');assert.ok(await coverage()>0,'keyboard brush paints the actual vessel');await page.locator('[data-mini=cancel]').click();assert.equal(await page.evaluate(()=>window.calls.cancel),1);assert.equal(await page.locator('.kiln-inplace-canvas').count(),0);assert.equal(await page.locator('#bench').evaluate(el=>el.inert),true);
   for(const kind of ['biscuit','fire']){
    await mount(kind);await fit();assert.equal(await page.locator('.kiln-fanning-body').count(),1);assert.equal(await page.locator('.kiln-fanning-hand').count(),1);assert.equal(await page.locator('.kiln-static-scene').count(),1);
    if(!process.env.SKIP_KILN_ART_CHECK)await page.waitForFunction(()=>[...document.querySelectorAll('.kiln-fanning-scene img')].every(image=>image.complete&&image.naturalWidth>0));
    const safe=await page.locator('.safe-zone').evaluate(el=>({left:el.style.left,width:parseFloat(el.style.width)}));assert.equal(safe.left,'46%');assert.ok(Math.abs(safe.width-18)<.001);
    await page.locator('[data-mini=pause]').focus();await page.keyboard.press('Space');assert.equal(await page.locator('.paused').count(),1,'Space activates focused pause button');const paused=await coverage();await page.locator('.bellows-button').focus();await page.keyboard.press('Space');assert.equal(await coverage(),paused);await page.locator('[data-mini=pause]').focus();await page.keyboard.press('Space');assert.equal(await page.locator('.paused').count(),0,'Space activates continue button');
    await page.locator('.bellows-button').focus();await page.keyboard.down('Space');await page.waitForTimeout(100);const tapCount=Number(await page.locator('.minigame-overlay').getAttribute('data-fan-taps'));await page.keyboard.down('Space');await page.waitForTimeout(250);assert.equal(Number(await page.locator('.minigame-overlay').getAttribute('data-fan-taps')),tapCount,'auto-repeat is not another fan stroke');await page.keyboard.up('Space');
    assert.ok(Number(await page.locator('.minigame-overlay').getAttribute('data-value'))<.6,'holding does not continuously raise heat');
    await page.screenshot({path:'/tmp/kiln-fanning-'+kind+'-'+viewport.width+'.png'});
    await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await page.locator('.paused').count(),1);await page.locator('[data-mini=pause]').click();
    await page.locator('.bellows-button').click();const afterPointer=Number(await page.locator('.minigame-overlay').getAttribute('data-fan-taps'));assert.ok(afterPointer>tapCount,'pointer press gives the same discrete impulse');
    for(let i=0;i<180;i++){if(await page.evaluate(()=>window.calls.complete===1))break;const state=await page.locator('.minigame-overlay').evaluate(el=>({heat:Number(el.dataset.value),won:el.classList.contains('mini-won')}));if(state.won){await page.waitForFunction(()=>window.calls.complete===1);break;}if(state.heat<.52)await page.locator('.bellows-button').press('Space');await page.waitForTimeout(60);}
    assert.equal(await page.evaluate(()=>window.calls.complete),1,'fair repeated taps complete the firing once');
   }
   await mount('fire');await page.locator('.bellows-button').focus();await page.keyboard.down('Space');await page.waitForFunction(()=>window.game.kiln.failed,{},{timeout:7000});assert.equal(await page.evaluate(()=>window.calls.complete),0,'one long hold cannot win');await page.keyboard.up('Space');await page.locator('.bellows-button').press('Space');assert.equal(await page.evaluate(()=>window.game.kiln.failed),false,'a new tap retries after failure');await page.locator('[data-mini=cancel]').focus();await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>window.calls.cancel),1);assert.equal(await page.locator('.minigame-overlay').count(),0);assert.deepEqual(errors,[]);
   console.log('Kiln '+viewport.width+'×'+viewport.height+': inline authored shapes/motifs/holes, controls, pause, keyboard, tap heat, retry and disposal passed');await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
