/* Real classroom API + browser: acknowledged completion and teacher/observer exhibit pages. */
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:4173';

(async()=>{
  assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Run only against a local test server.');
  const {COMPARISON_ANSWERS,OBSERVATION_ANSWERS}=await import(pathToFileURL(path.join(__dirname,'../lesson-answer-key.js')));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
  let teacherSession,releaseFinal;const errors=[];
  const makePage=async label=>{const context=await browser.newContext({viewport:{width:1366,height:768}}),page=await context.newPage();page.on('pageerror',error=>errors.push(`${label}: ${error.message}`));return page;};
  const teacher=await makePage('teacher'),student=await makePage('student'),observer=await makePage('observer');
  const call=async(action,{method='GET',body={},auth=teacherSession?.teacherToken}={})=>{
    const data={action,...(teacherSession?{code:teacherSession.code}:{}),...body},headers=auth?{Authorization:`Bearer ${auth}`}:{},response=method==='POST'
      ?await teacher.request.post(`${base}/api/classroom`,{headers,data}):await teacher.request.get(`${base}/api/classroom`,{headers,params:data});
    return {status:response.status(),value:await response.json()};
  };
  const control=async(command,extra={})=>{const response=await call('control',{method:'POST',body:{command,...extra}});assert.equal(response.status,200,JSON.stringify(response.value));return response.value;};
  async function capture(page,label){for(const [width,height] of [[1366,768],[1024,600]]){await page.setViewportSize({width,height});await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:`/tmp/classroom-${label}-${width}.png`});}await page.setViewportSize({width:1366,height:768});}
  try{
    await teacher.goto(`${base}/teacher`);await teacher.locator('[data-form=create] button').click();await teacher.locator('.teacher-room-code strong').waitFor();
    teacherSession=await teacher.evaluate(()=>JSON.parse(localStorage.getItem('celadon-classroom-teacher-v1')));
    // Leave enough wall time for real GLBs and the reload/ack assertions;
    // timeout behavior is covered separately by the main classroom tests.
    await control('settings',{settings:{durations:{1:60,2:60},submitButton:false}});
    const {observerToken}=await control('observer-link');
    await observer.goto(`${base}/observe?code=${teacherSession.code}#key=${observerToken}`);await observer.locator('.teacher-stage-nav').waitFor();
    assert.deepEqual((await call('teacher')).value.reveal,{},'teacher receives no exhibit descriptions before reveal');
    assert.deepEqual((await call('observe',{auth:observerToken})).value.reveal,{},'observer receives no exhibit descriptions before reveal');
    assert.equal(await observer.locator('[data-action=start],[data-action=pause],[data-action=reveal]').count(),0);
    assert.equal((await call('control',{method:'POST',auth:observerToken,body:{command:'reveal',activity:1}})).status,403);
    await student.goto(`${base}/lesson?code=${teacherSession.code}`);await student.locator('[name=number]').fill('1');await student.locator('[name=name]').fill('별빛');await student.locator('[data-form=join] button').click();await student.getByTestId('waiting-screen').waitFor();
    const identity=await student.evaluate(()=>JSON.parse(localStorage.getItem('celadon-classroom-student-v1')));
    await teacher.locator('[data-action=start][data-activity="1"]').click();await student.locator('#country-1').waitFor();
    assert.equal(await teacher.locator('[data-action=teacher-result-view][data-view=exhibit]').isDisabled(),true);
    const done=student.locator('[data-comparison-done]');assert.equal(await done.isVisible(),true);assert.equal(await done.isDisabled(),true);
    await student.locator('#country-1').selectOption('japan');await student.locator('#country-2').selectOption('yuan');assert.equal(await done.isDisabled(),true);
    await student.locator('#country-3').selectOption('goryeo');
    let attempts=0,held=false;const finalGate=new Promise(resolve=>{releaseFinal=resolve;});
    const intercept=async route=>{const request=route.request(),body=request.method()==='POST'?request.postDataJSON():null;
      if(body?.action==='answer'&&body.final){attempts++;if(attempts===1){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'시험용 잠깐 저장 실패'})});return;}held=true;await finalGate;}await route.continue();};
    await student.route('**/api/classroom',intercept);
    await done.click();await student.waitForFunction(()=>document.querySelector('[data-save-status]')?.dataset.status==='error');
    assert.equal(await student.locator('.completion-dialog').count(),0,'a failed save cannot show completion');
    const unsaved=await call('state',{auth:identity.participantToken,body:{participantId:identity.participantId}});assert.equal(unsaved.value.answers[1].submitted,false);
    await done.click();for(let retry=0;retry<50&&!held;retry++)await student.waitForTimeout(20);assert.equal(held,true);
    assert.equal(await student.locator('.completion-dialog').count(),0,'the final request must reach and be confirmed by the server');
    releaseFinal();await student.locator('.completion-dialog[open]').waitFor();await student.unroute('**/api/classroom',intercept);
    assert.match(await student.locator('.completion-dialog').innerText(),/다른 친구들이 다 할 때까지/);
    assert.equal(await student.locator('.completion-dialog button,.completion-dialog [data-action]').count(),0);
    await student.keyboard.press('Escape');assert.equal(await student.locator('.completion-dialog[open]').count(),1);
    await student.reload();await student.locator('.completion-dialog[open]').waitFor();
    await student.waitForResponse(response=>new URL(response.url()).searchParams.get('action')==='state');
    assert.equal((await call('state',{auth:identity.participantToken,body:{participantId:identity.participantId}})).value.state.status,'active','the persistence assertion runs before the activity expires');
    assert.equal(await student.locator('.completion-dialog[open]').count(),1,'polls and reload preserve the confirmed wait screen');
    const confirmed=await call('state',{auth:identity.participantToken,body:{participantId:identity.participantId}});
    assert.equal(confirmed.value.answers[1].submitted,true);assert.equal(confirmed.value.state.settings.submitButton,false);
    assert.equal((await call('answer',{method:'POST',auth:identity.participantToken,body:{participantId:identity.participantId,activity:1,runId:confirmed.value.state.runId,clientRevision:999,answers:{1:'yuan',2:'yuan',3:'yuan'}}})).status,409,'confirmed activity 1 cannot be edited even when optional submission is off');
    await capture(student,'completion-wait');
    await teacher.locator('[data-action=pause]').click();await student.getByTestId('lock-screen').waitFor();assert.equal(await student.locator('.completion-dialog').count(),0);
    console.log('Completion: default button, incomplete gating, failed-save retry, server acknowledgement, Escape protection, reload/poll persistence and teacher-close passed.');

    async function assertPage(page,activity,id,answers){
      const card=page.locator(`.exhibit-page[data-exhibit-activity="${activity}"][data-exhibit-id="${id}"]`);await card.waitFor();
      await card.locator('[data-exhibit-viewer][data-viewer-status=ready]').waitFor({timeout:45000});
      assert.equal(await page.locator('.viewer-host').count(),1);assert.equal(await card.locator('canvas').count(),1);
      assert.equal(await page.locator('.answer-reveal').count(),0);
      const answer=answers[id],description=await card.locator('.exhibit-description').innerText();
      for(const key of ['name','countryLabel','date','use','note'])if(answer[key])assert.ok(description.includes(answer[key]),`${activity}/${id} shows ${key}`);
      assert.doesNotMatch(description,/실측 스캔|형상의 일부는 추정|참고 표현|사진을 참고한 3D|질감 부재/);
    }
    async function revealAndCheck(activity,answers){
      await teacher.locator(`[data-action=reveal][data-activity="${activity}"]`).click();
      await assertPage(teacher,activity,'1',answers);
      assert.equal(await teacher.locator('[data-action=exhibit-previous]').isDisabled(),true);
      const canvas=await teacher.locator('[data-exhibit-viewer] canvas').elementHandle();
      await teacher.waitForResponse(response=>new URL(response.url()).searchParams.get('action')==='teacher');
      assert.equal(await canvas.evaluate(node=>node.isConnected&&node===document.querySelector('[data-exhibit-viewer] canvas')),true,'unchanged polls preserve the model canvas');
      for(const id of Object.keys(answers).slice(1)){await teacher.locator('[data-action=exhibit-next]').click();await assertPage(teacher,activity,id,answers);}
      assert.equal(await teacher.locator('[data-action=exhibit-next]').isDisabled(),true);
      await teacher.locator('[data-action=exhibit-previous]').click();await assertPage(teacher,activity,String(Object.keys(answers).length-1),answers);
      await teacher.locator('[data-action=exhibit-object][data-id="1"]').click();await assertPage(teacher,activity,'1',answers);
      await capture(teacher,`exhibit-${activity}`);
      await teacher.locator('[data-action=teacher-result-view][data-view=responses]').click();
      await teacher.locator(activity===1?'.teacher-visuals':'.word-cloud').waitFor();assert.equal(await teacher.locator('.exhibit-page').count(),0);
      await teacher.locator('[data-action=teacher-result-view][data-view=exhibit]').click();await assertPage(teacher,activity,'1',answers);
      await observer.locator(`[data-action=teacher-activity][data-activity="${activity}"]`).click();
      await observer.locator('[data-action=teacher-result-view][data-view=exhibit]').click();await assertPage(observer,activity,'1',answers);
      await observer.locator('[data-action=exhibit-next]').click();await assertPage(observer,activity,'2',answers);
      assert.doesNotMatch(await observer.locator('#classroom-app').innerText(),/별빛/);
      const own=await call('state',{auth:identity.participantToken,body:{participantId:identity.participantId}});assert.equal(own.value.reveal,undefined);
      assert.equal(await student.locator('.exhibit-page,[data-action=teacher-result-view],[data-action=exhibit-object]').count(),0);
      assert.equal((await call('teacher',{auth:identity.participantToken})).status,403);
    }
    await revealAndCheck(1,COMPARISON_ANSWERS);
    await teacher.locator('[data-action=teacher-activity][data-activity="2"]').click();
    assert.equal(await teacher.locator('[data-action=teacher-result-view][data-view=exhibit]').isDisabled(),true);
    await teacher.locator('[data-action=start][data-activity="2"]').click();await student.locator('#guess-name').waitFor();
    assert.equal(await student.locator('[data-action=submit-answers]').count(),0,'activity 2 still respects the optional submit setting');
    await student.locator('#guess-name').fill('머리 받침');await student.locator('#guess-use').fill('머리를 받치며 쉬어요');
    await student.waitForFunction(()=>document.querySelector('[data-save-status]')?.dataset.status==='saved');
    await teacher.locator('[data-action=pause]').click();await student.getByTestId('lock-screen').waitFor();
    await revealAndCheck(2,OBSERVATION_ANSWERS);
    assert.deepEqual(errors,[]);
    console.log('Exhibits: all 3 + 5 real models and descriptions, page navigation, poll-stable canvas, response/exhibit views and read-only observer/student boundaries passed.');
  }finally{releaseFinal?.();if(teacherSession)await control('delete').catch(()=>{});await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
