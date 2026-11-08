// Shared validation and a transparent, offline rubric. AI assessment lives on the server.
const clean = (value, limit = 300) => typeof value === 'string' ? value.normalize('NFKC').trim().slice(0, limit) : '';
export function assessmentInput(work = {}) {
  return {
    orderId: clean(work.orderId, 80), shape: clean(work.shape, 60), modelId: clean(work.modelId, 80),
    technique: clean(work.technique, 30), pattern: clean(work.pattern, 30), drawingLabel: clean(work.drawingLabel, 30),
    patterns: [...new Set((Array.isArray(work.patterns) ? work.patterns : (Array.isArray(work.placements) ? work.placements : []).map(p => p?.pattern || work.pattern)).map(p => clean(p, 30)).filter(Boolean))].slice(0, 12),
    slip: clean(work.clay?.slip || work.slip || 'white', 20), title: clean(work.title, 80),
    explanationUse: clean(work.explanationUse), explanationBeauty: clean(work.explanationBeauty),
  };
}
export function assessmentFingerprint(work) {
  const input = assessmentInput(work);
  // Accept both a work record and the already-normalized request body.
  if (Array.isArray(work?.patterns)) input.patterns = [...new Set(work.patterns.map(p => clean(p, 30)))].slice(0, 12);
  let hash = 2166136261;
  for (const char of JSON.stringify(input)) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  return `explanation-v1-${(hash >>> 0).toString(16)}`;
}
export function normalizeAssessment(value, work) {
  if (!value || value.version !== 1 || !['ai', 'rubric'].includes(value.source) || value.fingerprint !== assessmentFingerprint(work)) return null;
  for (const key of ['use', 'beauty']) if (!value[key] || !Number.isInteger(value[key].score) || value[key].score < 0 || value[key].score > 10 || typeof value[key].feedback !== 'string') return null;
  return {
    version: 1, source: value.source, fingerprint: value.fingerprint,
    model: clean(value.model, 100), accepted: value.accepted === true && value.use.score >= 5 && value.beauty.score >= 5,
    use: {score: value.use.score, feedback: clean(value.use.feedback, 240)},
    beauty: {score: value.beauty.score, feedback: clean(value.beauty.feedback, 240)},
    notice: clean(value.notice, 180),
  };
}
export function assessmentMatches(work) { return Boolean(normalizeAssessment(work?.assessment, work)); }
export function explanationScores(work = {}) {
  const assessed = normalizeAssessment(work.assessment, work);
  if (assessed) return {...assessed, legacy: false};
  // Keep the marks of previously delivered works; new submissions never use checkboxes.
  const legacy = work.step === 4 && !work.assessment;
  return {
    source: legacy ? 'legacy' : 'pending', legacy,
    use: {score: legacy && work.selfUse && clean(work.explanationUse).length >= 6 ? 10 : 0,
      feedback: legacy ? '이전 버전에서 저장한 쓰임 설명 점수예요.' : '만든 모양이나 문양과 어디에 쓰면 좋을지 이야기해 주세요.'},
    beauty: {score: legacy && work.selfBeauty && clean(work.explanationBeauty).length >= 6 ? 10 : 0,
      feedback: legacy ? '이전 버전에서 저장한 솜씨 설명 점수예요.' : '공들인 부분을 고르고 어떻게 만들었는지 이야기해 주세요.'},
  };
}

const USE_RULES = {
  pillow: {use: /머리|누워|잠|목을|목이/, feature: /받치|받쳐|받침|오목|파인|곡선|넓|평평|편안|시원|안정|단단/, reason: '머리를 받치는 부분의 모양이 왜 쉬기에 알맞은지'},
  stool: {use: /앉|걸터|좌석|쉬/, feature: /평평|넓|튼튼|단단|받치|받쳐|지탱|안정|다리|몸통|받침/, reason: '앉는 면이나 몸통이 어떻게 몸을 받쳐 주는지'},
  pitcher: {use: /물|술|차|따르|따라|음료/, feature: /손잡이|주둥이|잡|담|따르|따라|좁은|흐르/, reason: '손잡이나 주둥이가 물을 따르는 데 왜 필요한지'},
  incense: {use: /향|연기|냄새|향기/, feature: /구멍|뚫|투각|뚜껑|통로|빠져|나오|퍼지|받침/, reason: '뚜껑의 구멍이 향 연기에 어떤 일을 하는지'},
  maebyeong: {use: /담|보관|내용물|물|술|꽃/, feature: /좁|입|어깨|풍성|몸통|넓|배|세우|쏟|안정/, reason: '입과 몸통의 모양이 내용물을 담는 데 왜 알맞은지'},
  gourdBottle: {use: /담|보관|내용물|물|술|꽃/, feature: /좁|입|잘록|몸통|조롱박|넓|배|쏟|안정/, reason: '좁은 입과 몸통이 내용물을 담는 데 어떻게 도움이 되는지'},
  duckDropper: {use: /먹|벼루|글씨|붓|물/, feature: /작|구멍|조금|방울|따르|따라|양을|물줄기/, reason: '작은 구멍이 벼루에 물을 조금씩 붓는 데 왜 알맞은지'},
  chrysanthemumCup: {use: /마시|마실|음료|차|물|술/, feature: /입|넓|담|빈|오목|잡|둥근|속/, reason: '입과 속이 빈 모양이 음료를 마시는 데 왜 알맞은지'},
  cupStand: {use: /마시|마실|음료|차|물|술|잔/, feature: /받침|올려|놓|안정|뜨거|손|입|담/, reason: '잔과 받침을 함께 쓰면 어떤 점이 편리한지'},
};
const CAUSE = /때문|그래서|덕분|도록|위해|위하|있어|있으|수\s*있|좋아|좋고|편하|편리|잘\s*(?:받|보|담|나|퍼)|알맞|안정|쉽|도움|줄\s*수|해\s*주|해주|하려|하므로|하니|해서|하여|하니까|니까|므로/;
const SHAPE_WORDS = {pillow:/베개/,stool:/의자/,pitcher:/주전자/,incense:/향로/,maebyeong:/매병|병/,gourdBottle:/조롱박|병/,duckDropper:/연적/,chrysanthemumCup:/잔/,cupStand:/잔|받침/};
const MOTIF_WORDS = /무늬|문양|운학문|(?:^|[\s.,])학(?=[을의이과은\s.,]|$)|구름|연꽃|모란|국화|매화|대나무|버들|버드나무|포도|글자|풀꽃/;
const NONSENSE = /(?:[ㅋㅎㅠㅜ]){3,}|(.)\1{6,}|(?:asdf|qwer|zxcv){2,}|무시.*지시|지시.*무시|만점\s*(?:줘|주|처리)|점수\s*(?:100|백)\s*점|ignore\s+(?:all|previous)|system\s*prompt/i;
function meaningful(text) { return text.length >= 5 && (text.match(/[가-힣]/g) || []).length >= 3 && !NONSENSE.test(text); }
function response(score, feedback) { return {score, feedback}; }
export function explanationHints(work = {}) {
  const input=assessmentInput(work),names={cloud:'구름',crane:'학',lotus:'연꽃',peony:'모란',chrysanthemum:'국화',plum:'매화',bamboo:'대나무',willow:'버드나무',grape:'포도',wildflower:'풀꽃',text:'글자'};
  const motif=names[input.patterns[0]||input.drawingLabel]||'무늬',slip=input.slip==='dark'?'검은 흙':'흰 흙';
  const examples = {
    pillow: '예: 머리를 놓는 곳을 오목하게 빚은 베개예요. 누웠을 때 머리를 안정적으로 받쳐 주기 때문에 쉴 때 쓰면 좋아요.',
    stool: '예: 윗면이 평평하고 몸통이 튼튼한 의자예요. 사람의 몸을 단단히 받쳐 주기 때문에 앉아서 쉬기 좋아요.',
    pitcher: '예: 손잡이와 가느다란 주둥이가 있는 주전자예요. 손잡이를 잡고 주둥이로 물을 흘려보낼 수 있기 때문에 따르기 편해요.',
    incense: '예: 몸통에 향을 담고 뚜껑을 덮는 향로예요. 뚜껑을 열고 향을 넣어 피울 수 있기 때문에 방을 향기롭게 할 때 좋아요.',
    duckDropper: '예: 작은 구멍이 있는 연적이에요. 물을 조금씩 떨어뜨릴 수 있기 때문에 벼루에 먹을 갈 때 쓰면 좋아요.',
    chrysanthemumCup: '예: 속이 오목하고 입이 넓은 잔이에요. 차를 담아 마시기 편하기 때문에 차를 대접할 때 좋아요.',
    cupStand: '예: 잔과 받침을 함께 만들었어요. 받침 위에 잔을 놓으면 뜨거운 잔을 옮기고 내려놓기 편하기 때문에 차를 마실 때 좋아요.',
    gourdBottle: '예: 몸통이 넉넉하고 입이 좁은 조롱박 병이에요. 담은 것이 잘 쏟아지지 않기 때문에 내용물을 보관하기 좋아요.',
    maebyeong: '예: 어깨와 몸통이 넓고 입이 좁은 매병이에요. 넉넉히 담고 입을 막아 두기 쉽기 때문에 내용물을 보관하기 좋아요.',
  };
  return {use: examples[work.shape] || '예: 이 부분을 이렇게 빚은 그릇이에요. 그 모양이 쓰임을 돕기 때문에 이런 곳에 쓰면 좋아요.',
    beauty: work.technique === 'openwork' ? `예: ${motif} 모양 구멍의 가장자리를 여러 번 다듬었어요. 빛과 그림자로 무늬가 또렷하게 드러나기 때문이에요.`
      : work.technique === 'plain' ? '예: 몸통을 천천히 빚고 표면을 고르게 다듬었어요. 부드러운 곡선과 맑은 푸른빛을 살리고 싶었기 때문이에요.'
      : `예: ${motif} 무늬를 파고 ${slip}을 채운 다음 여러 번 닦았어요. 무늬가 또렷하게 보이게 하고 싶었기 때문이에요.`};
}
export function rubricAssessment(work = {}, notice = '기본 기준으로 설명을 확인했어요.') {
  const input = assessmentInput(work), useText = input.explanationUse, beautyText = input.explanationBeauty, rule = USE_RULES[input.shape];
  let use = response(0, '어떤 모양이나 문양을 만들었는지, 어디에 쓰면 좋을지 적어 주세요.');
  if (meaningful(useText) && rule) {
    const useFits = rule.use.test(useText), featureFits = rule.feature.test(useText), causal = CAUSE.test(useText), shapeFits = SHAPE_WORDS[input.shape]?.test(useText), motifFits = MOTIF_WORDS.test(useText), choice = featureFits || shapeFits || motifFits;
    // A familiar vessel name already conveys its everyday use. A short
    // description of that vessel and its motif/feature is enough to continue.
    use = !useFits && shapeFits && (featureFits || motifFits) ? response(5, '만든 모양과 특징을 소개했어요. 어디에 쓰고 싶은지도 덧붙여 볼 수 있어요.')
      : !useFits ? response(1, '만든 그릇의 모양이나 어디에 쓰면 좋을지 한 가지 더 알려 주세요.')
      : !choice ? response(3, '쓰임을 찾았어요. 어떤 모양이나 문양으로 만들었는지도 덧붙여 주세요.')
      : !causal || !featureFits ? response(6, '만든 모양이나 문양과 알맞은 쓰임을 소개했어요. 그 선택이 좋은 이유를 덧붙여도 좋아요.')
      : response(useText.length >= 28 ? 9 : 7, '이 그릇의 쓰임과 구체적인 모양을 이유로 연결했어요.');
  }
  let beauty = response(0, '공들인 부분이나 사용한 기법을 짧게 적어 주세요.');
  if (meaningful(beautyText)) {
    const inlay = /상감|색흙|다른\s*색.*흙|흰\s*(?:흙|색)|검은\s*(?:흙|색)|백토|자토|채우|채워|파인/,
      openwork = /투각|구멍|뚫|빛|그림자|통하|연기/,
      plain = /무늬\s*없|무문|곡선|빛깔|색|표면|부드러|매끈|푸른|맑/;
    const actual = input.technique === 'inlay' ? inlay : input.technique === 'openwork' ? openwork : plain;
    const concrete = actual.test(beautyText) || MOTIF_WORDS.test(beautyText) || /가장자리|몸통|손잡이|주둥이|뚜껑|윗면|입구/.test(beautyText);
    const processes = beautyText.match(/파고|파서|팠|새기|새겨|새겼|채우|채워|채웠|채운|닦|다듬|빚|뚫|칠하|칠해|칠했|구웠|굽|말리|말렸|늘리|늘렸|눌러|돌려|고르게|여러\s*번|천천히|조심히/g) || [];
    const effect = /또렷|뚜렷|선명|대비|어울|조화|잘\s*보|드러|빛|그림자|입체|시원|정교|아름|아름답|부드러|맑|고르|섬세|살리|살렸|나타/.test(beautyText);
    const effort = /신경|공을?\s*들|정성|집중|열심|애썼|애를\s*썼|꼼꼼|정교|조심|손길/.test(beautyText);
    const creation = /넣|넣었|그리|그려|그렸|표현|사용|꾸미|꾸며|꾸몄|만들|만든|만드|만듦/.test(beautyText);
    const namedTechnique = (input.technique === 'inlay' ? /상감/ : input.technique === 'openwork' ? /투각/ : /무문/).test(beautyText);
    const contradiction = (input.technique === 'plain' && /상감|투각|흙을\s*채|구멍을\s*뚫/.test(beautyText)) ||
      (input.technique === 'inlay' && /투각으로|투각\s*(?:기법)?을?\s*(?:사용|했)|구멍을\s*뚫어/.test(beautyText)) ||
      (input.technique === 'openwork' && /상감으로|상감\s*(?:기법)?을?\s*(?:사용|했)|색흙을\s*채/.test(beautyText));
    beauty = contradiction ? response(1, '설명한 기법이 지금 작품과 달라요. 실제로 만든 기법과 그 효과를 설명해 주세요.')
      : !concrete ? response(2, '어느 무늬, 색, 곡선 또는 제작 기법을 말하는지 구체적으로 적어 주세요.')
      : processes.length && (effect || processes.length >= 2) ? response(effect && processes.length >= 2 ? 9 : 7, '공들인 부분과 구체적으로 만든 과정을 잘 이야기했어요.')
      : processes.length ? response(6, '공들인 부분을 어떻게 만들었는지 이야기했어요. 그 방법의 효과를 덧붙여도 좋아요.')
      : effort || creation || namedTechnique ? response(5, '공들인 부분이나 사용한 기법을 잘 소개했어요.')
      : !effect || !CAUSE.test(beautyText) ? response(3, '부분을 잘 골랐어요. 신경 쓴 점이나 사용한 기법도 짧게 적어 주세요.')
      : response(actual.test(beautyText) && beautyText.length >= 28 ? 9 : 7, '실제로 만든 특징이 어떤 효과를 내는지 이유를 설명했어요.');
  }
  return {version: 1, source: 'rubric', fingerprint: assessmentFingerprint(work), accepted: use.score >= 5 && beauty.score >= 5, use, beauty, notice};
}
