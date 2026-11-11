const {enterGame}=require('./game-entry.cjs');
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
  await page.goto(new URL('/game', base).href);
  await page.evaluate(({key, work}) => localStorage.setItem(key,
    JSON.stringify({history: ['royal-rest'], gallery: [], draft: work})), {key: KEY, work});
  await page.reload();
  await enterGame(page,'start');
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
        const xs=guide.map(p=>p[0]),ys=guide.map(p=>p[1]),left=Math.min(...xs),topY=Math.min(...ys),guideWidth=Math.max(...xs)-left,guideHeight=Math.max(...ys)-topY;
        const localGuide=guide.map(p=>[(p[0]-left)/guideWidth,(p[1]-topY)/guideHeight]);
        const imperfect=shapePoints=>({...draft(model,shape),sculpt:{mode:'free',complete:false,fraction:0,points:shapePoints}});
        // Regression: the previous mean-only score passed these 10% undersized
        // real vessel outlines at roughly 90–92%, despite the clear missing clay.
        await enter(page,imperfect(localGuide.map(p=>p.map(v=>.5+(v-.5)*.9))));
        const undersizeScore=(await saved(page)).sculpt.fraction;
        assert.ok(undersizeScore<.85, `${model}: visible undersize cannot pass (${undersizeScore})`);
        assert.equal(await page.locator('[data-action=next-shape]').isDisabled(),true);
        if(model==='pomegranatePitcher'){
          await enter(page,imperfect(localGuide.map(([x,y])=>[x,Math.max(y,.2)])));
          assert.ok((await saved(page)).sculpt.fraction<.85,'a correct body cannot hide a flattened upper fifth');
          await page.screenshot({path:`/tmp/shape-local-mismatch-${viewport.width}.png`});
        }
        await enter(page,draft(model,shape));
        const top = guide.reduce((best, p, i) => p[1] < guide[best][1] ? i : best, 0);
        const initialScore = Number(await canvas.getAttribute('data-coverage'));
        await page.mouse.click(box.x + guide[top][0] * box.width, box.y + guide[top][1] * box.height);
        assert.equal(Number(await canvas.getAttribute('data-coverage')), initialScore, 'pressing the target alone cannot complete the clay');
        const before = await points(canvas, 'current');
        await pull(page, canvas, top);
        assert.notDeepEqual(await points(canvas, 'current'), before, 'dragging physically stretches the rendered clay');
        const partial = await saved(page);
        if (model === 'pomegranatePitcher') await page.screenshot({path:`/tmp/free-shape-final-${viewport.width}.png`});
        assert.ok(partial.sculpt.fraction > 0 && partial.sculpt.fraction < .9);
        assert.ok((await points(canvas, 'matches'))[top] >= .99, 'the upper outline can be matched');
        // A matched grip can still move sideways or back down: no target-direction rail.
        const matched = (await points(canvas, 'current'))[top];
        await page.mouse.move(box.x + matched[0] * box.width, box.y + matched[1] * box.height);
        await page.mouse.down();
        await page.mouse.move(box.x + matched[0] * box.width + 46, box.y + matched[1] * box.height + 32, {steps: 5});
        await page.mouse.up();
        const moved = (await points(canvas, 'current'))[top];
        assert.ok(Math.abs((moved[0] - matched[0]) * box.width - 46) < 2, 'grip follows horizontal mouse movement');
        assert.ok(Math.abs((moved[1] - matched[1]) * box.height - 32) < 2, 'grip follows downward mouse movement');
        assert.ok(Math.hypot(moved[0]-guide[top][0],moved[1]-guide[top][1]) > Math.hypot(matched[0]-guide[top][0],matched[1]-guide[top][1]), 'the grip can move away from its goal');
        await page.mouse.move(box.x + moved[0] * box.width, box.y + moved[1] * box.height);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * .025, box.y + box.height * .04, {steps: 6});
        await page.mouse.up();
        assert.ok((await saved(page)).sculpt.fraction < .9, 'one large outward pull cannot complete the partly shaped clay');
        await pull(page, canvas, top);
        const afterFreeDrag = await saved(page);
        assert.equal(await page.locator('[data-action=next-shape]').isDisabled(), true);
        await page.reload();
        await enterGame(page,'start');
        await page.waitForFunction(() => Boolean(document.querySelector('.sculpt-canvas')?.dataset.current));
        assert.ok((await saved(page)).sculpt.points.every((p,i) => p.every((v,j) => Math.abs(v-afterFreeDrag.sculpt.points[i][j]) < 1e-10)), 'reload preserves local deformations');
        // Test rescaling on a contour inside the workspace; a deliberately far-out grip is safely clamped at a smaller boundary.
        await enter(page, partial);
        const beforeResize = (await saved(page)).sculpt, localBeforeResize = beforeResize.points;
        await page.setViewportSize({width: viewport.width - 100, height: viewport.height});
        await page.waitForTimeout(120);
        const localAfterResize = (await saved(page)).sculpt.points;
        assert.ok(localAfterResize.every((p, i) => p.every((v, j) => Math.abs(v - localBeforeResize[i][j]) < .00001)), 'resize preserves normalized clay deformations');
        assert.ok(Math.abs((await saved(page)).sculpt.fraction-beforeResize.fraction)<.001, 'the same clay keeps its score after viewport resize');
        await page.setViewportSize(viewport);
        await page.waitForTimeout(120);
        // Detailed contour checks use the fine tool; broad hand shaping is
        // exercised separately in browser-shaping-controls.cjs.
        await page.locator('[data-sculpt-range=fine]').click();
        for (let pass = 0; pass < 4; pass++) {
          for (let i = 0; i < 40; i++) {
            if (await page.locator('.sculpt-success').count()) break;
            await pull(page, canvas, i);
          }
          if (await page.locator('.sculpt-success').count()) break;
        }
        if(!await page.locator('.sculpt-success').count()){
          await page.screenshot({path:`/tmp/shape-incomplete-${model}-${viewport.width}.png`});
          assert.fail(`${model} remains at ${(await saved(page)).sculpt.fraction} after shaping`);
        }
        await page.waitForSelector('.sculpt-success');
        assert.ok((await saved(page)).sculpt.fraction >= .9);
        assert.equal(await page.locator('[data-action=next-shape]').isDisabled(), false);
        // Every student is asked the same neutral question about the order's use before decorating.
        await page.click('[data-action=next-shape]');
        const check = page.locator('dialog.shape-check-popup[open]');
        await check.waitFor();
        assert.match(await check.locator('.order-quote').innerText(), /\S/, 'the order is shown again');
        assert.match(await check.innerText(), /이 모양이 손님이 말한 쓰임에 맞나요\?/);
        assert.doesNotMatch(await check.innerText(), /틀렸|정답|맞았|잘못/, 'the check never reveals whether the shape is right');
        await check.locator('[data-action=recheck-shape]').click();
        await check.waitFor({state: 'hidden'});
        assert.equal((await saved(page)).step, 0, 'choosing again stays on the shaping table');
        await page.click('[data-action=next-shape]');
        await page.locator('dialog.shape-check-popup[open] [data-action=confirm-shape]').click();
        await page.waitForFunction(() => document.querySelector('dialog.shape-check-popup[open]') === null);
        assert.equal((await saved(page)).step, 1);
        assert.equal(await page.locator('.sculpt-success').count(), 0, 'the success effect clears on decoration');
      }
      await enter(page, draft('stool', 'stool'));
      const keyboardCanvas = page.locator('.sculpt-canvas');
      await keyboardCanvas.focus();
      const oldPoint = (await points(keyboardCanvas, 'current'))[0];
      await page.keyboard.press('ArrowRight');
      const keyboardPoint = (await points(keyboardCanvas, 'current'))[0];
      assert.ok(keyboardPoint[0] > oldPoint[0], 'arrow key moves clay freely');
      await page.keyboard.press('KeyE');
      assert.equal(await keyboardCanvas.getAttribute('data-selected'), '1', 'E selects the next grip');
      for (let pass = 0; pass < 4; pass++) {
        for (let i = 0; i < 40; i++) {
          if (await page.locator('.sculpt-success').count()) break;
          for (let j = 0; j < 6; j++) await page.keyboard.press('Enter');
          await page.keyboard.press('KeyE');
        }
        if (await page.locator('.sculpt-success').count()) break;
      }
      await page.waitForSelector('.sculpt-success');
      assert.ok((await saved(page)).sculpt.fraction >= .9, 'keyboard shaping uses the same distance threshold');
      await page.waitForSelector('.sculpt-success', {state: 'hidden'});
      assert.equal(await page.locator('[data-action=next-shape]').isDisabled(), false, 'completion remains after the success effect fades');
      // Going back starts the earlier activity again, rather than carrying completed clay forward.
      await page.click('[data-action=station-back]');
      await page.waitForSelector('.knead-pad');
      const clayRestart = await saved(page);
      assert.equal(clayRestart.clay.kneads, 0);
      assert.equal(clayRestart.clay.prepared, false);
      assert.equal(clayRestart.sculpt, null);
      assert.equal(clayRestart.knead, 0);
      assert.equal(await page.locator('[data-action=clay-ready]').isDisabled(), true);
      await page.locator('.knead-pad').focus();
      for(let i=0;i<6;i++) await page.keyboard.press('Space');
      await page.click('[data-action=clay-ready]');
      await page.waitForFunction(() => JSON.parse(document.querySelector('.sculpt-canvas')?.dataset.current || '[]').length === 40);
      const restarted = await saved(page), restartedCanvas=page.locator('.sculpt-canvas');
      assert.equal(restarted.sculpt.complete, false);
      assert.equal(await page.locator('[data-action=next-shape]').isDisabled(), true);
      const restartedPoints=await points(restartedCanvas,'current'), starts=await points(restartedCanvas,'starts');
      assert.ok(restartedPoints.every((p,i)=>p.every((v,j)=>Math.abs(v-starts[i][j])<1e-10)), 'back to shape restores the untouched clay mound');
      assert.deepEqual(errors, []);
      console.log(`Shaping ${viewport.width}×${viewport.height}: undersize/local-mismatch rejection, stable score, drag, reload, 90%, keyboard passed`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
