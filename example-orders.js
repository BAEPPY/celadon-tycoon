/** Playable designs inspired by the 23 catalog entries, not historical commissions.
 * modelId chooses the scanned/reconstructed geometry; shape groups objects by use.
 * The uncertain-date qilin remains an observation reference, not a dated attribution.
 */
export const EXAMPLE_DESIGNS = [
 {modelId:'pillow',shape:'pillow',pattern:'crane',technique:'inlay',title:'학과 함께하는 낮잠',request:'머리를 받칠 베개를 부탁하오. 베개의 넓은 옆면에 학을 상감으로 넣어 주시오.'},
 {modelId:'pitcher',shape:'pitcher',pattern:'any',technique:'plain',title:'연회에 찾아온 어룡',request:'물을 따를 주전자가 필요합니다. 용의 머리와 물고기의 몸을 닮은 어룡 형태를 살리고 무늬는 더하지 말아 주세요.'},
 {modelId:'incense',shape:'incense',pattern:'cloud',technique:'openwork',title:'연기가 통하는 칠보 향로',request:'둥근 칠보무늬 뚜껑의 향로를 본떠 향 피울 그릇을 만들어 주세요. 새 구름 구멍무늬도 꾸며 주세요.'},
 {modelId:'stool',shape:'stool',pattern:'lotus',technique:'openwork',title:'연못가의 쉼터',request:'정원에서 앉아 쉴 투각 의자를 부탁해요. 몸통에 연꽃 모양 구멍무늬를 넣어 주세요.'},
 {modelId:'maebyeong',shape:'maebyeong',pattern:'crane',requiredPatterns:['crane','cloud'],technique:'inlay',title:'구름 사이로 나는 학',request:'작은 입과 넓은 어깨를 가진 매병에 내용물을 담아 두려 하오. 학과 구름 두 무늬를 상감으로 넣어 주시오.'},
 {modelId:'cupStand',shape:'cupStand',pattern:'lotus',technique:'inlay',title:'잔 아래 꽃받침',request:'손님이 음료를 마실 잔과 그 잔을 올려 둘 받침이 함께 필요해요. 한 세트로 빚고 연꽃을 상감으로 넣어 주세요.'},
 {modelId:'chrysanthemumCup',shape:'chrysanthemumCup',pattern:'chrysanthemum',technique:'inlay',title:'국화 한 잔의 여유',request:'따르는 도구 대신 직접 마실 잔이 필요합니다. 국화무늬 잔을 본떠 상감 국화를 넣어 주세요.'},
 {modelId:'willowMaebyeong',shape:'maebyeong',pattern:'willow',technique:'inlay',title:'병 위에 펼친 물가',request:'내용물을 담아 둘 매병에 물가의 풍경을 담고 싶어요. 물가무늬 매병을 본떠 버드나무를 상감으로 표현해 주세요.'},
 {modelId:'pomegranatePitcher',shape:'pitcher',pattern:'any',technique:'plain',title:'연회상을 밝히는 석류',request:'물을 담아 따를 주전자를 석류 열매 모양으로 만들어 주시오. 열매의 입체적인 모양이 보이도록 새 무늬는 넣지 마시오.'},
 {modelId:'plumBambooMaebyeong',shape:'maebyeong',pattern:'plum',requiredPatterns:['plum','bamboo','crane'],technique:'inlay',title:'매화·대나무와 학의 정원',request:'매화·대나무 매병을 본떠 병을 만들어 주세요. 매화와 대나무, 학 세 무늬를 모두 상감으로 넣어 주세요.'},
 {modelId:'cloudCraneMaebyeong',shape:'maebyeong',pattern:'cloud',requiredPatterns:['cloud','crane'],technique:'inlay',title:'실물 매병에서 배운 곡선',request:'구름·학 매병의 잘록한 허리와 어깨를 본떠 주세요. 구름과 학을 모두 상감으로 넣을 내용물 보관용 병이에요.'},
 {modelId:'pomegranateDropper',shape:'duckDropper',pattern:'any',technique:'plain',title:'원숭이가 건네는 먹물 준비',request:'먹을 갈 때 벼루에 물을 조금씩 부을 연적을 부탁합니다. 원숭이가 석류를 안은 모양을 고르고 무늬는 더하지 말아 주세요.'},
 {modelId:'duckDropper',shape:'duckDropper',pattern:'any',technique:'plain',title:'서재로 온 작은 오리',request:'벼루에 물을 조금씩 부을 오리 모양 연적이 필요해요. 오리 향로와 구별해 고르고 무늬는 더하지 말아 주세요.'},
 {modelId:'gourdPitcher',shape:'pitcher',pattern:'grape',technique:'inlay',title:'포도가 열린 조롱박',request:'잔에 물을 따를 조롱박 주전자와 받침을 부탁하오. 손잡이와 주둥이가 있는 것을 골라 포도무늬를 상감으로 넣어 주시오.'},
 {modelId:'bambooShootPitcher',shape:'pitcher',pattern:'any',technique:'plain',title:'봄 죽순으로 따르는 물',request:'죽순을 본뜬 주전자로 손님에게 물을 따라 드리고 싶어요. 죽순 모양을 살리고 새 무늬는 넣지 말아 주세요.'},
 {modelId:'wildflowerPitcher',shape:'pitcher',pattern:'wildflower',technique:'inlay',title:'풀꽃이 핀 차 자리',request:'풀꽃 주전자와 받침의 모양을 본떠 만들어 주세요. 이번 작품은 상감으로 풀꽃을 넣어 음료를 따를 때 쓰려고 합니다.'},
 {modelId:'qilinIncense',shape:'incense',pattern:'any',technique:'plain',title:'향을 품은 기린',request:'방 안에서 향을 피우려 하오. 상상 속 동물인 기린의 모습과 세 다리를 살려 향로를 빚고, 새 무늬는 넣지 마시오.'},
 {modelId:'qilinDecoratedIncense',shape:'incense',pattern:'cloud',technique:'inlay',title:'기린 곁을 흐르는 구름',request:'기린장식 향로를 본떠 향을 피울 그릇을 부탁하오. 상상 속 동물 아래 몸통에 구름무늬를 상감으로 넣어 주시오.'},
 {modelId:'duckIncense',shape:'incense',pattern:'any',technique:'plain',title:'향을 품은 오리',request:'향로에서 오리 모양 뚜껑이 이미 달린 오리 향로 형태를 고르시오. 향을 피울 것이니 새 무늬는 넣지 마시오.'},
 {modelId:'peonyPitcher',shape:'pitcher',pattern:'peony',technique:'inlay',title:'모란을 담아 따르는 물',request:'모란 주전자의 조롱박 몸통을 본떠 물을 따를 그릇을 만들어 주세요. 새 작품에도 모란을 상감으로 넣어 주세요.'},
 {modelId:'lotusIncense',shape:'incense',pattern:'lotus',technique:'openwork',title:'연꽃 사이로 피어나는 향',request:'칠보 향로 대신 연꽃 향로의 꽃잎 같은 몸통을 골라 주세요. 향 연기가 통하도록 연꽃 구멍무늬도 넣어 주세요.'},
 {modelId:'gourdBottle',shape:'gourdBottle',pattern:'any',technique:'plain',title:'주둥이 없는 조롱박',request:'조롱박 모양의 병에 내용물을 담아 둘 거예요. 따로 붙인 손잡이와 주둥이 없이, 시문도 없는 병의 모양을 살려 주세요.'},
 {modelId:'poemGourdBottle',shape:'gourdBottle',pattern:'text',requiredPatterns:['text','lotus'],technique:'inlay',title:'시 한 구절과 연꽃',request:'조롱박 병의 형태로 내용물을 담을 병을 부탁하오. 연꽃과 글자 무늬를 모두 상감으로 표현해 주시오.'},
];

export const EXAMPLE_ORDERS = EXAMPLE_DESIGNS.map((design,index)=>({
 ...design,id:`example-${design.modelId}`,exampleId:design.modelId,
 customer:['왕실의 주문','귀족의 주문','귀족 부인의 주문'][index%3],
 kind:['king','noble','noblewoman'][index%3],quote:design.request,
 hint:'주문의 참고 예시를 돌려 보며 쓰임과 형태를 비교하세요. 원본 유물의 문양과 이번에 새로 만드는 작품의 장식 조건은 다를 수 있어요.',
}));

export function designsForShape(shape){return EXAMPLE_DESIGNS.filter(d=>d.shape===shape);}
