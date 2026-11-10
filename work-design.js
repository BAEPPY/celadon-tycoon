import {PATTERNS, SHAPES, TECHNIQUES} from './domain.js';
import {MODEL_ARTIFACTS} from './models-manifest.js';
import {FRAME_COUNT} from './rotation-rules.js';
import {MAX_STAMP_SIZE, MIN_STAMP_SIZE} from './motif-size.js';

export const WORK_DESIGN_VERSION = 1;
export const MAX_WORK_DESIGN_BYTES = 3300000;
const MAX_PLACEMENTS = 1200;
const MAX_STROKES = 600;
const MAX_STROKE_POINTS = 512;
const MAX_TOTAL_POINTS = 40 * MAX_STROKE_POINTS;
const MAX_INLAY_CELLS = 14000;
const shapes = new Set(SHAPES.map(value => value.id));
const patterns = new Set(PATTERNS.map(value => value.id));
const techniques = new Set(TECHNIQUES.map(value => value.id));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const number = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const optional = (value, fallback, min, max) => value === undefined || value === null ? fallback : number(value, min, max) ? value : null;
// 'mixed' is the summary of a work that used white and dark slip together; inlay.dark then lists the dark cells.
const slip = value => value === undefined || value === null ? 'white' : ['white', 'dark', 'mixed'].includes(value) ? value : null;

function coordinate(raw) {
  if (!object(raw)) return null;
  const result = {};
  // Craft2D uses UV first, then legacy 3D points, then 360-unit coordinates.
  // Preserve that precedence without carrying screen coordinates or other data.
  if (raw.uv !== undefined) {
    if (!Array.isArray(raw.uv) || raw.uv.length !== 2 || !raw.uv.every(value => number(value, 0, 1))) return null;
    result.uv = [...raw.uv];
  } else if (raw.point !== undefined) {
    if (!Array.isArray(raw.point) || raw.point.length !== 3 || !raw.point.every(value => number(value, -10, 10))) return null;
    result.point = [...raw.point];
  } else {
    const x = optional(raw.x, 180, -3600, 3600), y = optional(raw.y, 180, -3600, 3600);
    if (x === null || y === null) return null;
    result.x = x; result.y = y;
  }
  for (const [key, min, max] of [['surfaceAngle', -Math.PI * 16, Math.PI * 16], ['surfaceV', -1, 2], ['surfaceRadius', .001, 2]]) {
    if (raw[key] === undefined || raw[key] === null) continue;
    if (!number(raw[key], min, max)) return null;
    result[key] = raw[key];
  }
  return result;
}

function inlayCells(raw) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_INLAY_CELLS) return null;
  for (const key of raw) {
    if (typeof key !== 'string' || !/^(?:0|[1-9][0-9]?):(?:0|-?[1-9][0-9]?)$/.test(key)) return null;
    const [angle, level] = key.split(':').map(Number);
    if (angle > 95 || level < -48 || level > 96) return null;
  }
  return [...new Set(raw)];
}

// Rendering data is separate from assessmentInput: full drawing geometry must
// never alter a stored rubric fingerprint or carry names, tokens, or feedback.
// Reject an unsupported design instead of silently dropping parts of its image.
export function sanitizeWorkDesign(raw) {
  if (!object(raw) || (raw.version !== undefined && raw.version !== WORK_DESIGN_VERSION) || !shapes.has(raw.shape) || !techniques.has(raw.technique)) return null;
  const modelId = raw.modelId || raw.shape;
  if (typeof modelId !== 'string' || !Object.hasOwn(MODEL_ARTIFACTS, modelId)) return null;
  const pattern = raw.pattern === undefined || raw.pattern === null || raw.pattern === '' ? 'crane' : raw.pattern;
  if (!patterns.has(pattern)) return null;
  const width = optional(raw.width, 1, .85, 1.15), viewFrame = optional(raw.viewFrame, 0, 0, FRAME_COUNT - 1), decorPhase = optional(raw.decorPhase, 2, 0, 2);
  const claySlip = slip(raw.clay?.slip);
  if (width === null || viewFrame === null || !Number.isInteger(viewFrame) || decorPhase === null || !Number.isInteger(decorPhase) || claySlip === null) return null;
  const placements = raw.placements ?? [], strokes = raw.strokes ?? [];
  if (!Array.isArray(placements) || placements.length > MAX_PLACEMENTS || !Array.isArray(strokes) || strokes.length > MAX_STROKES) return null;
  const design = {version: WORK_DESIGN_VERSION, shape: raw.shape, modelId, width, viewFrame, technique: raw.technique, pattern,
    step: 4, tool: 'rotate', knead: 3, decorDone: true, decorPhase, clay: {slip: claySlip}, placements: [], strokes: []};
  for (const mark of placements) {
    const point = coordinate(mark), markPattern = mark?.pattern || pattern, stampSize = optional(mark?.stampSize, 1, MIN_STAMP_SIZE, MAX_STAMP_SIZE);
    if (!point || !patterns.has(markPattern) || stampSize === null) return null;
    design.placements.push({...point, pattern: markPattern, stampSize});
  }
  let totalPoints = 0;
  for (const stroke of strokes) {
    if (!object(stroke) || !Array.isArray(stroke.points) || stroke.points.length > MAX_STROKE_POINTS) return null;
    totalPoints += stroke.points.length;
    if (totalPoints > MAX_TOTAL_POINTS) return null;
    const points = [];
    for (const point of stroke.points) { const normalized = coordinate(point); if (!normalized) return null; points.push(normalized); }
    design.strokes.push({points});
  }
  if (raw.inlay !== undefined && raw.inlay !== null) {
    if (!object(raw.inlay)) return null;
    const inlaySlip = slip(raw.inlay.slip ?? claySlip), fill = inlayCells(raw.inlay.fill), wipe = inlayCells(raw.inlay.wipe), dark = inlayCells(raw.inlay.dark);
    if (inlaySlip === null || fill === null || wipe === null || dark === null) return null;
    design.inlay = {slip: inlaySlip, fillDone: raw.inlay.fillDone === true, wipeDone: raw.inlay.wipeDone === true, fill, wipe,
      ...(Array.isArray(raw.inlay.dark) ? {dark} : {})};
  }
  return new TextEncoder().encode(JSON.stringify(design)).byteLength <= MAX_WORK_DESIGN_BYTES ? design : null;
}
