import test from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES, ORDERS, TECHNIQUES, PATTERNS, FIRING, evaluateWork } from './domain.js';

const completedWork = (overrides = {}) => ({
  orderId: 'royal-rest', shape: 'pillow', technique: 'inlay', pattern: 'crane',
  placements: [{ x: 0.4, y: 0.5 }], decorDone: true,
  firing: ['dry', 'biscuit', 'glaze', 'fire'],
  explanationUse: '누워서 쉴 때 머리를 받칩니다.',
  explanationBeauty: '학 무늬를 다른 색의 흙으로 정교하게 나타냈습니다.',
  selfUse: true, selfBeauty: true,
  ...overrides,
});

test('완성한 주문은 객관 조건 80점과 자기 점검 20점을 따로 반환한다', () => {
  const result = evaluateWork(completedWork());
  assert.equal(result.total, 100);
  assert.equal(result.objective, 80);
  assert.equal(result.self, 20);
  assert.equal(result.breakdown.reduce((sum, row) => sum + row.max, 0), 100);
  assert.match(result.message, /자동으로 채점한 결과는 아니/);
});

test('쓰임이 틀린 형태는 40점을 얻지 못하고 다시 고를 근거를 받는다', () => {
  const result = evaluateWork(completedWork({ shape: 'pitcher' }));
  assert.equal(result.total, 60);
  assert.match(result.breakdown.find((row) => row.key === 'use').feedback, /청자 베개/);
});

test('굽기 순서가 빠지거나 바뀌면 제작 과정 중 20점을 얻지 못한다', () => {
  for (const firing of [[], ['dry', 'biscuit', 'glaze'], ['dry', 'glaze', 'biscuit', 'fire'], ['dry', 'biscuit', 'glaze', 'fire', 'fire']]) {
    assert.equal(evaluateWork(completedWork({ firing })).total, 80);
  }
});

test('자기 점검 칸만 체크하고 설명이 없으면 자기 점검 20점을 얻지 못한다', () => {
  for (const explanation of ['', '    ', '좋아요']) {
    const result = evaluateWork(completedWork({ explanationUse: explanation, explanationBeauty: explanation }));
    assert.equal(result.self, 0);
    assert.equal(result.total, 80);
  }
  assert.equal(evaluateWork(completedWork({ selfUse: false, selfBeauty: false })).self, 0);
});

test('다섯 주문의 형태와 기법, 무늬 데이터는 모두 유효하다', () => {
  assert.equal(SHAPES.length, 5);
  assert.equal(ORDERS.length, 5);
  assert.equal(new Set(ORDERS.map((order) => order.shape)).size, 5);
  for (const order of ORDERS) {
    assert.ok(SHAPES.some((shape) => shape.id === order.shape));
    assert.ok(['king', 'noble'].includes(order.kind));
    assert.ok(order.technique === 'any' || TECHNIQUES.some((technique) => technique.id === order.technique));
    assert.ok(order.pattern === 'any' || PATTERNS.some((pattern) => pattern.id === order.pattern));
    const result = evaluateWork(completedWork({
      orderId: order.id, shape: order.shape,
      technique: order.technique === 'any' ? 'inlay' : order.technique,
      pattern: order.pattern === 'any' ? 'cloud' : order.pattern,
    }));
    assert.equal(result.total, 100, order.id);
  }
  assert.deepEqual(FIRING.map((stage) => stage.id), ['dry', 'biscuit', 'glaze', 'fire']);
});

test('주문의 무늬와 기법 조건을 다르게 만들면 수정 의견을 준다', () => {
  const wrongPattern = evaluateWork(completedWork({ pattern: 'lotus' }));
  assert.equal(wrongPattern.total, 90);
  assert.match(wrongPattern.breakdown.find((row) => row.key === 'design').feedback, /학/);
  const wrongTechnique = evaluateWork(completedWork({ technique: 'openwork' }));
  assert.equal(wrongTechnique.total, 90);
  assert.match(wrongTechnique.breakdown.find((row) => row.key === 'design').feedback, /상감/);
  assert.equal(evaluateWork(completedWork({ placements: [] })).total, 90);
});

test('장식 자유 주문은 무늬 없는 표현도 정당한 선택으로 인정한다', () => {
  const result = evaluateWork(completedWork({ orderId: 'noble-banquet', shape: 'pitcher', technique: 'plain', pattern: undefined, placements: [] }));
  assert.equal(result.total, 100);
});

test('단층 몸통에 구멍을 뚫은 주전자는 물을 담는 쓰임에 맞게 고치도록 안내한다', () => {
  const result = evaluateWork(completedWork({ orderId: 'noble-banquet', shape: 'pitcher', technique: 'openwork' }));
  assert.equal(result.total, 90);
  assert.match(result.breakdown.find((row) => row.key === 'design').feedback, /물이 샐 수/);
});

test('사용자 설명 문장을 피드백에 다시 출력하거나 의미를 자동 판정하지 않는다', () => {
  const explanation = '<img src=x onerror=alert(1)>';
  const result = evaluateWork(completedWork({ explanationUse: explanation }));
  assert.equal(result.self, 20);
  assert.ok(!JSON.stringify(result).includes(explanation));
  assert.match(result.breakdown.find((row) => row.key === 'selfUse').feedback, /선생님과 함께/);
});

test('빈 입력, 잘못된 입력, 여러 선택 조합에서도 항상 점수 범위를 지킨다', () => {
  const inputs = [undefined, null, {}, { orderId: 'unknown' }, completedWork({ placements: null, firing: null }), completedWork({ placements: [{ x: NaN, y: 0 }] })];
  for (const shape of [...SHAPES.map((item) => item.id), 'unknown']) {
    for (const technique of [...TECHNIQUES.map((item) => item.id), 'unknown']) {
      inputs.push(completedWork({ shape, technique }));
    }
  }
  for (const input of inputs) {
    const result = evaluateWork(input);
    assert.ok(result.total >= 0 && result.total <= 100);
    assert.ok(result.objective >= 0 && result.objective <= 80);
    assert.ok(result.self >= 0 && result.self <= 20);
    assert.equal(result.total, result.objective + result.self);
    for (const row of result.breakdown) assert.ok(row.score >= 0 && row.score <= row.max);
  }
});
