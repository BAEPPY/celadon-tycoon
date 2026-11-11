import { angleDelta, frameAngle } from './rotation-rules.js';

// A shallow overhead view turns each horizontal surface line into an ellipse.
// Height stays in vessel space, so rotation carries decoration around the body.
export const SURFACE_ELEVATION = .24;

// Most vessels are round: a point of the surface is an angle around the body. Two are not, and their surface is
// measured along the outline seen from above, scaled so that one turn is still 2π — a motif then stays on the part
// it was pressed into and turns with it, instead of sliding over the body as it would on a cylinder:
//  - the pillow is a box about 0.57 times as deep as it is wide (front face, right end, back face, left end);
//  - the duck dropper is an oval about 0.55 times as deep as it is long (its pictures are 0.69 wide from the side and
//    0.38 from the front).
// `elevation` is how much nearer points sit lower in the pictures (the pillow's, measured from the slope of its long
// face, is about 0.29; others keep the round vessels' 0.24). `wholeOutline`: a box's slanted faces cut a single row
// of the picture short, so it is placed across the picture's whole width instead (craft-2d.js).
export const SECTIONS = Object.freeze({
  pillow: Object.freeze({ shape: 'box', depth: .567, elevation: .29, wholeOutline: true }),
  duckDropper: Object.freeze({ shape: 'oval', depth: .55 }),
});
export const sectionFor = id => SECTIONS[id] || null;
const TAU = Math.PI * 2;
const clampUnit = value => Math.max(-.995, Math.min(.995, value));

// The oval's outline, measured once per depth: the length along it (in half lengths) at evenly spaced angles θ, where
// θ = 0 is the middle of the side facing the viewer of frame 0 and the point is (sin θ, depth · cos θ).
const OVAL_STEPS = 1024, ovals = new Map();
function ovalTable(depth) {
  if (ovals.has(depth)) return ovals.get(depth);
  const along = [0];
  for (let i = 1; i <= OVAL_STEPS; i++) {
    const a = (i - 1) / OVAL_STEPS * TAU, b = i / OVAL_STEPS * TAU, speed = t => Math.hypot(Math.cos(t), depth * Math.sin(t));
    along.push(along[i - 1] + (speed(a) + speed(b)) / 2 * (b - a));
  }
  const table = { along, length: along[OVAL_STEPS] };
  ovals.set(depth, table);
  return table;
}
const wrap = value => ((value % TAU) + TAU) % TAU;
function ovalAngleOf(table, theta) {
  const at = wrap(theta) / TAU * OVAL_STEPS, i = Math.min(OVAL_STEPS - 1, Math.floor(at)), s = table.along[i] + (table.along[i + 1] - table.along[i]) * (at - i);
  const angle = s / table.length * TAU;
  return angle > Math.PI ? angle - TAU : angle;
}
function ovalThetaOf(table, angle) {
  const s = wrap(angle) / TAU * table.length;
  let low = 0, high = OVAL_STEPS;
  while (high - low > 1) { const mid = (low + high) >> 1; if (table.along[mid] <= s) low = mid; else high = mid; }
  const part = (s - table.along[low]) / ((table.along[low + 1] - table.along[low]) || 1);
  return (low + part) / OVAL_STEPS * TAU;
}
function outlineLength(section) {
  return section.shape === 'oval' ? ovalTable(section.depth).length : 4 + 4 * section.depth;
}
// How far along the outline one unit of width is, as an angle (1 for a round body).
export const sectionScale = section => section ? TAU / outlineLength(section) : 1;

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
function ovalPoint(section, angle) {
  const d = section.depth, theta = ovalThetaOf(ovalTable(d), angle), x = Math.sin(theta), z = d * Math.cos(theta), n = Math.hypot(x, z / (d * d));
  return { x, z, nx: x / n, nz: z / (d * d) / n };
}
// The angle of the point seen at `t` (-1 … 1 across the outline) in a view: the visible part that lies there.
function sectionAngle(section, view, t) {
  const phi = frameAngle(view), c = Math.cos(phi), s = Math.sin(phi), d = section.depth;
  if (section.shape === 'oval') return ovalAngleOf(ovalTable(d), Math.atan2(d * s, c) + Math.asin(t));
  const length = 4 + 4 * d, target = t * (Math.abs(c) + d * Math.abs(s));
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
// Where a point of the outline lands in a view: across the outline (-1 … 1), how far it sits below its own level
// (`drop`, scaled like `across`) and how squarely its surface looks at the viewer.
// The pictures of every view stand on the same floor line, so the nearest point of the body is always the lowest,
// at the height the front had in the front view. A point drops by how near it is, less what the nearest point is
// nearer than the front was — otherwise a turned pillow's motifs would hang below the pillow. (For a round body this
// is the cylinder's own rule.) `back` is the far wall seen through the vessel; it mirrors the near one.
function sectionView(section, angle, view, back = false) {
  const phi = frameAngle(view), c = Math.cos(phi), s = Math.sin(phi), d = section.depth, oval = section.shape === 'oval';
  const p = oval ? ovalPoint(section, angle) : boxPoint(section, angle);
  const half = oval ? Math.hypot(c, d * s) : Math.abs(c) + d * Math.abs(s), nearest = oval ? Math.hypot(s, d * c) : Math.abs(s) + d * Math.abs(c), toward = p.x * s + p.z * c;
  return { across: (p.x * c - p.z * s) / half, drop: ((back ? -toward : toward) - nearest + d) / half, facing: p.nx * s + p.nz * c, half };
}

export function surfaceAnchor(uv, angle, row, view = 0, section = null) {
  const radius = Math.max(.035, (row[1] - row[0]) / 2);
  const t = clampUnit((uv[0] - (row[0] + row[1]) / 2) / radius);
  if (section) {
    const pressed = sectionAngle(section, view, t), seen = sectionView(section, pressed, view);
    // `radius` is half the width of the front on screen, so a motif keeps its size wherever it is pressed.
    return { angle: angle ?? pressed, radius: Math.max(.035, radius / seen.half), level: uv[1] - radius * (section.elevation ?? SURFACE_ELEVATION) * seen.drop };
  }
  return { angle: angle ?? frameAngle(view) + Math.asin(t), radius,
    level: uv[1] - radius * SURFACE_ELEVATION * Math.sqrt(1 - t*t) };
}
export function projectCurvedSurface(angle, level, view, rowAt, back = false, section = null) {
  if (section) {
    const seen = sectionView(section, angle, view, back), elevation = section.elevation ?? SURFACE_ELEVATION;
    if (back ? seen.facing > -.035 : seen.facing < .035) return null;
    let row = rowAt(level), radius, v = level;
    for (let i = 0; i < 3; i++) {
      radius = Math.max(.035, (row[1] - row[0]) / 2);
      v = level + radius * elevation * seen.drop;
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
