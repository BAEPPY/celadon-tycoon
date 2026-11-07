export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export function illustrationUV(mark) {
  if (Array.isArray(mark.uv)) return mark.uv.map((v) => clamp(v));
  if (Array.isArray(mark.point))
    return [clamp(0.5 + mark.point[0] / 3), clamp(0.55 - mark.point[1] / 3)];
  return [clamp((mark.x ?? 180) / 360), clamp((mark.y ?? 180) / 360)];
}
export function alphaBounds(data, width, height, threshold = 32) {
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > threshold) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  return right < 0
    ? null
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}
export function silhouetteRows(data, width, height, count = 28) {
  const result = [];
  for (let i = 0; i < count; i++) {
    const y = Math.min(height - 1, Math.floor(((i + 0.5) * height) / count));
    let left = width,
      right = -1;
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 64) {
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    result.push(right >= 0 ? [left / width, (right + 1) / width] : null);
  }
  return result;
}
