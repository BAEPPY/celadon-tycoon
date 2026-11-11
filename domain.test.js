import {assessmentFingerprint} from './assessment-rules.js';
import {EXAMPLE_DESIGNS} from './example-orders.js';
import {MODEL_CATALOG} from './models-manifest.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES, ORDERS, TECHNIQUES, PATTERNS, FIRING, MIN_MOTIFS, MIN_MOTIF_KINDS, drawNextOrder, evaluateWork, orderMotifs, workMotifCounts, decorationProgress, motifRequest } from './domain.js';
import {orderQuote} from './dialogue.js';

// So many stamps of each pattern: stamps({crane: 3, cloud: 2}).
const stamps = counts => Object.entries(counts).flatMap(([pattern, count]) => Array.from({length: count}, (_, index) => ({x: 150 + index * 20, y: 190, pattern})));
// One stamp of every pattern an order names (a free order gets two kinds).
const orderStamps = order => stamps(Object.fromEntries((orderMotifs(order).length ? orderMotifs(order).map(motif => motif.pattern) : ['cloud', 'crane']).map(pattern => [pattern, 1])));

const completedWork = (overrides = {}) => {const work = {
  orderId: 'royal-rest', shape: 'pillow', technique: 'inlay', pattern: 'crane',
  placements: [{ x: 0.4, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 }, { x: 0.3, y: 0.3, pattern: 'cloud' }, { x: 0.7, y: 0.3, pattern: 'cloud' }], decorDone: true,
  firing: ['dry', 'biscuit', 'glaze', 'fire'],
  explanationUse: '누워서 쉴 때 머리를 받칩니다.',
  explanationBeauty: '학 무늬를 다른 색의 흙으로 정교하게 나타냈습니다.',
  selfUse: true, selfBeauty: true,
  ...overrides,
};
  if (!Object.hasOwn(overrides, 'assessment') && work.explanationUse.trim().length >= 6 && work.explanationBeauty.trim().length >= 6) work.assessment = {
    version: 1, source: 'ai', fingerprint: assessmentFingerprint(work), accepted: true,
    use: {score: 10, feedback: '모양과 쓰임의 이유가 알맞아요.'}, beauty: {score: 10, feedback: '기법의 특징과 효과를 잘 연결했어요.'},
  };
  return work;
};

test('완성한 주문은 객관 조건 80점과 저장된 설명 평가 20점을 따로 반환한다', () => {
  const result = evaluateWork(completedWork());
  assert.equal(result.total, 100);
  assert.equal(result.objective, 80);
  assert.equal(result.self, 20);
  assert.equal(result.breakdown.reduce((sum, row) => sum + row.max, 0), 100);
  assert.equal(result.assessmentSource, 'ai');
  assert.equal(result.explanation, 20);
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

test('새 제작 과정은 유약 담그기 10점을 포함하며 설명 20점은 그대로 유지한다', () => {
  for (const [elapsedMs, expected] of [[4500, 100], [5000, 100], [5500, 100], [4499, 99], [5501, 99], [2500, 95], [7500, 95], [0, 90], [60000, 90]]) {
    const work = completedWork({processVersion: 2, glazeDip: {version: 1, elapsedMs, score: 10, outcome: 'balanced'}});
    const score = evaluateWork(work), process = score.breakdown.find(row => row.key === 'process');
    assert.equal(score.total, expected, `${elapsedMs} ms`); assert.equal(score.self, 20);
    assert.equal(score.objective, expected - 20); assert.equal(process.glazeScore, expected - 90);
    assert.equal(process.glazeMax, 10); assert.equal(process.max, 30);
  }
});

test('새 제작에서 빠진 유약 결과는 0점이고 이전 저장 작품의 점수는 유지한다', () => {
  for (const glazeDip of [undefined, null, {version: 1, elapsedMs: '5000'}, {version: 1, elapsedMs: Infinity}]) {
    assert.equal(evaluateWork(completedWork({processVersion: 2, glazeDip})).total, 90);
  }
  assert.equal(evaluateWork(completedWork()).total, 100);
  assert.equal(evaluateWork(completedWork({processVersion: 1})).total, 100);
  assert.equal(evaluateWork(completedWork({glazeDip: {version: 1, elapsedMs: 2500}})).total, 95);
  assert.equal(evaluateWork(completedWork({processVersion: 2, glazeDip: {version: 1, elapsedMs: 5000}, firing: []})).total, 90);
});

test('체크 표시만으로 설명 점수를 얻지 않고 유효한 평가 결과가 필요하다', () => {
  for (const explanation of ['', '    ', '좋아요']) {
    const result = evaluateWork(completedWork({ explanationUse: explanation, explanationBeauty: explanation }));
    assert.equal(result.self, 0);
    assert.equal(result.total, 80);
  }
  assert.equal(evaluateWork(completedWork({ selfUse: false, selfBeauty: false })).self, 20);
  assert.equal(evaluateWork(completedWork({assessment: null})).self, 0);
});

test('기존 30개와 예시 23개 주문은 모두 제작하고 만점 받을 수 있다', () => {
  assert.equal(SHAPES.length, 9);
  assert.equal(ORDERS.length, 53);
  assert.equal(new Set(ORDERS.map((order) => order.id)).size, ORDERS.length);
  assert.equal(new Set(ORDERS.map((order) => order.shape)).size, SHAPES.length);
  for (const shape of ['pillow','pitcher','incense','stool','maebyeong']) assert.equal(ORDERS.slice(0,30).filter(order=>order.shape===shape).length,6,shape);
  for (const order of ORDERS) {
    assert.ok(SHAPES.some((shape) => shape.id === order.shape));
    assert.ok(['king', 'noble', 'noblewoman'].includes(order.kind));
    assert.ok(order.technique === 'any' || TECHNIQUES.some((technique) => technique.id === order.technique));
    assert.ok(order.pattern === 'any' || PATTERNS.some((pattern) => pattern.id === order.pattern));
    const result = evaluateWork(completedWork({
      orderId: order.id, shape: order.shape, modelId: order.modelId,
      placements: orderStamps(order),
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

test('두 순환을 뽑아도 각 순환에는 중복이 없고 경계에서 직전 주문을 반복하지 않는다', () => {
  let seed = 17;
  const rng = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const history = [];
  for (let index = 0; index < ORDERS.length*2; index += 1) {
    const order = drawNextOrder(history, rng);
    assert.ok(ORDERS.some((item) => item.id === order.id));
    assert.ok(!history.slice(-2).includes(order.id));
    history.push(order.id);
  }
  assert.equal(new Set(history.slice(0, ORDERS.length)).size, ORDERS.length);
  assert.equal(new Set(history.slice(ORDERS.length)).size, ORDERS.length);
});

test('고정 난수를 사용해도 세 번의 순환과 순환 경계의 최근 주문 회피가 유지된다', () => {
  const history = [];
  for (let index = 0; index < ORDERS.length*3; index += 1) {
    const order = drawNextOrder(history, () => 0);
    assert.ok(!history.slice(-2).includes(order.id));
    history.push(order.id);
  }
  for (let start = 0; start < ORDERS.length*3; start += ORDERS.length) assert.equal(new Set(history.slice(start, start + ORDERS.length)).size, ORDERS.length);
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

test('평가받지 않은 사용자 HTML은 점수를 주거나 피드백에 그대로 출력하지 않는다', () => {
  const explanation = '<img src=x onerror=alert(1)>';
  const result = evaluateWork(completedWork({ explanationUse: explanation, assessment: null }));
  assert.equal(result.self, 0);
  assert.ok(!JSON.stringify(result).includes(explanation));
  assert.match(result.breakdown.find((row) => row.key === 'selfUse').feedback, /모양|문양|쓰임/);
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

test('직접 그린 문양은 학생이 정한 뜻으로 주문 조건을 확인한다', () => {
  const strokes = [{points: [{point:[0,0,1]}, {point:[.2,.1,1]}]}];
  // The order asks for three cranes and two clouds: a drawing named 학 stands for the cranes, the clouds are stamped.
  const clouds = stamps({cloud: 2});
  assert.equal(evaluateWork(completedWork({placements:clouds, strokes, drawingLabel:'crane'})).objective,80);
  assert.equal(evaluateWork(completedWork({placements:clouds, strokes, drawingLabel:'cloud'})).objective,70);
  assert.equal(evaluateWork(completedWork({placements:clouds, strokes, recognition:{id:'crane'}})).objective,70);
  assert.equal(evaluateWork(completedWork({placements:[], strokes, drawingLabel:'crane'})).objective,70,'the clouds are still missing');
});

test('각 도장의 무늬를 보존하고 마지막 선택만으로 기존 무늬를 바꾸지 않는다', () => {
  assert.equal(evaluateWork(completedWork({pattern:'cloud',placements:stamps({crane:3,cloud:2})})).objective,80);
  assert.equal(evaluateWork(completedWork({pattern:'crane',placements:stamps({cloud:5})})).objective,70);
});


test('23개 예시는 빠짐없이 제작 형태와 주문에 연결된다',()=>{
 assert.equal(EXAMPLE_DESIGNS.length,MODEL_CATALOG.length);
 for(const model of MODEL_CATALOG){const design=EXAMPLE_DESIGNS.find(d=>d.modelId===model.id);assert.ok(design,model.id);assert.ok(SHAPES.some(s=>s.id===design.shape));assert.ok(ORDERS.some(o=>o.modelId===model.id));}
});

test('오리 연적과 오리 향로는 다른 쓰임으로 평가한다',()=>{
 const work=completedWork({orderId:'example-duckDropper',shape:'incense',modelId:'duckIncense',technique:'plain',placements:[]});
 assert.equal(evaluateWork(work).objective,30);
 assert.equal(evaluateWork({...work,shape:'duckDropper',modelId:'duckDropper'}).objective,80);
});

test('조롱박 주전자와 병, 같은 분류의 다른 예시도 구별한다',()=>{
 const work=completedWork({orderId:'example-poemGourdBottle',shape:'gourdBottle',modelId:'gourdBottle',placements:stamps({text:2,lotus:2})});
 assert.equal(evaluateWork(work).objective,70);
 assert.equal(evaluateWork({...work,modelId:'poemGourdBottle'}).objective,80);
});

test('복합 무늬 주문은 모든 무늬가 있어야 하고 마지막 선택만 바꾸어 채울 수 없다',()=>{
 const work=completedWork({orderId:'example-plumBambooMaebyeong',shape:'maebyeong',modelId:'plumBambooMaebyeong',pattern:'bamboo',placements:stamps({plum:2,crane:1})});
 assert.equal(evaluateWork(work).objective,70);
 assert.equal(evaluateWork({...work,placements:[...work.placements,{x:160,y:180,pattern:'bamboo'}]}).objective,80);
});

test('무늬 주문은 두 가지 이상의 무늬를 말하되 몇 개씩 넣을지는 정하지 않는다',()=>{
 for(const order of ORDERS){
  const motifs=orderMotifs(order),request=motifRequest(order,{archaic:true});
  // No order tells how many motifs to place: that is the maker's choice (the bench asks for four of two kinds).
  for(const text of [orderQuote(order),order.quote,request])assert.doesNotMatch(text.replace('위치와 개수는','위치와 수는'),/\d\s*개|개수|몇 개/,`${order.id}: ${text}`);
  if(order.pattern==='any'||order.technique==='plain'){assert.deepEqual(motifs,[],order.id);continue;}
  assert.ok(motifs.length>=MIN_MOTIF_KINDS&&motifs.length<=3,order.id);assert.equal(motifs[0].pattern,order.pattern,order.id);
  assert.equal(new Set(motifs.map(motif=>motif.pattern)).size,motifs.length,order.id);
  for(const motif of motifs){assert.ok(PATTERNS.some(pattern=>pattern.id===motif.pattern),order.id);assert.equal('count' in motif,false);
   // The customer names each kind, and the plain-style text of the order does too.
   for(const text of [orderQuote(order),order.quote])assert.ok(text.includes(motif.name),`${order.id}: ${text}`);}
 }
 assert.equal(orderQuote(ORDERS[0]),'누워서 쉴 때 머리를 받칠 것이 필요하오. 학 무늬를 다른 색의 흙으로 넣어 주시오. 무늬는 학에 구름을 곁들여 주시오.');
 // 을/를 and 와/과 follow the last sound of the pattern's name.
 const request=id=>motifRequest(ORDERS.find(order=>order.id===id));
 assert.deepEqual([request('example-plumBambooMaebyeong'),request('noble-lotus-rest'),request('lady-crane-vessel'),request('example-poemGourdBottle')],
  ['무늬는 매화에 대나무와 학을 곁들여 주세요.','무늬는 연꽃에 버드나무를 곁들여 주세요.','무늬는 학에 매화를 곁들여 주세요.','무늬는 글자에 연꽃을 곁들여 주세요.']);
 // A free order says only that a decorated work mixes two kinds; a plain order asks for none.
 assert.equal(motifRequest(ORDERS.find(order=>order.id==='royal-fragrance'),{archaic:true}),'구멍무늬는 두 가지 모양을 섞어 뚫어 주시오.');
 assert.equal(motifRequest(ORDERS.find(order=>order.id==='noble-banquet'),{archaic:true}),'무늬를 넣는다면 두 가지를 섞어 넣어 주시오.');
 assert.equal(request('example-pitcher'),'');
 // Cranes and clouds were ordered: each kind once is enough, however many; a missing kind is not.
 assert.equal(evaluateWork(completedWork({placements:stamps({crane:1,cloud:1})})).total,100);
 assert.equal(evaluateWork(completedWork({placements:stamps({crane:4,cloud:1,lotus:2})})).total,100,'more, and another kind besides, still fills the order');
 const missing=evaluateWork(completedWork({placements:stamps({crane:4})}));
 assert.equal(missing.total,90);assert.match(missing.breakdown.find(row=>row.key==='design').feedback,/주문에 있는 학·구름를 다시 확인해 보세요/);
});

test('무늬 작업대는 두 가지 이상의 무늬를 네 개 이상 넣어야 다음 순서로 넘어간다',()=>{
 assert.deepEqual([MIN_MOTIFS,MIN_MOTIF_KINDS],[4,2]);
 const bench=(placements,more={})=>decorationProgress({technique:'inlay',pattern:'crane',placements,strokes:[],...more});
 assert.deepEqual(bench([]),{total:0,kinds:0,needed:4,neededKinds:2,ready:false});
 assert.equal(bench(stamps({crane:1})).ready,false);
 assert.deepEqual(bench(stamps({crane:4})),{total:4,kinds:1,needed:4,neededKinds:2,ready:false},'four of one kind are not enough');
 assert.deepEqual(bench(stamps({crane:2,cloud:1})),{total:3,kinds:2,needed:4,neededKinds:2,ready:false},'two kinds but only three');
 assert.equal(bench(stamps({crane:3,cloud:1})).ready,true);assert.equal(bench(stamps({crane:2,cloud:2,lotus:1})).ready,true);
 // A stamp without its own pattern takes the work's; a drawing is one motif of the pattern it is named (its own kind unnamed).
 assert.equal(bench([{x:1,y:1},{x:2,y:1},{x:3,y:1},{x:4,y:1,pattern:'cloud'}]).ready,true);
 const strokes=[{points:[{point:[0,0,1]},{point:[.2,.1,1]}]},{points:[{point:[0,0,1]},{point:[.3,.1,1]}]}];
 assert.deepEqual([bench(stamps({crane:3}),{strokes,drawingLabel:'cloud'}).ready,bench(stamps({crane:3}),{strokes}).ready,bench(stamps({crane:3}),{strokes,drawingLabel:'crane'}).ready],[true,true,false]);
 assert.equal(workMotifCounts({technique:'inlay',placements:stamps({crane:2}),strokes,drawingLabel:'crane'}).counts.get('crane'),3);
 assert.equal(bench([],{strokes}).ready,false,'a drawing alone is one motif');
 // 무문 needs no motif; openwork follows the same rule as inlay.
 assert.equal(decorationProgress({technique:'plain',placements:[],strokes:[]}).ready,true);
 assert.equal(decorationProgress({technique:'openwork',pattern:'lotus',placements:stamps({lotus:2,cloud:2}),strokes:[]}).ready,true);
 for(const broken of [undefined,null,{},{technique:'inlay',placements:null,strokes:null}])assert.equal(decorationProgress(broken).ready,false);
});
