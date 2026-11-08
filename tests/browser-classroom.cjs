/* Real HTTP/file-store integration. Run after npm run build against server.mjs. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const screenshotDirectory = process.env.CLASSROOM_SCREENSHOTS || '/tmp';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(check, message, timeout=20000) {
  const start=Date.now(); let last;
  while(Date.now()-start<timeout) {try {last=await check();if(last)return last;}catch(error){last=error.message;}await delay(150);}
  throw new Error(`${message}: ${JSON.stringify(last)}`);
}
async function session(page, teacher=false) {return page.evaluate(teacher=>JSON.parse((teacher?localStorage:sessionStorage).getItem(teacher?'celadon-classroom-teacher-v1':'celadon-classroom-student-v1')),teacher);}
async function capture(page, label) {
  for(const viewport of [{width:1366,height:768},{width:1024,height:600}]) {
    await page.setViewportSize(viewport);await page.waitForTimeout(150);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${label} has no horizontal overflow at ${viewport.width}`);
    await page.screenshot({path:path.join(screenshotDirectory,`classroom-${label}-${viewport.width}.png`),fullPage:false});
  }
  await page.setViewportSize({width:1366,height:768});
}

(async()=>{
  assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Classroom tests must use a local server, never a production class.');
  const {rubricAssessment}=await import(pathToFileURL(path.join(__dirname,'../assessment-rules.js')));
  const {evaluateWork}=await import(pathToFileURL(path.join(__dirname,'../domain.js')));
  const {vesselSVG}=await import(pathToFileURL(path.join(__dirname,'../art.js')));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
  const contexts=[]; let teacherSession, api;
  try {
    const errors=[];
    async function createPage(label) {const context=await browser.newContext({viewport:{width:1366,height:768}});contexts.push(context);const page=await context.newPage();page.on('pageerror',error=>errors.push(`${label}: ${error.message}`));return page;}
    const teacher=await createPage('teacher'),studentA=await createPage('student A'),studentB=await createPage('student B');
    api=async(action,{method='GET',body={},auth}={})=>{
      const headers=auth?{Authorization:`Bearer ${auth}`}:{},data={action,...(teacherSession?{code:teacherSession.code}:{}),...body};
      const response=method==='POST'?await teacher.request.post(`${base}/api/classroom`,{headers,data}):await teacher.request.get(`${base}/api/classroom`,{headers,params:data});
      return {status:response.status(),value:await response.json()};
    };
    const health=await api('health');assert.equal(health.status,200);assert.equal(health.value.storage,'filesystem');
    await teacher.goto(`${base}/teacher`);await teacher.locator('[data-form=create] button').click();
    await teacher.locator('.teacher-room-code strong').waitFor();teacherSession=await session(teacher,true);
    assert.match(teacherSession.code,/^[A-Z2-9]{6}$/);
    assert.equal(await teacher.locator('.teacher-room-code strong').innerText(),'탑텐반');
    const overview=async()=>{const response=await api('teacher',{auth:teacherSession.teacherToken});assert.equal(response.status,200);return response.value;};
    const control=async(command,extra={})=>{const response=await api('control',{method:'POST',auth:teacherSession.teacherToken,body:{command,...extra}});assert.equal(response.status,200,JSON.stringify(response.value));return response.value;};
    async function join(page,number,name) {
      await page.goto(`${base}/lesson?code=${encodeURIComponent('탑텐반')}`);
      assert.match(await page.locator('h1').innerText(),/고려청자의 우수성/);
      if(number===1)await capture(page,'welcome');
      await page.locator('[name=number]').fill(String(number));await page.locator('[name=name]').fill(name);
      await page.locator('[data-form=join] button[type=submit]').click();await page.getByTestId('waiting-screen').waitFor();return session(page);
    }
    const [a,b]=await Promise.all([join(studentA,1,'봄샘'),join(studentB,2,'하늘')]);
    await studentA.reload();await studentA.getByTestId('waiting-screen').waitFor();
    assert.equal((await session(studentA)).participantToken,a.participantToken);
    assert.match(await studentA.locator('.student-badge').innerText(),/1번 봄샘/);
    await teacher.reload();await teacher.locator('.teacher-room-code strong').waitFor();
    assert.equal((await session(teacher,true)).teacherToken,teacherSession.teacherToken);
    assert.equal((await overview()).participants.length,2);
    assert.equal((await api('teacher')).status,403);
    assert.equal((await api('teacher',{auth:a.participantToken})).status,403);
    assert.equal((await api('control',{method:'POST',auth:a.participantToken,body:{command:'start',activity:1}})).status,403);
    console.log('Classroom: two independent identities, reload persistence and teacher authorization passed.');

    await teacher.locator('[data-action=start][data-activity="1"]').click();
    await Promise.all([studentA.locator('#country-1').waitFor(),studentB.locator('#country-1').waitFor()]);
    assert.match(await studentA.locator('.current-activity').innerText(),/활동 1 \/ 3/);
    assert.match(await studentA.getByTestId('lesson-timer').innerText(),/1:[0-5]\d/);
    await studentA.waitForFunction(()=>document.querySelectorAll('[data-viewer-status=ready]').length===3,{},{timeout:45000});
    assert.equal(await studentA.locator('.lesson-viewer__canvas').count(),3);
    await studentA.locator('[data-viewer="1"]').getByRole('button',{name:'오른쪽으로 돌리기'}).click();
    let rejectedAnswer=false;
    const temporaryFailure=async route=>{const request=route.request(),body=request.method()==='POST'?request.postDataJSON():null;if(body?.action==='answer'&&!rejectedAnswer){rejectedAnswer=true;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'시험용 일시 연결 오류',code:'storage-unavailable'})});}else await route.continue();};
    await studentA.route('**/api/classroom',temporaryFailure);
    await studentA.locator('#country-1').selectOption('yuan');await studentA.locator('#country-2').selectOption('goryeo');await studentA.locator('#country-3').selectOption('japan');
    await studentB.locator('#country-1').selectOption('japan');await studentB.locator('#country-2').selectOption('goryeo');await studentB.locator('#country-3').selectOption('yuan');
    const comparison=await eventually(async()=>{const data=await overview();return data.comparison.every(item=>item.respondents===2)?data:false;},'Both country answers persist');
    assert.equal(rejectedAnswer,true,'test exercised a transient failed save');
    await studentA.unroute('**/api/classroom',temporaryFailure);
    assert.equal(comparison.comparison[0].choices.find(item=>item.country==='yuan').percent,50);
    assert.equal(comparison.comparison[0].choices.find(item=>item.country==='japan').percent,50);
    assert.equal(comparison.comparison[1].choices.find(item=>item.country==='goryeo').percent,100);
    await teacher.waitForFunction(()=>document.querySelector('.teacher-visuals')?.textContent.includes('50%'));
    assert.equal(await studentA.locator('.answer-reveal').count(),0);
    await capture(studentA,'activity1-student');await capture(teacher,'activity1-teacher');
    await studentA.reload();await studentA.locator('#country-1').waitFor();assert.equal(await studentA.locator('#country-1').inputValue(),'yuan');
    let releaseAnswer,answerHeld=false;
    const heldAnswer=new Promise(resolve=>{releaseAnswer=resolve;});
    const delayAnswer=async route=>{const request=route.request(),body=request.method()==='POST'?request.postDataJSON():null;if(body?.action==='answer'){const response=await route.fetch();answerHeld=true;await heldAnswer;await route.fulfill({response});}else await route.continue();};
    await studentA.route('**/api/classroom',delayAnswer);
    await studentA.locator('#country-1').selectOption('goryeo');await eventually(()=>answerHeld,'Hold an active-state answer response before teacher pause');
    await teacher.locator('[data-action=pause]').click();
    await Promise.all([studentA.getByTestId('lock-screen').waitFor(),studentB.getByTestId('lock-screen').waitFor()]);
    const staleResponse=studentA.waitForResponse(response=>response.request().method()==='POST'&&response.request().postDataJSON()?.action==='answer');releaseAnswer();await staleResponse;await studentA.waitForTimeout(350);
    await studentA.unroute('**/api/classroom',delayAnswer);
    assert.equal(await studentA.getByTestId('lock-screen').isVisible(),true,'a delayed answer response must not reopen the previous activity');
    assert.match(await studentA.getByTestId('lock-screen').innerText(),/크롬북을 닫고/);
    assert.equal((await api('answer',{method:'POST',auth:a.participantToken,body:{participantId:a.participantId,activity:1,runId:comparison.state.runId,clientRevision:100,answers:{1:'goryeo'}}})).status,409);
    await capture(studentA,'closed');
    console.log('Classroom: real 3D comparison, percentage charts, transient-save retry, stale-response pause protection and late-answer rejection passed.');

    await teacher.locator('[data-action=teacher-activity][data-activity="2"]').click();await teacher.locator('[data-action=start][data-activity="2"]').click();
    await Promise.all([studentA.locator('#guess-name').waitFor(),studentB.locator('#guess-name').waitFor()]);
    await studentA.locator('#guess-name').fill('머리 받침');await studentA.locator('#guess-use').fill('누워서 머리를 받쳐요');
    await studentB.locator('#guess-name').fill('머리 받침');await studentB.locator('#guess-use').fill('잠을 잘 때 써요');
    for(let id=2;id<=5;id++) {
      await studentA.locator('[data-action=next-object]').click();
      assert.equal(await studentA.locator('.object-dot.active').innerText(),String(id));
      await studentA.locator('#guess-name').fill(['','', '앉는 청자','오리 물그릇','차 주전자','향 담는 그릇'][id]);
      await studentA.locator('#guess-use').fill(['','','앉아서 쉬어요','먹을 갈 때 물을 조금 부어요','차를 따라요','향을 피워요'][id]);
    }
    await studentA.locator('[data-action=next-object]').click();assert.equal(await studentA.locator('#guess-name').inputValue(),'머리 받침');
    const observations=await eventually(async()=>{const data=await overview();return data.participants.find(p=>p.id===a.participantId)?.activity2Complete&&data.observations[0].responses.length===2?data:false;},'Five observation drafts persist');
    assert.equal(observations.observations[0].nameWords.find(item=>item.text==='머리 받침').count,2);
    for(const response of observations.observations.flatMap(item=>item.responses))assert.deepEqual(Object.keys(response).sort(),['name','use']);
    await teacher.waitForFunction(()=>document.querySelector('.word-cloud[data-kind=name]')?.textContent.includes('머리 받침'));
    assert.doesNotMatch(await teacher.locator('.cloud-layout').innerText(),/봄샘|하늘/);
    assert.match(await teacher.locator('.word-cloud[data-kind=name] span').first().getAttribute('title'),/2명/);
    await studentA.waitForFunction(()=>document.querySelector('[data-viewer-status=ready]'),{},{timeout:45000});
    await teacher.waitForFunction(()=>document.querySelector('[data-teacher-viewer]')?.dataset.viewerStatus==='ready'&&document.querySelector('.word-cloud')?.dataset.cloudLayout==='ready',{},{timeout:45000});
    await capture(studentA,'activity2-student');await capture(teacher,'activity2-teacher');
    await teacher.locator('[data-action=cloud-kind][data-kind=use]').click();
    await teacher.waitForFunction(()=>document.querySelector('.word-cloud[data-kind=use]')?.dataset.cloudLayout==='ready');
    assert.match(await teacher.locator('.word-cloud[data-kind=use]').innerText(),/누워서 머리를 받쳐요/);
    assert.match(await teacher.locator('.word-cloud[data-kind=use]').innerText(),/잠을 잘 때 써요/);
    assert.doesNotMatch(await teacher.locator('.cloud-layout').innerText(),/봄샘|하늘/);
    await capture(teacher,'activity2-teacher-use');
    await teacher.locator('[data-action=cloud-kind][data-kind=name]').click();
    await teacher.locator('[data-action=pause]').click();await Promise.all([studentA.getByTestId('lock-screen').waitFor(),studentB.getByTestId('lock-screen').waitFor()]);
    console.log('Classroom: five-object carousel, persisted observations and anonymous repeated-word cloud passed.');

    const completed={id:'classroom-fixture-complete',orderId:'royal-rest',shape:'pillow',modelId:'pillow',step:4,technique:'inlay',pattern:'crane',
      title:'청자 상감 학무늬 베개',placements:[{x:100,y:100,pattern:'crane'}],strokes:[],decorDone:true,decorPhase:2,knead:3,width:1,
      firing:['dry','biscuit','glaze','fire'],clay:{body:true,prepared:true,kneads:6,slip:'white'},inspection:{done:true},
      explanationUse:'학 무늬 베개예요. 머리를 받쳐 쉴 때 쓰면 좋아요.',explanationBeauty:'학 무늬를 파고 흰 흙을 채운 뒤\n또렷하게 보이도록 여러 번 닦았어요.'};
    completed.assessment=rubricAssessment(completed);assert.equal(completed.assessment.accepted,true);
    completed.preview='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(vesselSVG({...completed,uid:'classroom-test'}));
    const unfinished={...completed,id:'classroom-fixture-draft',step:3};
    await teacher.locator('[data-action=teacher-activity][data-activity="3"]').click();await teacher.locator('[data-action=start][data-activity="3"]').click();
    await Promise.all([studentA.getByTestId('classroom-game').waitFor(),studentB.getByTestId('classroom-game').waitFor()]);
    assert.equal(new URL(await studentA.getByTestId('classroom-game').getAttribute('src'),base).pathname,'/game','activity 3 uses the dedicated game route');
    await studentA.frameLocator('iframe').locator('.cover-start').first().waitFor();
    const firstGameRun=(await overview()).state.runId;
    const gameKey=`celadon-tycoon-v2:classroom:${teacherSession.code}:${a.participantId}:run:${firstGameRun}`;
    await studentA.evaluate(({gameKey,completed,unfinished})=>{
      localStorage.setItem('celadon-tycoon-v2',JSON.stringify({marker:'standalone-untouched'}));
      localStorage.setItem(gameKey,JSON.stringify({history:['royal-rest'],gallery:[completed,unfinished],draft:unfinished,sound:false}));
    },{gameKey,completed,unfinished});
    await studentA.locator('iframe').evaluate(frame=>frame.contentWindow.location.reload());
    const gameData=await eventually(async()=>{const data=await overview();return data.works.length?data:false;},'Real game bridge uploads its completed gallery fixture');
    assert.equal(gameData.works.length,1);assert.equal(gameData.works[0].id,completed.id);assert.equal(gameData.works[0].score,evaluateWork(completed).total);
    assert.equal(gameData.works[0].explanationBeauty,completed.explanationBeauty);
    assert.equal(await studentA.evaluate(()=>JSON.parse(localStorage.getItem('celadon-tycoon-v2')).marker),'standalone-untouched');
    await teacher.locator(`[data-work-id="${completed.id}"] img`).waitFor();
    assert.equal(await teacher.locator('.work-card').count(),1);
    assert.match(await teacher.locator('.work-score').innerText(),new RegExp(`${evaluateWork(completed).total}점`));
    assert.match(await teacher.locator('.work-details').innerText(),/봄샘/);
    const artworkParams={participantId:a.participantId,workId:completed.id};
    assert.equal((await api('artwork',{body:artworkParams})).status,403);
    assert.equal((await api('artwork',{body:artworkParams,auth:b.participantToken})).status,403);
    const art=await api('artwork',{body:artworkParams,auth:teacherSession.teacherToken});assert.equal(art.status,200);assert.match(art.value.preview,/^data:image\/(png|webp);base64,/);
    assert.equal((await api('artwork',{body:artworkParams,auth:a.participantToken})).status,200);
    assert.equal((await api('work',{method:'POST',auth:a.participantToken,body:{participantId:a.participantId,runId:gameData.state.runId,work:unfinished,preview:art.value.preview}})).status,400);
    const duplicate=await api('work',{method:'POST',auth:a.participantToken,body:{participantId:a.participantId,runId:gameData.state.runId,work:{...completed,score:100},preview:art.value.preview}});
    assert.equal(duplicate.status,200);assert.equal(duplicate.value.duplicate,true);assert.equal(duplicate.value.work.score,evaluateWork(completed).total);
    assert.equal((await overview()).works.length,1);
    await capture(teacher,'activity3-teacher');await capture(studentB,'activity3-student');
    await studentB.setViewportSize({width:1024,height:600});
    const gameB=studentB.frameLocator('iframe');
    const fullyVisible=async locator=>assert.equal(await locator.evaluate(element=>{const rect=element.getBoundingClientRect();return rect.left>=0&&rect.top>=0&&rect.right<=innerWidth+1&&rect.bottom<=innerHeight+1;}),true,'game action remains fully visible in the Chromebook iframe');
    await fullyVisible(gameB.locator('[data-action=new-order]'));
    await gameB.locator('[data-action=new-order]').click();
    await fullyVisible(gameB.locator('[data-action=accept]'));await gameB.locator('[data-action=accept]').click();
    await gameB.locator('.knead-pad').focus();for(let i=0;i<6;i++)await gameB.locator('.knead-pad').press('Space');
    assert.equal(await gameB.locator('[data-action=clay-ready]').isEnabled(),true);
    await fullyVisible(gameB.locator('[data-action=clay-ready]'));
    await studentB.screenshot({path:path.join(screenshotDirectory,'classroom-activity3-clay-1024.png')});
    await gameB.locator('[data-action=clay-ready]').click();
    await fullyVisible(gameB.locator('[data-action=next-shape]'));
    await studentB.screenshot({path:path.join(screenshotDirectory,'classroom-activity3-shape-1024.png')});
    await studentB.setViewportSize({width:1366,height:768});
    console.log('Classroom: real iframe bridge, finished-only work, exact score, idempotency and private teacher/owner preview access passed.');

    await teacher.locator('[data-action=pause]').click();await Promise.all([studentA.getByTestId('lock-screen').waitFor(),studentB.getByTestId('lock-screen').waitFor()]);
    await control('settings',{settings:{durations:{3:30}}});await control('start',{activity:3});
    await studentA.getByTestId('classroom-game').waitFor();
    await studentA.reload();await studentA.frameLocator('iframe').locator('.cover-start').first().waitFor();
    await studentA.waitForTimeout(700);
    assert.equal((await overview()).works.length,0,'a restarted activity cannot replay prior completed works after parent reload');
    assert.equal(await studentA.evaluate(key=>JSON.parse(localStorage.getItem(key)).gallery.length,gameKey),2,'prior run stays stored under its original namespace');
    await control('pause');await Promise.all([studentA.getByTestId('lock-screen').waitFor(),studentB.getByTestId('lock-screen').waitFor()]);
    // Activity 3 has no time limit: the game keeps running until the teacher ends it, then every student sees the lock screen.
    await control('settings',{settings:{autoPause:false}});await control('start',{activity:3});
    await Promise.all([studentA.getByTestId('classroom-game').waitFor(),studentB.getByTestId('classroom-game').waitFor()]);
    await studentA.waitForTimeout(6000);
    assert.equal(await studentA.getByTestId('classroom-game').count(),1,'activity 3 is still open after several seconds');
    assert.match(await studentA.getByTestId('lesson-timer').innerText(),/진행 시간/);
    const untimed=await overview();assert.equal(untimed.state.status,'active');assert.equal(untimed.state.endsAt,null);
    await control('pause');await Promise.all([studentA.getByTestId('lock-screen').waitFor({timeout:15000}),studentB.getByTestId('lock-screen').waitFor({timeout:15000})]);
    assert.equal(await studentA.getByTestId('classroom-game').count(),0,'ending the activity closes every game');
    await control('settings',{settings:{durations:{1:45},submitButton:true,autoPause:true}});await control('start',{activity:1});
    assert.equal((await api('work',{method:'POST',auth:a.participantToken,body:{participantId:a.participantId,runId:untimed.state.runId,work:completed,preview:art.value.preview}})).status,409,'a work from an earlier run is refused once another activity starts');
    await studentA.locator('#country-1').waitFor();
    await studentA.locator('#country-1').selectOption('yuan');await studentA.locator('#country-2').selectOption('goryeo');await studentA.locator('#country-3').selectOption('japan');
    await studentA.waitForFunction(()=>document.querySelectorAll('[data-viewer-status=ready]').length===3,{},{timeout:45000});
    await capture(studentA,'activity1-submit');await studentA.setViewportSize({width:1024,height:600});
    const submitAnswers=studentA.locator('[data-action=submit-answers]');await fullyVisible(submitAnswers);await submitAnswers.click();
    await eventually(async()=>Boolean((await overview()).participants.find(item=>item.id===a.participantId)?.activity1Submitted),'Explicit submit persists');
    await studentA.waitForFunction(()=>[...document.querySelectorAll('[data-country-for]')].every(select=>select.disabled));
    assert.match(await submitAnswers.innerText(),/다했어요/);
    await studentA.locator('.completion-dialog[open]').waitFor();
    await control('pause');await Promise.all([studentA.getByTestId('lock-screen').waitFor(),studentB.getByTestId('lock-screen').waitFor()]);
    if(process.env.CLASSROOM_DATA_DIR)await fs.access(path.join(process.env.CLASSROOM_DATA_DIR,'classroom-v1','local',teacherSession.code,'room.json'));
    assert.deepEqual(errors,[]);
    console.log('Classroom: activity 3 runs without a time limit until the teacher ends it, then closes every game; real filesystem persistence verified.');
    console.log('Classroom: activity 1 completion stays visible at 1024×600 and opens its wait dialog only after successful submission.');
    console.log(`Screenshots saved to ${screenshotDirectory}/classroom-*.png (1366×768 and 1024×600).`);
  } finally {
    if(teacherSession&&api)await api('control',{method:'POST',auth:teacherSession.teacherToken,body:{command:'delete'}}).catch(()=>{});
    await Promise.all(contexts.map(context=>context.close()));await browser.close();
  }
})().catch(error=>{console.error(error);process.exit(1);});
