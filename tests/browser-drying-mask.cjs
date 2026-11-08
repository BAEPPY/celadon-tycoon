/* Authored openwork can remove an entire drying band without removing the pot. */
const assert=require('node:assert/strict');
const path=require('node:path');
const {build}=require('esbuild');
const {chromium}=require('playwright');
const {dryingSweep}=require('./drying-gesture.cjs');
const base=process.env.BASE_URL||'http://127.0.0.1:4219';
(async()=>{
 const bundle=await build({stdin:{resolveDir:path.resolve(__dirname,'..'),contents:`
  import {Craft2D} from './craft-2d.js';import {KilnGame} from './kiln-game.js';import {sanitizeWorkDesign} from './work-design.js';
  window.mountMaskCase=async(shape,modelId)=>{
   window.game?.dispose();window.craft?.dispose();
   window.work={shape,modelId,width:1,viewFrame:0,step:2,knead:3,technique:'openwork',pattern:'lotus',decorPhase:2,decorDone:true,placements:[],strokes:[],firing:[]};
   window.craft=new Craft2D(()=>{},()=>{},error=>{throw error;});await craft.mount(document.querySelector('#host'),work,'biscuit');
   const points=[];
   for(let row=0;row<37;row++){
    const y=.29+row*.012,iy=Math.floor(y*craft.mask.height);let left=craft.mask.width,right=-1;
    for(let x=0;x<craft.mask.width;x++)if(craft.mask.data[(iy*craft.mask.width+x)*4+3]>64){left=Math.min(left,x);right=Math.max(right,x);}
    for(let col=0;col<12;col++){const x=(left+1+(row%2?11-col:col)*(right-left-2)/11)/craft.mask.width;if(craft.mask.data[(iy*craft.mask.width+Math.floor(x*craft.mask.width))*4+3]>64)points.push({uv:[x,y]});}
   }
   work.strokes=[{points}];craft.paint();window.surface=craft.exportWorkSurface();window.original=JSON.stringify(work);window.valid=Boolean(sanitizeWorkDesign(work));
   window.mountDry=surface=>{window.game?.dispose();window.completed=0;window.canceled=0;window.game=new KilnGame(document.querySelector('#mini'),'dry',{workSurface:surface,workbench:craft.el,controlsHost:document.querySelector('#controls'),onComplete:()=>completed++,onCancel:()=>canceled++});};
   mountDry(surface);
  };
 `},bundle:true,write:false,format:'iife',target:'es2022'});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:700},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/__dry-mask',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><base href="${base}/"><style>body{font:16px sans-serif}#host{width:600px;height:420px;position:relative}.craft-viewport{position:absolute;inset:0}.craft-viewport>canvas{position:absolute;inset:0;width:100%;height:100%}.vessel-turns,.dry-tool-controls{display:none}.dry-zone-progress{position:absolute;top:0;pointer-events:none}button{min-height:40px}</style><div id="host"></div><div id="controls"></div><div id="mini"></div>`}));
  await page.goto(`${base}/__dry-mask`);await page.addScriptTag({content:bundle.outputFiles[0].text});
  for(const [shape,modelId] of [['stool','stool'],['maebyeong','cloudCraneMaebyeong']]){
   await page.evaluate(([shape,model])=>mountMaskCase(shape,model),[shape,modelId]);
   const initial=await page.evaluate(()=>({available:game.dryAvailableZones,progress:game.dryZones,complete:completed,finished:game.finished,valid,points:work.strokes[0].points.length}));
   assert.ok(initial.valid&&initial.points<=512,'the cutout is an accepted student drawing, not a synthetic mask');
   assert.deepEqual(initial.available,[true,false,true]);assert.deepEqual(initial.progress,[0,1,0]);
   assert.equal(initial.complete,0);assert.equal(initial.finished,false,'occupied clay cannot finish automatically');
   assert.equal(await page.locator('[data-dry-zone="1"] output').textContent(),'없음');
   await page.evaluate(()=>{document.querySelector('#host').style.width='520px';});await page.waitForTimeout(100);
   assert.deepEqual(await page.evaluate(()=>game.dryAvailableZones),initial.available,'availability stays in vessel coordinates during resize');
   assert.deepEqual(await page.evaluate(()=>game.dryZones),initial.progress,'resize does not dry the remaining clay');
   const canvas=page.locator('.kiln-inplace-canvas');
   for(const zone of [0,2]){
    const target=await page.evaluate(zone=>{const cells=game.cells.filter(p=>game.zone(p.y)===zone);return {y:cells.reduce((n,p)=>n+p.y,0)/cells.length,x1:game.bounds.x-.03,x2:game.bounds.x+game.bounds.width+.03};},zone);
    for(let pass=0;pass<16&&!await page.evaluate(zone=>game.dryZones[zone]>=1,zone);pass++)await dryingSweep(page,canvas,target.y,target.x1,target.x2,24);
    assert.equal(await page.evaluate(zone=>game.dryZones[zone],zone),1,'occupied band completes only after real fan movement');
    if(zone===0){assert.equal(await page.evaluate(()=>completed),0);assert.equal(await page.evaluate(()=>game.dryZones[2]),0,'drying the top does not auto-dry the remaining bottom');}
   }
   await page.waitForFunction(()=>completed===1);assert.equal(await page.locator('.kiln-inplace-canvas').count(),0);
   assert.equal(await page.evaluate(()=>JSON.stringify(work)===original),true,'mask handling never changes the authored design');
   console.log(`Authored ${modelId}: empty middle excluded; top/bottom require fan contact and complete after resize`);
  }
  // The picture can still contain a visible back wall when its front mask is
  // empty. Exercise that export-boundary input without awarding an empty win.
  await page.evaluate(()=>{const empty=craft.exportWorkSurface();empty.mask.getContext('2d').clearRect(0,0,empty.mask.width,empty.mask.height);mountDry(empty);});
  assert.deepEqual(await page.evaluate(()=>game.dryZones),[0,0,0]);
  assert.equal(await page.locator('.kiln-minigame').getAttribute('data-empty-surface'),'true');
  assert.match(await page.locator('.mini-status').textContent(),/말릴 흙이 남아 있지 않아요/);
  await page.waitForTimeout(750);assert.equal(await page.evaluate(()=>completed),0);assert.equal(await page.locator('.mini-won').count(),0);
  await page.locator('[data-mini=cancel]').click();assert.equal(await page.evaluate(()=>canceled),1);
  assert.equal(await page.locator('.kiln-inplace-canvas').count(),0);assert.equal(await page.evaluate(()=>craft.el.inert),true);
  assert.deepEqual(errors,[]);console.log('Entirely empty front mask: no automatic win, clear recovery message and working cancel');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
