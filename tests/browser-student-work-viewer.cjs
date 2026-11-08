/* Read-only teacher artwork viewer: use the real renderer without changing the shared build. */
const assert = require('node:assert/strict');
const path = require('node:path');
const {build} = require('esbuild');
const {chromium} = require('playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const root = path.resolve(__dirname, '..');

const design = technique => ({
  shape: 'stool', modelId: 'stool', width: 1.08, viewFrame: 0, technique,
  pattern: 'cloud', decorPhase: 2, clay: {slip: 'white'},
  inlay: {slip: 'white', fillDone: true, wipeDone: true, fill: [], wipe: []},
  placements: [
    {uv: [.5, .42], surfaceAngle: 0, surfaceV: .36, surfaceRadius: .25, pattern: 'cloud', stampSize: .5},
    {uv: [.6, .67], surfaceAngle: .35, surfaceV: .61, surfaceRadius: .25, pattern: 'lotus', stampSize: 1.75},
    {uv: [.5, .5], surfaceAngle: Math.PI, surfaceV: .44, surfaceRadius: .25, pattern: 'grape', stampSize: 1.2},
  ],
  strokes: [{points: [
    {uv: [.4, .53], surfaceAngle: -.35, surfaceV: .49, surfaceRadius: .25},
    {uv: [.45, .55], surfaceAngle: -.17, surfaceV: .51, surfaceRadius: .25},
    {uv: [.5, .52], surfaceAngle: 0, surfaceV: .48, surfaceRadius: .25},
  ]}, {points: [
    {uv: [.4, .68], surfaceAngle: Math.PI - .35, surfaceV: .62, surfaceRadius: .25},
    {uv: [.5, .7], surfaceAngle: Math.PI, surfaceV: .65, surfaceRadius: .25},
    {uv: [.6, .68], surfaceAngle: Math.PI + .35, surfaceV: .62, surfaceRadius: .25},
  ]}],
});

(async () => {
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Use a local test server.');
  const bundle = await build({stdin: {contents: `
    import {Craft2D} from './craft-2d.js';
    import {mountStudentWorkViewer} from './student-work-viewer.js';
    const mount = Craft2D.prototype.mount;
    Craft2D.prototype.mount = function(...args) {
      const result = mount.apply(this, args);
      if (this.el.closest('.student-work-viewer')) window.viewerCraft = this;
      return result;
    };
    window.viewerFixture = {Craft2D, mountStudentWorkViewer};
  `, resolveDir: root, sourcefile: 'student-work-test-entry.js'}, bundle: true, format: 'iife', write: false, target: 'es2022'});
  const browser = await chromium.launch({headless: true, ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}), args: ['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport: {width: 1024, height: 600}, reducedMotion: 'reduce'});
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__student-work-test', route => route.fulfill({contentType: 'text/html', body: `<!doctype html><html lang="ko"><head><base href="${base}/"><style>body{margin:0;padding:20px;background:#e9edf1;font:16px sans-serif}#host{width:620px;height:530px;margin:auto}#reference{position:absolute;left:-2000px;width:620px;height:500px}.craft-viewport{position:relative;width:100%;height:100%}.craft-viewport>canvas{display:block;width:100%;height:100%}</style></head><body><div id="host"></div><div id="reference"></div></body></html>`}));
    await page.goto(`${base}/__student-work-test`);
    await page.evaluate(() => {
      const NativeResizeObserver = window.ResizeObserver, observers = new Set();
      window.ResizeObserver = class {
        constructor(callback) {this.targets = new Set(); this.observer = new NativeResizeObserver(callback);}
        observe(target, options) {this.targets.add(target); observers.add(this); this.observer.observe(target, options);}
        unobserve(target) {this.targets.delete(target); if (!this.targets.size) observers.delete(this); this.observer.unobserve(target);}
        disconnect() {this.targets.clear(); observers.delete(this); this.observer.disconnect();}
      };
      const request = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window), frames = new Set();
      window.requestAnimationFrame = callback => {let id; id = request(time => {frames.delete(id); callback(time);}); frames.add(id); return id;};
      window.cancelAnimationFrame = id => {frames.delete(id); cancel(id);};
      window.viewerResources = () => ({observers: observers.size, frames: frames.size});
      window.renderErrors = [];
    });
    await page.addScriptTag({content: bundle.outputFiles[0].text});

    const viewer = page.locator('.student-work-viewer');
    const canvas = viewer.locator('.illustration-viewport>canvas');
    const control = name => viewer.locator(`[data-work-view="${name}"]`);
    async function ready() {await viewer.locator('.illustration-viewport[data-status="ready"]').waitFor(); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));}
    async function parity(label) {
      const result = await page.evaluate(async () => {
        await window.referenceCraft.setRotation(window.studentViewer.viewFrame);
        window.viewerCraft.paint(); window.referenceCraft.paint();
        return {same: window.viewerCraft.surface.toDataURL() === window.referenceCraft.surface.toDataURL(), originalUnchanged: JSON.stringify(window.originalDesign) === window.originalJSON};
      });
      assert.equal(result.same, true, label);
      assert.equal(result.originalUnchanged, true, 'viewing never mutates the submitted design');
    }

    for (const technique of ['inlay', 'openwork']) {
      await page.evaluate(async design => {
        window.originalDesign = design; window.originalJSON = JSON.stringify(design);
        window.studentViewer = window.viewerFixture.mountStudentWorkViewer(document.querySelector('#host'), design, {onError: error => window.renderErrors.push(String(error))});
        window.referenceCraft = new window.viewerFixture.Craft2D(() => {}, () => {}, error => window.renderErrors.push(String(error)));
        window.referenceCraft.mount(document.querySelector('#reference'), {...structuredClone(design), step: 4, tool: 'rotate'}, 'finished');
        await window.studentViewer.ready;
      }, design(technique));
      await ready(); await page.waitForFunction(() => window.referenceCraft.el.dataset.status === 'ready');
      assert.equal(await viewer.getAttribute('data-readonly'), 'true');
      await parity(`${technique}: initial artwork matches the student's finished renderer`);
      const front = await page.evaluate(() => window.viewerCraft.surface.toDataURL());

      await control('right').click(); await ready();
      assert.equal(await page.evaluate(() => window.studentViewer.viewFrame), 1);
      assert.equal((await viewer.locator('[data-work-view-angle]').innerText()).trim(), '15°');
      await canvas.focus(); await page.keyboard.press('ArrowLeft'); await ready();
      assert.equal(await page.evaluate(() => window.studentViewer.viewFrame), 0, 'keyboard rotates back one frame');
      for (let i = 0; i < 12; i++) {await control('right').click(); await ready();}
      assert.equal(await page.evaluate(() => window.studentViewer.viewFrame), 12);
      assert.notEqual(await page.evaluate(() => window.viewerCraft.surface.toDataURL()), front, 'backside is distinct from the front');
      await parity(`${technique}: backside stamps, sizes and strokes match the student's work`);
      for (let i = 0; i < 12; i++) {await control('right').click(); await ready();}
      assert.equal(await page.evaluate(() => window.studentViewer.viewFrame), 0);
      assert.equal(await page.evaluate(() => window.viewerCraft.surface.toDataURL()), front, '360° returns to the exact saved front');

      const center = await canvas.evaluate(element => {const r = element.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2};});
      await page.mouse.move(center.x, center.y); await page.mouse.down(); await page.mouse.move(center.x + 100, center.y, {steps: 5}); await page.mouse.up(); await ready();
      assert.notEqual(await page.evaluate(() => window.studentViewer.viewFrame), 0, 'drag rotates the artwork');
      await control('reset').click(); await ready();
      assert.equal(await page.evaluate(() => window.studentViewer.viewFrame), 0);
      const originalBox = await canvas.evaluate(element => JSON.parse(element.parentElement.dataset.objectBox));
      await control('zoom-in').click(); await ready();
      const largerBox = await canvas.evaluate(element => JSON.parse(element.parentElement.dataset.objectBox));
      assert.ok(largerBox[2] > originalBox[2] && largerBox[3] > originalBox[3], 'zoom enlarges the actual vessel');
      await parity(`${technique}: zoom preserves the exact painted surface`);
      assert.equal(await page.evaluate(() => {const canvas = document.querySelector('.student-work-viewer canvas'); const event = new WheelEvent('wheel', {deltaY: -60, bubbles: true, cancelable: true}); canvas.dispatchEvent(event); return event.defaultPrevented;}), true, 'wheel zoom keeps the modal from scrolling');
      await page.evaluate(() => window.studentViewer.setZoom(100)); await ready();
      assert.equal(await control('zoom-in').isDisabled(), true, 'zoom has an upper bound');
      await page.evaluate(() => window.studentViewer.setZoom(-100)); await ready();
      assert.equal(await control('zoom-out').isDisabled(), true, 'zoom has a lower bound');
      await control('reset').click(); await ready();
      assert.equal(await page.evaluate(() => window.studentViewer.zoom), 1, 'reset restores default framing');
      assert.deepEqual(await canvas.evaluate(element => JSON.parse(element.parentElement.dataset.objectBox)), originalBox);
      await canvas.click(); await page.keyboard.press('Space'); await ready();
      await parity(`${technique}: clicks and Space do not stamp or alter the finished artwork`);

      if (technique === 'inlay') {
        for (const size of [{width: 500, height: 384}, {width: 340, height: 340}]) {
          await page.evaluate(size => Object.assign(document.querySelector('#host').style, {width: `${size.width}px`, height: `${size.height}px`}), size); await ready();
          assert.equal(await viewer.evaluate(element => {const r = element.getBoundingClientRect(); return [...element.querySelectorAll('.student-work-viewer__controls button')].every(button => {const b = button.getBoundingClientRect(); return b.width >= 30 && b.height >= 30 && b.left >= r.left - 1 && b.right <= r.right + 1 && b.top >= r.top - 1 && b.bottom <= r.bottom + 1;});}), true, `controls fit ${size.width}×${size.height}`);
          assert.equal(await viewer.evaluate(element => {const r = element.getBoundingClientRect(), help = element.querySelector('.student-work-viewer__help').getBoundingClientRect(); return help.bottom <= r.bottom + 1;}), true, `full interaction hint fits ${size.width}×${size.height}`);
        }
        await page.screenshot({path: '/tmp/student-work-viewer-340.png'});
        await page.evaluate(() => Object.assign(document.querySelector('#host').style, {width: '620px', height: '530px'})); await ready();
      }

      const cleanup = await page.evaluate(() => {
        const oldCanvas = window.viewerCraft.canvas, before = JSON.stringify(window.originalDesign);
        window.studentViewer.dispose(); window.studentViewer.dispose(); window.referenceCraft.dispose();
        oldCanvas.dispatchEvent(new KeyboardEvent('keydown', {code: 'ArrowRight', key: 'ArrowRight', bubbles: true}));
        oldCanvas.dispatchEvent(new WheelEvent('wheel', {deltaY: -60, bubbles: true, cancelable: true}));
        return {...window.viewerResources(), remaining: document.querySelectorAll('.student-work-viewer').length, unchanged: before === JSON.stringify(window.originalDesign)};
      });
      assert.deepEqual(cleanup, {observers: 0, frames: 0, remaining: 0, unchanged: true}, 'dispose removes the viewer and releases observers, animation frames and interaction');
      console.log(`${technique}: faithful front/back and sizes, 360°/keyboard/drag, bounded zoom, read-only interactions, mobile controls and disposal passed.`);
    }
    assert.deepEqual(await page.evaluate(() => window.renderErrors), []);
    assert.deepEqual(errors, []);
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
