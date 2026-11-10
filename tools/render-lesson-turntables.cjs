/* Renders each lesson 3D model turning once (24 views, 15 degrees apart) with the site's own viewer and saves one
   picture sheet per model to assets/lesson/turntable/<id>.jpg (6 columns x 4 rows). PowerPoint 2016/2019 shows add-ins
   with Internet Explorer, which cannot draw the 3D models, so the add-in's old-engine board turns these pictures instead.
   The sheets use the same blind file names as the models and carry no names.

   Run after `npm run build` with a local server:  BASE_URL=http://127.0.0.1:4173 node tools/render-lesson-turntables.cjs */
const fs = require('node:fs');
const path = require('node:path');
const {build} = require('esbuild');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..'), out = path.join(root, 'assets/lesson/turntable');
const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const FRAME = 480, COLUMNS = 6, ROWS = 4, STEPS = COLUMNS * ROWS, QUALITY = 0.82;
const entry = `
import {mountLessonViewer} from './lesson-viewer.js';
import {COMPARISON_ARTIFACTS, OBSERVATION_ARTIFACTS, BEAUTY_ARTIFACT} from './lesson-artifacts.js';
const models = {beauty: BEAUTY_ARTIFACT};
COMPARISON_ARTIFACTS.forEach(a => { models['comparison-' + a.id] = a; });
OBSERVATION_ARTIFACTS.forEach(a => { models['observation-' + a.id] = a; });
let current = null;
window.__models = Object.keys(models);
window.__mountModel = async id => {
  if (current) current.dispose();
  const host = document.getElementById('stage');
  current = mountLessonViewer(host, models[id], {expand: false, detail: true});
  await current.ready;
  window.__controller = current;
  return host.dataset.viewerStatus;
};
window.__nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
window.__sheet = async (frames, size, columns, rows, quality) => {
  const sheet = document.createElement('canvas'); sheet.width = size * columns; sheet.height = size * rows;
  const context = sheet.getContext('2d'); context.fillStyle = '#ffffff'; context.fillRect(0, 0, sheet.width, sheet.height);
  for (let index = 0; index < frames.length; index++) {
    const image = new Image(); image.src = 'data:image/png;base64,' + frames[index]; await image.decode();
    context.drawImage(image, (index % columns) * size, Math.floor(index / columns) * size, size, size);
  }
  return sheet.toDataURL('image/jpeg', quality).split(',')[1];
};`;
const page = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#fff}#stage{width:${FRAME}px;--lesson-viewer-height:${FRAME}px}
#stage .lesson-viewer__controls,#stage .lesson-viewer__hint,#stage p{display:none!important}</style></head>
<body><div id="stage"></div><script type="module" src="/__turntable/entry.js"></script></body></html>`;

(async () => {
  if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Use a local server.');
  const bundle = (await build({stdin: {contents: entry, resolveDir: root, loader: 'js'}, bundle: true, format: 'esm', write: false, logLevel: 'error'})).outputFiles[0].text;
  fs.mkdirSync(out, {recursive: true});
  const browser = await chromium.launch({...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}), args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']});
  try {
    const context = await browser.newContext({viewport: {width: FRAME + 40, height: FRAME + 120}, deviceScaleFactor: 1});
    await context.route(`${base}/__turntable/page.html`, route => route.fulfill({contentType: 'text/html', body: page}));
    await context.route(`${base}/__turntable/entry.js`, route => route.fulfill({contentType: 'text/javascript', body: bundle}));
    const tab = await context.newPage();
    tab.on('pageerror', error => console.error('page error:', error.message));
    await tab.goto(`${base}/__turntable/page.html`);
    await tab.waitForFunction(() => typeof window.__mountModel === 'function');
    for (const id of await tab.evaluate(() => window.__models)) {
      const status = await tab.evaluate(model => window.__mountModel(model), id);
      const canvas = tab.locator('#stage canvas').first(), frames = [];
      await tab.evaluate(() => window.__nextFrame()); await tab.waitForTimeout(500);
      for (let step = 0; step < STEPS; step++) {
        if (step) await tab.evaluate(delta => { window.__controller.rotate(delta); return window.__nextFrame(); }, Math.PI * 2 / STEPS);
        frames.push((await canvas.screenshot({type: 'png'})).toString('base64'));
      }
      const jpeg = Buffer.from(await tab.evaluate(([list, size, columns, rows, quality]) => window.__sheet(list, size, columns, rows, quality), [frames, FRAME, COLUMNS, ROWS, QUALITY]), 'base64');
      fs.writeFileSync(path.join(out, `${id}.jpg`), jpeg);
      console.log(`${id}: ${status}, ${STEPS} views, ${(jpeg.length / 1024).toFixed(0)} KB`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
