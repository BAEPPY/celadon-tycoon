/* Trusted mouse and touch drags through the classroom UI and persistent HTTP store. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:4173';

(async()=>{
  assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use an isolated local classroom server.');
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
  let teacherSession;
  const teacher=await browser.newPage(),student=await browser.newPage({viewport:{width:1366,height:768},hasTouch:true}),errors=[],answerRequests=[];
  const touch=await student.context().newCDPSession(student);
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
    assert.deepEqual(await values(),{'1':'','2':'','3':'',...expected},'visible nameplates match the chosen countries');
  }
  async function dragPoints(country,target){
    const from=await student.locator(`[data-country-chip=${country}]`).boundingBox(),to=await student.locator(target).boundingBox();
    assert.ok(from&&to,'drag source and target are visible');
    return {from:{x:from.x+from.width/2,y:from.y+from.height/2},to:{x:to.x+to.width/2,y:to.y+to.height/2}};
  }
  async function beginDrag(country,target,pointer='mouse'){
    const {from,to}=await dragPoints(country,target);
    if(pointer==='touch'){
      await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]});
      for(let step=1;step<=12;step++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*step/12,y:from.y+(to.y-from.y)*step/12,id:1}]});
    }else{
      await student.mouse.move(from.x,from.y);await student.mouse.down();
      // A direct move must work without another movement to trigger native dragover.
      await student.mouse.move(to.x,to.y);
    }
  }
  async function releaseDrag(pointer='mouse'){
    if(pointer==='touch')await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    else await student.mouse.up();
  }
  async function drag(country,target,id,pointer='mouse'){
    await beginDrag(country,target,pointer);
    assert.equal(await student.locator(`[data-country-drop="${id}"].drop-over`).count(),1,'the full receiving card is highlighted');
    await releaseDrag(pointer);
    assert.equal(await student.locator(`#country-${id}`).inputValue(),country,`a trusted ${pointer} drag updates the native select immediately`);
    assert.equal(await student.locator('.drop-over').count(),0,'drop feedback clears after release');
    assert.equal(await student.locator('[data-country-chip][aria-pressed=true]').count(),0,'releasing a drag does not select a chip through a follow-up click');
  }
  try{
    await teacher.goto(`${base}/teacher`);await teacher.locator('[data-form=create] button[type=submit]').click();await teacher.locator('.teacher-room-code strong').waitFor();
    teacherSession=await teacher.evaluate(()=>JSON.parse(localStorage.getItem('celadon-classroom-teacher-v1')));
    await control('settings',{settings:{durations:{1:180}}});
    await student.goto(`${base}/lesson?code=${encodeURIComponent('탑텐반')}`);
    await student.locator('[name=number]').fill('17');await student.locator('[name=name]').fill('이름표');await student.locator('[data-form=join] button').click();await student.getByTestId('waiting-screen').waitFor();
    await control('start',{activity:1});await student.locator('#country-1').waitFor();
    await student.waitForFunction(()=>document.querySelectorAll('[data-viewer-status=ready]').length===3,null,{timeout:45000});
    await student.evaluate(()=>{window.countryPointerEvents=[];for(const type of ['pointerdown','pointerup','pointercancel','dragstart','drop'])document.addEventListener(type,event=>window.countryPointerEvents.push({type,trusted:event.isTrusted,pointerType:event.pointerType}));});
    await drag('yuan','#country-1','1');
    await drag('goryeo','[data-viewer="2"] .lesson-viewer__canvas','2');
    await drag('japan','[data-country-drop="3"] .object-title','3');
    await saved({'1':'yuan','2':'goryeo','3':'japan'});
    await drag('japan','#country-1','1','touch');
    await drag('yuan','[data-viewer="2"] .lesson-viewer__canvas','2','touch');
    await drag('goryeo','[data-country-drop="3"] .object-title','3','touch');
    await saved({'1':'japan','2':'yuan','3':'goryeo'});
    const events=await student.evaluate(()=>window.countryPointerEvents);
    assert.ok(events.every(event=>event.trusted),'all pointer events came from browser input rather than dispatchEvent');
    for(const pointer of ['mouse','touch'])assert.equal(events.filter(event=>event.type==='pointerup'&&event.pointerType===pointer).length,3,`all three ${pointer} drags completed`);
    assert.equal(events.some(event=>['pointercancel','dragstart','drop'].includes(event.type)),false,'placement does not depend on native HTML drag-and-drop or scroll-cancelled touch gestures');

    // Each country name tag exists once. With all three placed the tray shows where each one is.
    const tray=()=>student.locator('[data-country-chip]').evaluateAll(chips=>Object.fromEntries(chips.map(chip=>[chip.dataset.countryChip,chip.classList.contains('used')?chip.dataset.usedLabel:''])));
    assert.deepEqual(await tray(),{yuan:'청자 2',goryeo:'청자 3',japan:'청자 1'});
    assert.match(await student.locator('.country-tray').innerText(),/나라마다 하나씩/);
    assert.equal(await student.locator('[data-country-chip=japan]').getAttribute('aria-label'),'일본 이름표, 청자 1에 붙어 있어요');
    assert.equal(await student.locator('[data-country-chip=japan]').evaluate(chip=>getComputedStyle(chip,'::after').content),'"청자 1"','the tray says where the tag is');
    assert.deepEqual(await student.locator('#country-1 option').allInnerTexts(),['나라 이름표 놓기','원 (청자 2에서 옮기기)','고려 (청자 3에서 옮기기)','일본']);

    await student.setViewportSize({width:1024,height:600});
    // Dragging 고려 (on 청자 3) to 청자 1 moves it: 청자 3 is empty again and 일본, which was on 청자 1, is back in the tray.
    await drag('goryeo','[data-viewer="1"] .lesson-viewer__canvas','1');
    assert.match(await student.locator('#classroom-toast').innerText(),/고려 이름표를 청자 3에서 떼어 청자 1에 붙였어요/);
    await saved({'1':'goryeo','2':'yuan'});
    assert.deepEqual(await tray(),{yuan:'청자 2',goryeo:'청자 1',japan:''});
    assert.deepEqual(await student.locator('#country-3 option').allInnerTexts(),['나라 이름표 놓기','원 (청자 2에서 옮기기)','고려 (청자 1에서 옮기기)','일본']);
    await student.screenshot({path:'/tmp/classroom-country-drag-1024.png'});
    await student.reload();await student.locator('#country-1').waitFor();
    assert.deepEqual(await values(),{'1':'goryeo','2':'yuan','3':''},'same-tab reload restores mouse and touch answers');
    assert.deepEqual(await tray(),{yuan:'청자 2',goryeo:'청자 1',japan:''},'and which tags are in use');

    // A click-selected chip can be placed on the native select without opening its popup.
    await student.locator('[data-country-chip=japan]').click();
    await student.locator('[data-viewer="2"]').getByRole('button',{name:'오른쪽으로 돌리기'}).click();
    assert.equal(await student.locator('#country-2').inputValue(),'yuan','viewer controls do not place a pending nameplate');
    assert.equal(await student.locator('[data-country-chip=japan]').getAttribute('aria-pressed'),'true');
    await student.locator('#country-2').click({button:'right'});await student.keyboard.press('Escape');
    assert.equal(await student.locator('#country-2').inputValue(),'yuan','a secondary pointer button does not place a nameplate');
    await student.locator('#country-2').click();
    assert.equal(await student.locator('#country-2').inputValue(),'japan');
    assert.equal(await student.locator('[data-country-chip][aria-pressed=true]').count(),0);
    assert.deepEqual(await tray(),{yuan:'',goryeo:'청자 1',japan:'청자 2'},'원, which 일본 replaced, is back in the tray');
    // The original keyboard-select alternative stays usable without a selected chip.
    await student.locator('#country-3').focus();await student.keyboard.press('Home');await student.keyboard.press('ArrowDown');
    await saved({'1':'goryeo','2':'japan','3':'yuan'});
    // A tag chosen with the keyboard and placed by a click also moves: 일본 leaves 청자 2 for 청자 3.
    await student.locator('[data-country-chip=japan]').focus();await student.keyboard.press('Enter');
    await student.locator('[data-country-drop="3"] .object-title').click();
    assert.match(await student.locator('#classroom-toast').innerText(),/일본 이름표를 청자 2에서 떼어 청자 3에 붙였어요/);
    await saved({'1':'goryeo','3':'japan'});
    assert.deepEqual(await tray(),{yuan:'',goryeo:'청자 1',japan:'청자 3'});
    // Choosing a used country in a ceramic's own list moves it too, and never leaves the same country on two ceramics.
    await student.locator('#country-2').selectOption('goryeo');
    assert.match(await student.locator('#classroom-toast').innerText(),/고려 이름표를 청자 1에서 떼어 청자 2에 붙였어요/);
    await saved({'2':'goryeo','3':'japan'});
    await student.locator('#country-1').selectOption('goryeo');
    await saved({'1':'goryeo','3':'japan'});
    // The server refuses the same country twice, whatever sends it.
    const identityNow=await student.evaluate(()=>JSON.parse(sessionStorage.getItem('celadon-classroom-student-v1')));
    const twice=await student.request.post(`${base}/api/classroom`,{headers:{Authorization:`Bearer ${identityNow.participantToken}`},data:{action:'answer',code:identityNow.code,participantId:identityNow.participantId,activity:1,runId:(await record()).runId,clientRevision:9999,answers:{1:'goryeo',2:'goryeo',3:'japan'}}});
    assert.equal(twice.status(),400);assert.equal((await twice.json()).code,'duplicate-country');
    assert.deepEqual((await record()).answers,{'1':'goryeo','3':'japan'},'nothing was saved from it');

    // Touch cancellation, leaving the cards, and pausing cannot write an answer.
    await beginDrag('yuan','[data-viewer="1"] .lesson-viewer__canvas','touch');
    assert.equal(await student.locator('[data-country-drop="1"].drop-over').count(),1);
    await touch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    assert.equal(await student.locator('.drop-over').count(),0);assert.equal(await student.locator('#country-1').inputValue(),'goryeo');
    await beginDrag('yuan','[data-viewer="1"] .lesson-viewer__canvas');
    await student.mouse.move(10,10,{steps:10});await student.mouse.up();
    assert.equal(await student.locator('.drop-over').count(),0);assert.equal(await student.locator('#country-1').inputValue(),'goryeo');
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
    console.log('Country nameplates: trusted direct mouse and CDP touch drags on select/canvas/card, 1024×600, persistence/reload, click/keyboard alternatives, one tag per country (moved, shown in the tray, refused twice by the server), touch cancellation, outside release, pause and completion locks passed.');
  }finally{if(teacherSession)await control('delete').catch(()=>{});await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
