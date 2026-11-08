// A placement owns its size; the tool setting only applies to the next stamp.
export const MIN_STAMP_SIZE = .5;
export const MAX_STAMP_SIZE = 1.75;
export function normalizeStampSize(value) {
  const size = Number(value);
  return Number.isFinite(size) && value != null
    ? Math.min(MAX_STAMP_SIZE, Math.max(MIN_STAMP_SIZE, size))
    : 1;
}
