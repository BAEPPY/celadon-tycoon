/* Actual inspection candidates must retain the student's fired surface, not
   the white raw-glaze preview or a generic vessel thumbnail. */
const assert=require('node:assert/strict');
const path=require('node:path');
const {build}=require('esbuild');
const {chromium}=require('playwright');
const {enterGame}=require('./game-entry.cjs');
const base=process.env.BASE_URL||'http://127.0.0.1:4173',KEY='celadon-tycoon-v2';

const authoredWork=elapsedMs=>({
 id:`inspection-authored-${elapsedMs}`,orderId:'royal-rest',accepted:true,
 shape:'pillow',modelId:'pillow',viewFrame:0,width:1.13,step:3,stationView:'inspection',
 knead:3,technique:'inlay',pattern:'crane',decorPhase:2,decorDone:true,processVersion:2,
 clay:{body:true,slip:'white',kneads:6,prepared:true},firing:['dry','biscuit','glaze','fire'],
 placements:[-.7,0,.7].flatMap((angle,col)=>[.36,.54,.70].map((level,row)=>({
  uv:[.5+angle*.2,level],x:180+angle*72,y:level*360,
  surfaceAngle:angle,surfaceV:level,surfaceRadius:.28,
  pattern:(row+col)%2?'lotus':'crane',stampSize:1.15,renderer:'illustration-2d',
 }))),
 strokes:[{renderer:'illustration-2d',points:Array.from({length:18},(_,i)=>({
  uv:[.33+i*.02,.61],x:119+i*7,y:220,surfaceAngle:-.8+i*.095,
  surfaceV:.61+Math.sin(i*.5)*.012,surfaceRadius:.28,
 }))}],
 inlay:{slip:'white',fillDone:true,wipeDone:true,fill:[],wipe:[],
  dark:Array.from({length:48},(_,a)=>Array.from({length:49},(_,v)=>`${a+48}:${v}`)).flat()},
 // Deliberately stale: ready candidates must be reconstructed from the design.
 preview:'/assets/vessels/stool.webp',glazeDip:{version:1,elapsedMs},
 inspection:{version:2,items:['crack','warped','glaze','sound'],broken:[],failed:false,done:false,attempts:0,correct:0},
});

(async()=>{
 assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use a local test server.');
 const fixture=await build({stdin:{contents:"export {Craft2D} from './craft-2d.js'; export {evaluateGlazeDip} from './glaze-dip-rules.js';",resolveDir:path.join(__dirname,'..')},bundle:true,format:'esm',write:false,target:'es2022'});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const [elapsedMs,mobile] of [[5000,false],[2000,false],[9000,false],[5000,true]]){
   const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1024,height:600},hasTouch:mobile,isMobile:mobile,reducedMotion:'reduce'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/__inspection-source-reference.js',route=>route.fulfill({contentType:'text/javascript',body:fixture.outputFiles[0].text}));
   await page.goto(`${base}/game`);
   const work=await page.evaluate(async value=>{
    const {evaluateGlazeDip}=await import('/__inspection-source-reference.js');
    value.glazeDip=evaluateGlazeDip(value.glazeDip.elapsedMs);return value;
   },authoredWork(elapsedMs));
   await page.evaluate(({KEY,work})=>localStorage.setItem(KEY,JSON.stringify({history:['royal-rest'],gallery:[],draft:work,sound:false,retentionStartedAt:Date.now()})),{KEY,work});
   await page.reload();await page.locator('#game-loading').waitFor({state:'detached'});await enterGame(page);
   await page.locator('[data-inspection-ready=true]').waitFor({timeout:30000});
   const result=await page.evaluate(async work=>{
    const {Craft2D}=await import('/__inspection-source-reference.js');
    const craft=new Craft2D(()=>{},()=>{},error=>{throw error;},()=>{},{readOnly:true});
    const make=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
    const read=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    const crop=img=>{
     const c=make(img.width,img.height);c.getContext('2d').drawImage(img,0,0);const p=read(c);
     let left=c.width,top=c.height,right=-1,bottom=-1;
     for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(p[(y*c.width+x)*4+3]>48){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
     return {x:left,y:top,width:right-left+1,height:bottom-top+1};
    };
    // The published inspection layout fits a 340×352 vessel above its baseline.
    // This independent reference contains no generated inspection defects.
    const compose=(image,warped=false)=>{
     const b=crop(image),scale=Math.min(340/b.width,352/b.height),w=b.width*scale,h=b.height*scale,x=(400-w)/2,y=394-h;
     const c=make(400,400),ctx=c.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
     if(warped){const rows=Math.ceil(h);for(let row=0;row<rows;row++){
      const t=row/rows,rw=w*(.82+.18*t),lean=(1-t)**2*w*.18;
      ctx.drawImage(image,b.x,b.y+row*b.height/rows,b.width,b.height/rows,x+(w-rw)/2+lean,y+t*h,rw,h/rows+.5);
     }}else ctx.drawImage(image,b.x,b.y,b.width,b.height,x,y,w,h);
     return c;
    };
    try{
     await craft.update({...structuredClone(work),tool:'rotate'},'finished');
     const finished=craft.exportWorkSurface().image,raw=craft.exportWorkSurface().glazedImage;
     await craft.update({...structuredClone(work),placements:[],strokes:[],tool:'rotate'},'finished');
     const bare=craft.exportWorkSurface().image;
     const expected=[compose(finished),compose(finished,true)],plain=[compose(bare),compose(bare,true)],white=read(compose(raw));
     const metrics={};
     for(const pot of document.querySelectorAll('.inspection-pot')){
      const kind=pot.dataset.sampleKind,img=pot.querySelector('img');await img.decode();
      const actual=make(400,400);actual.getContext('2d').drawImage(img,0,0,400,400);
      const a=read(actual),e=read(expected[kind==='warped'?1:0]),b=read(plain[kind==='warped'?1:0]);
      let opaque=0,exact=0,finishDifference=0,whiteDifference=0,motifs=0,keptMotifs=0;
      const mean=[0,0,0];
      for(let i=0;i<e.length;i+=4){
       if(e[i+3]<253)continue;opaque++;
       const diff=Math.max(...[0,1,2,3].map(j=>Math.abs(a[i+j]-e[i+j])));
       if(diff<=2)exact++;
       for(let j=0;j<3;j++){finishDifference+=Math.abs(a[i+j]-e[i+j]);whiteDifference+=Math.abs(a[i+j]-white[i+j]);mean[j]+=a[i+j];}
       if(b[i+3]>252&&Math.max(...[0,1,2].map(j=>Math.abs(e[i+j]-b[i+j])))>12){motifs++;if(diff<=3)keptMotifs++;}
      }
      metrics[kind]={opaque,exact:exact/opaque,finishDifference:finishDifference/opaque/3,whiteDifference:whiteDifference/opaque/3,motifs,keptMotifs:keptMotifs/motifs,mean:mean.map(v=>v/opaque)};
     }
     return metrics;
    }finally{craft.dispose();}
   },work);
   assert.deepEqual(Object.keys(result).sort(),['crack','glaze','sound','warped']);
   assert.ok(result.sound.exact>.999,`the retained candidate must be the exact fired artwork: ${JSON.stringify(result.sound)}`);
   assert.ok(result.sound.finishDifference<.01,'inspection adds no coating or defects to the sound candidate');
   assert.ok(result.sound.whiteDifference>25,'the fired candidate is visibly distinct from raw white glaze');
   for(const [kind,metric]of Object.entries(result)){
    assert.ok(metric.opaque>15000,`${kind} retains a full pillow silhouette`);
    assert.ok(metric.motifs>400,`${kind} reference includes substantial student drawing`);
    assert.ok(metric.keptMotifs>.45,`${kind} retains authored crane, lotus, mixed inlay and stroke pixels: ${JSON.stringify(metric)}`);
   }
   await page.screenshot({path:`/tmp/inspection-authored-${work.glazeDip.outcome}-${mobile?'phone':'desktop'}.png`,fullPage:mobile});
   await page.locator('[data-sample-kind=crack]').click();await page.locator('[data-sample-kind=crack].is-broken').waitFor();
   const after=await page.evaluate(KEY=>JSON.parse(localStorage.getItem(KEY)).draft,KEY);
   for(const field of ['modelId','shape','width','viewFrame','placements','strokes','inlay','glazeDip','processVersion','preview'])assert.deepEqual(after[field],work[field],`${field} survives rendering and a hammer strike unchanged`);
   assert.deepEqual(errors,[]);
   console.log(`Inspection authored ${work.glazeDip.outcome} ${mobile?'phone':'desktop'}: exact fired surface, all four motifs, unchanged glaze timing and design passed. ${JSON.stringify(result)}`);
   await page.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
