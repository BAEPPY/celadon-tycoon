const {enterGame}=require('./game-entry.cjs');
/* Run after npm run build + npm start. Uses an isolated browser profile. */
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const KEY = "celadon-tycoon-v2";
const base = process.env.BASE_URL || "http://127.0.0.1:4173";
const draft = (extra = {}) => ({
  id: "browser-check",
  orderId: "royal-rest",
  shape: "stool",
  modelId: "stool",
  step: 1,
  knead: 3,
  width: 1,
  technique: "openwork",
  pattern: "cloud",
  placements: [],
  strokes: [],
  decorPhase: 0,
  decorDone: false,
  firing: [],
  ...extra,
});
async function seed(page, work) {
  await page.evaluate(
    ({ key, work }) =>
      localStorage.setItem(
        key,
        JSON.stringify({ history: [], gallery: [], draft: work }),
      ),
    { key: KEY, work },
  );
  await page.reload();
  await enterGame(page,'start');
  await page.waitForSelector(".illustration-viewport[data-status=ready]");
}
async function saved(page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)).draft,
    KEY,
  );
}
async function surfacePoint(page, u, v) {
  return page.locator(".illustration-viewport>canvas").first().evaluate(
    (canvas, { u, v }) => {
      const r = canvas.getBoundingClientRect(),
        box = JSON.parse(canvas.parentElement.dataset.objectBox);
      return {
        x: r.x + (box[0] + u * box[2]) * r.width,
        y: r.y + (box[1] + v * box[3]) * r.height,
      };
    },
    { u, v },
  );
}
async function surfacePixels(page) {
  return page.locator('.illustration-viewport>canvas').first().evaluate(canvas => {
    const b=JSON.parse(canvas.parentElement.dataset.objectBox),x=Math.floor((b[0]+b[2]*.28)*canvas.width),y=Math.floor((b[1]+b[3]*.32)*canvas.height),w=Math.floor(b[2]*.44*canvas.width),h=Math.floor(b[3]*.46*canvas.height);
    return [...canvas.getContext('2d').getImageData(x,y,w,h).data];
  });
}
async function sweepInlay(page,mode) {
  const from=await surfacePoint(page,.13,.18),to=await surfacePoint(page,.87,.9);
  for(let row=0;row<15;row++) {
    if((await saved(page)).inlay?.[mode+'Done'])break;
    const y=from.y+(to.y-from.y)*row/14,x0=row%2?to.x:from.x,x1=row%2?from.x:to.x;
    await page.mouse.move(x0,y);await page.mouse.down();await page.mouse.move(x1,y,{steps:12});await page.mouse.up();
  }
  await page.waitForFunction(({key,mode})=>JSON.parse(localStorage.getItem(key)).draft.inlay?.[mode+'Done'],{key:KEY,mode});
}
async function turn(page, n) {
  for (let i = 0; i < n; i++) {
    await page.click('[data-turn="1"]');
    await page.waitForSelector(".illustration-viewport[data-status=ready]");
  }
  await page.waitForTimeout(250);
}
async function fire(page, kind, length) {
  await page.click(`[data-fire=${kind}]`);
  await page.waitForFunction(
    () =>
      document.querySelector(".minigame-overlay")?.dataset.value !== undefined,
  );
  if (kind === "dry") {
    const canvas = page.locator(".kiln-gesture-canvas"), box = await canvas.boundingBox();
    for (const y of [.27, .52, .77]) {
      await page.mouse.move(box.x + box.width * .12, box.y + box.height * y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * .88, box.y + box.height * y, {steps: 12});
      await page.mouse.up();
    }
  } else if (kind === "glaze") {
    const canvas = page.locator(".kiln-gesture-canvas"), box = await canvas.boundingBox();
    for (const y of [.12, .25, .38, .51, .64, .77, .9]) {
      if (await page.locator(".mini-won").count()) break;
      await page.mouse.move(box.x + box.width * .24, box.y + box.height * y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * .76, box.y + box.height * y, {steps: 12});
      await page.mouse.up();
    }
  } else {
    let held = false;
    for (let i = 0; i < 400; i++) {
      const info = await page
        .locator(".minigame-overlay")
        .evaluate((el) => ({
          value: Number(el.dataset.value),
          won: el.classList.contains("mini-won"),
          status: el.querySelector(".mini-status").textContent,
        }));
      if (info.won) break;
      assert.ok(!info.status.includes("다시 도전"), info.status);
      const next = info.value < 0.51;
      if (next !== held) {
        held = next;
        await page.keyboard[held ? "down" : "up"]("Space");
      }
      await page.waitForTimeout(60);
    }
    await page.keyboard.up("Space");
  }
  await page.waitForFunction(
    ({ key, length }) =>
      JSON.parse(localStorage.getItem(key)).draft.firing.length === length,
    { key: KEY, length },
  );
}
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1366, height: 768 },
      reducedMotion: "reduce",
    });
    page.setDefaultTimeout(60000);
    const errors = [],
      badAssets = [],
      glb = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (r.status() >= 400 && r.url().includes("/assets/"))
        badAssets.push(r.url());
    });
    page.on("request", (r) => {
      if (r.url().includes(".glb")) glb.push(r.url());
    });
    await page.goto(new URL('/game', base).href);
    await enterGame(page,'new-order');
    await page.waitForSelector(".counter-scene");
    await page.click("[data-action=accept]");
    assert.equal((await saved(page)).clay.body, true, "body clay is prepared automatically");
    await page.locator(".knead-pad").focus();
    for (let i = 0; i < 6; i++) { await page.keyboard.press("Space"); await page.waitForTimeout(160); }
    await page.click("[data-action=clay-ready]");
    await page.click("[data-shape=stool]");
    await page.waitForFunction(
      () =>
        JSON.parse(
          document.querySelector(".sculpt-canvas")?.dataset.guide || "[]",
        ).length > 5,
    );
    const sculptCanvas = page.locator(".sculpt-canvas");
    const box = await sculptCanvas.boundingBox();
    // Pull actual clay points towards their outline; visiting the outline alone is insufficient.
    for (let pass = 0; pass < 4; pass++) {
      if (!(await page.locator("[data-action=next-shape]").isDisabled())) break;
      const guide = JSON.parse(await sculptCanvas.getAttribute("data-guide"));
      for (let i = 0; i < guide.length; i += 3) {
        if (!(await page.locator("[data-action=next-shape]").isDisabled())) break;
        const current = JSON.parse(await sculptCanvas.getAttribute("data-current"));
        await page.mouse.move(box.x + current[i][0] * box.width, box.y + current[i][1] * box.height);
        await page.mouse.down();
        await page.mouse.move(box.x + guide[i][0] * box.width, box.y + guide[i][1] * box.height, { steps: 5 });
        await page.mouse.up();
      }
    }
    await page.waitForSelector(".sculpt-success");
    assert.ok((await saved(page)).sculpt.fraction >= .9);
    await page.click("[data-action=next-shape]");
    await page.click("[data-technique=openwork]");
    await page.click("[data-pattern=cloud]");
    await page.waitForTimeout(350);
    const before=await surfacePixels(page),frontPoint=await surfacePoint(page,.5,.55);
    await page.mouse.click(frontPoint.x,frontPoint.y);
    await page.waitForTimeout(350);
    const inside=await surfacePixels(page),cutPixels=[];
    for(let i=0;i<before.length;i+=4)if(before[i+3]>240&&inside[i+3]>240&&before[i]-inside[i]>15)cutPixels.push(i);
    assert.ok(cutPixels.length>30, 'front cuts reveal a darker opaque inner wall');
    await turn(page,12);
    assert.equal(await page.locator('.illustration-viewport').getAttribute('data-view-frame'),'12');
    const farWall=await surfacePixels(page);
    assert.ok(cutPixels.filter(i=>farWall[i+3]>240).length>cutPixels.length*.9,'the uncut opposite wall remains opaque');
    const q=await surfacePoint(page,.5,.55);
    await page.mouse.click(q.x,q.y);await page.waitForTimeout(350);
    const both=await surfacePixels(page);
    assert.ok(cutPixels.filter(i=>both[i+3]<20).length>20,'only matching cuts on both walls reveal the background');
    await page.click("[data-action=undo]");
    await turn(page, 12);
    await page.click("[data-technique=inlay]");
    await page.click("[data-tool=draw]");
    const cloud = [
      [-80, 22],
      [-95, 0],
      [-85, -30],
      [-60, -45],
      [-40, -35],
      [-25, -70],
      [15, -75],
      [50, -60],
      [60, -35],
      [85, -40],
      [105, -15],
      [95, 20],
      [70, 35],
      [-75, 35],
      [-80, 22],
    ];
    for (let i = 0; i < cloud.length; i++) {
      const q = await surfacePoint(
        page,
        0.5 + cloud[i][0] * 0.001,
        0.55 + cloud[i][1] * 0.001,
      );
      await page.mouse.move(q.x, q.y);
      if (!i) await page.mouse.down();
    }
    await page.mouse.up();
    assert.equal((await saved(page)).recognition.id, "cloud");
    await page.selectOption("#drawing-label", "cloud");
    await page.click('[data-action=inlay-fill]');
    await page.waitForSelector('.inlay-canvas[data-mode=fill]');
    await page.click('[data-slip=dark]');
    assert.equal(await page.locator('[data-action=inlay-wipe]').isDisabled(),true);
    await sweepInlay(page,'fill');
    await page.click('[data-action=inlay-wipe]');
    await page.waitForSelector('.inlay-canvas[data-mode=wipe]');
    assert.equal(await page.locator('[data-action=next-decor]').isDisabled(),true);
    await sweepInlay(page,'wipe');
    assert.equal((await saved(page)).clay.slip,'dark');
    assert.equal((await saved(page)).decorDone,true);
    await page.click('[data-action=next-decor]');
    for (const [i, kind] of ["dry", "biscuit", "glaze", "fire"].entries())
      await fire(page, kind, i + 1);
    await page.click("[data-action=next-fire]");
    await page.waitForSelector('[data-inspection-ready=true]');
    assert.equal(await page.locator('.inspection-pot').count(),4);
    for(const kind of ['crack','warped','glaze']){
      await page.click(`[data-sample-kind=${kind}]`);
      await page.waitForSelector(`[data-sample-kind=${kind}].is-broken`);
      await page.waitForSelector('[data-inspection-ready=true]');
    }
    assert.equal((await saved(page)).inspection.correct,3);
    assert.equal(await page.locator('.inspection-pot.is-kept').getAttribute('data-sample-kind'),'sound');
    await page.click("[data-action=inspection-finish]");
    await page.click("[data-action=explain]");
    assert.equal(await page.inputValue('#work-title'),'');
    await page.fill('#work-title','구름을 쉬게 하는 의자');
    await page.fill("#explain-use", "윗면이 평평하고 몸통이 튼튼해서 사람이 편하게 앉을 수 있기 때문이다.");
    await page.fill(
      "#explain-beauty",
      "파인 구름 무늬에 검은 색흙을 채우고 겉을 닦아 푸른 바탕에서 무늬가 또렷하게 보이기 때문이다.",
    );
    await page.click("[data-action=submit]");
    await page.waitForSelector(".customer-review-scene");
    assert.equal((await saved(page)).assessment.accepted,true);
    assert.equal((await saved(page)).title,'구름을 쉬게 하는 의자');
    const download = page.waitForEvent("download");
    await page.locator(".customer-review-scene [data-action=download]").click();
    assert.match((await download).suggestedFilename(), /\.png$/);
    await page.reload();
    await page.click("[data-action=gallery]");
    assert.equal(await page.locator(".gallery-grid article").count(), 1);
    await page.click("[data-gallery-view]");
    await page.waitForSelector(
      ".finished-preview .illustration-viewport[data-status=ready]",
    );
    await page.click('.finished-preview [data-turn="1"]');
    await page.waitForSelector(
      '.finished-preview .illustration-viewport[data-view-frame="1"][data-status=ready]',
    );
    await page.keyboard.press("Escape");
    console.log(
      "Counter → auto clay → free sculpt → independent curved wall cuts → drawing → dark slip filling/wiping → varied kiln games → four-pot inspection → explanation assessment → customer reaction → gallery passed.",
    );
    const root = pathToFileURL(path.resolve(__dirname, "..") + path.sep),
      { ROTATION_IDS } = await import(new URL("rotation-rules.js", root)),
      { EXAMPLE_DESIGNS } = await import(new URL("example-orders.js", root));
    for (const id of ROTATION_IDS) {
      await seed(
        page,
        draft({
          modelId: id,
          shape: EXAMPLE_DESIGNS.find((d) => d.modelId === id).shape,
          technique: "plain",
        }),
      );
      for (let i = 0; i < 24; i++) {
        assert.equal(
          await page
            .locator(".illustration-viewport")
            .getAttribute("data-view-frame"),
          String(i),
        );
        await page.click('[data-turn="1"]');
        await page.waitForSelector(".illustration-viewport[data-status=ready]");
      }
      assert.equal(
        await page
          .locator(".illustration-viewport")
          .getAttribute("data-view-frame"),
        "0",
      );
    }
    console.log(
      "All 15 × 24 = 360 illustration frames loaded and wrapped correctly.",
    );
    for (const [width, height] of [
      [1024, 600],
      [1280, 720],
      [1366, 768],
      [1536, 864],
    ]) {
      await page.setViewportSize({ width, height });
      for (let step = 0; step < 3; step++) {
        await seed(
          page,
          draft({ step, technique: "plain", decorDone: true, decorPhase: 2 }),
        );
        const layout = await page.evaluate(() => ({
          w: document.documentElement.scrollWidth,
          h: document.documentElement.scrollHeight,
          off: [
            ...document.querySelectorAll(
              ".station-scene button,.station-scene select,.hud button",
            ),
          ]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return (
                r.width &&
                !el.disabled &&
                (r.left < 0 ||
                  r.top < 0 ||
                  r.right > innerWidth ||
                  r.bottom > innerHeight)
              );
            })
            .map((el) => el.textContent),
        }));
        assert.equal(layout.w, width);
        assert.equal(layout.h, height);
        assert.deepEqual(layout.off, []);
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(badAssets, []);
    assert.deepEqual(glb, []);
    console.log(
      "Four Chromebook layouts fit; no runtime/asset failures; no 3D model requested by the workbench.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
