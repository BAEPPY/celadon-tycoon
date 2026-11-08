import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME_DATA_TTL_MS, gameSaveExpired, hasResumableGameProgress, pruneGameSaves, readGameSave, writeGameSave} from './game-retention.js';

class Storage {
  values = new Map();
  get length() {return this.values.size;}
  key(index) {return [...this.values.keys()][index] ?? null;}
  getItem(key) {return this.values.get(key) ?? null;}
  setItem(key, value) {this.values.set(key, String(value));}
  removeItem(key) {this.values.delete(key);}
}
const KEY = 'celadon-tycoon-v2', START = Date.UTC(2026, 10, 8);
const progress = () => ({history:['royal-rest'], draft:{id:'draft', accepted:true, step:0, explanationUse:'베개로 씁니다.'},
  gallery:[{id:'complete', step:4, explanationBeauty:'학 상감무늬입니다.', assessment:{accepted:true, use:{score:10}, beauty:{score:10}}}]});

test('game data lasts for exactly 24 hours from first save, including subsequent edits', () => {
  const storage = new Storage(), value = progress();
  assert.equal(writeGameSave(storage, KEY, value, START), true);
  assert.equal(value.retentionStartedAt, START);
  const before = readGameSave(storage, KEY, START + GAME_DATA_TTL_MS - 1);
  assert.deepEqual(before, value);
  before.draft.explanationUse = '머리를 받치는 베개입니다.';
  assert.equal(writeGameSave(storage, KEY, before, START + GAME_DATA_TTL_MS - 1), true);
  assert.equal(before.retentionStartedAt, START, 'edits must not renew old works and scores');
  assert.equal(gameSaveExpired(before, START + GAME_DATA_TTL_MS), true);
  assert.equal(readGameSave(storage, KEY, START + GAME_DATA_TTL_MS), null);
  assert.equal(storage.getItem(KEY), null);
  assert.equal(writeGameSave(storage, KEY, before, START + GAME_DATA_TTL_MS), false, 'an old in-memory callback cannot restore an expired save');
  assert.equal(storage.getItem(KEY), null);
  const next = progress();
  writeGameSave(storage, KEY, next, START + GAME_DATA_TTL_MS);
  assert.equal(writeGameSave(storage, KEY, before, START + GAME_DATA_TTL_MS), false);
  assert.deepEqual(readGameSave(storage, KEY, START + GAME_DATA_TTL_MS), next, 'an expired tab cannot delete a new game saved by another tab');
});

test('legacy saves receive only one migration window while preserving their work', () => {
  const storage = new Storage(), value = progress();
  storage.setItem(KEY, JSON.stringify(value));
  const migrated = readGameSave(storage, KEY, START);
  assert.deepEqual(migrated, {...value, retentionStartedAt:START});
  assert.equal(readGameSave(storage, KEY, START + GAME_DATA_TTL_MS - 1).retentionStartedAt, START);
  assert.equal(readGameSave(storage, KEY, START + GAME_DATA_TTL_MS), null);
});

test('cleanup expires every game namespace and preserves lesson drafts and credentials', () => {
  const storage = new Storage();
  const gameKeys = [KEY, `${KEY}:classroom:ABCDEF:7`, `${KEY}:classroom:ABCDEF:7:run:first`, `${KEY}:classroom:GHIJKL:8:run:second`, 'celadon-workshop-v1'];
  const protectedKeys = ['celadon-classroom-teacher-v1', 'celadon-classroom-student-v1', 'celadon-classroom-rejoin-v1', 'celadon-classroom-drafts-v1:ABCDEF:7'];
  for (const key of gameKeys) storage.setItem(key, JSON.stringify({...progress(), retentionStartedAt:START}));
  for (const key of protectedKeys) storage.setItem(key, 'untouched');
  const currentKey = `${KEY}:classroom:ABCDEF:9:run:current`;
  writeGameSave(storage, currentKey, progress(), START + 1);
  pruneGameSaves(storage, START + GAME_DATA_TTL_MS);
  for (const key of gameKeys) assert.equal(storage.getItem(key), null, key);
  for (const key of protectedKeys) assert.equal(storage.getItem(key), 'untouched', key);
  assert.ok(storage.getItem(currentKey));
});

test('a blank default order does not offer continue, while actual progress does', () => {
  const blank = {id:'blank', step:0, accepted:false, shape:null, clay:{body:true, slip:'white', kneads:0, prepared:false},
    knead:0, sculpt:null, placements:[], strokes:[], firing:[], stationView:'counter', explanationUse:'', explanationBeauty:''};
  assert.equal(hasResumableGameProgress(null), false);
  assert.equal(hasResumableGameProgress(blank), false);
  for (const change of [{accepted:true}, {shape:'pillow'}, {clay:{kneads:1}}, {knead:1}, {step:1}]) {
    assert.equal(hasResumableGameProgress({...blank, ...change}), true);
  }
  assert.equal(hasResumableGameProgress({...blank, accepted:true, shape:'pillow', step:4}), false);
});

test('corrupt game saves are removed, and an invalid future timestamp cannot make data permanent', () => {
  const storage = new Storage();
  storage.setItem(KEY, '{broken');
  assert.equal(readGameSave(storage, KEY, START), null);
  assert.equal(storage.getItem(KEY), null);
  storage.setItem(KEY, JSON.stringify({...progress(), retentionStartedAt:START + 10 * GAME_DATA_TTL_MS}));
  assert.equal(readGameSave(storage, KEY, START).retentionStartedAt, START);
  assert.equal(readGameSave(storage, KEY, START + GAME_DATA_TTL_MS), null);
});
