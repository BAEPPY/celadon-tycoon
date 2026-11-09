/* Real GLBs: sharp cards, lazy detailed models, fallback, cancellation and mobile. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const {build} = require('esbuild');
const {chromium} = require('playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:4173';

(async () => {
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Use a local server.');
  const bundle = await build({stdin: {resolveDir: path.join(__dirname, '..'), contents: `
    import {mountLessonViewer} from './lesson-viewer.js';
    import {COMPARISON_ARTIFACTS, OBSERVATION_ARTIFACTS, BEAUTY_ARTIFACT} from './lesson-artifacts.js';
    window.artifacts = [COMPARISON_ARTIFACTS[0], COMPARISON_ARTIFACTS[1], OBSERVATION_ARTIFACTS[0], OBSERVATION_ARTIFACTS[3], BEAUTY_ARTIFACT];
    window.mountArtifact = index => window.viewer = mountLessonViewer(document.querySelector('#quality-host'), window.artifacts[index]);
    window.mountArtifact(0);
  `}, bundle: true, write: false, format: 'esm', target: 'es2022'});
  const browser = await chromium.launch({headless: true,
    ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}),
    args: ['--no-sandbox', '--enable-unsafe-swiftshader']});
  const screenshots = process.env.QUALITY_SCREENSHOTS;
  if (screenshots) await fs.mkdir(screenshots, {recursive: true});
  try {
    const page = await browser.newPage({viewport: {width: 1366, height: 768}, deviceScaleFactor: 1});
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {if (request.url().endsWith('.glb')) requests.push(new URL(request.url()).pathname);});
    await page.route('**/__model-quality.js', route => route.fulfill({contentType: 'text/javascript', body: bundle.outputFiles[0].text}));
    await page.route('**/__model-quality', route => route.fulfill({contentType: 'text/html', body: `
      <!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="/classroom.css"><body style="margin:16px;background:#f2f5f5">
      <section class="object-card panel" style="width:min(100%,360px)"><h2>청자 1</h2><div id="quality-host"></div></section>
      <script type="module" src="/__model-quality.js"></script></body></html>`}));
    await page.goto(`${base}/__model-quality`);
    const host = page.locator('#quality-host');
    const ready = () => page.locator('#quality-host[data-viewer-status=ready]').waitFor({timeout: 60000});
    const dialog = () => page.locator('dialog.lesson-viewer__dialog[open]');
    const expand = () => host.getByRole('button', {name: /크게 보기/}).click();
    const expandedReady = () => dialog().locator('[data-viewer-status=ready]').waitFor({timeout: 60000});
    const painted = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await ready();
    const artifacts = await page.evaluate(() => window.artifacts);
    assert.equal(await host.getAttribute('data-model-quality'), 'standard');
    assert.ok(requests.includes(artifacts[0].src), 'Card loads the ordinary model.');
    assert.equal(requests.filter(url => url.includes('/detail/')).length, 0, 'No detailed model is downloaded before enlargement.');
    const cardResolution = await host.locator('canvas').evaluate(canvas => ({pixels: canvas.width, css: canvas.clientWidth}));
    assert.ok(cardResolution.pixels > cardResolution.css * 1.4, 'A standard-DPI Chromebook receives a sharper-than-native canvas.');

    await expand(); await expandedReady(); await painted();
    assert.equal(await dialog().locator('[data-viewer-status=ready]').getAttribute('data-model-quality'), 'detail');
    assert.ok(requests.includes(artifacts[0].detailedSrc), 'Enlargement fetches the actual high-detail GLB.');
    assert.doesNotMatch(await dialog().innerText(), /일본|가마쿠라|모란|제작 연도/);
    assert.equal(await dialog().locator('.lesson-viewer__info').getAttribute('data-info-state'), 'observation');
    const canvas = dialog().locator('canvas');
    const resolution = await canvas.evaluate(canvas => ({width: canvas.width, height: canvas.height, css: canvas.clientWidth}));
    assert.ok(resolution.width > resolution.css * 1.4, 'Enlargement retains supersampled detail.');
    assert.ok(resolution.width * resolution.height <= 3_000_000, 'Large view stays within the Chromebook pixel budget.');
    const before = await canvas.screenshot();
    await dialog().getByRole('button', {name: '오른쪽으로 돌리기', exact: true}).click(); await painted();
    assert.notDeepEqual(await canvas.screenshot(), before, 'High-detail geometry is actually rendered and rotates.');
    await dialog().getByRole('button', {name: '확대하기', exact: true}).click(); await painted();
    if (screenshots) await page.screenshot({path: path.join(screenshots, 'comparison-detail.png')});
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('canvas').count(), 1, 'Closing releases the detail canvas.');

    // Missing high-resolution data must not strand a student in a failed viewer.
    const detailRoute = `**${artifacts[0].detailedSrc}`;
    await page.route(detailRoute, route => route.fulfill({status: 503, body: 'Temporary detail outage'}));
    await expand(); await expandedReady();
    assert.equal(await dialog().locator('[data-viewer-status=ready]').getAttribute('data-model-quality'), 'standard');
    assert.equal(await dialog().getByRole('button', {name: '오른쪽으로 돌리기', exact: true}).isEnabled(), true);
    await page.keyboard.press('Escape'); await page.unroute(detailRoute);

    // Closing during a slow download must leave no stale modal/canvas or error.
    let pendingRoute;
    await page.route(detailRoute, route => {pendingRoute = route;});
    const pendingRequest = page.waitForRequest(request => new URL(request.url()).pathname === artifacts[0].detailedSrc);
    await expand(); await pendingRequest;
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('dialog').count(), 0);
    assert.equal(await page.locator('canvas').count(), 1);
    if (pendingRoute) await pendingRoute.abort().catch(() => {});
    await page.unroute(detailRoute);

    // Exercise every new detailed source, including the pillow's multiple UV sets.
    for (let index = 1; index < artifacts.length; index++) {
      const previousDetailedLoads = requests.filter(url => url.includes('/detail/')).length;
      await page.evaluate(index => window.mountArtifact(index), index); await ready();
      assert.equal(requests.filter(url => url.includes('/detail/')).length, previousDetailedLoads, 'Switching cards does not preload detailed assets.');
      await expand(); await expandedReady(); await painted();
      assert.equal(await dialog().locator('[data-viewer-status=ready]').getAttribute('data-model-quality'), 'detail', `Detailed source ${index} loads.`);
      assert.ok(requests.includes(artifacts[index].detailedSrc));
      assert.ok((await dialog().locator('canvas').screenshot()).length > 10000, 'Detailed view contains rendered model pixels.');
      if (screenshots) await page.screenshot({path: path.join(screenshots, `artifact-${index}-detail.png`)});
      await page.keyboard.press('Escape');
    }

    // A portrait phone must keep the model and controls inside its dialog.
    await page.setViewportSize({width: 390, height: 844});
    await page.evaluate(() => window.mountArtifact(2)); await ready();
    await expand(); await expandedReady();
    const mobile = await dialog().evaluate(dialog => {
      const body = dialog.querySelector('.lesson-viewer__dialog-body'), canvas = dialog.querySelector('canvas');
      const view = dialog.querySelector('.lesson-viewer__viewport').getBoundingClientRect();
      return {overflow: body.scrollWidth > body.clientWidth + 1, width: view.width, pixels: canvas.width * canvas.height, screen: innerWidth};
    });
    assert.equal(mobile.overflow, false);
    assert.ok(mobile.width > 150 && mobile.width < mobile.screen);
    assert.ok(mobile.pixels <= 3_000_000);
    if (screenshots) await page.screenshot({path: path.join(screenshots, 'pillow-detail-mobile.png')});
    await page.evaluate(() => window.viewer.dispose());
    assert.equal(await page.locator('dialog,canvas').count(), 0, 'Teacher phase change disposes both views.');
    assert.deepEqual(errors, [], 'No browser runtime errors.');
    console.log('Model quality: five real detailed GLBs, lazy loading, supersampling, mobile layout, fallback, rotation and cancellation passed.');
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
