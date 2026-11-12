/* Real Chromium touch input. Full-page phone layout is covered separately. */
const assert=require('node:assert/strict');
const path=require('node:path');
const {build}=require('esbuild');
const {chromium}=require('playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:4219';

async function touchInput(page){
 const cdp=await page.context().newCDPSession(page);
 const send=async(type,points=[])=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(p=>({id:p.id??1,x:p.x,y:p.y,radiusX:7,radiusY:7,force:1}))});if(type==='touchEnd'||type==='touchCancel')await page.evaluate(()=>new Promise(requestAnimationFrame));};
 const tap=async p=>{await send('touchStart',[p]);await send('touchEnd');};
 const drag=async(a,b,steps=10)=>{await send('touchStart',[a]);for(let i=1;i<=steps;i++)await send('touchMove',[{x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps}]);await send('touchEnd');};
 return {send,tap,drag};
}
async function center(locator){await locator.scrollIntoViewIfNeeded();const b=await locator.boundingBox();return{x:b.x+b.width/2,y:b.y+b.height/2};}
async function onCanvas(page,selector,point){const b=await page.locator(selector).boundingBox();return{x:b.x+point[0]*b.width,y:b.y+point[1]*b.height};}

(async()=>{
 const bundle=await build({stdin:{resolveDir:path.resolve(__dirname,'..'),contents:`
  import {Craft2D} from './craft-2d.js';import {SculptGame} from './sculpt-game.js';
  import {ClayKneading,clayLumpSVG,freshClay} from './clay.js';
  import {InlayGame} from './inlay-game.js';import {KilnGame} from './kiln-game.js';
  const draft=()=>({shape:'stool',modelId:'stool',width:1,viewFrame:0,knead:0,step:0,tool:'stamp',technique:'inlay',pattern:'cloud',decorPhase:0,placements:[],strokes:[],clay:freshClay()});
  window.fixture={
   reset(){window.game?.dispose();window.craft?.dispose();window.game=null;window.craft=null;document.querySelector('#host').innerHTML='';document.querySelector('#controls').innerHTML='';document.querySelector('#kiln').innerHTML='';window.scrollTo(0,0);},
   clay(){this.reset();window.work=draft();const host=document.querySelector('#host');host.innerHTML='<div class="clay-scene"><div class="kneading-area"><button class="knead-pad">'+clayLumpSVG()+'</button></div></div>';window.game=new ClayKneading(host.querySelector('.knead-pad'),work,()=>{});},
   async craft(step=1){this.reset();window.work=draft();work.step=step;work.knead=step?3:0;work.clay={body:true,slip:'white',kneads:6,prepared:true};window.craft=new Craft2D(mark=>{work.placements.push(mark);craft.paint();},stroke=>{work.strokes.push(stroke);craft.paint();},error=>{throw error;});await craft.mount(document.querySelector('#host'),work,step?'carved':'clay');},
   async sculpt(){await this.craft(0);window.game=new SculptGame(craft,work,()=>{});},
   async inlay(mode='fill'){if(mode==='fill'){await this.craft(1);work.decorPhase=1;work.placements=[-.65,.65].map(surfaceAngle=>({uv:[.5,.5],surfaceAngle,surfaceV:.5,surfaceRadius:.25,pattern:'cloud',stampSize:1}));craft.paint();}else game.dispose();window.game=new InlayGame(craft,work,{mode});},
   async kiln(kind){await this.craft(2);work.decorPhase=2;work.placements=[{uv:[.5,.5],surfaceAngle:0,surfaceV:.5,surfaceRadius:.25,pattern:'cloud',stampSize:1}];craft.paint();window.completed=false;window.game=new KilnGame(document.querySelector('#kiln'),kind,{workSurface:craft.exportWorkSurface(),workbench:craft.el,controlsHost:document.querySelector('#controls'),onComplete:()=>{window.completed=true;}});}
  };
 `},bundle:true,write:false,format:'iife',target:'es2022'});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const viewport of process.env.TOUCH_ACTUAL_ONLY?[]:[{width:390,height:844},{width:844,height:390}]){
   const page=await browser.newPage({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:2,reducedMotion:'reduce'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/__touch-gestures',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${base}/"><style>
    *{box-sizing:border-box}body{margin:0;font:15px sans-serif;background:#efe3cf}#host{width:calc(100vw - 20px);height:calc(100dvh - 100px);max-height:540px;margin:10px;position:relative}.craft-viewport{position:relative;width:100%;height:100%}.craft-viewport>canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none}.sculpt-canvas,.inlay-canvas{z-index:2}.vessel-turns{position:absolute;bottom:0;z-index:4}.vessel-turns[hidden]{display:none}.vessel-turns button,button{min-width:44px;min-height:44px;font:inherit}.sculpt-key-hint{display:none}.sculpt-touch-controls{position:absolute;bottom:0;left:0;right:0;display:flex;justify-content:center;z-index:5}.sculpt-touch-controls[hidden]{display:none}.clay-scene,.kneading-area,.knead-pad{width:100%;height:100%}.knead-pad{touch-action:none}.knead-pad>svg{width:100%;height:100%}.minigame-overlay:not(.gesture-game){position:fixed;inset:4px;background:#fff5df;z-index:10}.minigame-card h2,.mini-instruction{font-size:14px;margin:3px}.kiln-fanning-scene{display:none}.bellows-button{height:58px;touch-action:none}.mini-controls{display:flex;gap:8px}#controls{margin:0 10px}.kiln-gesture-dock h2,.kiln-gesture-dock .mini-instruction,.gesture-keyboard{display:none}.kiln-gesture-dock .mini-status{margin:2px}.kiln-inplace-canvas{background:transparent;z-index:8;touch-action:none}.sculpt-success{position:absolute;z-index:9;pointer-events:none}#scroll-space{height:700px}
   </style></head><body><div id="host"></div><div id="controls"></div><div id="kiln"></div><div id="scroll-space"></div></body></html>`}));
   await page.goto(`${base}/__touch-gestures`);await page.addScriptTag({content:bundle.outputFiles[0].text});
   const touch=await touchInput(page);

   await page.evaluate(()=>fixture.clay());
   const clay=await center(page.locator('.knead-pad'));
   await touch.tap(clay);assert.equal(await page.evaluate(()=>work.clay.kneads),1);
   await touch.send('touchStart',[clay]);const clayPointer=await page.evaluate(()=>game.pointer.id);
   await touch.send('touchStart',[clay,{x:clay.x+30,y:clay.y+20,id:2}]);
   assert.equal(await page.evaluate(()=>game.pointer.id),clayPointer,'second finger does not take over kneading');
   assert.equal(await page.evaluate(()=>work.clay.kneads),2);
   await touch.send('touchCancel');assert.equal(await page.evaluate(()=>game.pointer),null);
   for(let i=0;i<4;i++)await touch.tap(clay);
   assert.equal(await page.evaluate(()=>work.clay.prepared),true,'six finger presses prepare clay');

   await page.evaluate(()=>fixture.sculpt());await page.waitForFunction(()=>game.points.length===40);
   const start=await page.evaluate(()=>game.points[0]),goal=await page.evaluate(()=>game.guide[0]);
   await touch.drag(await onCanvas(page,'.sculpt-canvas',start),await onCanvas(page,'.sculpt-canvas',goal));
   assert.ok(await page.evaluate(()=>work.sculpt.fraction>0&&!work.sculpt.complete),'one finger pull changes actual geometry without completing it');
   // A grip that is not green yet (the one just pulled may have landed on its spot and turned green).
   const grip=await onCanvas(page,'.sculpt-canvas',await page.evaluate(()=>game.points[game.locked.findIndex(locked=>!locked)]));
   await touch.send('touchStart',[grip]);const sculptPointer=await page.evaluate(()=>game.drag.id);
   await touch.send('touchStart',[grip,{x:grip.x+22,y:grip.y+22,id:2}]);
   assert.equal(await page.evaluate(()=>game.drag.id),sculptPointer);
   await touch.send('touchCancel');assert.equal(await page.evaluate(()=>game.drag),null);
   assert.equal(await page.evaluate(()=>scrollY),0,'sculpting does not pan the document');
   const toward=await center(page.locator('[data-sculpt-touch=toward]')),next=await center(page.locator('[data-sculpt-touch=next]'));
   for(let pass=0;pass<3&&!await page.evaluate(()=>work.sculpt.complete);pass++)for(let i=0;i<40;i++){
    if(await page.evaluate(()=>work.sculpt.complete))break;
    for(let j=0;j<6&&!await page.evaluate(()=>work.sculpt.complete);j++)await touch.tap(toward);
    if(!await page.evaluate(()=>work.sculpt.complete))await touch.tap(next);
   }
   assert.ok(await page.evaluate(()=>work.sculpt.complete&&work.sculpt.fraction>=.85),'touch controls move each grip to pass the 85% score');
   await page.screenshot({path:`/tmp/touch-shaping-${viewport.width}.png`});

   await page.evaluate(()=>fixture.craft());
   const body=await onCanvas(page,'.craft-viewport>canvas', [.5,.5]);
   await touch.tap(body);assert.equal(await page.evaluate(()=>work.placements.length),1,'finger tap stamps one motif');
   await page.evaluate(()=>{work.tool='draw';});
   await touch.send('touchStart',[body]);const craftPointer=await page.evaluate(()=>craft.drag.id);
   await touch.send('touchStart',[body,{x:body.x+35,y:body.y+25,id:2}]);
   await touch.send('touchMove',[body,{x:body.x+60,y:body.y+35,id:2}]);
   assert.equal(await page.evaluate(()=>craft.drag.id),craftPointer,'secondary finger cannot replace the drawing pointer');
   assert.equal(await page.evaluate(()=>craft.stroke.length),1,'secondary movement cannot add drawing points');
   await touch.send('touchCancel');assert.equal(await page.evaluate(()=>work.strokes.length),0,'canceled touch never commits a drawing');
   assert.equal(await page.evaluate(()=>craft.drag),null);
   await touch.drag({x:body.x-20,y:body.y},{x:body.x+20,y:body.y+12});
   assert.equal(await page.evaluate(()=>work.strokes.length),1,'finger stroke is saved');
   await page.evaluate(()=>{work.tool='rotate';});
   await touch.drag(body,{x:body.x+66,y:body.y});await page.waitForFunction(()=>craft.el.dataset.rotationSettled==='true');
   assert.equal(await page.evaluate(()=>work.viewFrame),3,'touch rotation preserves the authored 15-degree poses');
   assert.equal(await page.evaluate(()=>work.placements.length),1);
   assert.equal(await page.evaluate(()=>scrollY),0,'artwork gestures do not pan the document');

   for(const mode of ['fill','wipe']){
    await page.evaluate(mode=>fixture.inlay(mode),mode);await page.waitForFunction(()=>game.state.targets.length>0);
    const target=await page.evaluate(()=>game.visibleTargets()[0].screen),b=await page.locator('.inlay-canvas').boundingBox(),p={x:b.x+target[0],y:b.y+target[1]};
    await touch.send('touchStart',[p]);const before=await page.evaluate(()=>({id:game.pointer.id,count:game.state[game.mode].length}));
    await touch.send('touchStart',[p,{x:b.x+b.width*.75,y:b.y+b.height*.6,id:2}]);
    assert.equal(await page.evaluate(()=>game.pointer.id),before.id);
    assert.equal(await page.evaluate(()=>game.state[game.mode].length),before.count,'second touch does not paint or wipe elsewhere');
    await touch.send('touchCancel');assert.equal(await page.evaluate(()=>game.pointer),null);
    const targets=await page.evaluate(()=>game.visibleTargets().map(t=>t.screen));
    for(let i=0;i<targets.length&&!await page.evaluate(()=>game.done);i+=4)await touch.tap({x:b.x+targets[i][0],y:b.y+targets[i][1]});
    assert.equal(await page.evaluate(()=>game.done),true,`${mode} completes with touch on the actual motif`);
   }

   for(const kind of ['dry','glaze']){
    await page.evaluate(kind=>fixture.kiln(kind),kind);
    const canvas=page.locator('.kiln-inplace-canvas'),b=await canvas.boundingBox();
    const p={x:b.x+b.width*.5,y:b.y+b.height*.5};await touch.send('touchStart',[p]);
    const id=await page.evaluate(()=>game.pointer.id);await touch.send('touchStart',[p,{x:p.x+30,y:p.y+30,id:2}]);
    assert.equal(await page.evaluate(()=>game.pointer.id),id);await touch.send('touchCancel');
    assert.equal(await page.evaluate(()=>game.pointer),null);
    if(kind==='dry'){
     const bounds=await page.evaluate(()=>game.bounds);
     for(let zone=0;zone<3;zone++)for(let pass=0;pass<8&&!await page.evaluate(zone=>game.dryZones[zone]>=1,zone);pass++){
      const y=b.y+await require('./drying-gesture.cjs').dryingHandleY(canvas,bounds.y+bounds.height*(zone+.5)/3)*b.height;
      await touch.tap({x:b.x+10,y:b.y+10});
      await touch.drag({x:b.x+(bounds.x-.06)*b.width,y},{x:b.x+(bounds.x+bounds.width+.06)*b.width,y});
     }
    }else{
     const cells=await page.evaluate(()=>game.cells.map(c=>[c.x,c.y]));
     for(let i=0;i<cells.length&&!await page.evaluate(()=>game.finished);i+=9)await touch.tap({x:b.x+cells[i][0]*b.width,y:b.y+cells[i][1]*b.height});
    }
    await page.waitForFunction(()=>completed);assert.equal(await canvas.count(),0,'completion removes the touch overlay');
    assert.equal(await page.evaluate(()=>craft.el.inert),true,'completion restores the readonly workbench');
   }

   await page.evaluate(()=>fixture.kiln('biscuit'));
   await page.evaluate(()=>{window.touchEvents=[];for(const type of ['pointerdown','pointerup','pointercancel','lostpointercapture'])document.addEventListener(type,e=>touchEvents.push({type,id:e.pointerId,primary:e.isPrimary,target:e.target.className,owner:game.firingPointer}),true);});
   const bellows=await center(page.locator('.bellows-button'));await touch.tap(bellows);
   assert.equal(await page.evaluate(()=>game.fanTaps),1,'a touch tap fans exactly once');
   await touch.send('touchStart',[bellows]);await touch.send('touchStart',[bellows,{x:bellows.x+20,y:bellows.y,id:2}]);
   assert.equal(await page.evaluate(()=>game.fanTaps),2,'second finger cannot add a firing tap');
   await touch.send('touchCancel');assert.equal(await page.evaluate(()=>game.held),false,JSON.stringify(await page.evaluate(()=>({pointer:game.firingPointer,events:touchEvents}))));
   await touch.tap(await center(page.locator('[data-mini=pause]')));const paused=await page.evaluate(()=>game.fanTaps);await touch.tap(bellows);
   assert.equal(await page.evaluate(()=>game.fanTaps),paused,'paused firing ignores touch');
   await touch.tap(await center(page.locator('[data-mini=pause]')));await touch.tap(bellows);
   assert.equal(await page.evaluate(()=>game.fanTaps),paused+1,'firing resumes after a touch on continue');
   await page.evaluate(()=>fixture.reset());assert.deepEqual(errors,[]);
   console.log(`Touch ${viewport.width}×${viewport.height}: clay, strict shaping, stamp/draw/rotation, fill/wipe, inline fan/glaze, firing and multi-touch cancellation passed`);
   await page.close();
  }
  // The actual stylesheet cascade matters too: a generic button rule must not
  // turn clay drags into browser panning, even if isolated components work.
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));const touch=await touchInput(page);
  await page.goto(`${base}/game`);
  await page.evaluate(()=>localStorage.setItem('celadon-tycoon-v2',JSON.stringify({history:['royal-rest'],gallery:[],draft:{id:'actual-touch-clay',orderId:'royal-rest',accepted:true,shape:'stool',modelId:'stool',step:0,knead:0,width:1,technique:'inlay',pattern:'cloud',placements:[],strokes:[],decorPhase:0,decorDone:false,firing:[],clay:{body:true,slip:'white',kneads:0,prepared:false},stationView:'clay'}})));
  await page.reload();await touch.tap(await center(page.locator('[data-action=start]')));
  const tutorial=page.locator('.tutorial-popup[open]');await tutorial.waitFor();
  for(let i=0;i<5;i++)await touch.tap(await center(tutorial.locator('[data-action=tutorial-next]')));
  await touch.tap(await center(tutorial.locator('#tutorial-understood')));
  await touch.tap(await center(tutorial.locator('[data-action=tutorial-start]')));
  const pad=page.locator('.knead-pad');await pad.waitFor();await pad.scrollIntoViewIfNeeded();
  assert.equal(await pad.evaluate(el=>getComputedStyle(el).touchAction),'none','the actual mobile CSS prevents clay gestures from becoming page pans');
  const b=await pad.boundingBox(),p={x:b.x+b.width*.5,y:b.y+b.height*.55},beforeScroll=await page.evaluate(()=>scrollY);
  await touch.drag(p,{x:p.x,y:p.y-75});
  assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('celadon-tycoon-v2')).draft.clay.kneads)>0,'vertical finger drag kneads real saved clay');
  assert.ok(Math.abs(await page.evaluate(()=>scrollY)-beforeScroll)<1,'a vertical clay drag does not move the document');
  assert.equal(await pad.evaluate(el=>el.classList.contains('is-kneading')),false);
  await touch.send('touchStart',[p]);await touch.send('touchCancel');
  assert.equal(await pad.evaluate(el=>el.classList.contains('is-kneading')),false,'actual-page touch cancellation releases clay');
  await page.screenshot({path:'/tmp/touch-clay-actual-390.png'});assert.deepEqual(errors,[]);await page.close();
  console.log('Actual phone /game: touch tutorial, CSS touch-action, vertical clay drag, saved progress and cancel cleanup passed');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
