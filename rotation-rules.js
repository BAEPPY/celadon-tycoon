export const ROTATION_IDS = Object.freeze([
  "bambooShootPitcher",
  "chrysanthemumCup",
  "cloudCraneMaebyeong",
  "cupStand",
  "duckDropper",
  "duckIncense",
  "incense",
  "peonyPitcher",
  "pillow",
  "pitcher",
  "poemGourdBottle",
  "pomegranateDropper",
  "pomegranatePitcher",
  "qilinDecoratedIncense",
  "stool",
]);
export const FRAME_COUNT = 24;
export const wrapFrame = (value) =>
  ((Math.round(value) % FRAME_COUNT) + FRAME_COUNT) % FRAME_COUNT;
export const frameAngle = (value) =>
  (wrapFrame(value) * Math.PI * 2) / FRAME_COUNT;
export const angleDelta = (a, b) =>
  Math.atan2(Math.sin(a - b), Math.cos(a - b));
export function surfaceAngle(u, row, view) {
  const t = Math.max(
    -0.995,
    Math.min(0.995, ((u - row[0]) / (row[1] - row[0] || 1) - 0.5) * 2),
  );
  return frameAngle(view) + Math.asin(t);
}
export function projectSurface(angle, row, view, back = false) {
  const delta = angleDelta(angle, frameAngle(view)),
    cos = Math.cos(delta);
  if (back ? cos > -0.04 : cos < 0.04) return null;
  return {
    u: (row[0] + row[1]) / 2 + (Math.sin(delta) * (row[1] - row[0])) / 2,
    squeeze: Math.max(0.12, Math.abs(cos)),
    delta,
  };
}
