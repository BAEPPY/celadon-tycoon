/**
 * 수업용 고려청자 공방의 내용과 평가 규칙.
 * 주문은 학습을 위해 구성한 가상 상황이며 유물의 실제 주문 기록이 아니다.
 * 객관적 조건 80점과 학생의 자기 점검 20점을 구분한다.
 */
export const SHAPES = [
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
];

export const TECHNIQUES = [
  { id: 'inlay', name: '상감', description: '표면에 무늬를 파고 다른 색의 흙을 채운 뒤 표면을 정리해 무늬를 나타냅니다.' },
  { id: 'openwork', name: '투각', description: '표면을 뚫어 무늬를 나타냅니다. 향로에서는 뚫린 부분이 향 연기의 통로가 되기도 합니다.' },
  { id: 'plain', name: '무늬 없이 표현하기', description: '상감이나 투각 무늬 없이 형태의 곡선과 청자의 빛깔을 살립니다. 모든 고려청자에 상감 무늬가 있는 것은 아닙니다.' },
];

export const PATTERNS = [
  { id: 'crane', name: '학' },
  { id: 'cloud', name: '구름' },
  { id: 'lotus', name: '연꽃' },
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
  const patternCorrect = Boolean(order && (order.pattern === 'any' || input.pattern === order.pattern));
  const techniqueCorrect = Boolean(order && validTechnique
    && (order.technique === 'any' || input.technique === order.technique));
  // This game's pitcher has one wall: piercing its body would let water escape.
  // This does not rule out historical openwork vessels with a separate inner wall.
  const holdsWater = !(input.shape === 'pitcher' && input.technique === 'openwork');
  const decorationAppropriate = holdsWater && (input.technique === 'plain'
    ? Boolean(order && order.pattern === 'any')
    : Boolean(validTechnique && validPlacements && patternById.has(input.pattern)));
  const designCorrect = patternCorrect && techniqueCorrect && decorationAppropriate;
  const hasExplanation = (value) => typeof value === 'string' && value.trim().length >= 6;
  const selfUse = input.selfUse === true && hasExplanation(input.explanationUse);
  const selfBeauty = input.selfBeauty === true && hasExplanation(input.explanationBeauty);

  const designFeedback = [];
  if (!order) designFeedback.push('먼저 주문을 선택해 주세요.');
  else {
    if (!patternCorrect) designFeedback.push(`주문에 있는 ${patternById.get(order.pattern)?.name ?? '무늬'}를 다시 확인해 보세요.`);
    if (!techniqueCorrect) designFeedback.push(order.technique === 'any'
      ? '표현할 제작 기법을 선택해 주세요.'
      : `이 주문에는 ${techniqueById.get(order.technique).name} 기법이 필요해요.`);
    if (!decorationAppropriate) designFeedback.push(!holdsWater
      ? '지금 만든 주전자 몸통의 구멍으로 물이 샐 수 있어요. 물을 담을 수 있게 상감이나 무늬 없는 표현을 골라 보세요.'
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
      key: 'design', label: '주문의 기법·무늬 조건', score: designCorrect ? 10 : 0, max: 10,
      feedback: designCorrect ? '주문의 기법과 무늬 조건을 충족했어요. 아름다움의 순위를 매긴 점수는 아니에요.' : designFeedback.join(' '),
    },
    {
      key: 'selfUse', label: '자기 점검: 쓰임 설명', score: selfUse ? 10 : 0, max: 10,
      feedback: selfUse
        ? '쓰임을 설명하고 스스로 확인했어요. 설명의 정확성은 선생님과 함께 살펴봐요.'
        : '어떤 때 어떻게 쓰는지 여섯 글자 이상으로 설명하고, 내용을 읽은 뒤 자기 점검에 표시해 주세요.',
    },
    {
      key: 'selfBeauty', label: '자기 점검: 우수성 설명', score: selfBeauty ? 10 : 0, max: 10,
      feedback: selfBeauty
        ? '빛깔·형태·제작 기법 중 우수한 점을 설명하고 스스로 확인했어요. 설명의 정확성은 선생님과 함께 살펴봐요.'
        : '빛깔·형태·제작 기법에서 찾은 우수성을 여섯 글자 이상으로 설명하고 자기 점검에 표시해 주세요.',
    },
  ];
  const objective = breakdown.slice(0, 3).reduce((sum, item) => sum + item.score, 0);
  const self = breakdown.slice(3).reduce((sum, item) => sum + item.score, 0);
  const total = objective + self;
  const message = total === 100
    ? '주문 조건과 제작 과정을 모두 확인했어요! 자기 점검 20점은 설명을 쓰고 확인한 기록이며, 설명의 뜻을 자동으로 채점한 결과는 아니에요.'
    : '주문과 제작 과정을 다시 살펴보고 고쳐 볼 수 있어요. 아래 의견을 읽고 필요한 부분을 수정해 보세요. 자기 점검 점수는 설명의 뜻을 자동 채점하지 않아요.';
  return { total, objective, self, breakdown, message };
}
