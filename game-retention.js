export const GAME_DATA_TTL_MS = 24 * 60 * 60 * 1000;
const GAME_KEY = 'celadon-tycoon-v2';

export function isGameSaveKey(key) {
  return key === GAME_KEY || key === 'celadon-workshop-v1' || key.startsWith(`${GAME_KEY}:classroom:`);
}

export function gameSaveExpired(value, now = Date.now()) {
  return Number.isFinite(value?.retentionStartedAt) && now >= value.retentionStartedAt + GAME_DATA_TTL_MS;
}

export function hasResumableGameProgress(work) {
  if (!work || !Number.isInteger(work.step) || work.step < 0 || work.step >= 4) return false;
  // An automatically prepared order has not been accepted or worked on yet.
  return Boolean(work.accepted || work.shape || work.step > 0 || work.clay?.kneads > 0 || work.clay?.prepared
    || work.knead > 0 || work.sculpt?.complete || work.placements?.length || work.strokes?.length || work.firing?.length
    || work.explanationUse?.trim() || work.explanationBeauty?.trim());
}

export function removeGameSave(storage, key) {
  if (!isGameSaveKey(key)) return;
  try {storage?.removeItem(key);} catch {}
}

export function readGameSave(storage, key, now = Date.now()) {
  if (!isGameSaveKey(key)) return null;
  let value;
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid game save');
    if (gameSaveExpired(value, now)) {removeGameSave(storage, key);return null;}
    // Old saves have no reliable creation time. Give them one bounded migration
    // window, persisted immediately so reopening the game cannot renew it.
    if (!Number.isFinite(value.retentionStartedAt) || value.retentionStartedAt > now) {
      value.retentionStartedAt = now;
      storage.setItem(key, JSON.stringify(value));
    }
    return value;
  } catch {
    removeGameSave(storage, key);
    return null;
  }
}

export function writeGameSave(storage, key, value, now = Date.now()) {
  if (!isGameSaveKey(key)) return false;
  if (gameSaveExpired(value, now)) {
    // Another tab may already have started a new game under this key. Clean up
    // the stored record only if it, too, has expired; never delete the new one.
    readGameSave(storage, key, now);
    return false;
  }
  if (!Number.isFinite(value.retentionStartedAt) || value.retentionStartedAt > now) value.retentionStartedAt = now;
  storage?.setItem(key, JSON.stringify(value));
  return true;
}

export function pruneGameSaves(storage, now = Date.now()) {
  const keys = [];
  try {
    for (let i = 0; i < storage?.length; i++) {
      const key = storage.key(i);
      if (key && isGameSaveKey(key)) keys.push(key);
    }
  } catch {return;}
  // Snapshot keys first: deleting while iterating localStorage skips entries.
  for (const key of keys) readGameSave(storage, key, now);
}
