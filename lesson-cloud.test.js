import test from 'node:test';
import assert from 'node:assert/strict';
import {placeCloudWords, CLOUD_GAP} from './lesson-cloud.js';

test('common words are central and every placed word stays readable, separate, and inside the board', () => {
  const words = Array.from({length: 45}, (_, index) => ({index, size: index ? 14 : 48,
    width: index ? 40 + index % 5 * 7 : 170, height: index ? 21 : 56}));
  const positions = placeCloudWords(words, 640, 480);
  assert.equal(positions.length, words.length);
  assert.equal(new Set(positions.map(item => item.index)).size, words.length);
  const common = positions.find(item => item.index === 0);
  assert.ok(Math.abs(common.x + common.width / 2 - 320) <= 1);
  assert.ok(Math.abs(common.y + common.height / 2 - 240) <= 1);
  for (const [index, a] of positions.entries()) {
    assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.width <= 640 && a.y + a.height <= 480);
    for (const b of positions.slice(index + 1)) assert.ok(a.x + a.width + CLOUD_GAP <= b.x || b.x + b.width + CLOUD_GAP <= a.x || a.y + a.height + CLOUD_GAP <= b.y || b.y + b.height + CLOUD_GAP <= a.y);
  }
  assert.deepEqual(placeCloudWords(words, 640, 480), positions);
  // The words sit close together: two pixels between boxes, and the nearest neighbour of the central word touches that gap.
  assert.equal(CLOUD_GAP, 2);
  const distance = other => Math.max(0, Math.max(other.x - (common.x + common.width), common.x - (other.x + other.width)), Math.max(other.y - (common.y + common.height), common.y - (other.y + other.height)));
  assert.ok(Math.min(...positions.filter(item => item !== common).map(distance)) <= 4);
});

test('a crowded board requests more room rather than silently dropping a word', () => {
  const words = [{index: 0, size: 25, width: 100, height: 100}, {index: 1, size: 20, width: 100, height: 100}];
  assert.equal(placeCloudWords(words, 120, 120), null);
  assert.equal(placeCloudWords(words, 120, 400).length, 2);
});
