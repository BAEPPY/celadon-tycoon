/* Genuine browser drags through the classroom UI and persistent HTTP store. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:4173';

(async()=>{
  assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use an isolated local classroom server.');
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
  let teacherSession;
  const teacher=await browser.newPage(),student=await browser.newPage({viewport:{width:1366,height:768}}),errors=[],answerRequests=[];
  student.on('pageerror',error=>errors.push(error.message));
  student.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/classroom'&&request.postDataJSON()?.action==='answer')answerRequests.push(request.postDataJSON());});
  const api=async(action,body={})=>{
    const response=await teacher.request.post(`${base}/api/classroom`,{headers:{Authorization:`Bearer ${teacherSession.teacherToken}`},data:{action,code:teacherSession.code,...body}});
    assert.equal(response.status(),200,await response.text());return response.json();
  };
  const control=(command,extra={})=>api('control',{command,...extra});
  const values=()=>student.locator('[data-country-for]').evaluateAll(selects=>Object.fromEntries(selects.map(select=>[select.dataset.countryFor,select.value])));
  const record=async()=>{
    const identity=await student.evaluate(()=>JSON.parse(sessionStorage.getItem('celadon-classroom-student-v1')));
    const response=await student.request.get(`${base}/api/classroom`,{headers:{Authorization:`Bearer ${identity.participantToken}`},params:{action:'state',code:identity.code,participantId:identity.participantId}});
    assert.equal(response.status(),200);return (await response.json()).answers[1];
  };
  async function saved(expected){
    let persisted;
    // A preceding save may finish between quick key presses; wait for this answer itself.
    for(let attempt=0;attempt<60;attempt++){
      persisted=(await record())?.answers;
      if(JSON.stringify(persisted)===JSON.stringify(expected))break;
      await student.waitForTimeout(150);
    }
    assert.deepEqual(persisted,expected,'the server persisted the same answers');
    await student.waitForFunction(()=>document.querySelector('[data-save-status]')?.dataset.status==='saved');
    assert.deepEqual(await values(),expected,'visible nameplates match the chosen countries');
  }
  async function beginDrag(country,target){
    const from=await student.locator(`[data-country-chip=${country}]`).boundingBox(),to=await student.locator(target).boundingBox();
    assert.ok(from&&to,'drag source and target are visible');
    await student.mouse.move(from.x+from.width/2,from.y+from.height/2);await student.mouse.down();
    await student.mouse.move(from.x+from.width/2+10,from.y+from.height/2,{steps:3});
    await student.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:15});
    // The second move ensures Chromium delivers dragover after entering the target.
    await student.mouse.move(to.x+to.width/2,to.y+to.height/2+1);
  }
  async function drag(country,target,id){
    await beginDrag(country,target);
    assert.equal(await student.locator(`[data-country-drop="${id}"].drop-over`).count(),1,'the full receiving card is highlighted');
    await student.mouse.up();
    assert.equal(await student.locator(`#country-${id}`).inputValue(),country,'a genuine mouse drop updates the native select immediately');
    assert.equal(await student.locator('.drop-over').count(),0,'drop feedback clears after release');
  }
  try{
    await teacher.goto(`${base}/teacher`);await teacher.locator('[data-form=create] button').click();await teacher.locator('.teacher-room-code strong').waitFor();
    teacherSession=await teacher.evaluate(()=>JSON.parse(localStorage.getItem('celadon-classroom-teacher-v1')));
    await control('settings',{settings:{durations:{1:180}}});
    await student.goto(`${base}/lesson?code=${encodeURIComponent('탑텐반')}`);
    await student.locator('[name=number]').fill('17');await student.locator('[name=name]').fill('이름표');await student.locator('[data-form=join] button').click();await student.getByTestId('waiting-screen').waitFor();
    await control('start',{activity:1});await student.locator('#country-1').waitFor();
    await student.waitForFunction(()=>document.querySelectorAll('[data-viewer-status=ready]').length===3,null,{timeout:45000});
    await student.evaluate(()=>{window.countryDragEvents=[];for(const type of ['dragstart','drop'])document.addEventListener(type,event=>window.countryDragEvents.push({type,trusted:event.isTrusted,target:event.target.tagName}));});
    await drag('yuan','#country-1','1');
    await drag('goryeo','[data-viewer="2"] .lesson-viewer__canvas','2');
    await drag('japan','[data-country-drop="3"] .object-title','3');
    await saved({'1':'yuan','2':'goryeo','3':'japan'});
    const events=await student.evaluate(()=>window.countryDragEvents);
    assert.equal(events.filter(event=>event.type==='drop').length,3);assert.ok(events.every(event=>event.trusted),'the browser, not synthetic DataTransfer events, produced every drag and drop');
    assert.deepEqual(events.filter(event=>event.type==='drop').map(event=>event.target),['SELECT','CANVAS','DIV']);

    await student.setViewportSize({width:1024,height:600});
    await drag('japan','[data-viewer="1"] .lesson-viewer__canvas','1');
    await saved({'1':'japan','2':'goryeo','3':'japan'});
    await student.screenshot({path:'/tmp/classroom-country-drag-1024.png'});
    await student.reload();await student.locator('#country-1').waitFor();
    assert.deepEqual(await values(),{'1':'japan','2':'goryeo','3':'japan'},'same-tab reload restores dragged answers');

    // A click-selected chip can be placed on the native select without opening its popup.
    await student.locator('[data-country-chip=yuan]').click();
    await student.locator('[data-viewer="2"]').getByRole('button',{name:'오른쪽으로 돌리기'}).click();
    assert.equal(await student.locator('#country-2').inputValue(),'goryeo','viewer controls do not place a pending nameplate');
    assert.equal(await student.locator('[data-country-chip=yuan]').getAttribute('aria-pressed'),'true');
    await student.locator('#country-2').click({button:'right'});await student.keyboard.press('Escape');
    assert.equal(await student.locator('#country-2').inputValue(),'goryeo','a secondary pointer button does not place a nameplate');
    await student.locator('#country-2').click();
    assert.equal(await student.locator('#country-2').inputValue(),'yuan');
    assert.equal(await student.locator('[data-country-chip][aria-pressed=true]').count(),0);
    // The original keyboard-select alternative stays usable without a selected chip.
    await student.locator('#country-3').focus();await student.keyboard.press('Home');await student.keyboard.press('ArrowDown');await student.keyboard.press('ArrowDown');
    await saved({'1':'japan','2':'yuan','3':'goryeo'});
    await student.locator('[data-country-chip=japan]').focus();await student.keyboard.press('Enter');
    await student.locator('[data-country-drop="3"] .object-title').click();
    await saved({'1':'japan','2':'yuan','3':'japan'});

    // Leaving the cards or pausing in the middle of a real drag cannot write an answer.
    await beginDrag('yuan','[data-viewer="1"] .lesson-viewer__canvas');
    await student.mouse.move(10,10,{steps:10});await student.mouse.up();
    assert.equal(await student.locator('.drop-over').count(),0);assert.equal(await student.locator('#country-1').inputValue(),'japan');
    const beforePause=await record(),requestsBeforePause=answerRequests.length;
    await beginDrag('yuan','[data-viewer="1"] .lesson-viewer__canvas');await control('pause');await student.getByTestId('lock-screen').waitFor();await student.mouse.up();
    assert.deepEqual(await record(),beforePause,'pausing during a drag leaves the saved answer untouched');
    assert.equal(answerRequests.length,requestsBeforePause,'a drag interrupted by a pause does not queue a save');
    assert.equal(await student.locator('[data-country-chip]').count(),0);

    await control('start',{activity:1});await student.locator('#country-1').waitFor();
    await drag('yuan','#country-1','1');await drag('goryeo','#country-2','2');await drag('japan','#country-3','3');
    await saved({'1':'yuan','2':'goryeo','3':'japan'});
    const completedSource=await student.locator('[data-country-chip=japan]').boundingBox(),completedTarget=await student.locator('#country-1').boundingBox();
    await student.locator('[data-comparison-done]').click();await student.locator('.completion-dialog[open]').waitFor();
    const completed=await record(),requestsAfterCompletion=answerRequests.length;assert.equal(completed.submitted,true);
    assert.equal(await student.locator('[data-country-chip]:disabled').count(),3);assert.equal(await student.locator('[data-country-for]:disabled').count(),3);
    assert.equal(await student.locator('[data-country-chip][draggable=true]').count(),0);
    await student.mouse.move(completedSource.x+completedSource.width/2,completedSource.y+completedSource.height/2);await student.mouse.down();
    await student.mouse.move(completedTarget.x+completedTarget.width/2,completedTarget.y+completedTarget.height/2,{steps:15});await student.mouse.up();
    assert.deepEqual(await record(),completed,'the completed activity stays immutable after a pointer drag attempt');assert.equal(answerRequests.length,requestsAfterCompletion);
    assert.deepEqual(errors,[]);
    console.log('Country nameplates: trusted mouse drops on select/canvas/card, 1024×600, server persistence, reload, click/keyboard alternatives, cancelled drag, pause and completion locks passed.');
  }finally{if(teacherSession)await control('delete').catch(()=>{});await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
