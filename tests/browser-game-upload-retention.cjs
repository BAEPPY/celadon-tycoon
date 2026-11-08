/* Real lesson host + real game iframe, with deterministic classroom HTTP responses. */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 8, 12);
const RUN = 'upload-retention';
const KEY = `celadon-tycoon-v2:classroom:ABCDEF:7:run:${RUN}`;
const work = {
  id: 'upload-retention-work', customerId: 'king', orderId: 'royal-rest', accepted: true,
  shape: 'pillow', modelId: 'pillow', step: 4, technique: 'inlay', pattern: 'crane',
  title: '청자 학무늬 베개', placements: [{x: 100, y: 100, pattern: 'crane'}], strokes: [],
  decorDone: true, decorPhase: 2, knead: 3, width: 1,
  firing: ['dry', 'biscuit', 'glaze', 'fire'], clay: {body: true, prepared: true, kneads: 6, slip: 'white'},
  inspection: {done: true}, explanationUse: '머리를 받쳐 쉴 때 쓰는 베개예요.',
  explanationBeauty: '학 무늬를 파고 흰 흙을 채워 넣었어요.',
  preview: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#9db497"/></svg>'),
};

(async () => {
  const browser = await chromium.launch({headless: true,
    ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}), args: ['--no-sandbox']});
  const errors = [];
  const contexts = [];
  try {
    async function scenario(mode) {
      const context = await browser.newContext({viewport: {width: 1366, height: 768}});
      contexts.push(context);
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on('pageerror', error => errors.push(`${mode}: ${error.message}`));
      let clock = NOW;
      const calls = [], held = [];
      let firstWork;const firstWorkRequest = new Promise(resolve => {firstWork = resolve;});
      const student = {number: 7, name: '보관시험'};
      const payload = () => ({
        code: 'ABCDEF', participantId: '7', participantToken: 'a'.repeat(43), student,
        state: {code: 'ABCDEF', joinCode: '탑텐반', revision: 1, serverNow: clock,
          activity: 3, status: 'active', runId: RUN, runs: {1: null, 2: null, 3: RUN, ...(mode === 'gone' ? {} : {beauty: null})},
          startedAt: NOW, endsAt: null, revealed: {}, settings: {durations: {1: 90, 2: 240, 3: 300}, autoPause: true}},
        answers: {}, completedWorks: [],
      });
      await page.addInitScript(() => {
        if (top !== self) return;
        window.retentionMessages = [];
        window.retentionAborts = 0;
        addEventListener('message', event => {if (event.data?.type === 'celadon:completed') retentionMessages.push(event.data);});
        const original = window.fetch;
        window.fetch = function(input, options) {
          let body;try {body = JSON.parse(options?.body || 'null');} catch {}
          if (body?.action === 'work') options?.signal?.addEventListener('abort', () => retentionAborts++);
          return original.apply(this, arguments);
        };
      });
      await page.clock.install({time: new Date(NOW)});
      await page.clock.setFixedTime(new Date(NOW));
      await page.route('**/api/classroom**', async route => {
        const request = route.request();
        const body = request.method() === 'POST' ? request.postDataJSON() : null;
        const action = body?.action || new URL(request.url()).searchParams.get('action');
        if (action === 'work') {
          calls.push(body);firstWork();
          if (mode === 'held') {
            await new Promise(resolve => held.push({route, resolve}));
            return;
          }
          await route.fulfill({status: mode === 'gone' ? 410 : 503, contentType: 'application/json',
            body: JSON.stringify({error: mode === 'gone' ? '작품 보관 시간이 지났어요.' : '시험용 연결 오류', code: mode === 'gone' ? 'work-expired' : 'storage-unavailable'})});
          return;
        }
        assert.ok(['join', 'state'].includes(action), `Unexpected classroom request: ${action}`);
        await route.fulfill({contentType: 'application/json', body: JSON.stringify(payload())});
      });
      await page.goto(new URL('/lesson?code=ABCDEF', base).href);
      const expiresAt = NOW + 10000;
      await page.evaluate(({key, work, retentionStartedAt}) => localStorage.setItem(key, JSON.stringify({
        history: ['royal-rest'], gallery: [work], draft: null, sound: false, retentionStartedAt,
      })), {key: KEY, work: {...work, id: `${work.id}-${mode}`}, retentionStartedAt: expiresAt - DAY});
      await page.locator('[name=number]').fill('7');
      await page.locator('[name=name]').fill(student.name);
      await page.locator('[data-form=join] button[type=submit]').click();
      await page.locator('[data-testid=classroom-game]').waitFor();
      await page.frameLocator('iframe').locator('#classroom-game-pause').waitFor({state: 'attached'});
      const frame = page.frames().find(value => value.url().includes('classroom=1'));
      await page.waitForFunction(() => retentionMessages.length > 0);
      const message = await page.evaluate(() => retentionMessages[0]);
      assert.equal(message.expiresAt, expiresAt, 'the real game bridge carries the original save deadline, not a new host receipt deadline');
      await firstWorkRequest;
      assert.ok(calls.length);
      assert.equal(calls[0].expiresAt, expiresAt, 'the host forwards the original deadline with its upload');
      const setTime = async value => {clock = value;await page.clock.setFixedTime(new Date(value));};
      const poll = async () => {
        const response = page.waitForResponse(value => new URL(value.url()).pathname === '/api/classroom' && new URL(value.url()).searchParams.get('action') === 'state');
        await page.evaluate(() => dispatchEvent(new Event('online')));
        await response;
        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
      };
      const resend = data => frame.evaluate(data => parent.postMessage(data, location.origin), data);
      const cleanup = async () => {
        for (const item of held) {try {await item.route.abort();} catch {} item.resolve();}
        await context.close();
      };
      return {page, frame, calls, message, expiresAt, setTime, poll, resend, cleanup};
    }

    const failed = await scenario('failed');
    await failed.page.waitForFunction(() => document.querySelector('[data-game-status]')?.textContent.includes('아직 보내지 못'));
    const beforeRenewal = failed.calls.length;
    await failed.resend({...failed.message, expiresAt: NOW + DAY});
    await failed.page.waitForFunction(() => document.querySelector('[data-game-status]')?.textContent.includes('아직 보내지 못'));
    // A repeated packet can retry, but must not extend the earliest retention deadline.
    await failed.page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
    assert.ok(failed.calls.length >= beforeRenewal);
    assert.ok(failed.calls.every(call => call.expiresAt === failed.expiresAt), 'same-id packets keep the earliest upload deadline');
    await failed.setTime(failed.expiresAt);
    const failuresAtExpiry = failed.calls.length;
    await failed.poll();
    await failed.page.clock.fastForward(5000);
    await failed.poll();
    assert.equal(failed.calls.length, failuresAtExpiry, 'expired failed uploads are not retried after online events or polling');
    await failed.resend(failed.message);
    await failed.poll();
    assert.equal(failed.calls.length, failuresAtExpiry, 'a delayed expired completion packet cannot requeue the removed preview');
    await failed.cleanup();

    const held = await scenario('held');
    await held.setTime(held.expiresAt);
    await held.poll();
    await held.page.clock.fastForward(1000);
    await held.page.waitForFunction(() => retentionAborts > 0);
    assert.equal(await held.page.evaluate(() => retentionAborts), 1, 'the pending request is aborted at the original deadline, before its 15-second network timeout');
    const heldAtExpiry = held.calls.length;
    await held.poll();
    await held.page.clock.fastForward(5000);
    assert.equal(held.calls.length, heldAtExpiry, 'an aborted expired upload cannot be queued again');
    await held.cleanup();

    const gone = await scenario('gone');
    await gone.page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
    const terminalCalls = gone.calls.length;
    await gone.poll();
    const beforeResend = await gone.page.evaluate(() => retentionMessages.length);
    await gone.page.evaluate(() => {
      const frame = document.querySelector('.game-frame');
      frame.contentWindow.postMessage({type: 'celadon:request-completed'}, location.origin);
    });
    await gone.page.waitForFunction(before => retentionMessages.length > before, beforeResend);
    await gone.poll();
    await gone.page.clock.fastForward(3000);
    assert.equal(gone.calls.length, terminalCalls, 'HTTP 410 is terminal even when the real iframe resends the same work before its client deadline');
    await gone.cleanup();

    assert.deepEqual(errors, []);
    console.log('Game upload retention: original deadline, earliest duplicate deadline, expired retry removal, in-flight abort, delayed packet rejection, and terminal 410 passed.');
  } finally {
    await Promise.allSettled(contexts.map(context => context.close()));
    await browser.close();
  }
})().catch(error => {console.error(error);process.exitCode = 1;});
