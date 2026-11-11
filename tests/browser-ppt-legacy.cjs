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
    const picks=[{1:'japan',2:'yuan',3:'goryeo'},{1:'japan',2:'goryeo',3:'yuan'}];
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
    // Pressing with no address answers plainly: a red box says the field is empty, the field is marked and ready to type
    // in, and the form still fits the box (the button stays in view).
    const shownError=()=>page.waitForFunction(()=>{const note=document.querySelector('#lg-error');return note&&note.innerHTML&&getComputedStyle(note).visibility==='visible';});
    await page.locator('.lg-submit').click();await shownError();   // the box blinks on each press
    assert.match(await page.locator('#lg-error').innerText(),/PPT용 주소 칸이 비어 있어요[\s\S]*PPT용 주소 복사/);
    const emptyNote=await page.evaluate(()=>{const note=document.querySelector('#lg-error'),field=document.querySelector('#lg-link'),button=document.querySelector('.lg-submit').getBoundingClientRect(),body=document.querySelector('.lg-body');
      return{boxed:getComputedStyle(note).backgroundColor,marked:field.className,focused:document.activeElement===field,buttonBottom:button.bottom,height:innerHeight,scrolls:body.scrollHeight>body.clientHeight+1};});
    assert.notEqual(emptyNote.boxed,'rgba(0, 0, 0, 0)','the message is a filled box');assert.equal(emptyNote.marked,'lg-bad-field');assert.equal(emptyNote.focused,true);
    assert.ok(emptyNote.buttonBottom<=emptyNote.height+1&&!emptyNote.scrolls,`the form still fits with the message (${JSON.stringify(emptyNote)})`);
    // A wrong address is named as such.
    await page.locator('#lg-link').fill('https://example.com/observe?code=탑텐반#key=abc');await page.locator('.lg-submit').click();
    await page.waitForFunction(()=>/이 주소는 PPT용 주소가 아니에요/.test(document.querySelector('#lg-error').innerHTML));await shownError();
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
    await api('answer',{participantId:students[2].participantId,activity:1,runId:a1.state.runId,clientRevision:1,final:true,answers:{1:'goryeo',2:'yuan',3:'japan'}},{auth:students[2].participantToken});
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
    // The same word spelled another way joins it, and tapping the word shows what was actually written.
    await api('answer',{participantId:students[2].participantId,activity:2,runId:a2.state.runId,clientRevision:1,answers:{1:{name:'베게',use:'머리 받쳐요.'}}},{auth:students[2].participantToken});
    await page.waitForFunction(()=>/베개\s*3명/.test(document.querySelector('#lg-root').innerText),{},{timeout:15000});
    assert.equal(await page.locator('.lg-word').count(),1,'베개 and 베게 are one word');
    await page.locator('.lg-word').click();
    assert.equal((await page.locator('.lg-detail-box').innerText()).replace(/\s+/g,' '),'베개3명 비슷한 뜻이라 한 낱말로 모았어요. 친구들은 이렇게 썼어요. 베개 2명 베게 1명 닫기');
    await page.locator('.lg-detail-box button').click();assert.equal(await page.locator('.lg-detail').count(),0);
    await page.locator('[data-act=kind][data-kind=use]').click();assert.match(await text(),/어디에 썼을까요\?/);assert.match(await text(),/머리 받쳐요\s*2명/,'머리를 받쳐요 and 머리 받쳐요. are one word');
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
    await page.locator('.lg-address').waitFor();assert.equal(await page.locator('.lg-address').inputValue(),`${base}/present?open=game`);
    assert.equal(await page.locator('[data-act=open-game]').getAttribute('href'),'/present?open=game');assert.equal(await page.locator('[data-act=open-game]').getAttribute('target'),'_blank');
    assert.match(await text(),/상자 안에서는 열 수 없어요/);assert.match(await text(),/하이퍼링크\(Ctrl\+K\)/);
    await page.close();

    // Real 3D where the engine's WebGL works: the old three.js draws the models, which turn, tilt and zoom.
    const boardPage=async(options={})=>{
      const boardContext=await browser.newContext({viewport:{width:1000,height:562}});await boardContext.route(OFFICE_JS,route=>route.abort());
      if(options.block)await boardContext.route(options.block,route=>route.abort());
      const board=await boardContext.newPage();watch(board,options.label||'3D board');board.fetched=[];board.on('request',request=>board.fetched.push(request.url()));
      if(options.before)await board.addInitScript(options.before);
      await board.addInitScript(([key,value])=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},['celadon-ppt-addin-v1',JSON.stringify({panel:options.panel||'comparison',link,model:options.model||'beauty',...(options.settings||{})})]);
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

    // 청자만 크게 보기 (for a slide that only looks around one celadon): the model fills the box, the only buttons are
    // 확대 and 축소, it is turned by dragging and does not turn by itself.
    const alone=await boardPage({label:'plain model',panel:'model',model:'beauty',settings:{plain:true}});
    await alone.locator('.lg-turn[data-model=beauty][data-3d=ready]').waitFor({timeout:60000});
    const shownButtons=page=>page.locator('#lg-root button').evaluateAll(nodes=>nodes.filter(node=>node.offsetParent!==null).map(node=>node.textContent));
    assert.deepEqual(await shownButtons(alone),['＋','－','화면 바꾸기']);
    assert.equal(await alone.locator('.lg-head').isVisible(),false,'no bar at the top');
    assert.equal(await alone.locator('[data-act=turn],[data-act=auto],[data-act=reset-view],.lg-model-name,.lg-turn-hint').count(),0);
    assert.deepEqual(await alone.locator('.lg-plain canvas.lg-3d').evaluate(node=>{const r=node.getBoundingClientRect();return [r.left,r.top,r.width,r.height];}),[0,0,1000,562],'the drawing fills the whole box');
    const view=()=>alone.evaluate(()=>window.__legacy3d.state('beauty'));
    assert.equal((await view()).yaw,0);await alone.waitForTimeout(700);assert.equal((await view()).yaw,0,'it does not turn by itself');
    await alone.locator('[data-act=zoom][data-factor="1.25"]').click();assert.equal((await view()).zoom,1.25);
    for(let i=0;i<8;i++)await alone.locator('[data-act=zoom][data-factor="1.25"]').click();assert.equal((await view()).zoom,4,'at most four times closer');
    await alone.locator('[data-act=zoom][data-factor="0.8"]').click();assert.ok((await view()).zoom<4);
    await alone.mouse.move(700,280);await alone.mouse.down();await alone.mouse.move(840,280,{steps:5});await alone.waitForTimeout(250);await alone.mouse.up();
    assert.ok((await view()).yaw>0.5,'dragging anywhere in the box turns it');
    assert.equal(await alone.evaluate(()=>{const body=document.querySelector('.lg-body');return body.scrollHeight<=body.clientHeight+1&&body.scrollWidth<=body.clientWidth+1;}),true);
    // It is one of the choices in the form (with the list of celadons), and the choice is kept.
    await alone.locator('[data-act=setup]').click();
    assert.equal(await alone.locator('input[name=lg-panel][value=plain]').isChecked(),true);assert.equal(await alone.locator('#lg-model-field').isVisible(),true);
    assert.match(await alone.locator('#lg-form').innerText(),/청자만 크게 보기/);
    await alone.locator('input[name=lg-panel][value=model]').check();await alone.locator('.lg-submit').click();
    await alone.locator('.lg-model-name').waitFor();assert.equal(await alone.locator('.lg-plain').count(),0,'the usual model box again');
    await alone.locator('[data-act=setup]').click();await alone.locator('input[name=lg-panel][value=plain]').check();await alone.locator('#lg-model').selectOption('comparison-2');await alone.locator('.lg-submit').click();
    await alone.locator('.lg-plain .lg-turn[data-model="comparison-2"]').waitFor();
    await alone.context().close();
    // Where 3D does not work the picture itself is enlarged (up to three times) inside its square.
    const flatAlone=await boardPage({label:'plain pictures',panel:'model',model:'beauty',settings:{plain:true,three:false}});
    const picture=flatAlone.locator('.lg-plain .lg-turn[data-model=beauty]');await picture.waitFor();
    assert.deepEqual(await shownButtons(flatAlone),['＋','－','화면 바꾸기']);
    await flatAlone.locator('[data-act=zoom][data-factor="1.25"]').click();assert.equal(await picture.evaluate(node=>node.style.transform),'scale(1.25)');
    for(let i=0;i<8;i++)await flatAlone.locator('[data-act=zoom][data-factor="1.25"]').click();assert.equal(await picture.evaluate(node=>node.style.transform),'scale(3)');
    for(let i=0;i<9;i++)await flatAlone.locator('[data-act=zoom][data-factor="0.8"]').click();assert.equal(await picture.evaluate(node=>node.style.transform),'scale(1)');
    const square=await picture.boundingBox();assert.ok(Math.abs(square.width-562)<2&&Math.abs(square.height-562)<2,'the pictures keep their square, as tall as the box');
    await flatAlone.context().close();

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
    // 비슷한 주문끼리 비교: the two works answered orders for the same use, so they stand side by side under its name
    // with the order and what was made in words; a third, for another use, is its own group. Still no names.
    await api('work',{participantId:students[2].participantId,runId:a3.state.runId,work:{...work,id:'legacy-vessel',orderId:'royal-simple-vessel',shape:'maebyeong',modelId:'maebyeong',technique:'plain',pattern:'',placements:[],title:'비색 매병',explanationUse:'무늬 없이 빛깔을 살린 매병이에요. 술을 담아 두면 좋아요.',explanationBeauty:'어깨는 풍성하게 아래는 좁게 빚어 곡선을 살렸어요.'},preview:webpPreview},{auth:students[2].participantToken});
    const compare=await boardPage({label:'compare',panel:'compare',query:'&nowebp=1'});
    await compare.waitForFunction(()=>document.querySelectorAll('.lg-cmp-card img').length===2,{},{timeout:30000});
    assert.deepEqual(await compare.locator('.lg-chips button').evaluateAll(buttons=>buttons.map(button=>[button.innerText.replace(/\s+/g,''),button.className])),[['베개2','lg-on'],['매병1','']]);
    assert.match(await compare.locator('.lg-cmp-head').innerText(),/비슷한 주문끼리 비교하기[\s\S]*청자 베개 주문\s*2점[\s\S]*누워서 쉴 때 머리를 받칩니다[\s\S]*같은 점과 다른 점/);
    assert.deepEqual((await compare.locator('.lg-cmp-card').evaluateAll(cards=>cards.map(card=>[card.querySelector('h2').textContent,...[...card.querySelectorAll('.lg-cmp-facts div')].map(item=>item.textContent)]))).sort(),
      [['구름이 쉬는 베개','주문왕실 · 학·구름 무늬 · 상감','만든 것학 무늬 · 상감'],['학이 쉬는 청자 베개','주문왕실 · 학·구름 무늬 · 상감','만든 것학 무늬 · 상감']]);
    // A picture keeps its own shape (that engine has no object-fit), and the whole board fits the slide box.
    const drawn=await compare.locator('.lg-cmp-card img').first().evaluate(image=>({natural:image.naturalWidth/image.naturalHeight,shown:image.getBoundingClientRect().width/image.getBoundingClientRect().height}));
    assert.ok(Math.abs(drawn.natural-drawn.shown)<.03,`picture ratio ${drawn.natural} shown as ${drawn.shown}`);
    assert.equal(await compare.evaluate(()=>{const body=document.querySelector('.lg-body');return body.scrollHeight<=body.clientHeight+1;}),true,'nothing to scroll');
    assert.ok(!(await compare.locator('#lg-root').innerText()).includes(privateName));
    // 크게 보기: one work with its whole explanation, and back.
    await compare.locator('[data-work="legacy-work"] [data-act=compare-open]').click();
    assert.match(await compare.locator('.lg-cmp-one').innerText(),/학이 쉬는 청자 베개[\s\S]*모양 · 문양 · 쓰임[\s\S]*머리를 받치고 쉬면 좋아요[\s\S]*공들인 부분[\s\S]*또렷하게 만들었어요/);
    await compare.locator('[data-act=compare-close]').click();assert.equal(await compare.locator('.lg-cmp-card').count(),2);
    // The other group: one work, a plain one made for an order that left pattern and technique free.
    await compare.locator('.lg-chips button',{hasText:'매병'}).click();
    assert.match(await compare.locator('.lg-cmp-head').innerText(),/청자 매병 주문\s*1점[\s\S]*한 명이 받았어요/);
    assert.deepEqual(await compare.locator('.lg-cmp-facts div').allTextContents(),['주문왕실 · 무늬·기법은 자유','만든 것무늬 없이 표현하기']);
    assert.equal(await compare.locator('[data-act=works-view]').count(),0,'a box set to the comparison alone has no switch');
    await compare.context().close();
    // The works board (also when following the class) has both views one tap apart, and the pictures keep their shape there too.
    const both=await boardPage({label:'works switch',panel:'works',query:'&nowebp=1'});
    await both.waitForFunction(()=>document.querySelectorAll('.lg-work img').length===3,{},{timeout:30000});
    const tile=await both.locator('.lg-work img').first().evaluate(image=>({natural:image.naturalWidth/image.naturalHeight,shown:image.getBoundingClientRect().width/image.getBoundingClientRect().height}));
    assert.ok(Math.abs(tile.natural-tile.shown)<.03,`works picture ratio ${tile.natural} shown as ${tile.shown}`);
    await both.locator('[data-act=works-view][data-view=compare]').click();
    assert.equal(await both.locator('.lg-cmp-card').count(),2);assert.equal(await both.locator('[data-act=works-view].lg-on').innerText(),'비슷한 주문끼리');
    await both.locator('[data-act=works-view][data-view=all]').click();assert.equal(await both.locator('.lg-work').count(),3);
    await both.context().close();
    // If the server cannot convert a picture, that work keeps its text card.
    const cards=await boardPage({label:'no conversion',panel:'works',query:'&nowebp=1',before:()=>{}});
    await cards.context().route('**/api/work-picture?*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({preview:'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',converted:false})}));
    await cards.reload();
    await cards.waitForFunction(()=>/그림을 불러오지 못했어요/.test(document.querySelector('[data-work="legacy-webp"]')?.innerText||''),{},{timeout:20000});
    assert.equal(await cards.locator('[data-work] img').count(),0);assert.match(await cards.locator('[data-work="legacy-webp"]').innerText(),/구름이 쉬는 베개/);
    await cards.context().close();

    // 워드 클라우드만 크게 보기: one word cloud alone fills the box — no bar, no model, no notice. The most common
    // answer is the largest and sits in the middle; the words are close together, inside the box, and never overlap.
    const cloudShape=target=>target.evaluate(()=>{const box=document.querySelector('.lg-cloud-only, .word-cloud').getBoundingClientRect();
      const words=[...document.querySelectorAll('.lg-cw, .cloud-word')].map(node=>{const r=node.getBoundingClientRect();return {text:node.textContent,size:parseFloat(getComputedStyle(node).fontSize),left:r.left,top:r.top,right:r.right,bottom:r.bottom};});
      const gap=(a,b)=>Math.max(0,Math.max(b.left-a.right,a.left-b.right),Math.max(b.top-a.bottom,a.top-b.bottom)),largest=[...words].sort((a,b)=>b.size-a.size)[0];
      return {texts:words.map(word=>word.text).sort(),largest:largest.text,share:largest.size/box.height,centred:Math.abs((largest.left+largest.right)/2-(box.left+box.right)/2)<box.width*.12&&Math.abs((largest.top+largest.bottom)/2-(box.top+box.bottom)/2)<box.height*.2,
        inside:words.every(word=>word.left>=box.left-1&&word.top>=box.top-1&&word.right<=box.right+1&&word.bottom<=box.bottom+1),
        apart:words.every((a,i)=>words.every((b,j)=>i===j||gap(a,b)>=1)),near:Math.max(...words.map((a,i)=>Math.min(...words.filter((b,j)=>i!==j).map(b=>gap(a,b))))),
        other:document.querySelectorAll('.lg-head:not([style*="none"]), .lg-note, .lg-turn, .lg-bar, .board-status, .viewer-host').length};});
    const cloudBox=await boardPage({label:'cloud alone',panel:'cloud',settings:{cloud:'beauty',three:false}});
    await cloudBox.locator('.lg-cloud-only[data-layout=ready]').waitFor({timeout:20000});
    const beautyCloud=await cloudShape(cloudBox);
    assert.deepEqual({texts:beautyCloud.texts,largest:beautyCloud.largest,centred:beautyCloud.centred,inside:beautyCloud.inside,apart:beautyCloud.apart,other:beautyCloud.other},
      {texts:['비색이 맑아요','학 무늬가 날아요'],largest:'비색이 맑아요',centred:true,inside:true,apart:true,other:0},JSON.stringify(beautyCloud));
    assert.ok(beautyCloud.near<=6,`the words sit close together: ${beautyCloud.near}px`);assert.ok(beautyCloud.share>=.2,`the cloud fills the box: ${beautyCloud.share}`);
    assert.equal(await cloudBox.locator('#lg-root button').count(),1,'only 화면 바꾸기, and only while editing');
    assert.ok(!(await cloudBox.locator('#lg-root').innerText()).includes(privateName));
    // Another cloud is chosen in the form: the names guessed for 청자 1.
    await cloudBox.locator('[data-act=setup]').click();
    assert.equal(await cloudBox.locator('input[name=lg-panel][value=cloud]').isChecked(),true);assert.equal(await cloudBox.locator('#lg-cloud-field').isVisible(),true);assert.equal(await cloudBox.locator('#lg-model-field').isVisible(),false);
    assert.equal(await cloudBox.locator('#lg-cloud option').count(),11);assert.equal(await cloudBox.locator('#lg-cloud').inputValue(),'beauty');
    await cloudBox.locator('#lg-cloud').selectOption('name-1');await cloudBox.locator('.lg-submit').click();
    await cloudBox.locator('.lg-cloud-only[data-cloud="name-1"][data-layout=ready]').waitFor({timeout:20000});
    const nameCloud=await cloudShape(cloudBox);assert.deepEqual([nameCloud.texts,nameCloud.inside,nameCloud.apart,nameCloud.other],[['베개'],true,true,0]);
    // Tapping the word shows what was written under it; tapping anywhere closes the box again.
    await cloudBox.locator('.lg-cw').click();
    assert.match((await cloudBox.locator('.lg-detail-box').innerText()).replace(/\s+/g,' '),/^베개3명 비슷한 뜻이라 한 낱말로 모았어요\. 친구들은 이렇게 썼어요\. 베개 2명 베게 1명/);
    await cloudBox.locator('.lg-detail').click({position:{x:8,y:8}});assert.equal(await cloudBox.locator('.lg-detail').count(),0);
    // The uses: the two ways of writing 머리를 받쳐요 are one word; 낮잠 잘 때 써요 is another until a helper says otherwise.
    await cloudBox.locator('[data-act=setup]').click();await cloudBox.locator('#lg-cloud').selectOption('use-1');await cloudBox.locator('.lg-submit').click();
    await cloudBox.locator('.lg-cloud-only[data-cloud="use-1"][data-layout=ready]').waitFor({timeout:20000});
    assert.deepEqual((await cloudShape(cloudBox)).texts,['낮잠 잘 때 써요','머리 받쳐요']);
    // A cloud with nothing in it yet says so.
    await cloudBox.locator('[data-act=setup]').click();await cloudBox.locator('#lg-cloud').selectOption('use-5');await cloudBox.locator('.lg-submit').click();
    await cloudBox.locator('.lg-cloud-only[data-cloud="use-5"] .lg-cloud-empty').waitFor({timeout:20000});
    assert.match(await cloudBox.locator('.lg-cloud-empty').innerText(),/아직 도착한 생각이 없어요/);
    // The same cloud alone on the site's board (the current engine): /observe?…&show=cloud&cloud=…
    const siteCloud=await cloudBox.context().newPage();watch(siteCloud,'site cloud');
    await siteCloud.goto(link.replace('#key=','&show=cloud&cloud=beauty#key='));
    await siteCloud.waitForFunction(()=>document.querySelector('.cloud-only .word-cloud')?.dataset.cloudLayout==='ready',{},{timeout:30000});
    const siteShape=await cloudShape(siteCloud);
    assert.deepEqual({texts:siteShape.texts,largest:siteShape.largest,centred:siteShape.centred,inside:siteShape.inside,apart:siteShape.apart,other:siteShape.other},
      {texts:['비색이 맑아요','학 무늬가 날아요'],largest:'비색이 맑아요',centred:true,inside:true,apart:true,other:0},JSON.stringify(siteShape));
    assert.ok(siteShape.near<=6&&siteShape.share>=.15,JSON.stringify(siteShape));
    assert.equal(await siteCloud.evaluate(()=>document.documentElement.scrollHeight<=innerHeight&&document.querySelectorAll('button').length===0),true,'nothing but the cloud');
    await siteCloud.goto(link.replace('#key=','&show=cloud&cloud=name-1#key='));
    await siteCloud.waitForFunction(()=>document.querySelector('.cloud-only[data-cloud="name-1"] .word-cloud')?.dataset.cloudLayout==='ready',{},{timeout:30000});
    assert.deepEqual((await cloudShape(siteCloud)).texts,['베개']);
    // On the site's board a tap opens the same list; Esc or 닫기 closes it.
    await siteCloud.locator('.cloud-word').click();await siteCloud.locator('.cloud-word-dialog[open]').waitFor();
    assert.equal((await siteCloud.locator('.cloud-word-dialog').innerText()).replace(/\s+/g,' '),'베개 3명 닫기 × 비슷한 뜻이라 한 낱말로 모았어요. 친구들은 이렇게 썼어요. 베개 2명 베게 1명');
    await siteCloud.locator('[data-close-cloud-word]').click();assert.equal(await siteCloud.locator('.cloud-word-dialog').count(),0);
    await siteCloud.locator('.cloud-word').focus();await siteCloud.keyboard.press('Enter');await siteCloud.locator('.cloud-word-dialog[open]').waitFor();await siteCloud.keyboard.press('Escape');
    await siteCloud.waitForFunction(()=>!document.querySelector('.cloud-word-dialog'));
    await cloudBox.context().close();

    // On a touch screen (an interactive whiteboard) the board's buttons are large enough for a finger and still fit.
    const fingerContext=await browser.newContext({viewport:{width:1500,height:844},hasTouch:true});await fingerContext.route(OFFICE_JS,route=>route.abort());
    const finger=await fingerContext.newPage();watch(finger,'touch board');
    await finger.addInitScript(([key,value])=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},['celadon-ppt-addin-v1',JSON.stringify({panel:'comparison',link,model:'beauty',three:false})]);
    await finger.goto(`${base}/ppt-addin/index.html?legacy=1`);await finger.locator('[data-comparison="1"]').waitFor({timeout:15000});
    const fit=await finger.evaluate(()=>{const heights=[...document.querySelectorAll('#lg-root button')].map(node=>node.getBoundingClientRect().height),body=document.querySelector('.lg-body');
      return {touch:document.querySelector('#lg-root').className,least:Math.min(...heights),sideways:body.scrollWidth>body.clientWidth+1};});
    assert.equal(fit.touch,'lg-touch');assert.ok(fit.least>=40,`the smallest button is ${fit.least}px tall`);assert.equal(fit.sideways,false);
    await finger.locator('[data-act=turn][data-model="comparison-1"][data-step="2"]').tap();
    assert.equal(await finger.locator('.lg-turn[data-model="comparison-1"]').getAttribute('data-frame'),'2','a tap turns the picture');
    await fingerContext.close();

    // The board always fits its box: nothing scrolls, the keys under a 3D model stay on one row, and a reload (↻)
    // leaves every size as it was. A box that is not 16:9, or one PowerPoint resizes without telling the page, is
    // followed too (the board looks at its own box every second).
    const boxContext=await browser.newContext({viewport:{width:1400,height:785},hasTouch:true});await boxContext.route(OFFICE_JS,route=>route.abort());
    const boxed=await boxContext.newPage();watch(boxed,'fitting board');
    await boxed.addInitScript(([key,value])=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},['celadon-ppt-addin-v1',JSON.stringify({panel:'comparison',link,model:'beauty'})]);
    const boxSizes=()=>boxed.evaluate(()=>{const body=document.querySelector('.lg-body'),keys=[...document.querySelectorAll('.lg-turn-keys')].map(row=>Math.round(row.getBoundingClientRect().height/Math.max(...[...row.querySelectorAll('button')].map(key=>key.getBoundingClientRect().height))));
      return {font:Math.round(parseFloat(document.documentElement.style.fontSize)*10)/10,fits:body.scrollHeight<=body.clientHeight+1&&body.scrollWidth<=body.clientWidth+1,rows:Math.max(...keys),keys:document.querySelectorAll('.lg-turn-keys button').length};});
    const fitSettled=async()=>{await boxed.waitForFunction(()=>document.querySelectorAll('.lg-turn[data-3d=ready]').length===3,{},{timeout:60000});await boxed.waitForTimeout(1500);return boxSizes();};
    await boxed.goto(`${base}/ppt-addin/index.html?legacy=1`);
    const firstFit=await fitSettled();
    assert.deepEqual({fits:firstFit.fits,rows:firstFit.rows,keys:firstFit.keys},{fits:true,rows:1,keys:15},JSON.stringify(firstFit));assert.ok(firstFit.font<=1400/64+.05&&firstFit.font>=1400/64*.9,`sized from the box: ${firstFit.font}`);
    await boxed.locator('[data-act=reload]').tap();await boxed.waitForLoadState('load');
    assert.deepEqual(await fitSettled(),firstFit,'the same after a reload');
    await boxed.locator('[data-act=reload]').tap();await boxed.waitForLoadState('load');
    assert.deepEqual(await fitSettled(),firstFit,'and after another');
    // If what is shown is taller than the box (here a tall bar stands in for an engine whose text runs larger),
    // everything is drawn smaller until it fits.
    await boxed.addStyleTag({content:'.lg-bar{padding-bottom:7rem!important}'});
    await boxed.setViewportSize({width:1401,height:785});await boxed.waitForTimeout(1500);
    const tallFit=await boxSizes();assert.equal(tallFit.fits,true,JSON.stringify(tallFit));assert.ok(tallFit.font<firstFit.font*.9&&tallFit.font>=firstFit.font*.6,`drawn smaller: ${tallFit.font} from ${firstFit.font}`);
    await boxed.addStyleTag({content:'.lg-bar{padding-bottom:0!important}'});
    // A squat box: sized from its height, and still nothing to scroll.
    await boxed.setViewportSize({width:1400,height:560});await boxed.waitForTimeout(1500);
    const squatFit=await boxSizes();assert.equal(squatFit.fits,true);assert.ok(squatFit.font<=560/36+.05,`a squat box is sized from its height: ${squatFit.font}`);
    // The box changes size without a resize event reaching the page: within a second or two the board follows.
    await boxed.evaluate(()=>{window.addEventListener('resize',event=>event.stopImmediatePropagation(),true);});
    await boxed.setViewportSize({width:1000,height:562});
    await boxed.waitForFunction(()=>Math.abs(parseFloat(document.documentElement.style.fontSize)-1000/64)<1.6,{},{timeout:8000});
    assert.equal((await boxSizes()).fits,true);
    await boxContext.close();

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
    // 청자만 크게 보기 in a slide show: only the model and the two zoom buttons.
    const showPlain=await showContext.newPage();watch(showPlain,'plain slide show');
    await showPlain.addInitScript(()=>{window.__settings={panel:'model',model:'beauty',plain:true};});
    await showPlain.goto(`${base}/ppt-addin/index.html?legacy=1`);
    await showPlain.locator('.lg-turn[data-model=beauty][data-3d=ready]').waitFor({timeout:60000});
    assert.deepEqual(await showPlain.locator('#lg-root button').evaluateAll(nodes=>nodes.filter(node=>node.offsetParent!==null).map(node=>node.textContent)),['＋','－']);
    await showPlain.evaluate(()=>window.__viewHandler({activeView:'edit'}));await showPlain.locator('[data-act=setup]').waitFor();
    assert.deepEqual(errors,[]);
    console.log('Old-engine add-in board: word cloud alone (old engine and site board), similar answers as one word with a tap showing what was written, fitting its box (same after reloads, squat box, unannounced resize), similar-order comparison (groups, words, 크게 보기), setup, anonymous comparison counts, turning pictures, 청자 설명 보기 from the slide, following 아름다움·쓰임·완성작, real 3D (turn, tilt, zoom, kept across redraws, self-turning), falling back to pictures without WebGL, with a missing model and after an empty drawing, pictures of finished works as JPEG where WebP cannot be drawn, large buttons on a touch screen, plain model view (zoom only, whole box, no self-turning, picture zoom), waiting for a class, slide-show cover and remote keys passed.');
  }finally{
    if(room&&teacher)await control('delete').catch(()=>{});
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
