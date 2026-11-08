/* Focused real-GLB viewer checks. Run against a local built server. */
const assert = require('node:assert/strict');
const path = require('node:path');
const {build} = require('esbuild');
const {chromium} = require('playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:4173';

(async () => {
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Viewer tests must use a local server.');
  const bundle = await build({stdin: {resolveDir: path.join(__dirname, '..'), contents: `
    import {mountLessonViewer} from './lesson-viewer.js';
    import {COMPARISON_ARTIFACTS, OBSERVATION_ARTIFACTS} from './lesson-artifacts.js';
    const host = document.querySelector('#viewer-test');
    window.testViewer = mountLessonViewer(host, COMPARISON_ARTIFACTS[0]);
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
    console.log('Expanded lesson viewer: size, model rendering, rotation, focus, Escape, close, disposal, artifact changes and narrow-card layout passed.');
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
