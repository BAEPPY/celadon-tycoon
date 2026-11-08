/* Live teacher/observer comparison models survive response updates. Local server only. */
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:4173';

(async () => {
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Run only against a local test server.');
  const {COMPARISON_ANSWERS, OBSERVATION_ANSWERS} = await import(pathToFileURL(path.join(__dirname, '../lesson-answer-key.js')));
  const browser = await chromium.launch({headless: true,
    ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}),
    args: ['--no-sandbox', '--enable-unsafe-swiftshader']});
  let session;
  const errors = [], requests = new Map();
  const teacher = await browser.newPage({viewport: {width: 1366, height: 768}});
  const observer = await browser.newPage({viewport: {width: 1366, height: 768}});
  for (const page of [teacher, observer]) page.on('pageerror', error => errors.push(error.message));
  teacher.on('request', request => {
    const file = new URL(request.url()).pathname.match(/\/assets\/lesson\/(comparison-[123]\.glb)$/)?.[1];
    if (file) requests.set(file, (requests.get(file) || 0) + 1);
  });
  const call = async (action, {method = 'GET', auth = session?.teacherToken, body = {}} = {}) => {
    const data = {action, ...(session ? {code: session.code} : {}), ...body};
    const headers = auth ? {Authorization: `Bearer ${auth}`} : {};
    const response = method === 'POST'
      ? await teacher.request.post(`${base}/api/classroom`, {headers, data})
      : await teacher.request.get(`${base}/api/classroom`, {headers, params: data});
    return {status: response.status(), value: await response.json()};
  };
  const control = async (command, extra = {}) => {
    const result = await call('control', {method: 'POST', body: {command, ...extra}});
    assert.equal(result.status, 200, JSON.stringify(result.value));
    return result.value;
  };
  const ready = async page => {
    await page.waitForFunction(() => document.querySelectorAll('[data-teacher-comparison-viewer][data-viewer-status=ready]').length === 3, null, {timeout: 45000});
    assert.equal(await page.locator('[data-teacher-comparison-viewer] canvas').count(), 3);
    assert.equal(await page.locator('[data-teacher-comparison-viewer] .lesson-viewer__expand').count(), 3);
  };
  const join = async (number, name) => {
    const result = await call('join', {method: 'POST', auth: '', body: {code: '탑텐반', number, name}});
    assert.equal(result.status, 200, JSON.stringify(result.value)); return result.value;
  };
  const answer = async (student, countries) => {
    const state = (await call('teacher')).value.state;
    const result = await call('answer', {method: 'POST', auth: student.participantToken, body: {
      participantId: student.participantId, activity: 1, runId: state.runId, clientRevision: 1,
      answers: Object.fromEntries(countries.map((country, index) => [index + 1, country])),
    }});
    assert.equal(result.status, 200, JSON.stringify(result.value));
  };
  const assertNeutralInfo = async dialog => {
    const info = dialog.locator('.lesson-viewer__info');
    assert.equal(await info.getAttribute('data-info-state'), 'observation');
    assert.match(await info.innerText(), /어떤 색과 무늬/);
    assert.equal(await info.locator('a,.lesson-viewer__info-meta,.lesson-viewer__info-use').count(), 0);
    const text = await dialog.innerText();
    for (const answer of [...Object.values(COMPARISON_ANSWERS), ...Object.values(OBSERVATION_ANSWERS)]) assert.equal(text.includes(answer.name), false, 'Unrevealed expanded view hides artifact names.');
  };
  const expandedInfo = async (page, selector, details, screenshot) => {
    const expand = page.locator(`${selector} .lesson-viewer__expand`);
    await expand.click();
    const dialog = page.locator('dialog.lesson-viewer__dialog[open]');
    await dialog.locator('[data-viewer-status=ready]').waitFor({timeout: 45000});
    if (details) {
      const info = dialog.locator('.lesson-viewer__info'), text = await info.innerText();
      assert.equal(await info.getAttribute('data-info-state'), 'revealed');
      for (const key of ['name', 'countryLabel', 'date', 'use', 'note', 'source']) if (details[key]) assert.ok(text.includes(details[key]), `Expanded view includes server ${key}.`);
      assert.equal(await info.locator('.lesson-viewer__info-use').count(), details.use ? 1 : 0);
      assert.equal(await info.getByRole('link', {name: '자료 출처 보기 ↗'}).getAttribute('href'), details.sourceUrl);
      const canvas = await dialog.locator('canvas').elementHandle();
      await page.waitForResponse(response => ['teacher', 'observe'].includes(new URL(response.url()).searchParams.get('action')));
      assert.equal(await canvas.evaluate(node => node.isConnected && node === document.querySelector('.lesson-viewer__dialog canvas')), true, 'Polling retains expanded model and its explanation.');
      if (screenshot) for (const viewport of [{width: 1366, height: 768}, {width: 1024, height: 600}]) {
        await page.setViewportSize(viewport);
        const bounds = await dialog.locator('.lesson-viewer__info').boundingBox(), model = await dialog.locator('.lesson-viewer__viewport').boundingBox();
        assert.ok(bounds.x >= model.x + model.width, 'Revealed explanation fits beside the model on desktop and tablet.');
        await page.screenshot({path: `/tmp/classroom-expanded-${screenshot}-${viewport.width}.png`});
      }
    } else await assertNeutralInfo(dialog);
    await page.keyboard.press('Escape');
    await dialog.waitFor({state: 'detached'});
    assert.equal(await expand.evaluate(button => button === document.activeElement), true);
    await page.setViewportSize({width: 1366, height: 768});
  };
  try {
    await teacher.goto(`${base}/teacher`);
    await teacher.locator('[data-form=create] button').click();
    await teacher.locator('.teacher-room-code strong').waitFor();
    session = await teacher.evaluate(() => JSON.parse(localStorage.getItem('celadon-classroom-teacher-v1')));
    await ready(teacher);
    await control('settings', {settings: {durations: {1: 300}}});
    assert.deepEqual((await call('teacher')).value.reveal, {}, 'No artifact identity is disclosed before reveal.');
    assert.doesNotMatch(await teacher.locator('.teacher-comparison-grid').innerText(), /참외|음인각|세로줄|가마쿠라|1271/);
    for (const id of ['1', '2', '3']) {
      const card = teacher.locator(`[data-comparison-result="${id}"]`);
      assert.match(await card.locator('h2').innerText(), new RegExp(`청자 ${id}`));
      assert.equal(await card.locator('.bar-row').count(), 3);
      const model = await card.locator('.teacher-comparison-viewer').boundingBox();
      const graph = await card.locator('.comparison-percentages').boundingBox();
      assert.ok(model.y + model.height <= graph.y + 1, `Model ${id} appears above its own graph.`);
      const viewport = await card.locator('.lesson-viewer__viewport').boundingBox();
      const expand = await card.locator('.lesson-viewer__expand').boundingBox();
      assert.ok(expand.y >= viewport.y + viewport.height, 'Expand control does not cover the pottery silhouette.');
    }
    for (const viewport of [{width: 1366, height: 768}, {width: 1024, height: 600}]) {
      await teacher.setViewportSize(viewport); await teacher.waitForTimeout(120);
      assert.equal(await teacher.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await teacher.screenshot({path: `/tmp/classroom-teacher-comparison-${viewport.width}.png`, fullPage: true});
      for (const id of ['1', '2', '3']) {
        const tail = teacher.locator(`[data-comparison-result="${id}"] .unanswered`);
        await tail.scrollIntoViewIfNeeded();
        const bounds = await tail.boundingBox();
        assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= viewport.height + 1, `Graph ${id} is reachable at ${viewport.width}.`);
      }
    }
    await teacher.setViewportSize({width: 1366, height: 768}); await teacher.evaluate(() => scrollTo(0, 0));
    const hosts = await teacher.locator('[data-teacher-comparison-viewer]').elementHandles();
    const canvas = teacher.locator('[data-teacher-comparison-viewer="1"] canvas');
    const canvasHandle = await canvas.elementHandle();
    const original = await canvas.screenshot();
    await teacher.locator('[data-teacher-comparison-viewer="1"]').getByRole('button', {name: '오른쪽으로 돌리기', exact: true}).click();
    await teacher.waitForTimeout(120);
    const rotated = await canvas.screenshot();
    assert.notDeepEqual(rotated, original, 'The comparison model rotates interactively.');
    const requestsBefore = new Map(requests);
    await teacher.locator('[data-action=start][data-activity="1"]').click();
    const one = await join(21, '응답확인학생');
    await answer(one, ['yuan', 'goryeo', 'japan']);
    await teacher.waitForFunction(() => document.querySelector('[data-comparison-result="1"] .bar-row strong')?.textContent === '100%');
    assert.equal(await canvasHandle.evaluate(node => node === document.querySelector('[data-teacher-comparison-viewer="1"] canvas')), true);
    assert.deepEqual(await canvas.screenshot(), rotated, 'The camera view survives a changed answer count.');
    assert.deepEqual(requests, requestsBefore, 'Answer updates do not refetch any comparison GLB.');
    await teacher.waitForResponse(response => new URL(response.url()).searchParams.get('action') === 'teacher');
    assert.equal(await canvasHandle.evaluate(node => node.isConnected), true, 'An unchanged poll also preserves the canvas.');

    await teacher.locator('[data-teacher-comparison-viewer="2"] .lesson-viewer__expand').click();
    const dialog = teacher.locator('dialog.lesson-viewer__dialog[open]');
    await dialog.locator('[data-viewer-status=ready]').waitFor({timeout: 45000});
    await assertNeutralInfo(dialog);
    const expandedCanvas = await dialog.locator('canvas').elementHandle();
    const two = await join(22, '두번째확인학생');
    await answer(two, ['japan', 'yuan', 'goryeo']);
    await teacher.waitForFunction(() => document.querySelector('[data-comparison-result="1"] .bar-row strong')?.textContent === '50%');
    assert.equal(await expandedCanvas.evaluate(node => node.isConnected && node === document.querySelector('dialog.lesson-viewer__dialog canvas')), true, 'Live responses preserve an open expanded model.');
    await dialog.getByRole('button', {name: '크게 보기 닫기', exact: true}).click();

    const {observerToken} = await control('observer-link');
    await observer.goto(`${base}/observe?code=${session.code}#key=${observerToken}`); await ready(observer);
    await expandedInfo(observer, '[data-teacher-comparison-viewer="1"]');
    assert.doesNotMatch(await observer.locator('#classroom-app').innerText(), /응답확인학생|두번째확인학생/);
    assert.equal(await observer.locator('[data-action=start],[data-action=pause],[data-action=reveal],[data-action=manage-students]').count(), 0);
    assert.equal((await call('control', {method: 'POST', auth: observerToken, body: {command: 'pause'}})).status, 403);

    await teacher.locator('[data-action=teacher-activity][data-activity="2"]').click();
    await teacher.locator('[data-teacher-viewer][data-viewer-status=ready]').waitFor({timeout: 45000});
    await expandedInfo(teacher, '[data-teacher-viewer="1"]');
    for (const host of hosts) assert.equal(await host.evaluate(node => node.dataset.viewerStatus), 'disposed', 'Switching activities releases comparison viewers.');
    assert.equal(await teacher.locator('[data-teacher-comparison-viewer]').count(), 0);
    await teacher.locator('[data-action=teacher-activity][data-activity="1"]').click(); await ready(teacher);
    const beforeReveal = await teacher.locator('[data-teacher-comparison-viewer]').elementHandles();
    await teacher.locator('[data-action=pause]').click();
    await teacher.locator('[data-action=reveal]').click();
    await teacher.locator('[data-exhibit-viewer][data-viewer-status=ready]').waitFor({timeout: 45000});
    for (const host of beforeReveal) assert.equal(await host.evaluate(node => node.dataset.viewerStatus), 'disposed', 'Revealing the exhibit releases response-board viewers.');
    await teacher.locator('[data-action=exhibit-object][data-id="3"]').click();
    await teacher.locator('[data-exhibit-viewer="3"][data-viewer-status=ready]').waitFor({timeout: 45000});
    assert.equal(await teacher.locator('.exhibit-description h2').innerText(), '청자 상감 모란 국화무늬 참외모양 병');
    await expandedInfo(teacher, '[data-exhibit-viewer="3"]', COMPARISON_ANSWERS['3'], 'teacher-exhibit');
    for (const viewport of [{width: 1366, height: 768}, {width: 1024, height: 600}]) {
      await teacher.setViewportSize(viewport); await teacher.waitForTimeout(100);
      assert.equal(await teacher.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await teacher.screenshot({path: `/tmp/classroom-melon-exhibit-${viewport.width}.png`, fullPage: true});
    }
    await teacher.setViewportSize({width: 1366, height: 768});
    await teacher.locator('[data-action=teacher-result-view][data-view=responses]').click(); await ready(teacher);
    await expandedInfo(teacher, '[data-teacher-comparison-viewer="1"]', COMPARISON_ANSWERS['1'], 'teacher-responses');
    await observer.locator('[data-exhibit-viewer="1"][data-viewer-status=ready]').waitFor({timeout: 45000});
    await expandedInfo(observer, '[data-exhibit-viewer="1"]', COMPARISON_ANSWERS['1']);
    await observer.locator('[data-action=teacher-result-view][data-view=responses]').click(); await ready(observer);
    await expandedInfo(observer, '[data-teacher-comparison-viewer="2"]', COMPARISON_ANSWERS['2']);

    // Observation details include the server-provided use in both result modes.
    await teacher.locator('[data-action=teacher-activity][data-activity="2"]').click();
    await teacher.locator('[data-action=start][data-activity="2"]').click();
    await teacher.locator('[data-action=pause]').click();
    await teacher.locator('[data-action=reveal][data-activity="2"]').click();
    await teacher.locator('[data-exhibit-viewer="1"][data-viewer-status=ready]').waitFor({timeout: 45000});
    await expandedInfo(teacher, '[data-exhibit-viewer="1"]', OBSERVATION_ANSWERS['1']);
    await teacher.locator('[data-action=teacher-result-view][data-view=responses]').click();
    await teacher.locator('[data-teacher-viewer="1"][data-viewer-status=ready]').waitFor({timeout: 45000});
    await expandedInfo(teacher, '[data-teacher-viewer="1"]', OBSERVATION_ANSWERS['1'], 'observation-responses');
    await observer.locator('[data-action=teacher-activity][data-activity="2"]').click();
    await observer.locator('[data-exhibit-viewer="1"][data-viewer-status=ready]').waitFor({timeout: 45000});
    await expandedInfo(observer, '[data-exhibit-viewer="1"]', OBSERVATION_ANSWERS['1']);
    await observer.locator('[data-action=teacher-result-view][data-view=responses]').click();
    await observer.locator('[data-teacher-viewer="1"][data-viewer-status=ready]').waitFor({timeout: 45000});
    await expandedInfo(observer, '[data-teacher-viewer="1"]', OBSERVATION_ANSWERS['1']);
    await teacher.locator('[data-action=teacher-activity][data-activity="1"]').click(); await ready(teacher);
    const beforeLeave = await teacher.locator('[data-teacher-comparison-viewer]').elementHandles();
    await teacher.locator('.manage-menu summary').click();
    teacher.once('dialog', dialog => dialog.accept());
    await teacher.locator('[data-action=delete-room]').click(); await teacher.locator('[data-form=create]').waitFor(); session = null;
    for (const host of beforeLeave) assert.equal(await host.evaluate(node => node.dataset.viewerStatus), 'disposed', 'Leaving the room releases comparison viewers.');
    assert.deepEqual(errors, []);
    console.log('Teacher comparison: live models and cameras, no refetch on response updates, teacher/observer revealed explanations in response/exhibit modes, hidden identities before reveal, responsive expanded details and view-change disposal passed.');
  } finally {
    if (session) await control('delete').catch(() => {});
    await browser.close();
  }
})().catch(error => {console.error(error); process.exit(1);});
