/* Authored bowl/tall-vase inspection at Chromebook and desktop sizes, including HiDPI. */
const assert=require('node:assert/strict');
const path=require('node:path');
const {build}=require('esbuild');
const {chromium}=require('playwright');
const {enterGame}=require('./game-entry.cjs');
const base=process.env.BASE_URL||'http://127.0.0.1:4173',KEY='celadon-tycoon-v2';

(async()=>{
 assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use a local test server.');
 const module=await build({stdin:{contents:"export {Craft2D} from './craft-2d.js';",resolveDir:path.join(__dirname,'..')},bundle:true,format:'esm',target:'es2022',write:false});
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try{
  for(const [width,height] of [[1024,600],[1366,768]])for(const [kind,shape,modelId] of [['cup','chrysanthemumCup','chrysanthemumCup'],['bowl','cupStand','cupStand'],['vase','maebyeong','cloudCraneMaebyeong']]){
   const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:2,reducedMotion:'reduce'}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/__inspection-craft-fixture.js',route=>route.fulfill({contentType:'text/javascript',body:module.outputFiles[0].text}));
   if(process.env.INSPECTION_SOURCE_BUNDLE){
    await page.route('**/app.js',route=>route.fulfill({contentType:'text/javascript',path:process.env.INSPECTION_SOURCE_BUNDLE}));
    await page.route('**/inspection-workshop.css',route=>route.fulfill({contentType:'text/css',path:path.join(__dirname,'../inspection-workshop.css')}));
   }
   await page.goto(`${base}/game`);
   const work={id:`inspection-${kind}`,orderId:'royal-rest',accepted:true,shape,modelId,viewFrame:0,step:3,stationView:'inspection',knead:3,width:1.08,technique:'inlay',pattern:'lotus',placements:[{uv:[.42,.48],x:151,y:173,pattern:'lotus',stampSize:.9},{uv:[.65,.68],x:234,y:245,pattern:'bamboo',stampSize:.7}],strokes:[],decorPhase:2,decorDone:true,inlay:{slip:'white',fillDone:true,wipeDone:true,fill:[],wipe:[]},firing:['dry','biscuit','glaze','fire'],clay:{body:true,slip:'white',kneads:6,prepared:true},inspection:{version:2,items:['crack','warped','glaze','sound'],broken:[],failed:false,done:false,attempts:0,correct:0}};
   work.preview=await page.evaluate(async value=>{
    const {Craft2D}=await import('/__inspection-craft-fixture.js'),host=document.createElement('div');
    Object.assign(host.style,{position:'fixed',left:'-2000px',top:'0',width:'600px',height:'380px'});document.body.append(host);
    const craft=new Craft2D(()=>{},()=>{},error=>{throw error;},()=>{},{readOnly:true});
    craft.el.style.width='100%';craft.el.style.height='100%';
    try{await craft.mount(host,structuredClone(value),'finished');return craft.snapshot();}finally{craft.dispose();host.remove();}
   },work);
   await page.evaluate(({key,work})=>localStorage.setItem(key,JSON.stringify({history:['royal-rest'],gallery:[],draft:work,sound:false,retentionStartedAt:Date.now()})),{key:KEY,work});
   await page.reload();await enterGame(page,'start');await page.locator('[data-inspection-ready=true]').waitFor({timeout:30000});
   assert.equal(await page.locator('.inspection-pot').count(),4);
   const layout=await page.evaluate(async()=>{
    const scene=document.querySelector('.inspection-scene').getBoundingClientRect(),intro=document.querySelector('.inspection-intro').getBoundingClientRect(),nav=document.querySelector('.inspection-navigation').getBoundingClientRect();
    const images=[];
    for(const img of document.querySelectorAll('.inspection-pot-art img')){
     await img.decode();const r=img.getBoundingClientRect(),canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;let minY=canvas.height,maxY=-1,minX=canvas.width,maxX=-1;
     for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(data[(y*canvas.width+x)*4+3]>64){minY=Math.min(minY,y);maxY=Math.max(maxY,y);minX=Math.min(minX,x);maxX=Math.max(maxX,x);}
     images.push({naturalWidth:img.naturalWidth,width:r.width,height:r.height,top:r.top+minY/canvas.height*r.height,bottom:r.top+(maxY+1)/canvas.height*r.height,left:r.left+minX/canvas.width*r.width,right:r.left+(maxX+1)/canvas.width*r.width,source:img.src});
    }
    return {scene:{left:scene.left,right:scene.right,top:scene.top,bottom:scene.bottom},introBottom:intro.bottom,navTop:nav.top,images,labels:[...document.querySelectorAll('.inspection-pot-number')].map(node=>{const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom};}),overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight};
   });
   assert.equal(layout.overflow,false);assert.equal(new Set(layout.images.map(image=>image.source)).size,4,'all three defects differ from sound work');
   for(const image of layout.images){
    assert.ok(image.naturalWidth>=image.width*2,'HiDPI copies have enough actual pixels');
    assert.ok(image.width<=230&&image.height<=230,'samples remain a natural, modest size');
    assert.ok(image.top>=layout.introBottom+8,'pottery clears the instruction panels');
    assert.ok(image.bottom<layout.navTop-45,'bottoms leave room for numbers and progress');
    assert.ok(image.left>=layout.scene.left+8&&image.right<=layout.scene.right-8,'all four silhouettes stay in the stage');
   }
   assert.ok(layout.labels.every(label=>label.bottom<layout.navTop-15),'numbers stay above navigation');
   await page.mouse.move(0,0);await page.screenshot({path:`/tmp/inspection-${kind}-${width}-dpr2.png`});
   await page.locator('[data-sample-kind=crack]').focus();await page.keyboard.press('Enter');await page.locator('[data-sample-kind=crack].is-broken').waitFor();await page.locator('[data-inspection-ready=true]').waitFor();
   const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).draft,KEY);
   assert.deepEqual(saved.placements,work.placements,'rendering keeps the student’s original marks');assert.equal(saved.preview,work.preview,'inspection never overwrites the original preview');assert.equal(saved.inspection.correct,1);
   assert.deepEqual(errors,[]);await page.close();console.log(`Inspection ${kind} ${width}×${height} DPR2: four complete silhouettes, clear defects, crisp authored surfaces and keyboard strike passed.`);
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
