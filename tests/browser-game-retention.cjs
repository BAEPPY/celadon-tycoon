const {enterGame}=require('./game-entry.cjs');
/* Run against a built app. The browser clock covers 24 hours without waiting. */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');

const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const KEY = 'celadon-tycoon-v2';
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 8, 12);
const CLASSROOM_KEY = `${KEY}:classroom:ABCDEF:7:run:retention-test`;
const draft = {
  id: 'retention-draft', customerId: 'king', orderId: 'royal-rest', accepted: true,
  clay: {body: true, slip: 'white', kneads: 2, prepared: false},
  shape: null, modelId: null, step: 0, stationView: 'clay',
  knead: 0, width: 1, technique: 'inlay', pattern: 'crane',
  placements: [], strokes: [], decorPhase: 0, decorDone: false, firing: [],
  explanationUse: '앉아서 쉬는 데 쓸 청자입니다.',
  explanationBeauty: '구름 무늬와 푸른 빛깔이 어울립니다.',
  selfUse: true, selfBeauty: true,
};
const completed = {
  ...draft, id: 'retention-completed', shape: 'stool', modelId: 'stool', step: 4,
  stationView: 'counter-delivery', knead: 3, decorPhase: 2, decorDone: true,
  firing: ['dry', 'biscuit', 'glaze', 'fire'],
  assessment: {accepted: true, use: {score: 5}, beauty: {score: 5}},
  preview: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#9db497"/></svg>'),
};
const fixture = {history: ['royal-rest'], gallery: [completed], draft, sound: false};

async function setTime(page, time) {await page.clock.setFixedTime(new Date(time));}
async function stored(page, key = KEY) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
}
async function write(page, entries) {
  await page.evaluate(entries => {
    for (const [key, value] of Object.entries(entries)) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    }
  }, entries);
}
async function cover(page, resumable) {
  await page.locator('.shop-cover').waitFor();
  assert.equal(await page.locator('[data-action=start]').count(), resumable ? 1 : 0);
  assert.equal(await page.locator('[data-action=new-order]').count(), 1);
}
async function focus(page) {await page.evaluate(() => dispatchEvent(new Event('focus')));}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}),
    args: ['--no-sandbox'],
  });
  const errors = [];
  try {
    const context = await browser.newContext({viewport: {width: 1366, height: 768}});
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({time: new Date(NOW)});
    await setTime(page, NOW);
    await page.goto(new URL('/game', base).href);
    await cover(page, false);

    await enterGame(page,'new-order');
    await page.locator('.counter-scene').waitFor();
    assert.equal((await stored(page)).draft.accepted, false);
    await page.click('[data-action=home]');
    await cover(page, false);
    await page.reload();
    await cover(page, false);
    await enterGame(page,'new-order');
    await page.click('[data-action=accept]');
    await page.locator('.clay-scene').waitFor();
    await page.click('[data-action=home]');
    await cover(page, true);
    await page.reload();
    await cover(page, true);

    // Data survives right up to its fixed deadline; interacting never renews it.
    const started = NOW - 3600000;
    await write(page, {[KEY]: {...fixture, retentionStartedAt: started}});
    await page.reload();
    await cover(page, true);
    await setTime(page, started + DAY - 1);
    await focus(page);
    await cover(page, true);
    assert.deepEqual(await stored(page), {...fixture, retentionStartedAt: started});
    await enterGame(page,'start');
    await page.locator('.clay-scene').waitFor();
    await page.click('[data-action=home]');
    assert.equal((await stored(page)).retentionStartedAt, started);
    await setTime(page, started + DAY);
    await focus(page);
    await cover(page, false);
    assert.equal(await stored(page), null, 'the complete record is removed at the 24-hour boundary');
    assert.match(await page.locator('.hud-stats').innerText(), /명성 0/);
    assert.match(await page.locator('.hud-stats').innerText(), /첫 손님 대기/);
    await page.click('[data-action=gallery]');
    assert.match(await page.locator('#popup').innerText(), /첫 작품을 기다리고 있어요/);
    await page.click('[data-action=close-popup]');

    // Startup sweeps every game namespace, while retaining lesson identities and answers.
    const cleanupTime = NOW + 2 * DAY;
    const oldRun = `${KEY}:classroom:ABCDEF:7:run:old-run`;
    const oldParticipant = `${KEY}:classroom:GHIJKL:8`;
    const currentRun = `${KEY}:classroom:ABCDEF:7:run:current-run`;
    const protectedEntries = {
      'celadon-classroom-teacher-v1': {code: 'ABCDEF', teacherToken: 'teacher-secret'},
      'celadon-classroom-student-v1': {code: 'ABCDEF', participantId: '7', token: 'student-secret'},
      'celadon-classroom-rejoin-v1': {sessions: [{code: 'ABCDEF', participantId: '7'}]},
      'celadon-classroom-drafts-v1:ABCDEF:7': {activity1: {country: '고려'}, activity2: {use: '의자'}},
    };
    await setTime(page, cleanupTime);
    await write(page, {
      ...protectedEntries,
      [KEY]: {...fixture, retentionStartedAt: cleanupTime - DAY},
      [oldRun]: {...fixture, retentionStartedAt: cleanupTime - DAY - 1},
      [oldParticipant]: {...fixture, retentionStartedAt: cleanupTime - 2 * DAY},
      [currentRun]: {...fixture, retentionStartedAt: cleanupTime - DAY + 1},
      'celadon-workshop-v1': {...fixture, retentionStartedAt: cleanupTime - DAY},
    });
    await page.evaluate(() => sessionStorage.setItem('celadon-classroom-student-v1', JSON.stringify({participantId: '7', token: 'active-secret'})));
    await page.reload();
    await cover(page, false);
    for (const key of [KEY, oldRun, oldParticipant, 'celadon-workshop-v1']) assert.equal(await stored(page, key), null, key);
    assert.equal((await stored(page, currentRun)).draft.id, draft.id);
    for (const [key, value] of Object.entries(protectedEntries)) assert.deepEqual(await stored(page, key), value, key);
    assert.deepEqual(await page.evaluate(() => JSON.parse(sessionStorage.getItem('celadon-classroom-student-v1'))), {participantId: '7', token: 'active-secret'});

    // Timestamp-free saves receive one bounded migration window, not a fresh day each reload.
    await write(page, {[KEY]: fixture});
    await page.reload();
    await cover(page, true);
    const migrated = await stored(page);
    assert.equal(migrated.retentionStartedAt, cleanupTime);
    const {retentionStartedAt, ...migratedData} = migrated;
    assert.deepEqual(migratedData, fixture);
    await setTime(page, cleanupTime + 3600000);
    await page.reload();
    await cover(page, true);
    assert.equal((await stored(page)).retentionStartedAt, retentionStartedAt);
    await setTime(page, retentionStartedAt + DAY);
    await page.reload();
    await cover(page, false);
    assert.equal(await stored(page), null);

    // An open tab expires without navigation, focus, or user input.
    const periodicTime = cleanupTime + 2 * DAY;
    await setTime(page, periodicTime);
    await write(page, {[KEY]: {...fixture, retentionStartedAt: periodicTime}});
    await page.reload();
    await cover(page, true);
    await enterGame(page,'start');
    await page.locator('.clay-scene').waitFor();
    await setTime(page, periodicTime + DAY);
    await page.clock.fastForward(61000);
    await cover(page, false);
    assert.equal(await stored(page), null, 'periodic cleanup also clears the live work');
    await context.close();

    // A teacher-paused iframe must not resurrect a draft when the lesson resumes after expiry.
    const classroom = await browser.newContext({viewport: {width: 1366, height: 768}});
    const host = await classroom.newPage();
    host.setDefaultTimeout(15000);
    host.on('pageerror', error => errors.push(error.message));
    await host.clock.install({time: new Date(NOW)});
    await setTime(host, NOW);
    const hostUrl = new URL('/__game-retention-host', base).href;
    await host.route(hostUrl, route => route.fulfill({contentType: 'text/html', body: `<!doctype html><body><script>window.messages=[];addEventListener("message",event=>messages.push(event.data));</script><iframe style="width:1300px;height:720px" src="/game?classroom=1&room=ABCDEF&student=7&run=retention-test"></iframe></body>`}));
    await host.goto(new URL('/game', base).href);
    await write(host, {[CLASSROOM_KEY]: {...fixture, gallery: [], retentionStartedAt: NOW}});
    await host.goto(hostUrl);
    let frame = host.frames().find(item => item.url().includes('classroom=1'));
    await frame.locator('#classroom-game-pause').waitFor();
    const teacherState = async active => {
      await host.evaluate(active => document.querySelector('iframe').contentWindow.postMessage({
        type: 'celadon:classroom-state', active, runId: 'retention-test',
      }, location.origin), active);
      await frame.waitForFunction(active => document.querySelector('#classroom-game-pause').style.display === (active ? 'none' : 'grid'), active);
    };
    await teacherState(true);
    await cover(frame, true);
    await enterGame(frame,'start');
    await frame.locator('.clay-scene').waitFor();
    await teacherState(false);
    assert.equal((await stored(frame, CLASSROOM_KEY)).draft.id, draft.id);
    await setTime(host, NOW + DAY);
    await teacherState(true);
    await cover(frame, false);
    assert.equal(await stored(frame, CLASSROOM_KEY), null);
    await enterGame(frame,'new-order');
    await frame.locator('.counter-scene').waitFor();
    assert.notEqual((await stored(frame, CLASSROOM_KEY)).draft.id, draft.id);
    assert.equal((await stored(frame, CLASSROOM_KEY)).retentionStartedAt, NOW + DAY);
    // A preview already being decoded must not upload an expired gallery item.
    const pendingTime = NOW + 2 * DAY;
    await setTime(host, pendingTime);
    await write(host, {[CLASSROOM_KEY]: {...fixture, retentionStartedAt: pendingTime}});
    await host.reload();
    frame = host.frames().find(item => item.url().includes('classroom=1'));
    await frame.locator('#classroom-game-pause').waitFor();
    await frame.evaluate(() => {
      const decode = HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode = function() {
        const ready = decode.call(this);
        if (!this.src.startsWith('data:image/svg+xml')) return ready;
        return ready.then(() => new Promise(resolve => {window.releaseHeldPreview = resolve;}));
      };
    });
    await teacherState(true);
    await frame.waitForFunction(() => typeof window.releaseHeldPreview === 'function');
    await setTime(host, pendingTime + DAY);
    await teacherState(true); // Keep the classroom lease active so expiry is the only upload guard.
    await focus(frame);
    await cover(frame, false);
    await frame.evaluate(async () => {
      window.releaseHeldPreview();
      // Flush the decode continuation and the bridge's asynchronous post check.
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    await host.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
    assert.equal(await host.evaluate(() => messages.filter(message => message.type === 'celadon:completed').length), 0,
      'a preview resolved after expiry cannot send the former gallery back to the classroom');
    assert.equal(await stored(frame, CLASSROOM_KEY), null);
    await classroom.close();

    assert.deepEqual(errors, []);
    console.log('Game retention: genuine progress only, fixed 24-hour boundary, namespace cleanup, protected lesson data, bounded legacy migration, live-tab expiry, and paused-iframe resume, and pending-preview expiry passed.');
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
