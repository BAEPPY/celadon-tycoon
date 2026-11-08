// The saved artwork keeps its 24 authored poses. This helper smooths the
// gesture between those poses without changing any decoration coordinates.
export const ROTATION_PIXELS_PER_FRAME = 22;
export const ROTATION_BLEND_MS = 65;

export function followRotation(position, target, elapsed, reducedMotion = false) {
  if (reducedMotion) return target;
  const delta = target - position;
  return Math.abs(delta) < .015 ? target : position + delta * (1 - Math.exp(-Math.max(0, Math.min(elapsed, 64)) / 55));
}

export function releasedRotationTarget(target, velocity, age, reducedMotion = false) {
  const momentum = reducedMotion || age > 90 ? 0 : Math.max(-1.5, Math.min(1.5, velocity * 120));
  return Math.round(target + momentum);
}
