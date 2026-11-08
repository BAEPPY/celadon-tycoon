/* The kiln uses the authored surface, including patterns, width and cutouts. */
const assert=require('node:assert/strict');
const path=require('node:path');
const {build}=require('esbuild');
const {chromium}=require('playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:4173';
(async()=>{
 const bundle=await build({stdin:{contents:`import {Craft2D} from './craft-2d.js';window.Craft2D=Craft2D;`,resolveDir:path.resolve(__dirname,'..')},bundle:true,write:false,format:'iife',target:'es2022'});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:600},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/__kiln-surface-test',route=>route.fulfill({contentType:'text/html',body:`<html><head><base href="${base}/"><style>#host{width:500px;height:420px}.craft-viewport{width:100%;height:100%}.craft-viewport canvas{width:100%;height:100%}</style></head><body><div id="host"></div></body></html>`}));
  await page.goto(`${base}/__kiln-surface-test`);await page.addScriptTag({content:bundle.outputFiles[0].text});
  const result=await page.evaluate(async()=>{
   const craft=new window.Craft2D(()=>{},()=>{},error=>{throw error;});
   const make=(model,technique='inlay')=>({modelId:model,shape:model,step:2,width:1.12,knead:3,viewFrame:0,technique,decorPhase:2,clay:{slip:'white'},inlay:{slip:'white',fillDone:true,wipeDone:true,fill:[],wipe:[]},placements:[{uv:[.5,.5],surfaceAngle:0,surfaceV:.5,surfaceRadius:.25,pattern:'lotus',stampSize:1.5}],strokes:[]});
   const fingerprint=canvas=>canvas.toDataURL();
   const counts=canvas=>{const a=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let n=0;for(let i=3;i<a.length;i+=4)if(a[i]>24)n++;return n;};
   await craft.mount(document.querySelector('#host'),make('stool'),'biscuit');
   const before=fingerprint(craft.surface),work=JSON.stringify(craft.work),a=craft.exportWorkSurface();
   const after=fingerprint(craft.surface),unchanged=work===JSON.stringify(craft.work);
   const marked=fingerprint(a.image),finished=fingerprint(a.glazedImage);
   craft.work.placements=[];craft.paint();const plain=craft.exportWorkSurface();craft.work.width=1;const narrow=craft.exportWorkSurface();const widthRatio=plain.image.width/narrow.image.width;
   await craft.update(make('maebyeong'),'biscuit');const vase=craft.exportWorkSurface();
   const vaseRatio=vase.image.width/vase.image.height,stoolRatio=a.image.width/a.image.height;
   const baseline=vase.image.toDataURL(),placement=vase.placement();craft.setZoom(2.5);craft.size();const zoomed=craft.exportWorkSurface(),placementScale=vase.placement().width/placement.width;
   await craft.update(make('stool','openwork'),'biscuit');const cut=craft.exportWorkSurface();
   const mask=counts(cut.mask),visible=counts(cut.image);
   const dims=[cut.image.width===cut.mask.width,cut.image.height===cut.mask.height,cut.image.width===cut.glazedImage.width,cut.image.height===cut.glazedImage.height];
   craft.dispose();
   return {same:before===after,unchanged,widthRatio,placementScale,patterns:marked!==fingerprint(plain.image),finish:marked!==finished,vaseRatio,stoolRatio,nativeHeight:a.image.height,zoomUnchanged:baseline===zoomed.image.toDataURL(),mask,visible,dims};
  });
  assert.ok(result.same&&result.unchanged,'export restores the current stage and never changes the student design');
  assert.ok(result.patterns,'student motifs are retained instead of substituting a generic pot');
  assert.ok(result.finish,'glazing has an authored final-colored surface');
  assert.ok(Math.abs(result.stoolRatio-result.vaseRatio)>.05,'different shapes retain their actual proportions');
  assert.ok(Math.abs(result.widthRatio-1.12)<.004,'the student’s width adjustment carries into kiln artwork');
  assert.ok(result.nativeHeight>350,'export uses source resolution instead of a small screen capture');
  assert.equal(result.zoomUnchanged,true,'screen size and zoom do not affect kiln artwork');
  assert.ok(Math.abs(result.placementScale-2.5)<.001,'the live interaction placement follows the workbench’s display scale');
  assert.ok(result.mask<result.visible,'brush mask excludes front cutouts even where the back wall is visible');
  assert.ok(result.dims.every(Boolean),'all aligned layers have identical dimensions');
  assert.deepEqual(errors,[]);
  console.log('Kiln authored surface: motifs, proportions, native resolution, final glaze, cutout mask and source preservation passed.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
