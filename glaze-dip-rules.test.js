import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateGlazeDip, normalizeGlazeDip, GLAZE_DIP_RULES} from './glaze-dip-rules.js';

test('유약 담그기는 5초 목표의 ±10% 경계를 모두 성공으로 판정한다', () => {
  assert.equal(GLAZE_DIP_RULES.targetMs, 5000);
  for (const ms of [4500, 5000, 5500]) {
    const result = evaluateGlazeDip(ms);
    assert.equal(result.outcome, 'balanced'); assert.equal(result.success, true);
    assert.equal(result.score, 10); assert.equal(result.severity, 0);
  }
  for (const [ms, outcome] of [[4499, 'thin'], [5501, 'thick']]) {
    const result = evaluateGlazeDip(ms);
    assert.equal(result.outcome, outcome); assert.equal(result.success, false);
    assert.equal(result.score, 9); assert.ok(result.severity > 0);
  }
});

test('빠르거나 늦은 정도에 따라 같은 폭으로 감점하고 결과 표현 강도를 제한한다', () => {
  for (const [early, late, score] of [[2500, 7500, 5], [1000, 9000, 2], [0, 10000, 0]]) {
    assert.equal(evaluateGlazeDip(early).score, score); assert.equal(evaluateGlazeDip(late).score, score);
    assert.equal(evaluateGlazeDip(early).severity, evaluateGlazeDip(late).severity);
  }
  assert.equal(evaluateGlazeDip(60000).severity, 1); assert.equal(evaluateGlazeDip(60000).score, 0);
  assert.equal(evaluateGlazeDip(2500).errorPercent, -50);
  assert.match(evaluateGlazeDip(2500).feedback, /광택/); assert.match(evaluateGlazeDip(7500).feedback, /흘러내리/);
});

test('시간이 아닌 주장된 점수·성공 여부는 버리고 측정값으로만 다시 계산한다', () => {
  const raw = {version: 1, elapsedMs: 1000, outcome: 'balanced', success: true, score: 10, severity: 0, feedback: 'injected'};
  assert.deepEqual(normalizeGlazeDip(raw), evaluateGlazeDip(1000));
  assert.equal(raw.score, 10, 'the input is not mutated');
  assert.deepEqual(normalizeGlazeDip(normalizeGlazeDip(raw)), normalizeGlazeDip(raw));
});

test('유효하지 않은 시간·결과 버전은 저장하거나 점수로 인정하지 않는다', () => {
  for (const ms of [undefined, null, '', '5000', NaN, Infinity, -Infinity, -1, 60001, 4999.5]) {
    assert.equal(evaluateGlazeDip(ms), null); assert.equal(normalizeGlazeDip({version: 1, elapsedMs: ms}), null);
  }
  for (const raw of [null, undefined, [], 5000, {elapsedMs: 5000}, {version: 2, elapsedMs: 5000}]) assert.equal(normalizeGlazeDip(raw), null);
});
