import {SCULPT_LOCK, SCULPT_SNAP} from './sculpt-rules.js';
const diagonal = (guide, width, height) => {
  const xs = guide.map(p => p[0] * width), ys = guide.map(p => p[1] * height);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
};
// Green is a fixed grip, not merely a target crossed by some other clay edge: a grip turns green within SCULPT_LOCK of
// its own spot on the dashed outline (a share of the target's diagonal, so the same at every screen size).
export function settleSculptLocks(points, guide, locked, width, height, acquire = true, share = SCULPT_LOCK) {
  const tolerance = diagonal(guide, width, height) * share;
  const fixed = guide.map((goal, i) => locked?.[i] === true || (acquire && Math.hypot((points[i][0] - goal[0]) * width, (points[i][1] - goal[1]) * height) <= tolerance));
  return {locked: fixed, points: points.map((point, i) => [...(fixed[i] ? guide[i] : point)])};
}

export function nextUnlockedSculptPoint(locked, selected, direction = 1) {
  for (let step = 1; step <= locked.length; step++) {
    const index = (selected + direction * step + locked.length) % locked.length;
    if (!locked[index]) return index;
  }
  return selected;
}

// A grip let go a little short of its own spot (within SCULPT_SNAP) lands on it, like a magnet.
export function snapSculptGrip(points, guide, locked, index, width, height) {
  if (locked?.[index] || !points[index] || !guide[index]) return {points, locked};
  const near = Math.hypot((points[index][0] - guide[index][0]) * width, (points[index][1] - guide[index][1]) * height) <= diagonal(guide, width, height) * SCULPT_SNAP;
  if (!near) return {points, locked};
  return {points: points.map((p, i) => i === index ? [...guide[i]] : p), locked: locked.map((value, i) => value || i === index)};
}
