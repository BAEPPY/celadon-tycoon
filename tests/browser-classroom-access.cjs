// Focused regression for sharing codes and teacher-only lesson transitions.
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const teacherKey = 'celadon-classroom-teacher-v1';
const studentKey = 'celadon-classroom-student-v1';

(async () => {
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Run only against a local test server.');
  const browser = await chromium.launch({headless: true,
    ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}),
    args: ['--no-sandbox', '--enable-unsafe-swiftshader']});
  const contexts = []; let teacherSession, teacher, creationForCleanup;
  try {
    const teacherContext = await browser.newContext({viewport: {width: 1366, height: 768}});
    const studentContext = await browser.newContext({viewport: {width: 1366, height: 768}});
    contexts.push(teacherContext, studentContext);
    await teacherContext.addInitScript(() => {
      window.__copiedText = '';
      window.__clipboardReject = false;
      Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {
        async writeText(value) {
          if (window.__clipboardReject) throw new Error('Clipboard unavailable for regression');
          window.__copiedText = value;
        },
      }});
    });
    teacher = await teacherContext.newPage();
    const student = await studentContext.newPage(), errors = [];
    for (const page of [teacher, student]) page.on('pageerror', error => errors.push(error.message));
    const health = await teacher.request.get(`${base}/api/classroom?action=health`);
    assert.equal((await health.json()).storage, 'filesystem');
    await teacher.goto(`${base}/teacher`);
    let lostCreate=false,firstCreateToken,secondCreateToken;
    await teacher.route('**/api/classroom',async route=>{
      const request=route.request(),body=request.method()==='POST'?request.postDataJSON():null;
      if(body?.action==='create'){
        if(!lostCreate){
          firstCreateToken=body.createToken;const response=await route.fetch();assert.equal(response.status(),200);creationForCleanup=await response.json();lostCreate=true;
          await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'시험용 수업 생성 응답 유실'})});return;
        }
        secondCreateToken=body.createToken;
      }
      await route.continue();
    });
    await teacher.locator('[data-form=create] button[type=submit]').click();
    await teacher.waitForFunction(()=>document.querySelector('[data-form-error]')?.textContent.includes('시험용 수업 생성 응답 유실'));
    assert.equal(await teacher.evaluate(key=>localStorage.getItem(key),teacherKey),null);
    await teacher.locator('[data-form=create] button[type=submit]').click();
    await teacher.waitForFunction(key => Boolean(JSON.parse(localStorage.getItem(key) || 'null')?.teacherToken), teacherKey);
    teacherSession = await teacher.evaluate(key => JSON.parse(localStorage.getItem(key)), teacherKey);
    assert.ok(Boolean(firstCreateToken)&&firstCreateToken===secondCreateToken,'retry reuses the persisted creation token');
    assert.equal(teacherSession.code,creationForCleanup.code,'a lost response recovers the original room instead of claiming a second alias');
    assert.equal(await teacher.evaluate(()=>localStorage.getItem('celadon-classroom-create-v1')),null);
    assert.match(teacherSession.code, /^[A-Z2-9]{6}$/);
    await teacher.locator('[data-action=copy-code]').click();
    assert.equal(await teacher.evaluate(() => window.__copiedText), '탑텐반', 'Code button copies exactly the public class code.');
    await teacher.locator('[data-action=copy-invite]').click();
    const invitation = await teacher.evaluate(() => window.__copiedText);
    assert.equal(new URL(invitation).pathname, '/lesson');
    assert.equal(new URL(invitation).searchParams.get('code'), '탑텐반');
    await teacher.evaluate(() => {window.__clipboardReject = true;});
    await teacher.locator('[data-action=copy-code]').click();
    const fallback = teacher.locator('.copy-fallback');
    await fallback.waitFor();
    assert.equal(await fallback.locator('input[readonly]').inputValue(), '탑텐반', 'Manual-copy fallback shows the public code, not https:.');
    await fallback.getByRole('button', {name: /닫기|확인/}).last().click();
    await fallback.waitFor({state: 'hidden'});

    await student.goto(`${base}/lesson`);
    assert.equal(await student.locator('a[href="/teacher"]').count(), 0, 'Student entry does not link to teacher controls.');
    await student.locator('[name=code]').evaluate((input, text) => {
      const clipboard = new DataTransfer(); clipboard.setData('text/plain', text);
      input.dispatchEvent(new ClipboardEvent('paste', {clipboardData: clipboard, bubbles: true, cancelable: true}));
    }, invitation);
    assert.equal(await student.locator('[name=code]').inputValue(), '탑텐반', 'Full invitation paste extracts the public class code.');
    await student.locator('[name=number]').fill('97');
    await student.locator('[name=name]').fill('권한검증학생');
    await student.locator('[data-form=join] button[type=submit]').click();
    await student.getByTestId('waiting-screen').waitFor();
    const studentSession = await student.evaluate(key => JSON.parse(sessionStorage.getItem(key)), studentKey);
    const control = async (command, activity, auth = teacherSession.teacherToken) => {
      const response = await teacher.request.post(`${base}/api/classroom`, {
        headers: {Authorization: `Bearer ${auth}`}, data: {action: 'control', code: teacherSession.code, command, activity},
      });
      return {status: response.status(), data: await response.json()};
    };
    assert.equal((await control('start', 1)).status, 200);
    await student.locator('#country-1').waitFor();
    assert.equal(await student.locator('[data-action=teacher-activity], .stage-steps button, .stage-steps a').count(), 0);
    assert.equal(await student.locator('.stage-step').count(), 0, 'Students see only the current activity, not a numbered stage menu.');
    const forbiddenRequests = [];
    student.on('request', request => {
      if (request.method() === 'POST' && request.url().includes('/api/classroom')) {
        const action = request.postDataJSON()?.action;
        if (['control', 'create'].includes(action)) forbiddenRequests.push(action);
      }
    });
    for (const action of ['teacher-activity', 'teacher-object', 'cloud-kind', 'start', 'pause', 'reveal', 'end', 'new-room', 'delete-room']) {
      await student.evaluate(value => {
        const button = document.createElement('button');
        button.id = 'injected-teacher-action'; button.dataset.action = value;
        button.dataset.activity = '3'; button.dataset.id = '3'; button.textContent = '권한 검사';
        document.querySelector('#classroom-app').append(button);
      }, action);
      await student.locator('#injected-teacher-action').click();
      await student.evaluate(() => document.querySelector('#injected-teacher-action')?.remove());
      assert.equal(await student.locator('#country-1').count(), 1, `${action} cannot replace the student activity screen.`);
    }
    assert.deepEqual(forbiddenRequests, [], 'Student-side teacher controls never issue a server request.');
    assert.equal((await control('start', 3, studentSession.participantToken)).status, 403, 'Server independently rejects the student capability.');
    const current = await teacher.request.get(`${base}/api/classroom`, {
      headers: {Authorization: `Bearer ${teacherSession.teacherToken}`}, params: {action: 'teacher', code: teacherSession.code},
    });
    assert.equal((await current.json()).state.activity, 1);
    assert.equal((await control('pause')).status, 200);
    await student.getByTestId('lock-screen').waitFor();
    assert.equal((await control('start', 2)).status, 200);
    await student.locator('#guess-name').waitFor();
    await student.locator('[data-action=select-object][data-id="2"]').click();
    assert.equal(await student.locator('[data-viewer="2"]').count(), 1, 'Students may still choose another artifact within the teacher-opened activity 2.');
    assert.equal(await student.getByTestId('classroom-game').count(), 0);
    assert.deepEqual(errors, []);
    console.log('Classroom access: lost-create-response recovery, fixed code/link copy, manual-copy fallback, URL paste, teacher-only controls and same-activity artifact browsing passed.');
  } finally {
    const cleanup=teacherSession||creationForCleanup;
    if (cleanup && teacher) await teacher.request.post(`${base}/api/classroom`, {
      headers: {Authorization: `Bearer ${cleanup.teacherToken}`},
      data: {action: 'control', code: cleanup.code, command: 'delete'},
    }).catch(() => {});
    await Promise.all(contexts.map(context => context.close()));
    await browser.close();
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
