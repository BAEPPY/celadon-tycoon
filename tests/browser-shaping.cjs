/* npm run build; run with BASE_URL and CHROMIUM_PATH as in browser-workshop.cjs. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const KEY = 'celadon-tycoon-v2';
const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const draft = (modelId, shape) => ({
  id: 'shaping-check', orderId: 'royal-rest', shape, modelId,
  step: 0, knead: 0, width: 1, technique: 'inlay', pattern: 'cloud',
  placements: [], strokes: [], decorPhase: 0, decorDone: false, firing: [],
  accepted: true, clay: { body: true, slip: 'white', kneads: 6, prepared: true },
  stationView: 'game',
});
async function saved(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)).draft, KEY);
}
async function enter(page, work) {
  await page.goto(base);
  await page.evaluate(({key, work}) => localStorage.setItem(key,
    JSON.stringify({history: ['royal-rest'], gallery: [], draft: work})), {key: KEY, work});
  await page.reload();
  await page.click('[data-action=start]');
  await page.waitForFunction(() => JSON.parse(document.querySelector('.sculpt-canvas')?.dataset.current || '[]').length === 40);
}
async function points(canvas, kind) {
  return JSON.parse(await canvas.getAttribute('data-' + kind));
}
async function pull(page, canvas, index) {
  const box = await canvas.boundingBox(), from = (await points(canvas, 'current'))[index], to = (await points(canvas, 'guide'))[index];
  await page.mouse.move(box.x + from[0] * box.width, box.y + from[1] * box.height);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0] * box.width, box.y + to[1] * box.height, {steps: 6});
  await page.mouse.up();
}
(async () => {
  const browser = await chromium.launch({headless: true, ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}), args: ['--no-sandbox']});
  try {
    for (const viewport of [{width: 1366, height: 768}, {width: 1024, height: 600}]) {
      const page = await browser.newPage({viewport, reducedMotion: viewport.width === 1024 ? 'reduce' : 'no-preference'}), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      for (const [model, shape] of [['pomegranatePitcher', 'pitcher'], ['pillow', 'pillow'], ['stool', 'stool']]) {
        await enter(page, draft(model, shape));
        const canvas = page.locator('.sculpt-canvas'), guide = await points(canvas, 'guide'), box = await canvas.boundingBox();
        assert.ok(guide.every(p => p.every(v => v >= 0 && v <= 1)), 'all outline edges are reachable');
        const top = guide.reduce((best, p, i) => p[1] < guide[best][1] ? i : best, 0);
        await page.mouse.click(box.x + guide[top][0] * box.width, box.y + guide[top][1] * box.height);
        assert.equal(Number(await canvas.getAttribute('data-coverage')), 0, 'pressing the target alone cannot complete the clay');
        const before = await points(canvas, 'current');
        await pull(page, canvas, top);
        assert.notDeepEqual(await points(canvas, 'current'), before, 'dragging physically stretches the rendered clay');
        const partial = await saved(page);
        assert.ok(partial.sculpt.fraction > 0 && partial.sculpt.fraction < .9);
        assert.ok(partial.sculpt.amounts[top] >= .99, 'the upper outline can be matched');
        assert.equal(await page.locator('[data-action=next-shape]').isDisabled(), true);
        await page.reload();
        await page.click('[data-action=start]');
        await page.waitForFunction(() => Boolean(document.querySelector('.sculpt-canvas')?.dataset.current));
        assert.deepEqual((await saved(page)).sculpt.amounts, partial.sculpt.amounts, 'reload preserves local deformations');
        for (let pass = 0; pass < 4; pass++) {
          for (let i = 0; i < 40; i += 3) {
            if (await page.locator('.sculpt-success').count()) break;
            await pull(page, canvas, i);
          }
          if (await page.locator('.sculpt-success').count()) break;
        }
        await page.waitForSelector('.sculpt-success');
        assert.ok((await saved(page)).sculpt.fraction >= .9);
        assert.equal(await page.locator('[data-action=next-shape]').isDisabled(), false);
        await page.click('[data-action=next-shape]');
        assert.equal(await page.locator('.sculpt-success').count(), 0, 'the success effect clears on decoration');
      }
      const near = draft('stool', 'stool');
      near.sculpt = {mode: 'stretch', amounts: Array(40).fill(.899), fraction: .899, complete: false};
      await enter(page, near);
      assert.equal(await page.locator('[data-action=next-shape]').isDisabled(), true, '89.9% must not pass');
      assert.match(await page.locator('#sculpt-status').textContent(), /89%/, 'a locked 89.9% never displays 90%');
      await page.locator('.sculpt-canvas').focus();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Space');
      await page.waitForSelector('.sculpt-success');
      assert.ok((await saved(page)).sculpt.fraction >= .9, 'keyboard stretching uses the same 90% threshold');
      await page.waitForSelector('.sculpt-success', {state: 'hidden'});
      assert.equal(await page.locator('[data-action=next-shape]').isDisabled(), false, 'completion remains after the success effect fades');
      assert.deepEqual(errors, []);
      console.log(`Shaping ${viewport.width}×${viewport.height}: top/flat/tall contours, drag, reload, 90%, keyboard passed`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
