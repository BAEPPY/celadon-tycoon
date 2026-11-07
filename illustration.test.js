import test from "node:test";
import assert from "node:assert/strict";
import {
  alphaBounds,
  silhouetteRows,
  illustrationUV,
} from "./illustration-rules.js";
import { motifPath, cutoutPath } from "./motif-paths.js";
import { MODEL_CATALOG } from "./models-manifest.js";
import { PATTERNS } from "./domain.js";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

test("투명 여백은 제외하고 그림의 실제 경계를 찾는다", () => {
  const rgba = new Uint8Array(8 * 6 * 4);
  for (let y = 1; y <= 4; y++)
    for (let x = 2; x <= 6; x++) rgba[(y * 8 + x) * 4 + 3] = 255;
  assert.deepEqual(alphaBounds(rgba, 8, 6), {
    x: 2,
    y: 1,
    width: 5,
    height: 4,
  });
  assert.equal(alphaBounds(new Uint8Array(16), 2, 2), null);
});
test("성형 윤곽은 그림의 알파 실루엣을 사용하며 내부 구멍을 외곽으로 취급하지 않는다", () => {
  const data = new Uint8Array(10 * 10 * 4);
  for (let y = 0; y < 10; y++)
    for (let x = 2; x < 8; x++) if (x !== 5) data[(y * 10 + x) * 4 + 3] = 255;
  assert.deepEqual(silhouetteRows(data, 10, 10, 3), [
    [0.2, 0.8],
    [0.2, 0.8],
    [0.2, 0.8],
  ]);
});
test("새 2D 좌표와 기존 작품의 좌표를 표면 범위 안으로 복원한다", () => {
  assert.deepEqual(illustrationUV({ uv: [0.2, 0.8] }), [0.2, 0.8]);
  assert.deepEqual(illustrationUV({ point: [0, 0, 2] }), [0.5, 0.55]);
  assert.deepEqual(illustrationUV({ uv: [-1, 4] }), [0, 1]);
  assert.deepEqual(illustrationUV({ x: 180, y: 180 }), [0.5, 0.5]);
});
test("모든 주문 문양은 잉크 경로와 닫힌 투각 경로를 갖는다", () => {
  for (const p of PATTERNS) {
    assert.match(motifPath(p.id), /^M/);
    assert.match(cutoutPath(p.id), /^M/);
    assert.match(cutoutPath(p.id), /Z$/);
  }
});
test("23개 제작 예시는 별도의 2D 원화와 게임 이미지의 출처·해시를 보존한다", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("./assets/vessels/manifest.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(manifest.assets.length, 23);
  for (const m of MODEL_CATALOG) {
    const a = manifest.assets.find((a) => a.id === m.id);
    assert.ok(a, m.id);
    assert.equal(a.alpha, true);
    assert.ok(a.width > 400 && a.height > 400);
    for (const [path, hash] of [
      [a.source, a.sourceSha256],
      [a.runtime, a.runtimeSha256],
    ]) {
      const bytes = await readFile(
        new URL("./assets/vessels/" + path, import.meta.url),
      );
      assert.equal(createHash("sha256").update(bytes).digest("hex"), hash);
    }
  }
});

test("선택한 15종만 24방향 회전 대상으로 유지하고 X 표시 8종은 제외한다", async () => {
  const { ROTATION_IDS, wrapFrame } = await import("./rotation-rules.js");
  assert.equal(ROTATION_IDS.length, 15);
  for (const id of [
    "gourdBottle",
    "gourdPitcher",
    "lotusIncense",
    "maebyeong",
    "plumBambooMaebyeong",
    "qilinIncense",
    "wildflowerPitcher",
    "willowMaebyeong",
  ])
    assert.ok(!ROTATION_IDS.includes(id));
  assert.equal(wrapFrame(-1), 23);
  assert.equal(wrapFrame(24), 0);
});
test("표면에 찍은 문양은 회전하면 옆으로 이동하고 반대편에서는 숨겨진다", async () => {
  const { surfaceAngle, projectSurface } = await import("./rotation-rules.js");
  const row = [0.2, 0.8],
    angle = surfaceAngle(0.5, row, 0);
  assert.ok(Math.abs(angle) < 1e-12);
  assert.ok(Math.abs(projectSurface(angle, row, 0).u - 0.5) < 1e-12);
  assert.ok(projectSurface(angle, row, 2).u < 0.5);
  assert.equal(projectSurface(angle, row, 12), null);
  assert.ok(projectSurface(angle, row, 12, true));
  assert.equal(projectSurface(angle, row, 0, true), null);
});
test("반대편 구멍은 앞벽의 구멍을 자동으로 복제하지 않는다", async () => {
  const { surfaceAngle, projectSurface } = await import("./rotation-rules.js");
  const row = [0.15, 0.85],
    front = surfaceAngle(0.5, row, 0),
    back = surfaceAngle(0.5, row, 12);
  assert.ok(projectSurface(front, row, 0));
  assert.equal(projectSurface(front, row, 12), null);
  assert.equal(projectSurface(back, row, 0), null);
  assert.ok(projectSurface(back, row, 12));
  assert.ok(projectSurface(back, row, 0, true));
});

test("회전 원화 15종은 24장씩 360장을 보존하고 각도·바닥 높이·파일 해시가 일치한다", async () => {
  const { ROTATION_IDS } = await import("./rotation-rules.js");
  const root = new URL("./assets/vessels/rotations/", import.meta.url),
    manifest = JSON.parse(
      await readFile(new URL("manifest.json", root), "utf8"),
    ),
    layouts = JSON.parse(await readFile(new URL("layouts.json", root), "utf8"));
  assert.equal(manifest.frameCount, 24);
  assert.equal(manifest.stepDegrees, 15);
  assert.equal(manifest.models.length, 15);
  assert.equal(manifest.sourceSheets.length, 120);
  assert.deepEqual(
    manifest.models.map((m) => m.id).sort(),
    [...ROTATION_IDS].sort(),
  );
  for (const sheet of manifest.sourceSheets) {
    const bytes = await readFile(new URL(sheet.source, root));
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      sheet.sha256,
    );
  }
  for (const m of manifest.models) {
    assert.equal(m.frames.length, 24);
    assert.deepEqual(
      m.frames.map((f) => f.index),
      Array.from({ length: 24 }, (_, i) => i),
    );
    for (const frame of m.frames) {
      assert.equal(frame.degrees, frame.index * 15);
      assert.equal(frame.bounds.y + frame.bounds.height, 590);
      assert.ok(
        frame.bounds.x >= 0 && frame.bounds.x + frame.bounds.width <= 640,
      );
      assert.ok(frame.bounds.width <= layouts[m.id].maxWidth);
      assert.ok(frame.bounds.height <= layouts[m.id].maxHeight);
      const bytes = await readFile(new URL(frame.src, root));
      assert.equal(
        createHash("sha256").update(bytes).digest("hex"),
        frame.sha256,
      );
      assert.equal(bytes.subarray(8, 12).toString(), "WEBP");
    }
  }
});
