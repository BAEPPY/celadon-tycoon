import { angleDelta, frameAngle } from './rotation-rules.js';

// A shallow overhead view turns each horizontal surface line into an ellipse.
// Height stays in vessel space, so rotation carries decoration around the body.
export const SURFACE_ELEVATION = .24;

// Most vessels are round: a point of the surface is an angle around the body. The pillow is a box, about 0.57 times
// as deep as it is wide. Its surface is measured along the outline seen from above (front face, right end, back face,
// left end) and scaled so that one turn is still 2π — a motif then stays on the face it was pressed into, and passes
// around a corner as the pillow turns, instead of sliding over the faces as it would on a cylinder.
export const SECTIONS = Object.freeze({ pillow: Object.freeze({ depth: .567 }) });
export const sectionFor = id => SECTIONS[id] || null;
const TAU = Math.PI * 2;
// How far along the outline one unit of width is, as an angle (1 for a round body).
export const sectionScale = section => section ? TAU / (4 + 4 * section.depth) : 1;
const clampUnit = value => Math.max(-.995, Math.min(.995, value));

// The point of a box outline for an angle: its place (x to the right, z toward the viewer of frame 0, half the width
// = 1) and the way its face looks.
function boxPoint(section, angle) {
  const d = section.depth, length = 4 + 4 * d;
  let s = (((angle / TAU) % 1) + 1) % 1 * length;
  if (s > length - 1) s -= length;                       // the front face runs from -1 to 1
  if (s <= 1) return { x: s, z: d, nx: 0, nz: 1 };
  if (s <= 1 + 2 * d) return { x: 1, z: d - (s - 1), nx: 1, nz: 0 };
  if (s <= 3 + 2 * d) return { x: 1 - (s - 1 - 2 * d), z: -d, nx: 0, nz: -1 };
  return { x: -1, z: -d + (s - 3 - 2 * d), nx: -1, nz: 0 };
}
// The angle of the point seen at `t` (-1 … 1 across the outline) in a view: the visible face that lies there.
function boxAngle(section, view, t) {
  const phi = frameAngle(view), c = Math.cos(phi), s = Math.sin(phi), d = section.depth, length = 4 + 4 * d;
  const target = t * (Math.abs(c) + d * Math.abs(s));
  // each face: where it starts and ends (x, z), how it looks (nx, nz), and where it starts along the outline
  const faces = [[-1, d, 1, d, 0, 1, -1], [1, d, 1, -d, 1, 0, 1], [1, -d, -1, -d, 0, -1, 1 + 2 * d], [-1, -d, -1, d, -1, 0, 3 + 2 * d]];
  let best = null;
  for (const [x0, z0, x1, z1, nx, nz, start] of faces) {
    if (nx * s + nz * c <= 1e-6) continue;               // this face looks away
    const from = x0 * c - z0 * s, to = x1 * c - z1 * s, along = Math.max(0, Math.min(1, (target - from) / (to - from || 1)));
    const miss = Math.abs(from + (to - from) * along - target), at = start + along * Math.hypot(x1 - x0, z1 - z0);
    if (!best || miss < best.miss) best = { miss, at };
  }
  return (best ? best.at : 0) / length * TAU;
}
// Where a box point lands in a view: across the outline (-1 … 1), toward the viewer (in half widths, scaled like
// `across`) and how squarely its face looks at the viewer.
function boxView(section, angle, view) {
  const phi = frameAngle(view), c = Math.cos(phi), s = Math.sin(phi), p = boxPoint(section, angle), half = Math.abs(c) + section.depth * Math.abs(s);
  return { across: (p.x * c - p.z * s) / half, toward: (p.x * s + p.z * c) / half, facing: p.nx * s + p.nz * c, half };
}

export function surfaceAnchor(uv, angle, row, view = 0, section = null) {
  const radius = Math.max(.035, (row[1] - row[0]) / 2);
  const t = clampUnit((uv[0] - (row[0] + row[1]) / 2) / radius);
  if (section) {
    const pressed = boxAngle(section, view, t), seen = boxView(section, pressed, view);
    // `radius` is half the width of the front face on screen, so a motif keeps its size on every face.
    return { angle: angle ?? pressed, radius: Math.max(.035, radius / seen.half), level: uv[1] - radius * SURFACE_ELEVATION * seen.toward };
  }
  return { angle: angle ?? frameAngle(view) + Math.asin(t), radius,
    level: uv[1] - radius * SURFACE_ELEVATION * Math.sqrt(1 - t*t) };
}
export function projectCurvedSurface(angle, level, view, rowAt, back = false, section = null) {
  if (section) {
    const seen = boxView(section, angle, view);
    if (back ? seen.facing > -.035 : seen.facing < .035) return null;
    const toward = back ? -seen.toward : seen.toward;
    let row = rowAt(level), radius, v = level;
    for (let i = 0; i < 3; i++) {
      radius = Math.max(.035, (row[1] - row[0]) / 2);
      v = level + radius * SURFACE_ELEVATION * toward;
      row = rowAt(v);
    }
    radius = Math.max(.035, (row[1] - row[0]) / 2);
    return { uv: [(row[0] + row[1]) / 2 + seen.across * radius, v],
      squeeze: Math.max(.1, Math.abs(seen.facing)), delta: Math.asin(clampUnit(seen.across)) };
  }
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
