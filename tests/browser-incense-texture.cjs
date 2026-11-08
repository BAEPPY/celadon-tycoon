/* The textured incense must work in both classroom viewing modes and the game catalog. */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:4173';

(async () => {
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
  const browser = await chromium.launch({headless: true, ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}), args: ['--no-sandbox', '--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport: {width: 1024, height: 600}});
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  let room;
  async function api(action, body = {}, auth) {
    const response = await page.request.post(`${base}/api/classroom`, {headers: auth ? {Authorization: `Bearer ${auth}`} : {}, data: {action, ...(room ? {code: room.code} : {}), ...body}});
    const value = await response.json(); assert.equal(response.status(), 200, JSON.stringify(value)); return value;
  }
  try {
    room = await api('create');
    await api('control', {command: 'start', activity: 2}, room.teacherToken);
    await page.goto(`${base}/lesson?code=${room.code}`);
    await page.locator('[name=number]').fill('1'); await page.locator('[name=name]').fill('질감 확인');
    await page.locator('[data-form=join] button[type=submit]').click();
    await page.locator('[data-action=select-object][data-id="5"]').click();
    const model = page.locator('.observe-stage [data-viewer="5"]');
    await model.locator('canvas').waitFor(); await model.locator('.lesson-viewer__expand').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-viewer="5"]')?.dataset.viewerStatus === 'ready', null, {timeout: 45000});
    assert.doesNotMatch(await page.locator('.observe-stage').innerText(), /칠보|향로/);
    await page.screenshot({path: '/tmp/incense-textured-student.png'});
    assert.equal(await model.getAttribute('data-opening'), 'closed');
    await model.getByRole('button', {name: '뚜껑 열기', exact: true}).click();
    await page.waitForFunction(() => document.querySelector('[data-viewer="5"]')?.dataset.opening === 'open');
    await page.screenshot({path: '/tmp/incense-open-student.png'});
    await model.locator('.lesson-viewer__expand').click();
    const expanded = page.locator('dialog.lesson-viewer__dialog[open]');
    await expanded.locator('[data-viewer-status=ready]').waitFor({timeout: 45000});
    assert.equal(await expanded.locator('[data-viewer-status=ready]').getAttribute('data-opening'), 'open', 'enlarging preserves the open lid');
    const before = await expanded.locator('canvas').screenshot();
    await expanded.getByRole('button', {name: '오른쪽으로 돌리기', exact: true}).click();
    await page.waitForTimeout(150);
    assert.notDeepEqual(await expanded.locator('canvas').screenshot(), before, 'the textured object rotates in expanded view');
    await page.screenshot({path: '/tmp/incense-textured-expanded.png'});
    await expanded.getByRole('button', {name: '뚜껑 닫기', exact: true}).click();
    await expanded.locator('[data-opening=closed]').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await model.getAttribute('data-opening'), 'closed', 'closing in enlarged view syncs to the small view');
    await api('control', {command: 'pause'}, room.teacherToken);
    await api('control', {command: 'reveal', activity: 2}, room.teacherToken);
    await page.evaluate(value => localStorage.setItem('celadon-classroom-teacher-v1', JSON.stringify(value)), {code: room.code, teacherToken: room.teacherToken});
    await page.goto(`${base}/teacher`);
    await page.locator('[data-action=exhibit-object][data-id="5"]').click();
    await page.locator('[data-exhibit-viewer="5"][data-viewer-status=ready]').waitFor({timeout: 45000});
    assert.match(await page.locator('.teacher-content').innerText(), /청자 투각 칠보무늬 향로/);
    await page.screenshot({path: '/tmp/incense-textured-teacher.png'});
    await page.goto(`${base}/game`); await page.locator('[data-action=museum]').click();
    await page.locator('#catalog-select').selectOption('incense');
    await page.locator('#model-viewer[data-status=ready]').waitFor({timeout: 45000});
    assert.match(await page.locator('#museum').innerText(), /원본 사진 질감/);
    await page.locator('#model-viewer').getByRole('button', {name: '뚜껑 열기', exact: true}).click();
    await page.locator('#model-viewer[data-opening=open]').waitFor();
    await page.screenshot({path: '/tmp/incense-textured-catalog.png'});
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.locator('#model-viewer').getByRole('button', {name: '뚜껑 닫기', exact: true}).click();
    await page.locator('#model-viewer[data-opening=closed]').waitFor();
    await page.locator('#catalog-select').selectOption('pillow');
    await page.locator('#model-viewer[data-status=ready]').waitFor({timeout: 45000});
    assert.equal(await page.getByRole('button', {name: /뚜껑 (열기|닫기)/}).count(), 0, 'other artifacts do not acquire a lid control');
    assert.deepEqual(errors, []);
    console.log('Textured incense: student blind view, reversible opening, expanded state/rotation, teacher reveal, game catalog and reduced motion passed.');
  } finally {
    if (room) await api('control', {command: 'delete'}, room.teacherToken).catch(() => {});
    await browser.close();
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
