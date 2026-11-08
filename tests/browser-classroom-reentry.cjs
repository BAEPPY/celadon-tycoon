/* Fixed public code and real persistent-browser reentry. Run classroom suites sequentially. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {chromium}=require('playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:4173';
const ACTIVE='celadon-classroom-student-v1',TEACHER='celadon-classroom-teacher-v1',VAULT='celadon-classroom-rejoin-v1';

(async()=>{
  assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use an isolated local classroom server.');
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'celadon-reentry-'));
  const errors=[],joins=[],ownedRooms=[];let context,teacherSession,teacher;
  const launch=async(restore=false)=>{
    context=await chromium.launchPersistentContext(profile,{headless:true,viewport:{width:1366,height:768},ignoreDefaultArgs:['--disable-back-forward-cache'],...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader',...(restore?['--restore-last-session']:[])]});
    await context.addInitScript(()=>{try{window.__hadStudentSessionBeforeBoot=Boolean(sessionStorage.getItem('celadon-classroom-student-v1'));}catch{window.__hadStudentSessionBeforeBoot=false;}addEventListener('pageshow',event=>{window.__wasBfcacheRestore=event.persisted;});});
    context.on('page',watch);for(const page of context.pages())watch(page);return context;
  };
  const watch=page=>{
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/classroom'){const body=request.postDataJSON();if(body?.action==='join')joins.push(body);}});
  };
  const api=async(action,body={},method='POST')=>{
    const data={action,...(teacherSession?{code:teacherSession.code}:{}),...body},headers={...(teacherSession?{Authorization:`Bearer ${teacherSession.teacherToken}`}:{})};
    const response=await fetch(`${base}/api/classroom${method==='GET'?'?'+new URLSearchParams(data):''}`,{method,headers:{...headers,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:JSON.stringify(data)}:{})});
    assert.equal(response.status,200,`Test API ${action} succeeds`);return response.json();
  };
  const active=page=>page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),ACTIVE);
  async function entry(page){await page.locator('[data-form=join]').waitFor();assert.equal(await page.locator('[name=number]').inputValue(),'');assert.equal(await page.locator('[name=name]').inputValue(),'');assert.equal(await page.locator('#country-1,.student-badge').count(),0);assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),ACTIVE),null);}
  async function manualJoin(page,number,name){await page.locator('[name=code]').fill('탑텐반');await page.locator('[name=number]').fill(String(number));if(name!==undefined)await page.locator('[name=name]').fill(name);await page.locator('[data-form=join] button[type=submit]').click();}
  try{
    await launch();teacher=await context.newPage();await teacher.goto(`${base}/teacher`);
    // Simulate an already saved teacher room from before public aliases existed.
    const legacy=await api('create');teacherSession={code:legacy.code,teacherToken:legacy.teacherToken};ownedRooms.push(teacherSession);assert.match(teacherSession.code,/^[A-Z2-9]{6}$/);
    await teacher.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:TEACHER,value:teacherSession});
    await teacher.reload();await teacher.locator('.teacher-room-code strong').waitFor();
    assert.equal(await teacher.locator('.teacher-room-code strong').innerText(),'탑텐반','the authenticated teacher claims the fixed alias for the existing canonical room');
    await api('control',{command:'settings',settings:{durations:{1:180}}});
    let student=await context.newPage();await student.goto(`${base}/lesson`);await entry(student);
    await manualJoin(student,7,'돌봄');await student.getByTestId('waiting-screen').waitFor();const original=await active(student);
    assert.equal(original.code,teacherSession.code);assert.equal(original.student.number,7);assert.equal(original.joinCode,'탑텐반');
    assert.equal(await student.evaluate(key=>localStorage.getItem(key),ACTIVE),null,'active student credentials are no longer a persistent auto-login record');
    const storedVault=await student.evaluate(key=>JSON.parse(localStorage.getItem(key)),VAULT);assert.ok(storedVault.sessions.some(item=>item.participantId==='7'&&item.code===teacherSession.code));
    await api('control',{command:'start',activity:1});await student.locator('#country-1').waitFor();await student.locator('#country-1').selectOption('yuan');
    await student.waitForFunction(()=>document.querySelector('[data-save-status]')?.dataset.status==='saved');
    await student.reload();await student.locator('#country-1').waitFor();assert.equal(await student.locator('#country-1').inputValue(),'yuan');
    assert.ok((await active(student)).participantToken===original.participantToken,'same-tab reload resumes its existing participant');

    const fresh=await context.newPage();await fresh.goto(`${base}/lesson`);await entry(fresh);
    await fresh.locator('[name=code]').fill('탑텐반');await fresh.locator('[name=number]').fill('8');
    assert.equal(await fresh.locator('[name=name]').inputValue(),'','another number must not inherit the previous student name');
    const beforeJoin=joins.length;await fresh.locator('[data-form=join] button[type=submit]').click();assert.equal(joins.length,beforeJoin,'a new student still needs a name');
    await fresh.locator('[name=name]').fill('다른학생');await fresh.locator('[data-form=join] button[type=submit]').click();await fresh.locator('#country-1').waitFor();
    assert.equal(Boolean(joins.at(-1).participantToken),false,'another number must not receive the first student token');
    const second=await active(fresh);assert.equal(second.student.number,8);assert.ok(second.participantToken!==original.participantToken);assert.equal(await fresh.locator('#country-1').inputValue(),'');

    const popup=context.waitForEvent('page');await student.evaluate(()=>window.open('/lesson','student-session-clone'));const cloned=await popup;await entry(cloned);
    assert.equal(await cloned.evaluate(()=>window.__hadStudentSessionBeforeBoot),true,'the popup began with a genuine sessionStorage clone');
    await cloned.reload();await entry(cloned);
    await student.goto(`${base}/lesson`);await entry(student);
    await student.locator('[name=code]').fill('탑텐반');await student.locator('[name=number]').fill('7');
    await student.waitForFunction(()=>document.querySelector('[name=name]')?.value==='돌봄');await student.locator('[data-form=join] button[type=submit]').click();await student.locator('#country-1').waitFor();
    assert.equal(await student.locator('#country-1').inputValue(),'yuan');assert.ok((await active(student)).participantToken===original.participantToken);
    await student.goto('about:blank');await student.goBack({waitUntil:'domcontentloaded'});await entry(student);
    console.log(`Browser back returns to entry (actual BFCache restore: ${await student.evaluate(()=>Boolean(window.__wasBfcacheRestore))}).`);
    await student.locator('[name=code]').fill('탑텐반');await student.locator('[name=number]').fill('7');await student.waitForFunction(()=>document.querySelector('[name=name]')?.value==='돌봄');await student.locator('[data-form=join] button[type=submit]').click();await student.locator('#country-1').waitFor();
    console.log('Reentry: same-tab reload resumes, new navigation/new tab/cloned sessionStorage require blank entry, another number uses no previous token.');

    await context.close();context=null;await launch(true);
    await new Promise(resolve=>setTimeout(resolve,700));
    const restored=context.pages().filter(page=>page.url().startsWith(`${base}/lesson`));
    for(const page of restored)await entry(page);
    console.log(`Persistent restart with --restore-last-session checked ${restored.length} restored lesson tabs.`);
    student=await context.newPage();await student.goto(`${base}/lesson`);await entry(student);
    await student.screenshot({path:'/tmp/classroom-browser-reopened-entry.png'});
    teacher=await context.newPage();await teacher.goto(`${base}/teacher`);await teacher.locator('.teacher-room-code strong').waitFor();
    assert.equal(await teacher.locator('.teacher-room-code strong').innerText(),'탑텐반');
    const persistedTeacher=await teacher.evaluate(key=>JSON.parse(localStorage.getItem(key)),TEACHER);assert.equal(persistedTeacher.code,teacherSession.code);assert.ok(persistedTeacher.teacherToken===teacherSession.teacherToken);
    await student.locator('[name=code]').fill('탑텐반');await student.locator('[name=number]').fill('7');await student.waitForFunction(()=>document.querySelector('[name=name]')?.value==='돌봄');
    await student.locator('[data-form=join] button[type=submit]').click();await student.locator('#country-1').waitFor();
    assert.equal(await student.locator('#country-1').inputValue(),'yuan');assert.ok((await active(student)).participantToken===original.participantToken);
    assert.equal(joins.at(-1).number,7);assert.ok(joins.at(-1).participantToken===original.participantToken,'manual rejoin retrieves the exact saved credential');
    const previousRoom=teacherSession;
    teacher.on('dialog',dialog=>dialog.accept());await teacher.locator('.manage-menu>summary').click();await teacher.locator('[data-action=new-room]').click();
    await teacher.waitForFunction(previous=>JSON.parse(localStorage.getItem('celadon-classroom-teacher-v1')||'null')?.code!==previous,previousRoom.code);
    teacherSession=await teacher.evaluate(key=>JSON.parse(localStorage.getItem(key)),TEACHER);ownedRooms.push(teacherSession);
    assert.ok(teacherSession&&teacherSession.code!==previousRoom.code);assert.equal(await teacher.locator('.teacher-room-code strong').innerText(),'탑텐반');
    const nextStudent=await context.newPage();await nextStudent.goto(`${base}/lesson`);await entry(nextStudent);
    await nextStudent.locator('[name=code]').fill('탑텐반');await nextStudent.locator('[name=number]').fill('7');await nextStudent.waitForFunction(()=>document.querySelector('[name=name]')?.value==='돌봄');await nextStudent.locator('[data-form=join] button[type=submit]').click();await nextStudent.getByTestId('waiting-screen').waitFor();
    const nextIdentity=await active(nextStudent);assert.equal(nextIdentity.code,teacherSession.code);assert.ok(nextIdentity.participantToken!==original.participantToken,'new fixed-code class has a separate participant credential');
    const preserved=await fetch(`${base}/api/classroom?`+new URLSearchParams({action:'state',code:previousRoom.code,participantId:original.participantId}),{headers:{Authorization:`Bearer ${original.participantToken}`}});assert.equal(preserved.status,200);assert.equal((await preserved.json()).answers[1].answers[1],'yuan');
    assert.deepEqual(errors,[]);
    console.log('Persistent Chromium restart: blank student entry, manual saved-answer recovery, teacher continuity, and new-class fixed-code transfer with separate old answers passed.');
  }finally{for(const owned of [...ownedRooms].reverse()){teacherSession=owned;await api('control',{command:'delete'}).catch(()=>{});}await context?.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exit(1);});
