const clamp = value => Math.max(0, Math.min(1, value));
const validOutline = points => Array.isArray(points) && points.length >= 3 && points.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));

// Use physical proportions, not fractions of a possibly wide/narrow viewport.
// Returned points stay in the caller's coordinate system.
export function sampleSculptOutline(points, count = 40, width = 1, height = 1) {
  const lengths = points.map((p, i) => Math.hypot((p[0] - points[(i + 1) % points.length][0]) * width, (p[1] - points[(i + 1) % points.length][1]) * height));
  const total = lengths.reduce((a, b) => a + b, 0), out = [];
  let edge = 0, offset = 0;
  for (let i = 0; i < count; i++) {
    const d = i / count * total;
    while (edge < lengths.length - 1 && offset + lengths[edge] < d) offset += lengths[edge++];
    const a = points[edge], b = points[(edge + 1) % points.length], t = (d - offset) / (lengths[edge] || 1);
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

function nearestDistance(point, polygon) {
  let result = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], dx = b[0] - a[0], dy = b[1] - a[1];
    const t = clamp(((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1));
    result = Math.min(result, Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy));
  }
  return result;
}

function intervalsAt(polygon, y) {
  const xs = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]));
  }
  xs.sort((a, b) => a - b);
  return Array.from({length: Math.floor(xs.length / 2)}, (_, i) => [xs[i * 2], xs[i * 2 + 1]]);
}

// Scanline integration also handles a folded/self-crossed clay outline. Sampling
// is relative to these shapes, so pixels and devicePixelRatio never affect it.
function areaOverlap(clay, target) {
  const ys = [...clay, ...target].map(p => p[1]), top = Math.min(...ys), bottom = Math.max(...ys);
  let intersection = 0, union = 0;
  for (let i = 0; i < 256; i++) {
    const y = top + (i + .5) / 256 * (bottom - top), a = intervalsAt(clay, y), b = intervalsAt(target, y);
    const areaA = a.reduce((sum, p) => sum + p[1] - p[0], 0), areaB = b.reduce((sum, p) => sum + p[1] - p[0], 0);
    let overlap = 0;
    for (const x of a) for (const z of b) overlap += Math.max(0, Math.min(x[1], z[1]) - Math.max(x[0], z[0]));
    intersection += overlap;
    union += areaA + areaB - overlap;
  }
  return union > 1e-10 ? clamp(intersection / union) : 0;
}

/**
 * Shape match, in [0, 1]. Both directions matter: missing and excess clay count.
 * A 1.2%-of-target-diagonal hand-control allowance is followed by a 7% falloff.
 * 45% whole contour + 30% filled-area overlap + 25% poorest contour fifth keeps
 * a broad correct body from hiding an unfinished neck, rim or base. The 90%
 * completion target is unchanged. This is a similarity score, not a count of
 * successful grips or how much the player has dragged.
 */
export function sculptMatch(points, guide, width = 1, height = 1) {
  const empty = {matches: Array.isArray(guide) ? guide.map(() => 0) : [], fraction: 0, contour: 0, overlap: 0, local: 0};
  if (!validOutline(points) || !validOutline(guide) || !(width > 0) || !(height > 0)) return empty;
  const xs = guide.map(p => p[0] * width), ys = guide.map(p => p[1] * height), left = Math.min(...xs), top = Math.min(...ys);
  const diagonal = Math.hypot(Math.max(...xs) - left, Math.max(...ys) - top);
  if (!Number.isFinite(diagonal) || diagonal < 1e-10) return empty;
  const normalize = outline => outline.map(p => [(p[0] * width - left) / diagonal, (p[1] * height - top) / diagonal]);
  const clay = normalize(points), target = normalize(guide), similarity = d => clamp(1 - Math.max(0, d - .012) / .07);
  const targetSamples = sampleSculptOutline(target, 128), claySamples = sampleSculptOutline(clay, 128);
  const scores = [...targetSamples.map(p => similarity(nearestDistance(p, clay))), ...claySamples.map(p => similarity(nearestDistance(p, target)))];
  const contour = scores.reduce((a, b) => a + b, 0) / scores.length;
  const worstCount = Math.ceil(scores.length * .2), worst = [...scores].sort((a, b) => a - b).slice(0, worstCount);
  const local = worst.reduce((a, b) => a + b, 0) / worstCount, overlap = areaOverlap(clay, target);
  return {matches: target.map(p => similarity(nearestDistance(p, clay))), fraction: clamp(.45 * contour + .3 * overlap + .25 * local), contour, overlap, local};
}
