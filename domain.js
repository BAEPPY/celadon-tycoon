import {explanationScores} from './assessment-rules.js';
import {EXAMPLE_ORDERS} from './example-orders.js';
/**
 * 수업용 고려청자 공방의 내용과 평가 규칙.
 * 주문은 학습을 위해 구성한 가상 상황이며 유물의 실제 주문 기록이 아니다.
 * 객관적 조건 80점과 쓰임·솜씨 설명 평가 20점을 구분한다.
 */
export const SHAPES = [
  {id:'chrysanthemumCup',name:'청자 잔',use:'음료를 담아 마십니다.',feature:'넓은 입과 속이 빈 공간을 살펴보세요.'},
  {id:'cupStand',name:'청자 잔과 받침',use:'잔에 음료를 담아 마시고 받침에 올려 둡니다.',feature:'잔과 아래 받침을 함께 살펴보세요.'},
  {id:'duckDropper',name:'청자 연적',use:'먹을 갈 때 벼루에 조금씩 부을 물을 담습니다.',feature:'물 넣는 구멍과 물 나오는 구멍을 찾아보세요.'},
  {id:'gourdBottle',name:'청자 조롱박 병',use:'내용물을 담아 둡니다.',feature:'잘록한 몸통과 입, 별도 손잡이·주둥이가 없는 점을 살펴보세요.'},

  { id: 'pillow', name: '청자 베개', use: '누워서 쉴 때 머리를 받칩니다.', feature: '머리를 받칠 수 있는 형태와 표면의 무늬를 살펴보세요.' },
  { id: 'pitcher', name: '청자 주전자', use: '물이나 술 같은 액체를 담아 따릅니다.', feature: '몸통, 손잡이, 주둥이가 하는 일을 살펴보세요.' },
  { id: 'incense', name: '청자 향로', use: '향을 피웁니다.', feature: '뚜껑의 뚫린 부분은 향 연기가 나오는 통로가 됩니다.' },
  { id: 'stool', name: '청자 의자', use: '사람이 앉을 때 사용합니다.', feature: '앉는 면과 몸체의 뚫린 무늬를 살펴보세요.' },
  { id: 'maebyeong', name: '청자 매병', use: '내용물을 담아 두는 데 사용합니다.', feature: '좁은 입, 풍성한 어깨, 아래로 좁아지는 곡선을 살펴보세요.' },
];

export const ORDERS = [
  {
    id: 'royal-rest', customer: '왕실의 주문', kind: 'king', title: '편안한 쉼을 위한 청자',
    quote: '누워서 쉴 때 머리를 받칠 것이 필요하오. 학 무늬를 다른 색의 흙으로 넣어 주시오.',
    shape: 'pillow', pattern: 'crane', technique: 'inlay',
    hint: '머리를 받치는 쓰임에 맞는 형태를 고르고, 무늬를 파서 다른 색 흙을 넣는 기법을 떠올려 보세요.',
  },
  {
    id: 'noble-banquet', customer: '귀족의 주문', kind: 'noble', title: '연회에 필요한 청자',
    quote: '손님들에게 물을 따르려고 합니다. 잡기 편한 손잡이와 물을 따르는 주둥이가 필요해요. 장식은 맡길게요.',
    shape: 'pitcher', pattern: 'any', technique: 'any',
    hint: '액체를 담는 것에 더해, 잡고 따르기 편한 형태가 무엇인지 생각해 보세요.',
  },
  {
    id: 'royal-fragrance', customer: '왕실의 주문', kind: 'king', title: '은은한 향을 위한 청자',
    quote: '방 안에서 향을 피우려고 하오. 향 연기가 나올 수 있도록 뚜껑에 구멍을 뚫어 주시오.',
    shape: 'incense', pattern: 'any', technique: 'openwork',
    hint: '향을 피우는 쓰임과 구멍을 뚫어 무늬를 나타내는 기법을 연결해 보세요.',
  },
  {
    id: 'noble-garden', customer: '귀족의 주문', kind: 'noble', title: '앉아서 쉬기 위한 청자',
    quote: '정원을 바라보며 앉아 쉴 것이 필요합니다. 몸체에는 뚫린 무늬를 넣어 주세요.',
    shape: 'stool', pattern: 'any', technique: 'openwork',
    hint: '사람이 앉을 수 있는 형태인지 살펴보세요. 몸체를 뚫어 나타낸 무늬는 무엇이라고 할까요?',
  },
  {
    id: 'noble-vessel', customer: '귀족의 주문', kind: 'noble', title: '내용물을 담을 청자',
    quote: '내용물을 담아 둘 병이 필요합니다. 입은 좁고 어깨는 풍성했으면 좋겠어요. 구름 무늬도 넣어 주세요.',
    shape: 'maebyeong', pattern: 'cloud', technique: 'any',
    hint: '입과 어깨의 모양을 살펴보세요. 어떤 내용을 담았는지는 유물과 자료에 따라 다를 수 있어요.',
  },
  {
    id: 'lady-cloud-rest', customer: '귀족 부인의 주문', kind: 'noblewoman', title: '구름과 함께 쉬는 시간',
    quote: '누워서 머리를 받칠 물건이 필요해요. 구름 무늬를 파고 다른 색 흙으로 채워 주세요.',
    shape: 'pillow', pattern: 'cloud', technique: 'inlay',
    hint: '머리를 받치는 형태와, 파인 무늬에 다른 흙을 넣는 기법을 함께 생각해 보세요.',
  },
  {
    id: 'noble-lotus-rest', customer: '귀족의 주문', kind: 'noble', title: '연꽃 무늬의 쉼',
    quote: '잠잘 때 머리를 받치려고 합니다. 다른 색의 흙을 넣은 연꽃 무늬로 꾸며 주세요.',
    shape: 'pillow', pattern: 'lotus', technique: 'inlay',
    hint: '앉는 물건과 머리를 받치는 물건의 모양은 어떻게 다를까요?',
  },
  {
    id: 'royal-quiet-rest', customer: '왕실의 주문', kind: 'king', title: '잠시 누워 쉬고 싶소',
    quote: '잠시 누워 쉴 때 머리를 받칠 것이 필요하오. 모양을 잘 다듬고, 장식은 그대가 정해 보시오.',
    shape: 'pillow', pattern: 'any', technique: 'any',
    hint: '머리를 안정적으로 받칠 수 있는 형태를 고른 뒤, 장식은 자유롭게 정해 보세요.',
  },
  {
    id: 'lady-crane-rest', customer: '귀족 부인의 주문', kind: 'noblewoman', title: '학 무늬와 함께하는 휴식',
    quote: '누워 쉴 때 머리 아래에 둘 것이 필요해요. 날아가는 학 무늬를 넣어 주실래요?',
    shape: 'pillow', pattern: 'crane', technique: 'any',
    hint: '어디에 받쳐 두는 물건인지 생각하고, 학 무늬를 표현할 방법을 선택해 보세요.',
  },
  {
    id: 'noble-cloud-rest', customer: '귀족의 주문', kind: 'noble', title: '구름 무늬로 꾸민 휴식',
    quote: '머리를 받치고 누워 쉴 물건을 부탁합니다. 구름 무늬의 위치와 개수는 맡길게요.',
    shape: 'pillow', pattern: 'cloud', technique: 'any',
    hint: '쓰임에 맞는 기본 형태를 고르고, 구름 무늬가 잘 보이도록 배치해 보세요.',
  },
  {
    id: 'royal-crane-pour', customer: '왕실의 주문', kind: 'king', title: '학 무늬로 차린 연회',
    quote: '연회에서 물을 따르려고 하오. 손잡이와 주둥이를 만들고, 학 무늬는 다른 색 흙으로 넣어 주시오.',
    shape: 'pitcher', pattern: 'crane', technique: 'inlay',
    hint: '물을 담고 따르는 기능을 살리면서 상감 무늬를 나타내 보세요.',
  },
  {
    id: 'lady-cloud-pour', customer: '귀족 부인의 주문', kind: 'noblewoman', title: '손님에게 물을 따라요',
    quote: '손님께 물을 따라 드릴 물건이 필요해요. 구름 무늬를 파서 다른 색 흙으로 채워 주세요.',
    shape: 'pitcher', pattern: 'cloud', technique: 'inlay',
    hint: '잡는 손잡이와 물이 나오는 주둥이가 있는 형태를 찾아보세요.',
  },
  {
    id: 'noble-lotus-pour', customer: '귀족의 주문', kind: 'noble', title: '연꽃을 담은 술자리',
    quote: '연회에서 술을 담아 따르려고 합니다. 손잡이를 달고 연꽃 무늬를 상감으로 넣어 주세요.',
    shape: 'pitcher', pattern: 'lotus', technique: 'inlay',
    hint: '액체가 새지 않으면서 손으로 잡고 따르기 편한 형태를 생각해 보세요.',
  },
  {
    id: 'royal-cloud-pour', customer: '왕실의 주문', kind: 'king', title: '구름 무늬의 물 따르개',
    quote: '손잡이를 잡고 물을 따를 수 있어야 하오. 몸통에는 구름 무늬를 넣어 주시오.',
    shape: 'pitcher', pattern: 'cloud', technique: 'any',
    hint: '몸통에 물을 담아야 하므로 장식할 때도 물이 새지 않는지 생각해 보세요.',
  },
  {
    id: 'lady-crane-pour', customer: '귀족 부인의 주문', kind: 'noblewoman', title: '물을 따르는 학 무늬 청자',
    quote: '손님들의 잔에 물을 따를 물건을 부탁해요. 손잡이와 주둥이가 있고, 학 무늬도 보이면 좋겠어요.',
    shape: 'pitcher', pattern: 'crane', technique: 'any',
    hint: '담아 두는 병과 물을 따르는 도구의 모양을 비교해 보세요.',
  },
  {
    id: 'lady-lotus-fragrance', customer: '귀족 부인의 주문', kind: 'noblewoman', title: '연꽃 사이로 피어나는 향',
    quote: '방 안에서 향을 피우고 싶어요. 뚜껑에 연꽃 모양의 구멍무늬를 뚫어 주세요.',
    shape: 'incense', pattern: 'lotus', technique: 'openwork',
    hint: '향을 피우는 몸체와 연기가 나올 뚜껑을 살펴보세요.',
  },
  {
    id: 'noble-cloud-fragrance', customer: '귀족의 주문', kind: 'noble', title: '구름처럼 오르는 향',
    quote: '향을 피울 물건을 부탁합니다. 연기가 나오도록 뚜껑에 구름 모양을 뚫어 주세요.',
    shape: 'incense', pattern: 'cloud', technique: 'openwork',
    hint: '표면을 뚫어 무늬를 나타내는 기법은 어떤 쓰임에도 도움이 될까요?',
  },
  {
    id: 'royal-crane-fragrance', customer: '왕실의 주문', kind: 'king', title: '학 무늬 사이로 흐르는 향',
    quote: '향을 피우려 하오. 뚜껑에 학 무늬를 뚫어 향 연기가 나올 길을 내 주시오.',
    shape: 'incense', pattern: 'crane', technique: 'openwork',
    hint: '물이나 술을 담는 도구가 아니라, 향을 피우는 도구가 필요해요.',
  },
  {
    id: 'lady-evening-fragrance', customer: '귀족 부인의 주문', kind: 'noblewoman', title: '저녁에 피우는 향',
    quote: '저녁에 방 안에서 향을 피우려고 해요. 연기가 빠져나갈 구멍무늬를 예쁘게 뚫어 주세요.',
    shape: 'incense', pattern: 'any', technique: 'openwork',
    hint: '무늬는 자유롭게 고르되, 뚫린 부분이 필요한 까닭을 설명해 보세요.',
  },
  {
    id: 'noble-lotus-fragrance', customer: '귀족의 주문', kind: 'noble', title: '향을 위한 연꽃 뚜껑',
    quote: '향을 담아 피울 물건이 필요합니다. 뚜껑에는 연꽃 무늬를 뚫어 넣어 주세요.',
    shape: 'incense', pattern: 'lotus', technique: 'openwork',
    hint: '향 연기의 통로가 되는 구멍과 무늬의 아름다움을 함께 생각해 보세요.',
  },
  {
    id: 'royal-cloud-seat', customer: '왕실의 주문', kind: 'king', title: '구름 무늬에 앉아 쉬리다',
    quote: '정원을 보며 앉아 쉴 것이 필요하오. 몸체에는 구름 모양의 구멍무늬를 뚫어 주시오.',
    shape: 'stool', pattern: 'cloud', technique: 'openwork',
    hint: '머리를 받치는 물건이 아니라 사람이 앉을 수 있는 형태를 골라 보세요.',
  },
  {
    id: 'lady-lotus-seat', customer: '귀족 부인의 주문', kind: 'noblewoman', title: '연꽃을 보며 쉬는 자리',
    quote: '연못을 바라보며 앉을 것이 필요해요. 몸체에 연꽃 모양을 뚫어 꾸며 주세요.',
    shape: 'stool', pattern: 'lotus', technique: 'openwork',
    hint: '앉는 윗면과 장식하는 몸체를 구분해 살펴보세요.',
  },
  {
    id: 'noble-crane-seat', customer: '귀족의 주문', kind: 'noble', title: '학 무늬로 꾸민 자리',
    quote: '손님과 이야기를 나누며 앉을 물건을 부탁합니다. 몸체에 학 무늬를 뚫어 넣어 주세요.',
    shape: 'stool', pattern: 'crane', technique: 'openwork',
    hint: '사람이 앉는 쓰임을 떠올리고, 투각으로 학 무늬를 나타내 보세요.',
  },
  {
    id: 'royal-courtyard-seat', customer: '왕실의 주문', kind: 'king', title: '뜰에서 쉬는 자리',
    quote: '뜰에서 잠시 앉아 쉬고 싶소. 몸체에 뚫린 무늬를 넣되, 무늬의 모양은 그대에게 맡기겠소.',
    shape: 'stool', pattern: 'any', technique: 'openwork',
    hint: '앉는 데 알맞은 형태를 고르고 원하는 구멍무늬를 배치해 보세요.',
  },
  {
    id: 'lady-cloud-seat', customer: '귀족 부인의 주문', kind: 'noblewoman', title: '정원에서 쉬고 싶어요',
    quote: '정원에서 앉아 꽃을 볼 물건이 필요해요. 몸체에는 구름 무늬를 뚫어 주세요.',
    shape: 'stool', pattern: 'cloud', technique: 'openwork',
    hint: '꽃을 담는 도구가 아니라 꽃을 보며 사람이 앉는 도구예요.',
  },
  {
    id: 'royal-crane-vessel', customer: '왕실의 주문', kind: 'king', title: '학을 담은 둥근 어깨',
    quote: '내용물을 담아 둘 병이 필요하오. 입은 좁고 어깨는 풍성하게, 학 무늬는 상감으로 넣어 주시오.',
    shape: 'maebyeong', pattern: 'crane', technique: 'inlay',
    hint: '입과 어깨의 곡선을 살펴보고, 상감으로 학 무늬를 표현해 보세요.',
  },
  {
    id: 'lady-cloud-vessel', customer: '귀족 부인의 주문', kind: 'noblewoman', title: '구름 무늬가 있는 병',
    quote: '내용물을 담아 둘 병을 부탁해요. 좁은 입과 넓은 어깨에, 다른 색 흙으로 채운 구름 무늬를 넣어 주세요.',
    shape: 'maebyeong', pattern: 'cloud', technique: 'inlay',
    hint: '좁은 입 아래로 어깨가 풍성하게 벌어지는 형태를 찾아보세요.',
  },
  {
    id: 'noble-lotus-vessel', customer: '귀족의 주문', kind: 'noble', title: '연꽃 무늬를 새긴 병',
    quote: '입이 좁고 어깨가 넓은 병에 내용물을 담으려 합니다. 연꽃 무늬를 상감으로 넣어 주세요.',
    shape: 'maebyeong', pattern: 'lotus', technique: 'inlay',
    hint: '손잡이와 주둥이보다는 입과 어깨의 모양이 중요한 주문이에요.',
  },
  {
    id: 'lady-crane-vessel', customer: '귀족 부인의 주문', kind: 'noblewoman', title: '학 무늬의 넓은 어깨',
    quote: '내용물을 담을 병이 필요해요. 입은 좁게, 어깨는 넓게 만들고 학 무늬도 넣어 주세요.',
    shape: 'maebyeong', pattern: 'crane', technique: 'any',
    hint: '여러 병의 형태 중 주문에 나온 입과 어깨의 특징을 떠올려 보세요.',
  },
  {
    id: 'royal-simple-vessel', customer: '왕실의 주문', kind: 'king', title: '형태가 돋보이는 병',
    quote: '내용물을 담을 병을 부탁하오. 좁은 입과 풍성한 어깨를 잘 표현하시오. 장식은 자유롭게 정해 보시오.',
    shape: 'maebyeong', pattern: 'any', technique: 'any',
    hint: '무늬를 넣거나 넣지 않아도 좋아요. 입과 어깨, 곡선의 특징을 잘 나타내 보세요.',
  },
];

ORDERS.push(...EXAMPLE_ORDERS);

export const TECHNIQUES = [
  { id: 'inlay', name: '상감', description: '표면에 무늬를 파고 다른 색의 흙을 채운 뒤 표면을 정리해 무늬를 나타냅니다.' },
  { id: 'openwork', name: '투각', description: '표면을 뚫어 무늬를 나타냅니다. 향로에서는 뚫린 부분이 향 연기의 통로가 되기도 합니다.' },
  { id: 'plain', name: '무늬 없이 표현하기', description: '상감이나 투각 무늬 없이 형태의 곡선과 청자의 빛깔을 살립니다. 모든 고려청자에 상감 무늬가 있는 것은 아닙니다.' },
];

export const PATTERNS = [
  {id:'peony',name:'모란',reading:'목단',hanja:'牡丹'},
  {id:'chrysanthemum',name:'국화',reading:'국화',hanja:'菊花'},
  {id:'plum',name:'매화',reading:'매',hanja:'梅'},
  {id:'bamboo',name:'대나무',reading:'죽',hanja:'竹'},
  {id:'willow',name:'버드나무',reading:'류',hanja:'柳'},
  {id:'grape',name:'포도',reading:'포도',hanja:'葡萄'},
  {id:'wildflower',name:'풀꽃',reading:'초화',hanja:'草花'},
  {id:'text',name:'글자',reading:'문자',hanja:'文字'},
  {id:'crane',name:'학',reading:'학',hanja:'鶴'},
  {id:'cloud',name:'구름',reading:'운',hanja:'雲'},
  {id:'lotus',name:'연꽃',reading:'연',hanja:'蓮'},
];

export const FIRING = [
  { id: 'dry', name: '건조', description: '빚고 장식한 청자를 충분히 말립니다.' },
  { id: 'biscuit', name: '초벌구이', description: '말린 청자를 먼저 한 번 굽습니다.' },
  { id: 'glaze', name: '유약 바르기', description: '초벌구이한 청자에 유약을 입힙니다.' },
  { id: 'fire', name: '재벌구이', description: '유약을 입힌 청자를 다시 구워 빛깔과 표면을 완성합니다.' },
];

const shapeById = new Map(SHAPES.map((item) => [item.id, item]));
const orderById = new Map(ORDERS.map((item) => [item.id, item]));
const techniqueById = new Map(TECHNIQUES.map((item) => [item.id, item]));
const patternById = new Map(PATTERNS.map((item) => [item.id, item]));
const firingOrder = FIRING.map((item) => item.id);

/**
 * Draw one order from the current catalog bag without changing the caller's history.
 * History must be oldest first; append the returned id once when accepting it.
 * Each consecutive group of ORDERS.length valid ids forms a cycle. A new cycle avoids
 * the last two orders so the customer does not immediately repeat at its edge.
 */
export function drawNextOrder(history = [], rng = Math.random) {
  const previous = Array.isArray(history)
    ? history.filter((id) => typeof id === 'string' && orderById.has(id))
    : [];
  const cycleSize = ORDERS.length;
  const usedInCycle = previous.length % cycleSize;
  const used = new Set(usedInCycle ? previous.slice(-usedInCycle) : []);
  const recent = new Set(previous.slice(-2));
  const remaining = ORDERS.filter((item) => !used.has(item.id));
  const preferred = remaining.filter((item) => !recent.has(item.id));
  const options = preferred.length ? preferred : remaining;
  const lastShape = orderById.get(previous.at(-1))?.shape;
  const differentUse = options.filter(item => item.shape !== lastShape);
  const pool = differentUse.length ? differentUse : options;
  const value = typeof rng === 'function' ? Number(rng()) : Math.random();
  const unit = Number.isFinite(value) ? Math.min(1 - Number.EPSILON, Math.max(0, value)) : 0;
  return pool[Math.floor(unit * pool.length)];
}

/** No student's free text is interpolated into feedback or interpreted as HTML. */
export function evaluateWork(work = {}) {
  const input = work && typeof work === 'object' ? work : {};
  const order = orderById.get(input.orderId);
  const shapeCorrect = Boolean(order && input.shape === order.shape);
  const decorated = input.decorDone === true;
  const firingCorrect = Array.isArray(input.firing)
    && input.firing.length === firingOrder.length
    && firingOrder.every((id, index) => input.firing[index] === id);
  const validTechnique = techniqueById.has(input.technique);
  const validPlacements = Array.isArray(input.placements) && input.placements.some((point) =>
    point && Number.isFinite(point.x) && Number.isFinite(point.y));
  const drawn = Array.isArray(input.strokes) && input.strokes.some(s => Array.isArray(s.points) && s.points.length > 1);
  const stamped = validPlacements;
  const drawingPattern = patternById.has(input.drawingLabel) ? input.drawingLabel : null;
  const requiredPatterns = order?.requiredPatterns || (order?.pattern === 'any' ? [] : [order?.pattern]);
  const patternCorrect = Boolean(order && requiredPatterns.every(pattern => (stamped && input.placements.some(p => p && (p.pattern || input.pattern) === pattern)) || (drawn && drawingPattern === pattern)));
  const modelCorrect = !order?.modelId || (input.modelId || input.shape) === order.modelId;
  const techniqueCorrect = Boolean(order && validTechnique
    && (order.technique === 'any' || input.technique === order.technique));
  // This game's liquid containers have one wall: piercing its body would let water escape.
  // This does not rule out historical openwork vessels with a separate inner wall.
  const holdsWater = !(['pitcher','gourdBottle','duckDropper','chrysanthemumCup','cupStand','maebyeong'].includes(input.shape) && input.technique === 'openwork');
  const decorationAppropriate = holdsWater && (input.technique === 'plain'
    ? Boolean(order && order.pattern === 'any')
    : Boolean(validTechnique && (validPlacements || drawn) && (patternById.has(input.pattern) || patternById.has(drawingPattern))));
  const designCorrect = patternCorrect && techniqueCorrect && decorationAppropriate && modelCorrect;
  const explanation = explanationScores(input);

  const designFeedback = [];
  if (!order) designFeedback.push('먼저 주문을 선택해 주세요.');
  else {
    if (!modelCorrect) designFeedback.push('같은 쓰임의 다른 형태를 골랐어요. 주문의 참고 예시와 내가 고른 세부 형태를 다시 비교해 보세요.');
    if (!patternCorrect) designFeedback.push(`주문에 있는 ${requiredPatterns.map(id => patternById.get(id)?.name).join('·') ?? '무늬'}를 다시 확인해 보세요.`);
    if (!techniqueCorrect) designFeedback.push(order.technique === 'any'
      ? '표현할 제작 기법을 선택해 주세요.'
      : `이 주문에는 ${techniqueById.get(order.technique).name} 기법이 필요해요.`);
    if (!decorationAppropriate) designFeedback.push(!holdsWater
      ? '지금 만든 그릇의 몸통 구멍으로 물이 샐 수 있어요. 물을 담을 수 있게 상감이나 무늬 없는 표현을 골라 보세요.'
      : input.technique === 'plain'
        ? '이 주문에는 무늬가 필요해요. 무늬를 표현할 기법을 선택해 보세요.'
        : '무늬와 배치를 선택해 주문에 맞게 표현해 보세요.');
  }

  const breakdown = [
    {
      key: 'use', label: '쓰임에 맞는 형태', score: shapeCorrect ? 40 : 0, max: 40,
      feedback: shapeCorrect
        ? '주문에 필요한 쓰임과 형태를 잘 연결했어요.'
        : order
          ? `이 주문에는 ${shapeById.get(order.shape).name}의 쓰임이 어울려요. 주문에서 무엇을 하려는지 다시 읽고 형태를 바꿔 보세요.`
          : '주문을 선택하고 필요한 쓰임에 맞는 형태를 골라 주세요.',
    },
    {
      key: 'process', label: '제작 과정 확인', score: (decorated ? 10 : 0) + (firingCorrect ? 20 : 0), max: 30,
      feedback: decorated && firingCorrect
        ? '장식을 마무리하고 건조 → 초벌구이 → 유약 바르기 → 재벌구이 순서를 확인했어요.'
        : [!decorated ? '선택한 표현 방법의 제작 단계를 마무리해 주세요.' : '',
          !firingCorrect ? '건조 → 초벌구이 → 유약 바르기 → 재벌구이 순서로 다시 확인해 보세요.' : ''].filter(Boolean).join(' '),
    },
    {
      key: 'design', label: '주문의 세부 형태·기법·무늬', score: designCorrect ? 10 : 0, max: 10,
      feedback: designCorrect ? '주문의 기법과 무늬 조건을 충족했어요. 아름다움의 순위를 매긴 점수는 아니에요.' : designFeedback.join(' '),
    },
    {
      key: 'selfUse', label: '이유 설명: 쓰임과 모양', score: explanation.use.score, max: 10,
      feedback: explanation.use.feedback,
    },
    {
      key: 'selfBeauty', label: '이유 설명: 솜씨와 효과', score: explanation.beauty.score, max: 10,
      feedback: explanation.beauty.feedback,
    },
  ];
  const objective = breakdown.slice(0, 3).reduce((sum, item) => sum + item.score, 0);
  const self = breakdown.slice(3).reduce((sum, item) => sum + item.score, 0);
  const total = objective + self;
  const message = total === 100
    ? '주문과 제작 과정을 맞추고, 쓰임과 솜씨의 이유도 명확하게 설명했어요!'
    : '주문과 제작 과정, 설명의 이유를 살펴보고 더 알맞게 고쳐 볼 수 있어요.';
  return { total, objective, self, explanation: self, assessmentSource: explanation.source, breakdown, message };
}
