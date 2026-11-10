/* Old-engine board of the PowerPoint add-in (PowerPoint 2016/2019 show add-ins with Internet Explorer 11).
   Internet Explorer itself is not available here, so this runs the same ES5 board in Chromium through "?legacy=1"
   and checks what it shows; legacy-board.test.js checks that its code and styles keep to what that engine has.
   Run after npm run build against a local server.mjs, never a production class. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

const base=process.env.BASE_URL||'http://127.0.0.1:4173';
const OFFICE_JS='**/appsforoffice.microsoft.com/**';
// A minimal Office.js stand-in written the way the old engine needs it (no arrow functions used by the page).
const officeStub=view=>`window.__settings=window.__settings||{};window.__goto=[];window.Office={EventType:{ActiveViewChanged:'ActiveViewChanged'},Index:{Next:'next',Previous:'previous'},GoToType:{Index:'index'},
  onReady:function(callback){setTimeout(function(){callback({host:'PowerPoint'});},10);},
  context:{document:{settings:{get:function(k){return k in window.__settings?window.__settings[k]:null;},set:function(k,v){window.__settings[k]=v;},saveAsync:function(cb){cb&&cb({status:'succeeded'});}},
    getActiveViewAsync:function(cb){cb({value:${JSON.stringify(view)}});},addHandlerAsync:function(type,handler){window.__viewHandler=handler;},
    goToByIdAsync:function(id,type,cb){window.__goto.push(id);cb&&cb({status:'succeeded'});}}}};`;

(async()=>{
  assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use an isolated local classroom server.');
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
  const errors=[],privateName='비밀이름학생';let teacher,room;
  const watch=(page,label)=>page.on('pageerror',error=>errors.push(`${label}: ${error.message}`));
  async function api(action,body={},{auth=room?.teacherToken}={}){
    const response=await teacher.request.post(`${base}/api/classroom`,{headers:auth?{Authorization:`Bearer ${auth}`}:{},data:{action,...(room?{code:room.code}:{}),...body}});
    const value=await response.json();assert.equal(response.status(),200,JSON.stringify(value));return value;
  }
  const control=(command,extra={})=>api('control',{command,...extra});
  try{
    const teacherContext=await browser.newContext({viewport:{width:1100,height:700}});teacher=await teacherContext.newPage();watch(teacher,'teacher');
    await teacher.goto(`${base}/teacher`);
    const created=teacher.waitForResponse(response=>response.url().endsWith('/api/classroom')&&response.request().postDataJSON()?.action==='create');
    await teacher.locator('[data-form=create] button[type=submit]').click();room=await (await created).json();
    await teacher.locator('[data-action=observer-link]').waitFor();
    const students=[];
    for(const [number,name] of [[4,privateName],[7,'둘째학생'],[9,'셋째학생']])students.push(await api('join',{code:'탑텐반',number,name},{auth:null}));
    const a1=await control('start',{activity:1});
    const picks=[{1:'japan',2:'yuan',3:'goryeo'},{1:'japan',2:'goryeo',3:'goryeo'}];
    for(const [index,answers] of picks.entries())await api('answer',{participantId:students[index].participantId,activity:1,runId:a1.state.runId,clientRevision:1,final:true,answers},{auth:students[index].participantToken});
    const {observerToken,observerCode}=await control('observer-link',{role:'presenter'});
    const link=`${base}/observe?code=${encodeURIComponent(observerCode)}#key=${observerToken}`;

    // The add-in page hands an old engine to legacy.js; a current engine keeps the usual board.
    const context=await browser.newContext({viewport:{width:1000,height:562}});await context.route(OFFICE_JS,route=>route.abort());
    const usual=await context.newPage();watch(usual,'usual add-in');
    await usual.goto(`${base}/ppt-addin/index.html`);await usual.locator('#form').waitFor();
    assert.equal(await usual.locator('#lg-root').count(),0,'a current engine never loads the old-engine board');
    await usual.close();
    const page=await context.newPage();watch(page,'old-engine board');
    const requests=[];page.on('request',request=>requests.push(request.url()));
    // First the board as it is where 3D does not work (3D switched off here): pictures that turn.
    await page.addInitScript(key=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({three:false}));},'celadon-ppt-addin-v1');
    await page.goto(`${base}/ppt-addin/index.html?legacy=1`);
    await page.locator('#lg-form').waitFor({timeout:15000});
    assert.equal(await page.locator('#setup').isVisible(),false,'the usual form stays hidden');
    assert.match(await page.locator('#lg-form').innerText(),/옛 웹 엔진/);
    assert.equal(await page.locator('#lg-model-field').isVisible(),false);assert.equal(await page.locator('#lg-link-field').isVisible(),true);
    // A wrong address is refused; the 세 나라 비교 board then shows anonymous counts.
    await page.locator('input[name=lg-panel][value=comparison]').check();
    await page.locator('#lg-link').fill('https://example.com/observe?code=탑텐반#key=abc');await page.locator('.lg-submit').click();
    assert.match(await page.locator('#lg-error').innerText(),/PPT용 주소를 확인해 주세요/);
    await page.locator('#lg-link').fill(link);await page.locator('.lg-submit').click();
    await page.locator('[data-comparison="1"]').waitFor({timeout:15000});
    const text=()=>page.locator('#lg-root').innerText();
    await page.waitForFunction(()=>/참여\s*3\s*명/.test(document.querySelector('#lg-root').innerText));
    assert.match(await text(),/활동 1 · 진행 중\s*세 나라 도자기 비교/);assert.match(await text(),/모두 작성\s*2\s*명/);assert.match(await text(),/남은 시간\s*\d:\d\d/);
    assert.match(await page.locator('[data-comparison="1"]').innerText(),/2명 응답/);
    assert.match(await page.locator('[data-comparison="1"] [data-country=japan]').innerText(),/100%\s*일본\s*2명/);
    assert.match(await page.locator('[data-comparison="2"] [data-country=yuan]').innerText(),/50%\s*원\s*1명/);
    assert.equal(await page.locator('[data-comparison="2"] [data-country=yuan] .lg-fill').evaluate(el=>el.style.width),'50%');
    assert.match(await page.locator('[data-comparison="3"]').innerText(),/아직 고르지 않은 학생 1명/);
    assert.ok(!(await text()).includes(privateName),'no student names on the slide');
    assert.equal(await page.evaluate(()=>document.querySelectorAll('.lg-body > .lg-colwrap > .lg-cols > .lg-col').length),3,'three cards side by side');
    assert.equal(await page.locator('[data-connection]').innerText(),'연결됨');
    // Pictures that turn stand in for the 3D models: one sheet per model, turned by dragging or the arrow buttons.
    const turn=page.locator('.lg-turn[data-model="comparison-1"]');
    assert.match(await turn.evaluate(el=>el.style.backgroundImage),/\/assets\/lesson\/turntable\/comparison-1\.jpg/);
    assert.match((await page.request.get(`${base}/assets/lesson/turntable/comparison-1.jpg`)).headers()['content-type'],/^image\/jpeg/);
    assert.ok(!requests.some(url=>url.endsWith('.glb')||url.includes('/vendor/')),'with 3D off no model or 3D library is fetched');
    const box=await turn.boundingBox();assert.ok(Math.abs(box.width-box.height)<2&&box.width>60,'the picture is square');
    assert.equal(await turn.getAttribute('data-frame'),'0');
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2-box.width/3,box.y+box.height/2,{steps:6});await page.mouse.up();
    assert.equal(await turn.getAttribute('data-frame'),'4','dragging a third of the width turns four views');
    assert.equal(await turn.evaluate(el=>el.style.backgroundPosition),'80% 0%');
    await page.locator('[data-act=turn][data-model="comparison-1"][data-step="-2"]').click();assert.equal(await turn.getAttribute('data-frame'),'2');
    for(let i=0;i<2;i++)await page.locator('[data-act=turn][data-model="comparison-1"][data-step="-2"]').click();
    assert.equal(await turn.getAttribute('data-frame'),'22','turning wraps around');
    // New answers keep the view the picture was turned to.
    await api('answer',{participantId:students[2].participantId,activity:1,runId:a1.state.runId,clientRevision:1,final:true,answers:{1:'goryeo',2:'yuan',3:'goryeo'}},{auth:students[2].participantToken});
    await page.waitForFunction(()=>/3명 응답/.test(document.querySelector('[data-comparison="1"]').innerText),{},{timeout:15000});
    assert.equal(await page.locator('.lg-turn[data-model="comparison-1"]').getAttribute('data-frame'),'22');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.lg-body').scrollWidth<=document.querySelector('.lg-body').clientWidth+1),true,'nothing spills sideways');

    // 청자 설명 보기: closed while the activity runs, opened from the slide with the PPT용 주소 once it is over.
    const explain=page.locator('[data-act=exhibit][data-activity="1"]');
    assert.equal(await explain.isDisabled(),true);assert.match(await page.locator('.lg-bar').first().innerText(),/활동을 마치면 열 수 있어요/);
    await control('pause');
    await page.waitForFunction(()=>!document.querySelector('[data-act=exhibit]').disabled,{},{timeout:15000});
    await explain.click();
    await page.locator('.lg-exhibit-name').waitFor({timeout:15000});
    const overview=await (await teacher.request.get(`${base}/api/classroom`,{headers:{Authorization:`Bearer ${room.teacherToken}`},params:{action:'teacher',code:room.code}})).json();
    assert.equal(overview.state.revealed[1],true,'the slide opened the answers for the class');
    assert.ok((await page.locator('.lg-exhibit-name').innerText()).length>3);assert.ok(await page.locator('.lg-meta span').count()>=1);
    const firstName=await page.locator('.lg-exhibit-name').innerText();
    await page.locator('[data-act=exhibit-object][data-id="2"]').first().click();
    assert.notEqual(await page.locator('.lg-exhibit-name').innerText(),firstName);
    assert.match(await page.locator('.lg-turn').getAttribute('data-model'),/^comparison-2$/);
    await page.locator('[data-act=responses][data-activity="1"]').click();await page.locator('[data-comparison="1"]').waitFor();

    // "지금 활동 따라가기" moves with the class: 아름다움 찾기, 쓰임 짐작, 완성작.
    await page.locator('[data-act=setup]').click();await page.locator('input[name=lg-panel][value=follow]').check();
    assert.equal(await page.locator('#lg-link').inputValue(),link,'the address is remembered');
    await page.locator('.lg-submit').click();await page.locator('[data-comparison="1"]').waitFor({timeout:15000});
    const beauty=await control('start-beauty');
    for(const [index,words] of ['비색이 맑아요','비색이 맑아요','학 무늬가 날아요'].entries())await api('beauty-answer',{participantId:students[index].participantId,runId:beauty.state.runId,clientRevision:1,final:true,text:words},{auth:students[index].participantToken});
    await page.locator('.lg-turn[data-model=beauty]').waitFor({timeout:15000});
    await page.waitForFunction(()=>/3명 응답/.test(document.querySelector('#lg-root').innerText),{},{timeout:15000});
    assert.match(await text(),/고려청자의 아름다움 찾기/);assert.match(await text(),/비색이 맑아요\s*2명/);assert.match(await text(),/학 무늬가 날아요/);
    const sizes=await page.locator('.lg-word').evaluateAll(nodes=>nodes.map(node=>parseFloat(node.style.fontSize)));
    assert.ok(sizes[0]>sizes[1],'a thought more students wrote is larger');
    await control('pause');const a2=await control('start',{activity:2});
    await api('answer',{participantId:students[0].participantId,activity:2,runId:a2.state.runId,clientRevision:1,answers:{1:{name:'베개',use:'머리를 받쳐요'},2:{name:'꽃병',use:'꽃을 꽂아요'}}},{auth:students[0].participantToken});
    await api('answer',{participantId:students[1].participantId,activity:2,runId:a2.state.runId,clientRevision:1,answers:{1:{name:'베개',use:'낮잠 잘 때 써요'}}},{auth:students[1].participantToken});
    await page.locator('.lg-turn[data-model="observation-1"]').waitFor({timeout:15000});
    await page.waitForFunction(()=>/베개\s*2명/.test(document.querySelector('#lg-root').innerText),{},{timeout:15000});
    assert.match(await text(),/활동 2 · 진행 중\s*쓰임과 이름 짐작하기/);
    await page.locator('[data-act=kind][data-kind=use]').click();assert.match(await text(),/어디에 썼을까요\?/);assert.match(await text(),/머리를 받쳐요/);
    await page.locator('[data-act=object][data-id="2"]').click();await page.locator('.lg-turn[data-model="observation-2"]').waitFor();assert.match(await text(),/꽃을 꽂아요/);
    assert.ok(!(await text()).includes(privateName));
    await control('pause');const a3=await control('start',{activity:3});
    const preview=await teacher.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=120;canvas.height=90;const ctx=canvas.getContext('2d');ctx.fillStyle='#88ae8d';ctx.fillRect(30,15,60,60);return canvas.toDataURL('image/png');});
    const work={id:'legacy-work',orderId:'royal-rest',shape:'pillow',modelId:'pillow',step:4,technique:'inlay',pattern:'crane',title:'학이 쉬는 청자 베개',placements:[{x:100,y:100,pattern:'crane'}],strokes:[],decorDone:true,firing:['dry','biscuit','glaze','fire'],clay:{slip:'white'},explanationUse:'학 무늬를 넣은 베개예요. 머리를 받치고 쉬면 좋아요.',explanationBeauty:'학 무늬를 파고 흰 흙을 채워 또렷하게 만들었어요.'};
    await api('work',{participantId:students[0].participantId,runId:a3.state.runId,work,preview},{auth:students[0].participantToken});
    await page.locator('[data-work="legacy-work"]').waitFor({timeout:15000});
    assert.match(await text(),/활동 3 · 진행 중\s*좋은 청자 위대한 청자/);assert.match(await text(),/완성작\s*1\s*점/);
    assert.match(await page.locator('[data-work="legacy-work"]').innerText(),/학이 쉬는 청자 베개/);assert.match(await page.locator('[data-work="legacy-work"]').innerText(),/\d+점/);
    await page.locator('[data-work="legacy-work"] img').waitFor({timeout:15000});
    assert.match(await page.locator('[data-work="legacy-work"] img').getAttribute('src'),/^data:image\/png;base64,/);
    assert.ok(!(await text()).includes(privateName));

    // The 3D 모델 choice needs no class: it turns by itself until it is dragged or stopped.
    await page.locator('[data-act=setup]').click();await page.locator('input[name=lg-panel][value=model]').check();
    assert.equal(await page.locator('#lg-model-field').isVisible(),true);assert.equal(await page.locator('#lg-link-field').isVisible(),false);
    await page.locator('#lg-model').selectOption('observation-5');await page.locator('.lg-submit').click();
    const model=page.locator('.lg-turn[data-model="observation-5"]');await model.waitFor();
    assert.match(await text(),/청자 5/);assert.ok(!/향로|베개|매병/.test(await text()),'activity 2 models keep their blind names');
    const before=await model.getAttribute('data-frame');await page.waitForTimeout(700);assert.notEqual(await model.getAttribute('data-frame'),before,'it turns by itself');
    await page.locator('[data-act=auto]').click();const stopped=await model.getAttribute('data-frame');await page.waitForTimeout(600);
    assert.equal(await model.getAttribute('data-frame'),stopped);assert.match(await page.locator('[data-act=auto]').innerText(),/천천히 돌리기/);
    // The game cannot run in that engine: the box says so and gives the address for a browser window or a slide hyperlink.
    await page.locator('[data-act=setup]').click();await page.locator('input[name=lg-panel][value=game]').check();await page.locator('.lg-submit').click();
    await page.locator('.lg-address').waitFor();assert.equal(await page.locator('.lg-address').inputValue(),`${base}/game`);
    assert.equal(await page.locator('[data-act=open-game]').getAttribute('href'),'/game');assert.equal(await page.locator('[data-act=open-game]').getAttribute('target'),'_blank');
    assert.match(await text(),/상자 안에서는 열 수 없어요/);assert.match(await text(),/하이퍼링크\(Ctrl\+K\)/);
    await page.close();

    // Real 3D where the engine's WebGL works: the old three.js draws the models, which turn, tilt and zoom.
    const boardPage=async(options={})=>{
      const boardContext=await browser.newContext({viewport:{width:1000,height:562}});await boardContext.route(OFFICE_JS,route=>route.abort());
      if(options.block)await boardContext.route(options.block,route=>route.abort());
      const board=await boardContext.newPage();watch(board,options.label||'3D board');board.fetched=[];board.on('request',request=>board.fetched.push(request.url()));
      if(options.before)await board.addInitScript(options.before);
      await board.addInitScript(([key,value])=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},['celadon-ppt-addin-v1',JSON.stringify({panel:options.panel||'comparison',link,model:options.model||'beauty'})]);
      await board.goto(`${base}/ppt-addin/index.html?legacy=1${options.query||''}`);return board;
    };
    const solid=await boardPage();
    await solid.waitForFunction(()=>document.querySelectorAll('.lg-turn[data-3d=ready]').length===3,{},{timeout:60000});
    for(const file of ['/vendor/three-r116.min.js','/vendor/GLTFLoader-r116.js','/ppt-addin/legacy-3d.js','/assets/lesson/comparison-1.glb'])assert.ok(solid.fetched.some(url=>url.endsWith(file)),file);
    assert.ok(!solid.fetched.some(url=>url.includes('promise-polyfill')),'the Promise stand-in is only for engines without Promise');
    assert.ok(!solid.fetched.some(url=>url.includes('/detail/')),'the light models are used');
    const canvas=solid.locator('.lg-turn[data-model="comparison-1"] canvas');
    const look=()=>canvas.evaluate(node=>{const data=node.getContext('2d').getImageData(0,0,node.width,node.height).data;let solidPixels=0,sum=0;
      for(let i=0;i<data.length;i+=40){if(data[i+3]>200)solidPixels++;sum=(sum+data[i]*3+data[i+1]*5+data[i+2]*7+data[i+3])%1000003;}return {solidPixels,sum};});
    const angle=()=>solid.evaluate(()=>window.__legacy3d.state('comparison-1'));
    const first=await look();assert.ok(first.solidPixels>200,'the model is drawn');
    assert.equal(await solid.locator('.lg-turn[data-model="comparison-1"]').evaluate(node=>node.style.backgroundImage),'none','the pictures step aside');
    assert.equal(await solid.locator('[data-act=zoom][data-model="comparison-1"]').count(),2);assert.equal(await solid.locator('[data-act=reset-view][data-model="comparison-1"]').count(),1);
    const area=await canvas.boundingBox();
    await solid.mouse.move(area.x+area.width/2,area.y+area.height/2);await solid.mouse.down();
    await solid.mouse.move(area.x+area.width/2+area.width/4,area.y+area.height/2+area.height/10,{steps:5});await solid.waitForTimeout(250);await solid.mouse.up();
    let state=await angle();
    assert.ok(Math.abs(state.yaw-Math.PI/4)<0.05,`dragging a quarter of the width turns 45 degrees (${state.yaw})`);assert.ok(state.pitch>0.2,'dragging down tilts it');
    assert.notEqual((await look()).sum,first.sum,'the picture changed');
    await solid.locator('[data-act=turn][data-model="comparison-1"][data-step="-2"]').click();
    await solid.waitForFunction(yaw=>Math.abs(window.__legacy3d.state('comparison-1').yaw-yaw-Math.PI/6)<0.01,state.yaw,{timeout:5000});
    await solid.locator('[data-act=zoom][data-model="comparison-1"][data-factor="1.25"]').click();assert.equal((await angle()).zoom,1.25);
    // New numbers redraw the cards; the model keeps the way it was turned.
    const turned=await angle();
    await api('join',{code:'탑텐반',number:12,name:'넷째학생'},{auth:null});
    await solid.waitForFunction(()=>/아직 고르지 않은 학생 1명/.test(document.querySelector('[data-comparison="1"]').innerText),{},{timeout:15000});
    await solid.waitForFunction(()=>document.querySelectorAll('.lg-turn[data-3d=ready]').length===3,{},{timeout:15000});
    assert.deepEqual(await angle(),turned);assert.ok((await look()).solidPixels>200);
    await solid.locator('[data-act=reset-view][data-model="comparison-1"]').click();
    state=await angle();assert.equal(state.yaw,0);assert.equal(state.zoom,1);
    // 청자 돌려 보기 turns by itself in 3D until it is stopped; switching 3D off in the form brings the pictures back.
    await solid.locator('[data-act=setup]').click();await solid.locator('input[name=lg-panel][value=model]').check();await solid.locator('#lg-model').selectOption('observation-5');
    assert.equal(await solid.locator('#lg-three').isChecked(),true);await solid.locator('.lg-submit').click();
    await solid.locator('.lg-turn[data-model="observation-5"][data-3d=ready]').waitFor({timeout:60000});
    assert.match(await solid.locator('.lg-turn-hint').innerText(),/끌어서 돌리고 기울여/);
    const yawNow=()=>solid.evaluate(()=>window.__legacy3d.state('observation-5').yaw);
    const yaw1=await yawNow();await solid.waitForTimeout(600);const yaw2=await yawNow();assert.ok(yaw2>yaw1,'it turns by itself');
    await solid.locator('[data-act=auto]').click();const yaw3=await yawNow();await solid.waitForTimeout(500);assert.equal(await yawNow(),yaw3);
    await solid.locator('[data-act=setup]').click();await solid.locator('#lg-three').uncheck();
    await Promise.all([solid.waitForEvent('load'),solid.locator('.lg-submit').click()]);
    await solid.locator('.lg-turn[data-model="observation-5"]').waitFor();await solid.waitForTimeout(1500);
    assert.equal(await solid.locator('.lg-turn[data-3d=ready]').count(),0);
    assert.match(await solid.locator('.lg-turn').evaluate(node=>node.style.backgroundImage),/turntable\/observation-5\.jpg/);
    await solid.context().close();
    // Where 3D cannot be trusted the board notices by itself and keeps the pictures:
    // a model that does not arrive, an engine without WebGL, and a drawing that comes out empty.
    const partial=await boardPage({label:'one model missing',block:'**/assets/lesson/comparison-2.glb'});
    await partial.waitForFunction(()=>document.querySelectorAll('.lg-turn[data-3d=ready]').length===2,{},{timeout:60000});
    const missing=partial.locator('.lg-turn[data-model="comparison-2"]');
    assert.equal(await missing.getAttribute('data-3d'),null);assert.match(await missing.evaluate(node=>node.style.backgroundImage),/turntable\/comparison-2\.jpg/);
    assert.equal(await partial.locator('[data-act=zoom][data-model="comparison-2"]').count(),0);assert.equal(await partial.locator('[data-act=zoom][data-model="comparison-1"]').count(),2);
    await partial.locator('[data-act=turn][data-model="comparison-2"][data-step="2"]').click();assert.equal(await missing.getAttribute('data-frame'),'2','its pictures still turn');
    await partial.context().close();
    const flat=await boardPage({label:'no WebGL',before:()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type){return /webgl/.test(type)?null:original.apply(this,arguments);};}});
    await flat.locator('[data-comparison="1"]').waitFor({timeout:15000});await flat.waitForTimeout(1500);
    assert.ok(!flat.fetched.some(url=>url.includes('/vendor/')||url.endsWith('.glb')),'without WebGL nothing for 3D is fetched');
    assert.match(await flat.locator('.lg-turn[data-model="comparison-1"]').evaluate(node=>node.style.backgroundImage),/turntable\/comparison-1\.jpg/);
    await flat.context().close();
    const empty=await boardPage({label:'empty drawing',before:()=>{const original=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(source){if(source instanceof HTMLCanvasElement)return;return original.apply(this,arguments);};}});
    await empty.waitForFunction(()=>window.__legacy3d&&window.__legacy3d.reason,{},{timeout:60000});
    assert.match(await empty.evaluate(()=>window.__legacy3d.reason),/nothing recognisable was drawn/);
    await empty.waitForTimeout(500);
    assert.equal(await empty.locator('.lg-turn canvas').count(),0);assert.equal(await empty.locator('[data-act=zoom]').count(),0);
    assert.match(await empty.locator('.lg-turn[data-model="comparison-1"]').evaluate(node=>node.style.backgroundImage),/turntable\/comparison-1\.jpg/);
    await empty.locator('[data-act=turn][data-model="comparison-1"][data-step="2"]').click();assert.equal(await empty.locator('.lg-turn[data-model="comparison-1"]').getAttribute('data-frame'),'2');
    await empty.context().close();

    // Finished works' pictures where WebP cannot be drawn ("nowebp=1" stands in for that engine): the server
    // hands each one over as JPEG, whatever format it was stored in.
    const webpPreview=await teacher.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=160;canvas.height=120;const ctx=canvas.getContext('2d');ctx.fillStyle='#88ae8d';ctx.beginPath();ctx.ellipse(80,62,38,48,0,0,7);ctx.fill();return canvas.toDataURL('image/webp',.8);});
    assert.match(webpPreview,/^data:image\/webp;base64,/);
    await api('work',{participantId:students[1].participantId,runId:a3.state.runId,work:{...work,id:'legacy-webp',title:'구름이 쉬는 베개'},preview:webpPreview},{auth:students[1].participantToken});
    const gallery=await boardPage({label:'no WebP',panel:'works',query:'&nowebp=1'});
    await gallery.locator('[data-work="legacy-webp"] img').waitFor({timeout:20000});await gallery.locator('[data-work="legacy-work"] img').waitFor({timeout:20000});
    for(const id of ['legacy-webp','legacy-work']){
      const shown=gallery.locator(`[data-work="${id}"] img`);
      assert.match(await shown.getAttribute('src'),/^data:image\/jpeg;base64,/);
      await gallery.waitForFunction(node=>node.complete&&node.naturalWidth>0,await shown.elementHandle());
    }
    assert.ok(gallery.fetched.some(url=>url.includes('/api/work-picture?')));assert.ok(!gallery.fetched.some(url=>url.includes('action=artwork')),'the stored WebP is never asked for');
    assert.ok(!(await gallery.locator('#lg-root').innerText()).includes(privateName));
    await gallery.context().close();
    // If the server cannot convert a picture, that work keeps its text card.
    const cards=await boardPage({label:'no conversion',panel:'works',query:'&nowebp=1',before:()=>{}});
    await cards.context().route('**/api/work-picture?*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({preview:'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',converted:false})}));
    await cards.reload();
    await cards.waitForFunction(()=>/그림을 불러오지 못했어요/.test(document.querySelector('[data-work="legacy-webp"]')?.innerText||''),{},{timeout:20000});
    assert.equal(await cards.locator('[data-work] img').count(),0);assert.match(await cards.locator('[data-work="legacy-webp"]').innerText(),/구름이 쉬는 베개/);
    await cards.context().close();

    // With no class open the board says so and comes back when a class opens.
    const waitingPage=await context.newPage();watch(waitingPage,'waiting board');
    await waitingPage.addInitScript(([key,value])=>localStorage.setItem(key,value),['celadon-ppt-addin-v1',JSON.stringify({panel:'follow',link,model:'beauty'})]);
    await control('delete');
    await waitingPage.goto(`${base}/ppt-addin/index.html?legacy=1`);
    await waitingPage.locator('[data-waiting]').waitFor({timeout:15000});
    assert.match(await waitingPage.locator('#lg-root').innerText(),/지금은 열린 수업이 없어요/);assert.match(await waitingPage.locator('#lg-root').innerText(),/수업 전/);
    assert.equal(await waitingPage.locator('.lg-turn').count(),3,'the lesson pictures can still be looked at');
    room=null;room=await api('create',{joinCode:'탑텐반',createToken:require('node:crypto').randomBytes(32).toString('base64url')},{auth:null});
    await waitingPage.locator('[data-waiting]').waitFor({state:'detached',timeout:15000});
    await waitingPage.close();

    // Inside PowerPoint (Office.js stand-in): a slide show has no buttons for changing the box, the cover waits for
    // a click, and a presenter remote's PageDown moves the slides.
    const showContext=await browser.newContext({viewport:{width:1000,height:562}});
    await showContext.route(OFFICE_JS,route=>route.fulfill({contentType:'text/javascript',body:officeStub('read')}));
    const show=await showContext.newPage();watch(show,'slide show');
    await show.addInitScript(([link])=>{window.__settings={panel:'comparison',link,model:'beauty',cover:true};},[link]);
    await show.goto(`${base}/ppt-addin/index.html?legacy=1`);
    await show.locator('#lg-cover-screen').waitFor({state:'visible',timeout:15000});
    assert.equal(await show.locator('[data-act=setup]').count(),0);
    await show.locator('#lg-cover-screen').click();await show.locator('#lg-cover-screen').waitFor({state:'hidden'});
    await show.locator('[data-comparison="1"]').waitFor({timeout:15000});
    await show.keyboard.press('PageDown');await show.keyboard.press('PageUp');
    assert.deepEqual(await show.evaluate(()=>window.__goto),['next','previous']);
    // Back in the editor the box can be changed again.
    await show.evaluate(()=>window.__viewHandler({activeView:'edit'}));
    await show.locator('[data-act=setup]').waitFor();
    assert.deepEqual(errors,[]);
    console.log('Old-engine add-in board: setup, anonymous comparison counts, turning pictures, 청자 설명 보기 from the slide, following 아름다움·쓰임·완성작, real 3D (turn, tilt, zoom, kept across redraws, self-turning), falling back to pictures without WebGL, with a missing model and after an empty drawing, pictures of finished works as JPEG where WebP cannot be drawn, waiting for a class, slide-show cover and remote keys passed.');
  }finally{
    if(room&&teacher)await control('delete').catch(()=>{});
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
