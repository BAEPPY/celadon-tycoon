/* Actual workbench -> timed glaze bath -> saved score -> teacher artwork.
   Virtual time drives the real performance.now/RAF clock; actions remain
   native pointer/touch/keyboard input, without changing game internals. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {enterGame}=require('./game-entry.cjs');
const base=process.env.BASE_URL||'http://127.0.0.1:4173',KEY='celadon-tycoon-v2',NOW=Date.now();
const draft=(id='glaze-dip-pillow',tall=false)=>({
 id,orderId:tall?'royal-crane-vessel':'royal-rest',customerId:'king',accepted:true,
 shape:tall?'maebyeong':'pillow',modelId:tall?'cloudCraneMaebyeong':'pillow',width:1.08,
 clay:{body:true,slip:'white',kneads:6,prepared:true},knead:3,step:2,stationView:'game',
 technique:'inlay',pattern:'crane',viewFrame:0,decorPhase:2,decorDone:true,processVersion:2,
 placements:[
  {x:165,y:170,uv:[.46,.47],surfaceAngle:0,surfaceV:.47,surfaceRadius:.25,pattern:'crane',stampSize:1.35,renderer:'illustration-2d'},
  {x:215,y:230,uv:[.6,.64],surfaceAngle:.35,surfaceV:.64,surfaceRadius:.25,pattern:'cloud',stampSize:.7,renderer:'illustration-2d'},
 ],
 strokes:[{renderer:'illustration-2d',points:Array.from({length:12},(_,i)=>({x:140+i*4,y:210,uv:[(140+i*4)/360,.58],surfaceAngle:-.3+i*.06,surfaceV:.58,surfaceRadius:.22}))}],
 inlay:{slip:'white',fillDone:true,wipeDone:true,fill:[],wipe:[]},firing:['dry','biscuit'],
});

(async()=>{
 assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Use a local test server.');
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const errors=[];let teacher,room;
 const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
 const game=page=>page.locator('.glaze-dip-game');
 const action=(page,name)=>page.locator(`[data-glaze-action="${name}"]`);
 const surface=page=>page.locator('canvas[data-work-surface="authored"]');
 const original=page=>page.locator('.illustration-viewport>canvas').first();
 const read=page=>game(page).evaluate(el=>({state:el.dataset.state,paused:el.dataset.paused==='true',elapsed:Number(el.dataset.elapsedMs||0),outcome:el.dataset.outcome,score:Number(el.dataset.score)}));
 async function seed(work,{mobile=false,clock=true}={}){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1024,height:600},hasTouch:mobile,isMobile:mobile,reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));
  if(clock){await page.clock.install({time:new Date(NOW)});await page.clock.pauseAt(new Date(NOW+1000));}
  await page.goto(`${base}/game`);
  await page.evaluate(({key,work,now})=>localStorage.setItem(key,JSON.stringify({history:[work.orderId],gallery:[],draft:work,sound:false,retentionStartedAt:now})),{key:KEY,work,now:NOW});
  await page.reload();await page.locator('#game-loading').waitFor({state:'detached'});await enterGame(page);
  if(work.step===2)await page.locator('.illustration-viewport[data-status=ready]').waitFor();
  await page.evaluate(()=>document.fonts.ready);if(clock)await page.clock.runFor(80);return page;
 }
 async function open(page){
  await page.locator('[data-fire=glaze]').click();await game(page).waitFor();await surface(page).waitFor();
  assert.equal((await read(page)).state,'ready');
  assert.match(await game(page).innerText(),/5초|다섯/);
  assert.equal(await surface(page).getAttribute('data-work-surface'),'authored');
  await desktopFit(page);
  await geometry(page);
 }
 async function geometry(page,{capture=true}={}){
  const state=(await read(page)).state,modelId=(await saved(page)).draft.modelId;
  const value=await surface(page).evaluate(canvas=>{
   const data=canvas.dataset,b=JSON.parse(data.surfaceBounds),v=JSON.parse(data.vatBounds);
   const top=Math.max(0,Math.floor(v.y*canvas.height)-2),pixels=top?canvas.getContext('2d').getImageData(0,0,canvas.width,top).data:[];
   let aboveVat=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>64)aboveVat++;
   return {sourceWidth:Number(data.sourceWidth),sourceHeight:Number(data.sourceHeight),sourceAspect:Number(data.sourceAspect),baseAngle:Number(data.baseAngleDeg),angle:Number(data.angleDeg),bounds:b,vat:v,plane:Number(data.liquidPlane),submerged:data.fullySubmerged==='true',canvasWidth:canvas.width,canvasHeight:canvas.height,aboveVat};
  });
  const {bounds:b,vat:v}=value,expectedBase=value.sourceHeight>value.sourceWidth?-90:0;
  assert.ok(value.sourceWidth>0&&value.sourceHeight>0,`${modelId} exposes its authored source size`);
  assert.ok(Math.abs(value.sourceAspect-value.sourceWidth/value.sourceHeight)<.001,'source aspect retains the made pottery proportions');
  assert.equal(value.baseAngle,expectedBase,`${modelId} lays its longer axis horizontally`);
  assert.ok(Math.abs(value.angle-expectedBase)<=5.8,'dipping adds only a gentle tilt to the horizontal pose');
  const radians=value.angle*Math.PI/180,c=Math.abs(Math.cos(radians)),s=Math.abs(Math.sin(radians));
  const expectedAspect=(value.sourceWidth*c+value.sourceHeight*s)/(value.sourceWidth*s+value.sourceHeight*c);
  assert.ok(Math.abs((b.width*value.canvasWidth)/(b.height*value.canvasHeight)-expectedAspect)<.025,'rotating never stretches the authored vessel');
  const within=rect=>rect.x>=-.001&&rect.y>=-.001&&rect.width>0&&rect.height>0&&rect.x+rect.width<=1.001&&rect.y+rect.height<=1.001;
  assert.ok(within(b)&&within(v),`${modelId} pottery and vat remain inside the canvas in ${state}`);
  assert.ok(b.x>=v.x-.001&&b.x+b.width<=v.x+v.width+.001,'the complete horizontal silhouette fits across the vat');
  if(state==='immersed'){
   assert.equal(value.submerged,true,`${modelId} reaches full immersion before timing starts`);
   assert.ok(b.y>=value.plane-.001&&b.y+b.height<=v.y+v.height+.001,'the whole rotated vessel fits below the liquid plane and inside the vat');
   assert.equal(value.aboveVat,0,'no pottery pixels remain above the vat while fully immersed');
  }else if(state==='ready'||state==='result'){
   assert.equal(value.submerged,false);assert.ok(Math.abs(value.angle-expectedBase)<.01,'resting and result poses remain horizontal');
  }
  if(capture)await page.screenshot({path:`/tmp/glaze-horizontal-${modelId}-${state}-${page.viewportSize().width}.png`,fullPage:page.viewportSize().width<600});
  return value;
 }
 async function desktopFit(page){
  if(page.viewportSize().width<1024)return;
  const layout=await game(page).evaluate(el=>{const r=el.getBoundingClientRect(),scene=el.closest('.station-scene'),s=scene.getBoundingClientRect(),canvas=scene.querySelector('.glaze-dip-canvas'),c=canvas.getBoundingClientRect(),b=JSON.parse(canvas.dataset.surfaceBounds);return {game:r.toJSON(),scene:s.toJSON(),canvas:c.toJSON(),scrollTop:scene.scrollTop,contained:r.top>=s.top-1&&r.bottom<=s.bottom+1&&r.left>=0&&r.right<=innerWidth+1,artContained:c.top>=s.top-1&&c.bottom<=s.bottom+1&&b.x>=0&&b.y>=0&&b.x+b.width<=1.001&&b.y+b.height<=1.001};});
  if(!layout.contained||!layout.artContained||layout.scrollTop)await page.screenshot({path:'/tmp/glaze-dip-desktop-layout-failure.png'});
  assert.ok(layout.contained&&layout.artContained&&layout.scrollTop===0,`desktop instructions, buttons and pottery fit without scrolling a clipped scene: ${JSON.stringify(layout)}`);
 }
 async function until(page,state,max=2000){
  for(let elapsed=0;elapsed<=max;elapsed+=20){if((await read(page)).state===state){await geometry(page);return;}await page.clock.runFor(20);}
  assert.equal((await read(page)).state,state,`reaches ${state}`);
 }
 async function press(page,name,key){
  const button=action(page,name);
  if(key){await button.focus();await page.keyboard.press(key);}else await button.click({force:true});
 }
 async function reachable(page){
  for(const button of await game(page).locator('button:visible').all()){
   await button.scrollIntoViewIfNeeded();
   const hit=await button.evaluate(el=>{const r=el.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {ok:r.width>=40&&r.height>=30&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&(top===el||el.contains(top)),text:el.textContent,rect:r.toJSON(),hit:top?.outerHTML.slice(0,200)};});
   if(!hit.ok)await page.screenshot({path:'/tmp/glaze-dip-controls-failure.png'});
   assert.equal(hit.ok,true,`reachable control: ${JSON.stringify(hit)}`);
  }
 }
 async function complete(page,expected,{duplicate=false,exit='complete'}={}){
  await until(page,'result');const result=await read(page);
  assert.equal(result.outcome,expected);assert.equal(result.score,expected==='balanced'?10:5);
  assert.deepEqual((await saved(page)).draft.firing,['dry','biscuit','glaze'],'STOP records the attempt before the result is acknowledged');
  assert.equal((await saved(page)).draft.glazeDip.outcome,expected);
  await desktopFit(page);
  await page.screenshot({path:`/tmp/glaze-dip-${expected}-result.png`});
  if(exit==='refresh'){
   await page.reload();await page.locator('#game-loading').waitFor({state:'detached'});await enterGame(page);await page.clock.runFor(80);
  }else if(exit==='cancel')await press(page,'cancel');
  else if(duplicate)await action(page,'complete').dblclick({force:true});
  else await press(page,'complete');
  await game(page).waitFor({state:'detached'});await page.locator('.illustration-viewport[data-status=ready]').waitFor();
  await page.clock.runFor(80);
  const work=(await saved(page)).draft;
  assert.equal(work.processVersion,2);assert.equal(work.glazeDip.outcome,expected);assert.equal(work.glazeDip.score,result.score);
  assert.equal(work.firing.filter(id=>id==='glaze').length,1,'completion is recorded exactly once');
  assert.deepEqual(work.firing,['dry','biscuit','glaze']);
  assert.equal(await page.locator('[data-fire=glaze]').isDisabled(),true,'a stopped attempt cannot be rerolled by cancelling or refreshing');
  return work;
 }
 function unchangedDesign(actual,expected){for(const key of ['shape','modelId','width','placements','strokes','inlay'])assert.deepEqual(actual[key],expected[key],`${key} survives glazing`);}
 try{
  const earlySeed=draft(),early=await seed(earlySeed);
  await open(early);await reachable(early);await early.clock.runFor(80);
  // The active bath has a larger workbench, so its backing canvas resizes.
  // Compare after that layout settles and separately retain the authored data.
  const before=await original(early).evaluate(c=>c.toDataURL());unchangedDesign((await saved(early)).draft,earlySeed);
  const wide=await geometry(early,{capture:false});
  await early.clock.runFor(6000);assert.equal((await read(early)).state,'ready','reading instructions never starts the bath');assert.equal((await read(early)).elapsed,0);
  assert.ok(await original(early).evaluate(c=>c.toDataURL())===before,'reading bath instructions does not alter the authored base picture');
  await press(early,'cancel');await game(early).waitFor({state:'detached'});assert.equal((await saved(early)).draft.glazeDip,undefined);
  await open(early);await press(early,'start');await until(early,'immersed');await early.clock.runFor(2500);
  await action(early,'stop').dblclick({force:true});const earlyWork=await complete(early,'thin',{duplicate:true});unchangedDesign(earlyWork,earlySeed);
  assert.ok(Math.abs(earlyWork.glazeDip.elapsedMs-2500)<60,'early result uses active immersion time');
  const thinPicture=await original(early).evaluate(c=>c.toDataURL());await early.close();

  const balancedSeed=draft('glaze-dip-vase',true),balanced=await seed(balancedSeed);
  await open(balanced);
  const tall=await geometry(balanced,{capture:false});
  assert.ok(wide.sourceAspect>1&&tall.sourceAspect<1,'pillow and vase retain their different authored source proportions');
  assert.equal(wide.baseAngle,0);assert.equal(tall.baseAngle,-90,'the tall vase turns onto its side while the wide pillow stays natural');
  await balanced.screenshot({path:'/tmp/glaze-dip-vase-ready.png'});
  await press(balanced,'start','Enter');await until(balanced,'immersed');
  await balanced.clock.runFor(1500);await press(balanced,'pause','Space');const paused=await read(balanced);assert.equal(paused.paused,true);
  await balanced.clock.runFor(4000);assert.equal((await read(balanced)).elapsed,paused.elapsed,'explicit pause is excluded from immersion time');
  await press(balanced,'pause','Space');assert.equal((await read(balanced)).paused,false);await balanced.clock.runFor(1500);
  await balanced.evaluate(()=>window.dispatchEvent(new Event('blur')));const blurred=await read(balanced);assert.equal(blurred.paused,true);
  await balanced.clock.runFor(3000);assert.equal((await read(balanced)).elapsed,blurred.elapsed,'blur is excluded from immersion time');
  await press(balanced,'pause','Enter');await balanced.clock.runFor(2000);await press(balanced,'stop','Space');
  const balancedWork=await complete(balanced,'balanced',{exit:'cancel'});unchangedDesign(balancedWork,balancedSeed);
  assert.ok(Math.abs(balancedWork.glazeDip.elapsedMs-5000)<80,'pause/resume and native keyboard controls retain the five active seconds');await balanced.close();

  const late=await seed(draft('glaze-dip-late'));await open(late);await press(late,'start');await until(late,'immersed');await late.clock.runFor(7500);
  assert.equal((await read(late)).state,'immersed','passing the target never stops for the student');await press(late,'stop');const lateWork=await complete(late,'thick',{exit:'refresh'});unchangedDesign(lateWork,draft('glaze-dip-late'));
  assert.ok(Math.abs(lateWork.glazeDip.elapsedMs-7500)<60);assert.ok(await original(late).evaluate(c=>c.toDataURL())!==thinPicture,'thin and thick outcomes visibly affect the actual authored work');await late.close();

  const mobileSeed=draft('glaze-dip-mobile'),mobile=await seed(mobileSeed,{mobile:true});await open(mobile);await reachable(mobile);await action(mobile,'start').tap();await until(mobile,'immersed');await mobile.clock.runFor(1000);
  await mobile.setViewportSize({width:844,height:390});await mobile.clock.runFor(20);await reachable(mobile);
  await action(mobile,'pause').tap();const mobilePaused=await read(mobile);assert.equal(mobilePaused.paused,true);await mobile.clock.runFor(2000);assert.equal((await read(mobile)).elapsed,mobilePaused.elapsed);
  await mobile.screenshot({path:'/tmp/glaze-dip-mobile-landscape.png'});await action(mobile,'cancel').tap();await game(mobile).waitFor({state:'detached'});
  assert.deepEqual((await saved(mobile)).draft.firing,['dry','biscuit']);assert.equal((await saved(mobile)).draft.glazeDip,undefined);
  await mobile.setViewportSize({width:390,height:844});await open(mobile);assert.equal((await read(mobile)).elapsed,0,'cancelled immersion restarts from the instructions');await reachable(mobile);await mobile.screenshot({path:'/tmp/glaze-dip-mobile-portrait.png'});await mobile.close();

  // The catalog includes sculptural droppers, spouts/handles and open cups.
  // All use the player's complete made surface, not a generic vase template.
  for(const [modelId,shape] of [['pomegranateDropper','duckDropper'],['duckDropper','duckDropper'],['pitcher','pitcher'],['chrysanthemumCup','chrysanthemumCup']]){
   const made={...draft(`glaze-horizontal-${modelId}`),modelId,shape,orderId:`example-${modelId}`,width:modelId==='duckDropper'?.94:1.12};
   const page=await seed(made,{mobile:modelId==='duckDropper'});await open(page);await press(page,'start');
   for(let frame=0;frame<2;frame++){await page.clock.runFor(120);await geometry(page,{capture:false});}
   await until(page,'immersed');await page.clock.runFor(5000);await press(page,'stop');
   const finished=await complete(page,'balanced');unchangedDesign(finished,made);assert.ok(Math.abs(finished.glazeDip.elapsedMs-5000)<80);
   await page.close();
  }

  // Carry the actual early result through the normal explanation/score flow.
  // Unrelated firing and inspection are seeded complete to keep this focused.
  const finalPage=await seed({...earlyWork,step:3,stationView:'counter-delivery',firing:['dry','biscuit','glaze','fire'],inspection:{done:true}},{clock:false});
  await finalPage.locator('[data-action=explain]').click();await finalPage.locator('#work-title').fill('구름과 학이 쉬는 베개');
  await finalPage.locator('#explain-use').fill('구름과 학 무늬가 있는 베개를 만들었어요. 누워서 잘 때 쓰면 좋겠어요.');
  await finalPage.locator('#explain-beauty').fill('구름을 파고 흰 흙을 채운 다음 여러 번 닦아 무늬가 선명하게 보이게 했어요.');
  await finalPage.locator('[data-action=submit]').click();await finalPage.locator('.customer-review-scene').waitFor();
  const finalWork=(await saved(finalPage)).gallery[0],scoreText=await finalPage.locator('.review-score').innerText(),total=Number((await finalPage.locator('.review-score strong').innerText()).match(/\d+/)[0]);
  assert.deepEqual(finalWork.glazeDip,earlyWork.glazeDip);assert.match(scoreText,/주문·제작 75\/80/,'five lost glaze points reach the final objective score');unchangedDesign(finalWork,earlySeed);
  await finalPage.screenshot({path:'/tmp/glaze-dip-final-score.png'});await finalPage.close();

  // Real lesson iframe transfer and authenticated teacher artwork storage.
  teacher=await browser.newPage({viewport:{width:1024,height:600},reducedMotion:'reduce'});teacher.on('pageerror',e=>errors.push(e.message));
  async function api(action,body={},method='POST'){
   const data={action,...(room?{code:room.code}:{}),...body},headers=room?{Authorization:`Bearer ${room.teacherToken}`}:{},response=method==='POST'?await teacher.request.post(`${base}/api/classroom`,{data,headers}):await teacher.request.get(`${base}/api/classroom`,{params:data,headers});
   const value=await response.json();assert.equal(response.status(),200,JSON.stringify(value));return value;
  }
  room=await api('create');const started=await api('control',{command:'start',activity:3});
  const student=await browser.newPage({viewport:{width:1024,height:600},reducedMotion:'reduce'});student.on('pageerror',e=>errors.push(e.message));
  await student.goto(`${base}/lesson?code=${room.code}`);
  const classroomKey=`${KEY}:classroom:${room.code}:8:run:${started.state.runId}`;
  await student.evaluate(({key,work})=>localStorage.setItem(key,JSON.stringify({history:[work.orderId],gallery:[work],draft:null,sound:false,retentionStartedAt:Date.now()})),{key:classroomKey,work:finalWork});
  const upload=student.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/api/classroom')&&response.request().postDataJSON()?.action==='work');
  await student.locator('[name=number]').fill('8');await student.locator('[name=name]').fill('유약시험');await student.locator('[data-form=join] button[type=submit]').click();
  const uploaded=await upload;assert.equal(uploaded.status(),200,await uploaded.text());const packet=uploaded.request().postDataJSON();
  assert.deepEqual(packet.work.glazeDip,finalWork.glazeDip);assert.deepEqual(packet.work.design.glazeDip,finalWork.glazeDip);assert.equal(packet.work.processVersion,2);
  const artifact=await api('artwork',{participantId:'8',workId:finalWork.id},'GET');assert.deepEqual(artifact.design.glazeDip,finalWork.glazeDip);assert.deepEqual(artifact.design,packet.work.design);
  assert.equal(artifact.design.width,earlySeed.width);assert.equal(artifact.design.placements[0].stampSize,earlySeed.placements[0].stampSize);assert.deepEqual(artifact.design.strokes[0].points.map(point=>point.uv),earlySeed.strokes[0].points.map(point=>point.uv),'the full authored stroke survives the teacher transfer');
  const overview=await api('teacher',{},'GET'),summary=overview.works.find(work=>work.id===finalWork.id);assert.ok(summary);assert.deepEqual(summary.glazeDip,finalWork.glazeDip);assert.equal(summary.score,total,'teacher score agrees with the student final score');
  await teacher.goto(`${base}/teacher`);await teacher.evaluate(value=>localStorage.setItem('celadon-classroom-teacher-v1',JSON.stringify(value)),{code:room.code,teacherToken:room.teacherToken});await teacher.reload();await teacher.locator(`[data-work-id="${finalWork.id}"] [data-action=view-work]`).click();
  await teacher.locator('dialog.work-dialog .student-work-viewer [data-status=ready] canvas').waitFor();await teacher.screenshot({path:'/tmp/glaze-dip-teacher-result.png'});
  assert.deepEqual(errors,[]);
  console.log('Glaze dip: six authored shapes laid horizontally, full immersion and bounds, preserved motifs, intentional start, early/balanced/late timing, pause/blur, native keys, duplicate guards, cancel/reopen, phone controls, final score and real classroom teacher design passed.');
 }finally{
  if(room&&teacher)await teacher.request.post(`${base}/api/classroom`,{headers:{Authorization:`Bearer ${room.teacherToken}`},data:{action:'control',code:room.code,command:'delete'}}).catch(()=>{});
  await browser.close();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
