/* Teacher tools in 수업 관리: 수업 전 점검 (preflight dialog) and 수업 결과 내려받기 (CSV on the teacher's computer).
   Run after npm run build against a local server.mjs, never a production class. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {chromium}=require('playwright');

const base=process.env.BASE_URL||'http://127.0.0.1:4173';

(async()=>{
  assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use an isolated local classroom server.');
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
  const errors=[],downloads=await fs.mkdtemp(path.join(os.tmpdir(),'teacher-tools-'));let teacher,room;
  const api=async(action,body={},auth=room?.teacherToken)=>{const r=await teacher.request.post(`${base}/api/classroom`,{headers:auth?{Authorization:`Bearer ${auth}`}:{},data:{action,...(room?{code:room.code}:{}),...body}});const v=await r.json();assert.equal(r.status(),200,JSON.stringify(v));return v;};
  const control=(command,extra={})=>api('control',{command,...extra});
  try{
    const context=await browser.newContext({viewport:{width:1366,height:768},acceptDownloads:true});teacher=await context.newPage();
    teacher.on('pageerror',error=>errors.push(error.message));teacher.on('dialog',dialog=>dialog.accept());
    await teacher.goto(`${base}/teacher`);
    const created=teacher.waitForResponse(response=>response.url().endsWith('/api/classroom')&&response.request().postDataJSON()?.action==='create');
    await teacher.locator('[data-form=create] button[type=submit]').click();room=await (await created).json();
    await teacher.locator('[data-action=observer-link]').waitFor();
    const student=await api('join',{code:'탑텐반',number:3,name:'결과학생'},null),other=await api('join',{code:'탑텐반',number:1,name:'=위험한이름'},null);
    const a1=await control('start',{activity:1});
    await api('answer',{participantId:student.participantId,activity:1,runId:a1.state.runId,clientRevision:1,final:true,answers:{1:'japan',2:'yuan',3:'goryeo'}},student.participantToken);
    await control('pause');const a2=await control('start',{activity:2});
    await api('answer',{participantId:student.participantId,activity:2,runId:a2.state.runId,clientRevision:1,answers:{1:{name:'베개, "쉼"',use:'머리를 받쳐요'}}},student.participantToken);
    await control('pause');

    // 수업 전 점검: every check reports in plain words; locally there is no AI key, cron secret or passcode.
    await teacher.click('.manage-menu>summary');await teacher.click('[data-action=preflight]');
    const dialog=teacher.locator('dialog.preflight[open]');await dialog.waitFor();
    const state=id=>dialog.locator(`[data-check="${id}"]`).getAttribute('data-state');
    await teacher.waitForFunction(()=>document.querySelector('dialog.preflight [data-preflight-summary]')?.dataset.state!=='running',{},{timeout:90000});
    assert.equal(await state('storage'),'ok');assert.match(await dialog.locator('[data-check=storage] p').innerText(),/저장하고 지울 수 있어요/);
    assert.equal(await state('code'),'ok');assert.match(await dialog.locator('[data-check=code] p').innerText(),/탑텐반/);
    assert.equal(await state('models'),'ok');assert.match(await dialog.locator('[data-check=models] p').innerText(),/3D 청자 9점\(\d+\.\dMB\)을 \d+\.\d초에 받았어요/);
    for(const id of ['ai','cleanup','passcode'])assert.equal(await state(id),'warn',id);
    assert.match(await dialog.locator('[data-check=ai] p').innerText(),/수업은 그대로 진행할 수 있어요/);
    assert.equal(await dialog.locator('[data-preflight-summary]').getAttribute('data-state'),'warn');
    assert.match(await dialog.locator('[data-preflight-summary]').innerText(),/수업은 할 수 있어요\. 참고할 항목이 3개 있어요/);
    const layout=await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&el.scrollWidth<=el.clientWidth+1;});
    assert.ok(layout,'the dialog fits the screen');
    // A model that cannot be fetched and a server that cannot be reached are reported as problems.
    await teacher.route('**/assets/lesson/observation-3.glb',route=>route.abort());
    await teacher.route('**/api/classroom',route=>route.request().postDataJSON()?.action==='preflight'?route.abort():route.continue());
    await dialog.locator('[data-rerun-preflight]').click();
    await teacher.waitForFunction(()=>document.querySelector('dialog.preflight [data-preflight-summary]')?.dataset.state==='fail',{},{timeout:90000});
    assert.equal(await state('models'),'fail');assert.match(await dialog.locator('[data-check=models] p').innerText(),/1점을 받지 못했어요/);
    assert.equal(await state('storage'),'fail');
    assert.match(await dialog.locator('[data-preflight-summary]').innerText(),/확인이 필요한 항목이 2개 있어요/);
    await teacher.unroute('**/assets/lesson/observation-3.glb');await teacher.unroute('**/api/classroom');
    await dialog.locator('[data-close-preflight]').click();await dialog.waitFor({state:'detached'});
    assert.equal((await api('preflight')).storage,true);

    // 수업 결과 내려받기: a spreadsheet file with one row per student, the answer key, and spreadsheet-safe cells.
    await teacher.click('.manage-menu>summary');
    const downloading=teacher.waitForEvent('download');await teacher.click('[data-action=download-results]');
    const download=await downloading;assert.match(download.suggestedFilename(),/^청자수업_결과_\d{4}-\d{2}-\d{2}\.csv$/);
    const saved=path.join(downloads,'results.csv');await download.saveAs(saved);
    const text=await fs.readFile(saved,'utf8');
    assert.equal(text.charCodeAt(0),0xFEFF,'Excel reads the Korean text with the byte-order mark');
    const lines=text.slice(1).trim().split('\r\n');assert.equal(lines.length,4,'header, answer key and two students');
    assert.match(lines[0],/^"번호","이름","활동1 청자1","활동1 청자2","활동1 청자3","활동1 맞힌 수","고려청자의 아름다움","활동2 청자1 이름","활동2 청자1 쓰임"/);
    assert.match(lines[1],/^"","\(정답\)","일본","원","고려","","","청자 상감 모란 구름 학무늬 베개"/);
    assert.match(lines[2],/^"1","'=위험한이름","","","","0"/,'a name that looks like a formula is neutralised');
    assert.match(lines[3],/^"3","결과학생","일본","원","고려","3","","베개, ""쉼""","머리를 받쳐요"/,'commas and quotes stay inside one cell');
    await teacher.waitForFunction(()=>document.querySelector('#classroom-toast')?.textContent.includes('2명의 결과를 내려받았어요'));
    // Students never get these tools.
    const pupil=await (await browser.newContext()).newPage();await pupil.goto(`${base}/lesson`);
    assert.equal(await pupil.locator('[data-action=preflight],[data-action=download-results]').count(),0);
    const denied=await pupil.request.get(`${base}/api/classroom`,{params:{action:'results',code:room.code},headers:{Authorization:`Bearer ${other.participantToken}`}});
    assert.equal(denied.status(),403);
    assert.deepEqual(errors,[]);
    console.log('Teacher tools: preflight dialog with plain-language results, failure reporting and rerun; results CSV with BOM, answer key, escaped cells and teacher-only access passed.');
  }finally{
    if(room&&teacher)await control('delete').catch(()=>{});
    await browser.close();await fs.rm(downloads,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
