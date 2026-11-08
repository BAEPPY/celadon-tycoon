/* Focused real-GLB viewer checks. Run against a local built server. */
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {build} = require('esbuild');
const {chromium} = require('playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:4173';

(async () => {
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Viewer tests must use a local server.');
  const {COMPARISON_ANSWERS, OBSERVATION_ANSWERS} = await import(pathToFileURL(path.join(__dirname, '../lesson-answer-key.js')));
  const bundle = await build({stdin: {resolveDir: path.join(__dirname, '..'), contents: `
    import {mountLessonViewer} from './lesson-viewer.js';
    import {COMPARISON_ARTIFACTS, OBSERVATION_ARTIFACTS} from './lesson-artifacts.js';
    const host = document.querySelector('#viewer-test');
    window.testViewer = mountLessonViewer(host, COMPARISON_ARTIFACTS[0], {getExpandedInfo: () => window.expandedInfo});
    window.replaceTestViewer = () => window.testViewer = mountLessonViewer(host, OBSERVATION_ARTIFACTS[0]);
  `}, bundle: true, write: false, format: 'esm', target: 'es2022'});
  const browser = await chromium.launch({headless: true,
    ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}),
    args: ['--no-sandbox', '--enable-unsafe-swiftshader']});
  try {
    const page = await browser.newPage({viewport: {width: 1366, height: 768}}), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__lesson-viewer-test.js', route => route.fulfill({contentType: 'text/javascript', body: bundle.outputFiles[0].text}));
    await page.route('**/__lesson-viewer-test', route => route.fulfill({contentType: 'text/html', body: `
      <!doctype html><html lang="ko"><meta charset="utf-8"><link rel="stylesheet" href="/classroom.css">
      <body style="margin:20px;background:#f2f5f5"><section class="object-card panel" style="width:290px">
      <div class="object-title"><h2 id="neutral-label">청자 1</h2></div><div id="viewer-test"></div>
      </section><script type="module" src="/__lesson-viewer-test.js"></script></body></html>`}));
    await page.goto(`${base}/__lesson-viewer-test`);
    await page.locator('#viewer-test[data-viewer-status="ready"]').waitFor({timeout: 30000});
    const expand = page.locator('#viewer-test .lesson-viewer__expand');
    for (const size of [{width: 1366, height: 768}, {width: 1024, height: 600}]) {
      await page.setViewportSize(size);
      const small = await page.locator('#viewer-test .lesson-viewer__viewport').boundingBox();
      const label = await page.locator('#neutral-label').boundingBox(), button = await expand.boundingBox();
      assert.ok(button.y >= label.y + label.height, 'Expand button does not cover the neutral artifact label.');
      assert.ok(button.x >= small.x && button.x + button.width <= small.x + small.width + 1, 'Expand button fits a narrow card.');
      await expand.click();
      const dialog = page.locator('dialog.lesson-viewer__dialog[open]');
      await dialog.locator('[data-viewer-status="ready"]').waitFor({timeout: 30000});
      const large = await dialog.locator('.lesson-viewer__viewport').boundingBox(), bounds = await dialog.boundingBox();
      assert.ok(bounds.width >= size.width * .92 && bounds.height >= size.height * .9, 'Dialog fills the screen.');
      assert.ok(large.width > small.width * 2 && large.height > small.height, 'Expanded model viewport is larger.');
      assert.equal(await dialog.locator('.lesson-viewer__expand').count(), 0, 'Expanded viewer cannot open another expanded viewer.');
      const info = dialog.locator('.lesson-viewer__info'), infoBounds = await info.boundingBox();
      assert.equal(await info.getAttribute('data-info-state'), 'observation');
      assert.match(await info.innerText(), /어떤 색과 무늬/);
      assert.equal(await info.locator('a,.lesson-viewer__info-meta,.lesson-viewer__info-use').count(), 0, 'Unrevealed viewers only offer neutral observation guidance.');
      assert.ok(infoBounds.x >= large.x + large.width && infoBounds.width >= 260 && infoBounds.width <= 300, 'Readable sidebar sits to the right of the large model.');
      if (process.env.VIEWER_SCREENSHOTS) await page.screenshot({path: path.join(process.env.VIEWER_SCREENSHOTS, `celadon-expanded-viewer-${size.width}.png`)});
      const canvas = dialog.locator('canvas'), before = await canvas.screenshot();
      await dialog.getByRole('button', {name: '오른쪽으로 돌리기', exact: true}).click();
      await page.waitForTimeout(100);
      assert.notDeepEqual(await canvas.screenshot(), before, 'Rotation changes the rendered view.');
      await dialog.getByRole('button', {name: '확대하기', exact: true}).click();
      await dialog.getByRole('button', {name: '처음 시점으로 되돌리기', exact: true}).click();
      await canvas.focus(); await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('Escape');
      await dialog.waitFor({state: 'detached'});
      assert.equal(await expand.evaluate(button => button === document.activeElement), true, 'Escape restores focus to expand.');
      assert.equal(await page.locator('canvas').count(), 1, 'Closing releases the second canvas.');
    }
    // A live server callback may reveal or update the details without remounting
    // the already rotated model, and never supplies facts omitted by the server.
    await expand.click();
    const revealedDialog = page.locator('dialog.lesson-viewer__dialog[open]');
    await revealedDialog.locator('[data-viewer-status="ready"]').waitFor({timeout: 30000});
    await revealedDialog.getByRole('button', {name: '오른쪽으로 돌리기', exact: true}).click();
    const retainedCanvas = await revealedDialog.locator('canvas').elementHandle();
    const rotatedView = await retainedCanvas.screenshot();
    for (const details of [COMPARISON_ANSWERS['1'], OBSERVATION_ANSWERS['1']]) {
      await page.evaluate(info => {window.expandedInfo = info; window.testViewer.refreshExpandedInfo();}, details);
      const info = revealedDialog.locator('.lesson-viewer__info');
      assert.equal(await info.getAttribute('data-info-state'), 'revealed');
      const text = await info.innerText();
      for (const key of ['name', 'countryLabel', 'date', 'use', 'note', 'source']) if (details[key]) assert.ok(text.includes(details[key]), `Expanded details include ${key}.`);
      assert.equal(await info.locator('.lesson-viewer__info-use').count(), details.use ? 1 : 0, 'No use is inferred when the server omits it.');
      assert.equal(await info.getByRole('link', {name: '자료 출처 보기 ↗'}).getAttribute('href'), details.sourceUrl);
      assert.equal(await retainedCanvas.evaluate(canvas => canvas.isConnected && canvas === document.querySelector('.lesson-viewer__dialog canvas')), true, 'Refreshing the explanation preserves the model canvas.');
      assert.deepEqual(await retainedCanvas.screenshot(), rotatedView, 'Refreshing only the explanation preserves the camera.');
    }
    await page.evaluate(info => {window.expandedInfo = info; window.testViewer.refreshExpandedInfo();}, COMPARISON_ANSWERS['1']);
    for (const size of [{width: 1366, height: 768}, {width: 1024, height: 600}, {width: 390, height: 844}]) {
      await page.setViewportSize(size);
      const dimensions = await revealedDialog.evaluate(dialog => {
        const body = dialog.querySelector('.lesson-viewer__dialog-body'), host = dialog.querySelector('.lesson-viewer__expanded-host'), info = dialog.querySelector('.lesson-viewer__info');
        const toRect = node => {const rect = node.getBoundingClientRect(); return {x: rect.x, y: rect.y, width: rect.width, height: rect.height};};
        return {dialog: toRect(dialog), host: toRect(host), info: toRect(info), overflowing: body.scrollWidth > body.clientWidth + 1 || info.scrollWidth > info.clientWidth + 1,
          fonts: [...info.querySelectorAll('h3,p,strong,a')].map(node => parseFloat(getComputedStyle(node).fontSize))};
      });
      assert.equal(dimensions.overflowing, false, 'Description fits without horizontal scrolling.');
      assert.ok(dimensions.fonts.every(size => size >= 14), 'All explanation text stays at least 14px.');
      if (size.width <= 700) {
        assert.ok(dimensions.info.y >= dimensions.host.y + dimensions.host.height, 'Mobile explanation stacks below the model.');
        await revealedDialog.getByRole('link', {name: '자료 출처 보기 ↗'}).scrollIntoViewIfNeeded();
        assert.equal(await revealedDialog.getByRole('link', {name: '자료 출처 보기 ↗'}).isVisible(), true);
        await revealedDialog.locator('.lesson-viewer__dialog-body').evaluate(body => {body.scrollTop = 0;});
      } else assert.ok(dimensions.info.x >= dimensions.host.x + dimensions.host.width, 'Desktop and tablet explanations sit beside the model.');
      if (process.env.VIEWER_SCREENSHOTS) await page.screenshot({path: path.join(process.env.VIEWER_SCREENSHOTS, `celadon-expanded-info-${size.width}.png`)});
    }
    await page.setViewportSize({width: 1366, height: 768});
    await page.evaluate(() => {window.expandedInfo = null; window.testViewer.refreshExpandedInfo();});
    assert.equal(await revealedDialog.locator('.lesson-viewer__info').getAttribute('data-info-state'), 'observation', 'Withdrawing revealed data removes the identity.');
    assert.equal(await revealedDialog.locator('.lesson-viewer__info a').count(), 0);
    await page.keyboard.press('Escape');
    await expand.click();
    await page.getByRole('button', {name: '크게 보기 닫기', exact: true}).click();
    assert.equal(await page.locator('dialog').count(), 0, 'Close button removes the modal.');
    // Dispose immediately during a modal load, as when the teacher pauses the class.
    await expand.click(); await page.evaluate(() => window.testViewer.dispose());
    await page.waitForTimeout(100);
    assert.equal(await page.locator('dialog, canvas').count(), 0, 'Teacher pause/dispose closes the modal and both viewers.');
    await page.evaluate(() => window.replaceTestViewer());
    await page.locator('#viewer-test[data-viewer-status="ready"]').waitFor({timeout: 30000});
    await expand.click(); await page.evaluate(() => window.replaceTestViewer());
    assert.equal(await page.locator('dialog').count(), 0, 'Changing the artifact closes the expanded viewer.');
    await page.evaluate(() => window.testViewer.dispose());
    assert.deepEqual(errors, [], 'No browser runtime errors.');
    console.log('Expanded lesson viewer: responsive explanation sidebar, reveal privacy, source metadata, live updates without camera reset, model rendering, rotation, focus, Escape, close and disposal passed.');
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
