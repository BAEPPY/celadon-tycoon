// Five seconds is the target for this classroom mini-game, not a firing recipe.
export const GLAZE_DIP_RULES = Object.freeze({targetMs: 5000, minMs: 4500, maxMs: 5500, maxDurationMs: 60000});

export function evaluateGlazeDip(elapsedMs) {
  if (!Number.isInteger(elapsedMs) || elapsedMs < 0 || elapsedMs > GLAZE_DIP_RULES.maxDurationMs) return null;
  const {targetMs, minMs, maxMs} = GLAZE_DIP_RULES;
  const outcome = elapsedMs < minMs ? 'thin' : elapsedMs > maxMs ? 'thick' : 'balanced';
  const success = outcome === 'balanced', errorMs = elapsedMs - targetMs;
  // A miss always loses at least one point, including a one-millisecond miss.
  const score = success ? 10 : Math.max(0, Math.min(9, Math.round(10 * (1 - Math.abs(errorMs) / targetMs))));
  const severity = success ? 0 : Math.min(1, (Math.abs(errorMs) - (maxMs - targetMs)) / minMs);
  const feedback = success
    ? '5초에 가깝게 꺼내 유약을 알맞게 입혔어요.'
    : outcome === 'thin'
      ? '조금 일찍 꺼냈어요. 유약이 얇으면 광택과 빛깔이 덜 나타날 수 있어요.'
      : '조금 오래 담갔어요. 유약이 너무 두꺼우면 흘러내리거나 갈라질 수 있어요.';
  return {version: 1, elapsedMs, outcome, success, score, max: 10, errorMs, errorPercent: errorMs / targetMs * 100, severity, feedback};
}

// Derived fields are deliberately ignored: saved and submitted results have one
// source of truth, the measured time, on both the client and the server.
export function normalizeGlazeDip(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1) return null;
  return evaluateGlazeDip(raw.elapsedMs);
}
