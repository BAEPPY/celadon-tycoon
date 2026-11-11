const assert=require('node:assert/strict');
const path=require('node:path');
const {build}=require('esbuild');
const {chromium}=require('playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:4177';
(async()=>{
 const bundle=await build({stdin:{contents:`import {Craft2D} from './craft-2d.js';window.Craft2D=Craft2D;`,resolveDir:path.resolve(__dirname,'..')},bundle:true,write:false,format:'iife',target:'es2022'});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:1000},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/__glaze-surface-test',route=>route.fulfill({contentType:'text/html',body:`<html><head><base href="${base}/"><style>body{background:#fbf3e3;font:18px sans-serif;color:#534c3e}#host{position:absolute;left:-2000px;width:500px;height:420px}.craft-viewport{width:100%;height:100%}.craft-viewport canvas{width:100%;height:100%}#results{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}figure{margin:0;text-align:center;background:#fff9ed;border-radius:18px;padding:10px}figure canvas{width:100%;height:340px;object-fit:contain}</style></head><body><div id="host"></div><div id="results"></div></body></html>`}));
  await page.goto(`${base}/__glaze-surface-test`);await page.addScriptTag({content:bundle.outputFiles[0].text});
  const result=await page.evaluate(async()=>{
   const craft=new window.Craft2D(()=>{},()=>{},error=>{throw error;},null,{readOnly:true});
   const make=(elapsedMs,technique='inlay')=>({modelId:'cloudCraneMaebyeong',shape:'maebyeong',step:4,width:1.12,knead:3,viewFrame:0,technique,decorPhase:2,glazeDip:elapsedMs==null?undefined:{version:1,elapsedMs},clay:{slip:'white'},inlay:{slip:'white',fillDone:true,wipeDone:true,fill:[],wipe:[]},placements:[{uv:[.5,.5],surfaceAngle:0,surfaceV:.5,surfaceRadius:.25,pattern:'lotus',stampSize:1.5}],strokes:[]});
   const pixels=()=>craft.surface.getContext('2d').getImageData(0,0,craft.surface.width,craft.surface.height).data;
   const alpha=p=>Array.from(p).filter((_,i)=>i%4===3).join(',');
   const fingerprint=()=>craft.surface.toDataURL();
   const show=label=>{const f=document.createElement('figure'),c=document.createElement('canvas');c.width=craft.surface.width;c.height=craft.surface.height;c.getContext('2d').drawImage(craft.surface,0,0);f.append(c,Object.assign(document.createElement('figcaption'),{textContent:label}));document.querySelector('#results').append(f);};
   await craft.mount(document.querySelector('#host'),make(null),'finished');const legacy=fingerprint(),silhouette=alpha(pixels());
   const frames={},alphaMatches=[];let rawColor;
   for(const stage of ['glazed','finished'])for(const [label,time]of [['thin',2000],['balanced',5000],['thick',9000]]){
    const work=make(time),before=JSON.stringify(work);await craft.update(work,stage);frames[stage+label]=fingerprint();alphaMatches.push(alpha(pixels())===silhouette);show(`${stage} · ${label}`);
    if(JSON.stringify(work)!==before)throw new Error('renderer changed authored work');
    if(stage==='glazed'&&label==='balanced'){const p=pixels();let count=0;rawColor=[0,0,0];for(let i=0;i<p.length;i+=4)if(p[i+3]>200){count++;for(let k=0;k<3;k++)rawColor[k]+=p[i+k];}rawColor=rawColor.map(x=>x/count);}
   }
   await craft.update(make(2000),'biscuit');const beforeFire=fingerprint();await craft.update(make(5000),'biscuit');const unchangedBeforeFire=beforeFire===fingerprint();
   const thin=make(2000);await craft.update(thin,'finished');const marked=fingerprint();thin.placements=[];craft.paint();const retainsPattern=marked!==fingerprint();
   await craft.update(make(9000),'finished');const front=fingerprint(),snapshot=craft.snapshot();await craft.setRotation(12);const back=fingerprint();await craft.setRotation(0);const roundTrip=front===fingerprint();
   await craft.update(make(5000,'openwork'),'finished');const clear=alpha(pixels());await craft.update(make(9000,'openwork'),'finished');const holesSame=clear===alpha(pixels());
   const shaped=[];
   for(const modelId of ['pillow','duckDropper']){
    const work={...make(5000),modelId,shape:modelId};await craft.update(work,'finished');const a=alpha(pixels()),before=fingerprint();
    work.glazeDip={version:1,elapsedMs:9000};await craft.update(work,'finished');const treated=fingerprint();
    const clipped=a===alpha(pixels());await craft.setRotation(12);const turns=fingerprint()!==treated;await craft.setRotation(0);
    shaped.push({modelId,clipped,changes:before!==treated,turns,roundTrip:treated===fingerprint()});
   }
   craft.dispose();return {frames,legacy,alphaMatches,rawColor,shaped,unchangedBeforeFire,retainsPattern,rotated:front!==back,roundTrip,holesSame,snapshot:snapshot.startsWith('data:image/webp')};
  });
  assert.equal(result.frames.finishedbalanced,result.legacy,'balanced glaze and legacy work retain the original design');
  for(const stage of ['glazed','finished'])assert.equal(new Set(['thin','balanced','thick'].map(x=>result.frames[stage+x])).size,3,'each glaze thickness is visually distinct');
  assert.ok(result.alphaMatches.every(Boolean),'effects never leak beyond the vessel silhouette');
  assert.ok(result.unchangedBeforeFire,'a biscuit vessel is not prematurely colored by its later glaze result');
  assert.ok(result.retainsPattern,'student-authored motifs remain on the treated vessel');
  assert.ok(result.rotated,'rotating reveals another side of the treated vessel');
  assert.ok(result.roundTrip,'the same surface returns when rotated through 360 degrees');
  assert.ok(result.holesSame,'glaze effects do not fill openwork cutouts');
  assert.ok(result.snapshot,'result renderer exports its treated surface');
  assert.ok(Math.min(...result.rawColor)>150&&Math.max(...result.rawColor)-Math.min(...result.rawColor)<12,'unfired glaze is milky white/light gray rather than ochre or celadon green');
  assert.ok(result.shaped.every(s=>s.clipped&&s.changes&&s.turns&&s.roundTrip),'box-shaped pillows and oval duck vessels retain their actual silhouettes and stable rotation');
  assert.deepEqual(errors,[]);
  if(process.env.GLAZE_SURFACE_SCREENSHOT)await page.screenshot({path:process.env.GLAZE_SURFACE_SCREENSHOT,fullPage:true});
  console.log('Glaze surface: outcomes, authored motifs, clipping, cutouts, stages, rotation and snapshot passed.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
