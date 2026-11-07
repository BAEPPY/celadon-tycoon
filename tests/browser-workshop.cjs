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
  await page.click("[data-action=start]");
  await page.waitForSelector(".illustration-viewport[data-status=ready]");
}
async function saved(page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)).draft,
    KEY,
  );
}
async function surfacePoint(page, u, v) {
  return page.locator(".illustration-viewport>canvas").evaluate(
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
async function sample(page, u = 0.5, v = 0.55) {
  return page.locator(".illustration-viewport>canvas").evaluate(
    (canvas, { u, v }) => {
      const box = JSON.parse(canvas.parentElement.dataset.objectBox),
        x = Math.round((box[0] + u * box[2]) * canvas.width),
        y = Math.round((box[1] + v * box[3]) * canvas.height);
      return [...canvas.getContext("2d").getImageData(x, y, 1, 1).data];
    },
    { u, v },
  );
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
    await page.waitForFunction(() => {
      const v = Number(
        document.querySelector(".minigame-overlay")?.dataset.value,
      );
      return v > 0.61 && v < 0.72;
    });
    await page.keyboard.press("Space");
  } else if (kind === "glaze") {
    await page.keyboard.down("Space");
    await page.waitForSelector(".mini-won");
    await page.keyboard.up("Space");
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
    await page.goto(base);
    await page.click("[data-action=start]");
    await page.waitForSelector(".counter-scene");
    await page.click("[data-action=accept]");
    await page.click("[data-clay=celadon]");
    await page.click("[data-clay=dark]");
    await page.locator(".knead-pad").focus();
    for (let i = 0; i < 6; i++) await page.keyboard.press("Space");
    await page.click("[data-action=clay-ready]");
    await page.click("[data-shape=stool]");
    await page.waitForFunction(
      () =>
        JSON.parse(
          document.querySelector(".sculpt-canvas")?.dataset.guide || "[]",
        ).length > 5,
    );
    const guide = JSON.parse(
        await page.locator(".sculpt-canvas").getAttribute("data-guide"),
      ),
      box = await page.locator(".sculpt-canvas").boundingBox();
    await page.mouse.move(
      box.x + guide[0][0] * box.width,
      box.y + guide[0][1] * box.height,
    );
    await page.mouse.down();
    for (const point of [...guide, guide[0]])
      await page.mouse.move(
        box.x + point[0] * box.width,
        box.y + point[1] * box.height,
      );
    await page.mouse.up();
    await page.waitForFunction(
      () => !document.querySelector("[data-action=next-shape]").disabled,
    );
    await page.click("[data-action=next-shape]");
    await page.click("[data-technique=openwork]");
    await page.click("[data-pattern=cloud]");
    const before = await sample(page);
    await page.click("[data-action=stamp]");
    await page.waitForTimeout(300);
    const inside = await sample(page);
    assert.ok(inside[3] > 240);
    assert.ok(inside[0] < before[0] - 10);
    await turn(page, 12);
    assert.equal(
      await page
        .locator(".illustration-viewport")
        .getAttribute("data-view-frame"),
      "12",
    );
    assert.ok(
      (await sample(page))[0] > inside[0] + 10,
      "opposite wall remains intact",
    );
    const q = await surfacePoint(page, 0.5, 0.55);
    await page.mouse.click(q.x, q.y);
    await page.waitForTimeout(400);
    assert.ok(
      (await sample(page))[3] < 20,
      "background only appears after both walls are cut",
    );
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
    await page.click("[data-action=decorate]");
    await page.click("[data-action=decorate]");
    await page.click("[data-action=next-decor]");
    for (const [i, kind] of ["dry", "biscuit", "glaze", "fire"].entries())
      await fire(page, kind, i + 1);
    await page.click("[data-action=next-fire]");
    for (let i = 0; i < 4; i++) {
      const kind = await page
        .locator("[data-sample-kind]")
        .getAttribute("data-sample-kind");
      await page.click(
        `[data-action=inspection-${kind === "sound" ? "deliver" : "hold"}]`,
      );
      await page.click("[data-action=inspection-next]");
    }
    assert.equal((await saved(page)).inspection.correct, 4);
    await page.click("[data-action=inspection-finish]");
    await page.click("[data-action=explain]");
    await page.fill("#explain-use", "앉아서 쉴 때 사용하는 청자 의자예요.");
    await page.fill(
      "#explain-beauty",
      "자토로 구름을 그려 상감의 솜씨를 담았어요.",
    );
    await page.click("[data-action=submit]");
    await page.waitForSelector(".score-big");
    const download = page.waitForEvent("download");
    await page.locator("#popup [data-action=download]").click();
    assert.match((await download).suggestedFilename(), /\.png$/);
    await page.click("[data-action=close-popup]");
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
      "Counter → clay → sculpt → independent wall cuts → drawing → kiln → inspection → delivery → gallery passed.",
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
