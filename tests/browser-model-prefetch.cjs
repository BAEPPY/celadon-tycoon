/* Students' browsers fetch the next activity's 3D models ahead of time (waiting screen → activity 1 models and the
   named vase; activity 1 → the five observation models), one at a time, and the teacher page does not.
   Run after npm run build against a local server.mjs, never a production class. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

const base=process.env.BASE_URL||'http://127.0.0.1:4173';

(async()=>{
  assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use an isolated local classroom server.');
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
  const errors=[];let teacher,room;
  const watch=(page,label)=>page.on('pageerror',error=>errors.push(`${label}: ${error.message}`));
  const control=async(command,extra={})=>{const r=await teacher.request.post(`${base}/api/classroom`,{headers:{Authorization:`Bearer ${room.teacherToken}`},data:{action:'control',code:room.code,command,...extra}});const v=await r.json();assert.equal(r.status(),200,JSON.stringify(v));return v;};
  const models=requests=>requests.filter(url=>url.endsWith('.glb')).map(url=>url.split('/').pop().replace('.glb',''));
  try{
    const teacherContext=await browser.newContext({viewport:{width:1280,height:720}});teacher=await teacherContext.newPage();watch(teacher,'teacher');
    const teacherRequests=[];teacher.on('request',request=>teacherRequests.push(request.url()));
    await teacher.goto(`${base}/teacher`);
    const created=teacher.waitForResponse(response=>response.url().endsWith('/api/classroom')&&response.request().postDataJSON()?.action==='create');
    await teacher.locator('[data-form=create] button[type=submit]').click();room=await (await created).json();

    const studentContext=await browser.newContext({viewport:{width:1366,height:768}});const student=await studentContext.newPage();watch(student,'student');
    const requests=[],inFlight=new Set();let overlap=0;
    student.on('request',request=>{const url=request.url();requests.push(url);if(url.endsWith('.glb')){if(inFlight.size)overlap++;inFlight.add(url);}});
    for(const event of ['requestfinished','requestfailed'])student.on(event,request=>inFlight.delete(request.url()));
    await student.goto(`${base}/lesson?code=${encodeURIComponent('탑텐반')}`);
    await student.locator('[name=number]').fill('5');await student.locator('[name=name]').fill('미리받기');
    await student.locator('[data-form=join] button[type=submit]').click();await student.getByTestId('waiting-screen').waitFor();
    assert.deepEqual(models(requests),[],'nothing is fetched the moment the student joins');

    // Waiting for the class to start: activity 1's three models and the named vase arrive in the background.
    await student.waitForFunction(()=>performance.getEntriesByType('resource').filter(entry=>entry.name.endsWith('.glb')).length>=4,{},{timeout:60000});
    assert.deepEqual(models(requests),['comparison-1','comparison-2','comparison-3','beauty']);
    assert.equal(overlap,0,'models are fetched one at a time');
    assert.equal(await student.getByTestId('waiting-screen').count(),1,'the waiting screen stays as it is');

    // During activity 1 the five observation models of activity 2 follow.
    await control('start',{activity:1});
    await student.locator('[data-comparison-card],.compare-grid').first().waitFor({timeout:15000});
    await student.waitForFunction(()=>new Set(performance.getEntriesByType('resource').filter(entry=>/observation-\d\.glb$/.test(entry.name)).map(entry=>entry.name)).size===5,{},{timeout:90000});
    const prefetched=models(requests).filter(name=>name.startsWith('observation-'));
    assert.deepEqual([...new Set(prefetched)].sort(),['observation-1','observation-2','observation-3','observation-4','observation-5']);
    assert.ok(!models(requests).some(name=>name.includes('detail')),'the large enlarged-view models are never fetched ahead');

    // Activity 2 has nothing further to fetch ahead, and the teacher page never prefetches.
    await control('pause');await control('start',{activity:2});
    await student.locator('.observe-layout').waitFor({timeout:15000});
    const before=models(requests).length;await student.waitForTimeout(7000);
    assert.ok(models(requests).slice(before).every(name=>name.startsWith('observation-')),'only the models on screen load in activity 2');
    assert.ok(!models(teacherRequests).includes('beauty'),'the teacher page loads only what it shows');
    assert.deepEqual(errors,[]);
    console.log('Model prefetch: waiting-screen warm-up of activity 1 and the vase, activity 2 models during activity 1, one at a time, no detail models, no teacher prefetch passed.');
  }finally{
    if(room&&teacher)await control('delete').catch(()=>{});
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
