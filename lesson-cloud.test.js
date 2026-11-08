import test from 'node:test';
import assert from 'node:assert/strict';
import {placeCloudWords} from './lesson-cloud.js';

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
    for (const b of positions.slice(index + 1)) assert.ok(a.x + a.width + 6 <= b.x || b.x + b.width + 6 <= a.x || a.y + a.height + 6 <= b.y || b.y + b.height + 6 <= a.y);
  }
  assert.deepEqual(placeCloudWords(words, 640, 480), positions);
});

test('a crowded board requests more room rather than silently dropping a word', () => {
  const words = [{index: 0, size: 25, width: 100, height: 100}, {index: 1, size: 20, width: 100, height: 100}];
  assert.equal(placeCloudWords(words, 120, 120), null);
  assert.equal(placeCloudWords(words, 120, 400).length, 2);
});
