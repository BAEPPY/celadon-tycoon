/* Run after npm run build + npm start. Uses an isolated browser profile. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const KEY = 'celadon-tycoon-v2';
const TITLE = '좋은 청자 위대한 청자';
const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const sizes = [[1024, 600], [1280, 720], [1366, 768], [1536, 864]];
const draft = {
  id: 'entry-resume', customerId: 'king', orderId: 'royal-rest', accepted: true,
  clay: { body: true, slip: 'dark', kneads: 6, prepared: true },
  shape: 'stool', modelId: 'stool', step: 1, stationView: 'game',
  knead: 3, width: 1.05, viewFrame: 5, technique: 'inlay', pattern: 'cloud',
  placements: [{ x: 0.5, y: 0.5, pattern: 'cloud' }], strokes: [],
  decorPhase: 1, decorDone: false, firing: [],
  explanationUse: '정원을 보며 쉬는 의자입니다.', explanationBeauty: '구름 무늬를 담았습니다.',
  selfUse: true, selfBeauty: false,
};
const completed = {
  ...draft, id: 'entry-gallery', step: 4, stationView: 'counter-delivery',
  decorPhase: 2, decorDone: true, firing: ['dry', 'biscuit', 'glaze', 'fire'],
  preview: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#9db497"/></svg>'),
};
const fixture = { history: ['royal-rest'], gallery: [completed], draft };

async function seed(page, value) {
  await page.evaluate(({ key, value }) => {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  }, { key: KEY, value });
  await page.reload();
  await page.waitForSelector('.shop-cover');
  await page.evaluate(() => document.fonts.ready);
}
async function saved(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
}
async function noCharacterGallery(page) {
  assert.equal(await page.locator('[data-action=characters], [data-cast], .cast-popup, .sheet-download').count(), 0);
  assert.doesNotMatch(await page.locator('body').innerText(), /손님\s?도감|공방을 찾[는은] 다섯 사람/);
}
async function checkCover(page, resumable) {
  assert.equal(await page.locator('[data-action=start]').count(), resumable ? 1 : 0);
  assert.equal(await page.locator('[data-action=new-order]').count(), 1);
  assert.equal((await page.locator('h1').innerText()).replace(/\s+/g, ' ').trim(), TITLE);
  assert.equal((await page.locator('.mini-logo').innerText()).replace(/\s+/g, ' ').trim(), TITLE);
  assert.equal(await page.title(), TITLE);
  await noCharacterGallery(page);
  const layout = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.cover-actions button')];
    const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const panel = document.querySelector('.cover-content');
    return {
      width: innerWidth, height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      buttons: buttons.map(rect), panel: rect(panel),
      title: rect(document.querySelector('h1')),
      ribbonFont: parseFloat(getComputedStyle(document.querySelector('.ribbon')).fontSize),
      clippedLabels: buttons.filter(b => b.scrollWidth > b.clientWidth || b.scrollHeight > b.clientHeight).length,
    };
  });
  assert.ok(layout.scrollWidth <= layout.width && layout.scrollHeight <= layout.height, JSON.stringify(layout));
  assert.ok(layout.ribbonFont >= 18, 'Cover tagline should be larger than the previous 12px');
  assert.equal(layout.clippedLabels, 0);
  for (const box of [...layout.buttons, layout.panel, layout.title]) {
    assert.ok(box.x >= 0 && box.y >= 0 && box.right <= layout.width && box.bottom <= layout.height, JSON.stringify(layout));
  }
  if (resumable) {
    const [resume, fresh] = layout.buttons;
    assert.ok(Math.abs(resume.width - fresh.width) < 1 && Math.abs(resume.height - fresh.height) < 1, 'Buttons must have equal dimensions');
    assert.ok(Math.abs(resume.y - fresh.y) < 1 && resume.right < fresh.x, 'Buttons must sit side by side');
  }
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await seed(page, null);
    await checkCover(page, false);
    await page.click('[data-action=new-order]');
    await page.waitForSelector('.counter-scene');
    const first = await saved(page);
    assert.equal(first.history.length, 1);
    assert.equal(first.draft.step, 0);
    assert.equal(first.draft.shape, null);
    assert.equal(await page.locator('.counter-plaque').count(), 0);
    assert.equal(await page.locator('.reference-book').count(), 1);
    assert.ok(['king','queen','noble','noblewoman','artisan'].includes(first.draft.customerId));
    await noCharacterGallery(page);

    await seed(page, fixture);
    await checkCover(page, true);
    await page.click('[data-action=start]');
    await page.waitForSelector('.illustration-viewport[data-status=ready]');
    assert.equal(await page.locator('.game-window.is-game').count(), 1);
    assert.equal(await page.locator('.illustration-viewport').getAttribute('data-view-frame'), String(draft.viewFrame));
    assert.deepEqual(await saved(page), fixture, 'Resume must retain the complete saved work, history, and gallery');
    await noCharacterGallery(page);
    await page.click('[data-action=home]');
    await page.click('[data-action=new-order]');
    await page.waitForSelector('.counter-scene');
    const fresh = await saved(page);
    assert.notEqual(fresh.draft.id, draft.id);
    assert.notEqual(fresh.draft.orderId, draft.orderId);
    assert.equal(fresh.draft.shape, null);
    assert.equal(fresh.draft.step, 0);
    assert.deepEqual(fresh.draft.placements, []);
    assert.deepEqual(fresh.gallery, fixture.gallery);
    assert.deepEqual(fresh.history.slice(0, -1), fixture.history);
    assert.equal(fresh.history.at(-1), fresh.draft.orderId);

    await page.click('[data-action=gallery]');
    await page.evaluate(() => {
      window.exportText = [];
      const original = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
        window.exportText.push(text);
        return original.call(this, text, ...args);
      };
    });
    const download = page.waitForEvent('download');
    await page.click(`[data-download="${completed.id}"]`);
    assert.match((await download).suggestedFilename(), /\.png$/);
    assert.ok((await page.evaluate(() => window.exportText)).includes(TITLE), 'PNG export must use the renamed game title');
    await noCharacterGallery(page);
    await page.click('[data-action=close-popup]');

    for (const value of [
      { ...fixture, draft: completed },
      { ...fixture, draft: { ...draft, orderId: 'missing-order' } },
      { ...fixture, draft: null },
      '{bad json',
      null,
    ]) {
      await seed(page, value);
      await checkCover(page, false);
    }

    for (const resumable of [false, true]) {
      await seed(page, resumable ? fixture : null);
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        await checkCover(page, resumable);
        if (resumable && width === 1366) await page.screenshot({ path: '/tmp/cover-updated.png' });
        if (resumable && width === 1024) await page.screenshot({ path: '/tmp/cover-updated-1024.png' });
      }
    }
    const bundle = await (await page.request.get(new URL('app.js', base).href)).text();
    assert.doesNotMatch(bundle, /손님 도감|공방을 찾[는은] 다섯 사람|sheet-download/);
    assert.deepEqual(errors, []);
    console.log('Entry checks passed: first visit, resume integrity, fresh order, saved gallery/export, invalid/completed drafts, and 8 Chromebook cover layouts.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
