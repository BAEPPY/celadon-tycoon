import test from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES, ORDERS, TECHNIQUES, PATTERNS, FIRING, drawNextOrder, evaluateWork } from './domain.js';

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

test('서른 주문은 형태별 여섯 건이며 기법과 무늬 데이터가 모두 유효하다', () => {
  assert.equal(SHAPES.length, 5);
  assert.equal(ORDERS.length, 30);
  assert.equal(new Set(ORDERS.map((order) => order.id)).size, 30);
  assert.equal(new Set(ORDERS.map((order) => order.shape)).size, 5);
  for (const shape of SHAPES) assert.equal(ORDERS.filter((order) => order.shape === shape.id).length, 6, shape.id);
  for (const order of ORDERS) {
    assert.ok(SHAPES.some((shape) => shape.id === order.shape));
    assert.ok(['king', 'noble', 'noblewoman'].includes(order.kind));
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

test('기존 다섯 주문 ID를 유지해 이전 작품도 평가할 수 있다', () => {
  const original = ['royal-rest', 'noble-banquet', 'royal-fragrance', 'noble-garden', 'noble-vessel'];
  assert.deepEqual(ORDERS.slice(0, 5).map((order) => order.id), original);
});

test('랜덤 주문은 한 건만 반환하고 입력 이력을 바꾸지 않는다', () => {
  const history = ['royal-rest'];
  const before = [...history];
  const result = drawNextOrder(history, () => 0.5);
  assert.ok(!Array.isArray(result));
  assert.ok(ORDERS.includes(result));
  assert.notEqual(result.id, history.at(-1));
  assert.deepEqual(history, before);
});

test('연속 60건을 뽑아도 각 30건 순환에는 중복이 없고 경계에서 직전 주문을 반복하지 않는다', () => {
  let seed = 17;
  const rng = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const history = [];
  for (let index = 0; index < 60; index += 1) {
    const order = drawNextOrder(history, rng);
    assert.ok(ORDERS.some((item) => item.id === order.id));
    assert.ok(!history.slice(-2).includes(order.id));
    history.push(order.id);
  }
  assert.equal(new Set(history.slice(0, 30)).size, 30);
  assert.equal(new Set(history.slice(30, 60)).size, 30);
});

test('고정 난수를 사용해도 세 번의 순환과 순환 경계의 최근 주문 회피가 유지된다', () => {
  const history = [];
  for (let index = 0; index < 90; index += 1) {
    const order = drawNextOrder(history, () => 0);
    assert.ok(!history.slice(-2).includes(order.id));
    history.push(order.id);
  }
  for (let start = 0; start < 90; start += 30) assert.equal(new Set(history.slice(start, start + 30)).size, 30);
});

test('저장된 잘못된 이력과 경계 난수 값이 있어도 유효한 주문 한 건을 반환한다', () => {
  for (const history of [undefined, null, {}, ['missing-order', null, 'royal-rest']]) {
    for (const value of [-1, 0, 0.999999, 1, 2, NaN, Infinity]) {
      assert.ok(ORDERS.includes(drawNextOrder(history, () => value)));
    }
  }
  assert.notEqual(drawNextOrder(['missing-order', 'royal-rest'], () => 0).id, 'royal-rest');
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
