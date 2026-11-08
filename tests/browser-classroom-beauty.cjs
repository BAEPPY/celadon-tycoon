/* Real API/browser follow-up to activity 1: independent answer, teacher control, and anonymous word cloud. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:4173';

(async()=>{
  assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use a local test server.');
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
  let room,releaseFinal;const errors=[];
  const makePage=async label=>{const context=await browser.newContext({viewport:{width:1366,height:768}}),page=await context.newPage();page.on('pageerror',error=>errors.push(`${label}: ${error.message}`));return page;};
  const teacher=await makePage('teacher'),student=await makePage('student'),observer=await makePage('observer');
  const api=async(action,{method='GET',auth=room?.teacherToken,body={}}={})=>{
    const data={action,...(room?{code:room.code}:{}),...body},headers=auth?{Authorization:`Bearer ${auth}`}:{},response=method==='POST'?await teacher.request.post(`${base}/api/classroom`,{headers,data}):await teacher.request.get(`${base}/api/classroom`,{headers,params:data});
    return {status:response.status(),value:await response.json()};
  };
  const control=async(command,extra={})=>{const result=await api('control',{method:'POST',body:{command,...extra}});assert.equal(result.status,200,JSON.stringify(result.value));return result.value;};
  async function capture(page,label){for(const [width,height] of [[1366,768],[1024,600]]){await page.setViewportSize({width,height});await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${label} fits ${width}`);if(label==='student'){const box=await page.locator('[data-beauty-done]').boundingBox();assert.ok(box&&box.y+box.height<=height,`done button visible at ${width}×${height}`);}await page.screenshot({path:`/tmp/classroom-beauty-${label}-${width}.png`});}await page.setViewportSize({width:1366,height:768});}
  try{
    const created=await api('create',{method:'POST'});assert.equal(created.status,200);room=created.value;
    await teacher.addInitScript(value=>localStorage.setItem('celadon-classroom-teacher-v1',JSON.stringify(value)),{code:room.code,teacherToken:room.teacherToken});
    await teacher.goto(`${base}/teacher`);await teacher.locator('.teacher-stage-nav').waitFor();
    await teacher.click('[data-action=teacher-a1-view][data-view=beauty]');
    assert.equal(await teacher.locator('[data-action=start-beauty]').isDisabled(),true,'comparison must happen first');
    await teacher.click('[data-action=teacher-a1-view][data-view=comparison]');
    await student.goto(`${base}/lesson?code=${room.code}`);await student.fill('[name=number]','7');await student.fill('[name=name]','별빛');await student.click('[data-form=join] button');await student.getByTestId('waiting-screen').waitFor();
    const identity=await student.evaluate(()=>JSON.parse(sessionStorage.getItem('celadon-classroom-student-v1')));
    const state=()=>api('state',{auth:identity.participantToken,body:{participantId:identity.participantId}});
    const {observerToken,observerCode=room.code}=await control('observer-link');await observer.goto(`${base}/observe?code=${encodeURIComponent(observerCode)}#key=${observerToken}`);await observer.locator('.teacher-stage-nav').waitFor();
    await teacher.click('[data-action=start][data-activity="1"]');await student.locator('[data-country-for="1"]').waitFor();
    for(const [id,value] of [['1','japan'],['2','yuan'],['3','goryeo']])await student.selectOption(`[data-country-for="${id}"]`,value);
    await student.locator('[data-comparison-done]').click();await student.locator('.completion-dialog[open]').waitFor();
    const comparison=(await state()).value;assert.equal(comparison.answers[1].submitted,true);
    await teacher.click('[data-action=pause]');await student.getByTestId('lock-screen').waitFor();await capture(student,'lock');
    await teacher.click('[data-action=start-beauty]');await student.locator('[data-beauty-answer]').waitFor();
    assert.equal(await student.locator('.completion-dialog').count(),0,'previous completion never locks new phase');
    assert.equal(await student.locator('[data-beauty-answer]').inputValue(),'');
    assert.equal(await student.locator('[data-beauty-done]').isDisabled(),true,'empty answer cannot submit');
    assert.equal(await student.locator('[data-action=start-beauty],[data-action=teacher-a1-view]').count(),0);
    assert.equal(await student.locator('[data-beauty-answer]').getAttribute('maxlength'),'300');
    assert.match(await student.locator('.current-activity').innerText(),/고려청자의 아름다움 찾기/);
    const beautyState=(await state()).value;
    assert.equal(beautyState.state.activity,1);assert.equal(beautyState.state.activity1Stage,'beauty');assert.equal(beautyState.state.runs[1],comparison.state.runs[1]);assert.equal(beautyState.answers[1].submitted,true);
    assert.equal(beautyState.state.endsAt-beautyState.state.startedAt,90_000);
    await student.locator('[data-collection=beauty][data-viewer-status=ready]').waitFor({timeout:45000});
    await capture(student,'student');
    await student.click('.beauty-object .lesson-viewer__expand');await student.locator('.lesson-viewer__info-title').waitFor();
    assert.equal(await student.locator('.lesson-viewer__info-title').innerText(),'청자 상감 운학문 매병');
    assert.match(await student.locator('.lesson-viewer__info').innerText(),/빛깔은 어떤가요/);await student.keyboard.press('Escape');

    // A local unsent draft survives refresh and retries when the connection is back.
    const text='푸른빛과 학 무늬가 아름다워요.';
    const blockSave=async route=>{const value=route.request().postDataJSON();if(value?.action==='beauty-answer')await route.abort('failed');else await route.continue();};
    await student.route('**/api/classroom',blockSave);await student.fill('[data-beauty-answer]',text);await student.reload();await student.locator('[data-beauty-answer]').waitFor();
    assert.equal(await student.locator('[data-beauty-answer]').inputValue(),text);
    await student.unroute('**/api/classroom',blockSave);
    await student.waitForFunction(()=>document.querySelector('[data-save-status]')?.textContent.includes('저장했어요'),{},{timeout:15000});
    assert.equal((await state()).value.beautyAnswer.text,text);
    let finalCount=0;
    const interceptFinal=async route=>{
      const data=route.request().postDataJSON();
      if(data?.action==='beauty-answer'&&data.final){finalCount++;if(finalCount===1){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'연결을 다시 확인해 주세요.'})});return;}
        await new Promise(resolve=>{releaseFinal=resolve;});}
      await route.continue();
    };
    await student.route('**/api/classroom',interceptFinal);await student.click('[data-beauty-done]');
    await student.waitForFunction(()=>document.querySelector('[data-save-status]')?.dataset.status==='error');
    assert.equal(await student.locator('.completion-dialog').count(),0,'failed final save never shows wait screen');
    await student.click('[data-beauty-done]');for(let i=0;i<100&&!releaseFinal;i++)await student.waitForTimeout(20);
    assert.ok(releaseFinal);assert.equal(await student.locator('.completion-dialog').count(),0,'waits for final acknowledgement');
    releaseFinal();releaseFinal=null;await student.locator('.completion-dialog[open]').waitFor();await student.unroute('**/api/classroom',interceptFinal);
    await student.keyboard.press('Escape');assert.equal(await student.locator('.completion-dialog[open]').count(),1);await student.reload();await student.locator('.completion-dialog[open]').waitFor();
    assert.equal((await state()).value.beautyAnswer.submitted,true);

    // Existing comparison responses are preserved; anonymous beauty responses appear live.
    for(const [number,name,response] of [[8,'달빛',text],[9,'햇빛','매끈한 곡선']]){
      const joined=await api('join',{method:'POST',auth:null,body:{number,name}});assert.equal(joined.status,200);
      const sent=await api('beauty-answer',{method:'POST',auth:joined.value.participantToken,body:{participantId:joined.value.participantId,runId:beautyState.state.runs.beauty,clientRevision:1,text:response,final:true}});assert.equal(sent.status,200);
    }
    await teacher.waitForFunction(()=>document.querySelector('.beauty-board .board-response-count')?.textContent.includes('3명'),{},{timeout:15000});
    await teacher.locator('.beauty-board .word-cloud[data-cloud-layout=ready]').waitFor();
    const sizes=await teacher.locator('.beauty-board .word-cloud .cloud-word').evaluateAll(nodes=>nodes.map(node=>parseFloat(getComputedStyle(node).fontSize)));
    assert.ok(Math.max(...sizes)>=Math.min(...sizes)*1.8,'repeated responses contrast visibly');
    assert.doesNotMatch(await teacher.locator('.beauty-board').innerText(),/별빛|달빛|햇빛/);
    const canvas=await teacher.locator('[data-beauty-viewer] canvas').elementHandle();await teacher.waitForResponse(response=>new URL(response.url()).searchParams.get('action')==='teacher');assert.equal(await canvas.evaluate(node=>node.isConnected),true,'poll preserves 3D canvas');
    await capture(teacher,'teacher');
    await observer.locator('.beauty-board').waitFor({timeout:15000});assert.equal(await observer.locator('[data-action=start-beauty]').count(),0);assert.doesNotMatch(await observer.locator('#classroom-app').innerText(),/별빛|달빛|햇빛/);
    await teacher.click('[data-action=teacher-a1-view][data-view=comparison]');await teacher.locator('[data-comparison-result="1"]').waitFor();assert.match(await teacher.locator('[data-comparison-result="1"]').innerText(),/1명 응답/);assert.equal((await state()).value.state.activity1Stage,'beauty','local tab never controls students');
    await teacher.click('[data-action=teacher-a1-view][data-view=beauty]');await teacher.click('[data-action=pause]');await student.getByTestId('lock-screen').waitFor();assert.equal(await student.locator('.completion-dialog').count(),0);
    // A second beauty run is independent; its timer automatically closes both input and wait state.
    await control('settings',{settings:{beautyDuration:5}});await teacher.reload();await teacher.locator('[data-action=start-beauty]').click();await student.locator('[data-beauty-answer]').waitFor();assert.equal(await student.locator('[data-beauty-answer]').inputValue(),'');
    await student.getByTestId('lock-screen').waitFor({timeout:15000});
    assert.equal((await state()).value.answers[1].submitted,true);
    assert.deepEqual(errors,[]);
    console.log('Beauty: teacher-gated comparison follow-up, named3D,90s timer, independent/autosaved draft, final ack/retry/wait, anonymous live cloud, preserved comparison, restart and expiry passed.');
  }finally{releaseFinal?.();if(room)await api('control',{method:'POST',body:{command:'delete'}}).catch(()=>{});await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
