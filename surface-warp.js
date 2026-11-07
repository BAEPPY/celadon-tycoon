import { angleDelta, frameAngle } from './rotation-rules.js';

// A shallow overhead view turns each horizontal surface line into an ellipse.
// Height stays in vessel space, so rotation carries decoration around the body.
export const SURFACE_ELEVATION = .24;
export function surfaceAnchor(uv, angle, row, view = 0) {
  const radius = Math.max(.035, (row[1] - row[0]) / 2);
  const t = Math.max(-.995, Math.min(.995, (uv[0] - (row[0] + row[1]) / 2) / radius));
  return { angle: angle ?? frameAngle(view) + Math.asin(t), radius,
    level: uv[1] - radius * SURFACE_ELEVATION * Math.sqrt(1 - t*t) };
}
export function projectCurvedSurface(angle, level, view, rowAt, back = false) {
  const delta = angleDelta(angle, frameAngle(view)), facing = Math.cos(delta);
  if (back ? facing > -.035 : facing < .035) return null;
  let row = rowAt(level), radius, v = level;
  for (let i = 0; i < 3; i++) {
    radius = Math.max(.035, (row[1] - row[0]) / 2);
    v = level + radius * SURFACE_ELEVATION * Math.abs(facing);
    row = rowAt(v);
  }
  radius = Math.max(.035, (row[1] - row[0]) / 2);
  return { uv: [(row[0] + row[1]) / 2 + Math.sin(delta) * radius, v],
    squeeze: Math.max(.1, Math.abs(facing)), delta };
}
export function inlayCell(angle, level) {
  const tau = Math.PI*2, a = ((angle % tau) + tau) % tau;
  return `${Math.round(a / tau * 96) % 96}:${Math.round(level * 48)}`;
}
