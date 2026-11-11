import {castForOrder} from './characters.js';
import {motifRequest} from './domain.js';

/** Curated classroom dialogue. Requirements remain in the order data; these lines change only voice. */
export const ORDER_QUOTES = Object.freeze({
 'royal-rest':'누워서 쉴 때 머리를 받칠 것이 필요하오. 학 무늬를 다른 색의 흙으로 넣어 주시오.',
 'noble-banquet':'손님들에게 물을 따르려 하오. 잡기 편한 손잡이와 물을 따르는 주둥이를 갖추시오. 장식은 그대에게 맡기겠소.',
 'royal-fragrance':'방 안에서 향을 피우려 하오. 향 연기가 나오도록 뚜껑에 구멍을 뚫어 주시오.',
 'noble-garden':'정원을 바라보며 앉아 쉴 것이 필요하오. 몸체에는 뚫린 무늬를 넣어 주시오.',
 'noble-vessel':'내용물을 담아 둘 병이 필요하오. 입은 좁고 어깨는 풍성하게 빚으시오. 구름 무늬도 넣어 주시오.',
 'lady-cloud-rest':'누워서 머리를 받칠 물건이 필요하오. 구름 무늬를 파고 다른 색 흙으로 채워 주시오.',
 'noble-lotus-rest':'잠잘 때 머리를 받치려 하오. 다른 색의 흙을 넣은 연꽃 무늬로 꾸며 주시오.',
 'royal-quiet-rest':'잠시 누워 쉴 때 머리를 받칠 것이 필요하오. 모양을 잘 다듬고, 장식은 그대가 정해 보시오.',
 'lady-crane-rest':'누워 쉴 때 머리 아래에 둘 것이 필요하오. 날아가는 학 무늬를 넣어 주시오.',
 'noble-cloud-rest':'머리를 받치고 누워 쉴 물건을 부탁하오. 구름 무늬를 넣되, 위치와 개수는 그대가 정하시오.',
 'royal-crane-pour':'연회에서 물을 따르려 하오. 손잡이와 주둥이를 만들고, 학 무늬는 다른 색 흙으로 넣어 주시오.',
 'lady-cloud-pour':'손님께 물을 따를 물건이 필요하오. 구름 무늬를 파서 다른 색 흙으로 채워 주시오.',
 'noble-lotus-pour':'연회에서 술을 담아 따르려 하오. 손잡이를 달고 연꽃 무늬를 상감으로 넣어 주시오.',
 'royal-cloud-pour':'손잡이를 잡고 물을 따를 수 있어야 하오. 몸통에는 구름 무늬를 넣어 주시오.',
 'lady-crane-pour':'손님들의 잔에 물을 따를 물건을 부탁하오. 손잡이와 주둥이를 갖추고, 학 무늬도 넣으시오.',
 'lady-lotus-fragrance':'방 안에서 향을 피우고 싶소. 뚜껑에 연꽃 모양의 구멍무늬를 뚫어 주시오.',
 'noble-cloud-fragrance':'향을 피울 물건을 부탁하오. 연기가 나오도록 뚜껑에 구름 모양을 뚫어 주시오.',
 'royal-crane-fragrance':'향을 피우려 하오. 뚜껑에 학 무늬를 뚫어 향 연기가 나올 길을 내 주시오.',
 'lady-evening-fragrance':'저녁에 방 안에서 향을 피우려 하오. 연기가 빠져나갈 구멍무늬를 예쁘게 뚫어 주시오.',
 'noble-lotus-fragrance':'향을 담아 피울 물건이 필요하오. 뚜껑에는 연꽃 무늬를 뚫어 넣어 주시오.',
 'royal-cloud-seat':'정원을 보며 앉아 쉴 것이 필요하오. 몸체에는 구름 모양의 구멍무늬를 뚫어 주시오.',
 'lady-lotus-seat':'연못을 바라보며 앉을 것이 필요하오. 몸체에 연꽃 모양을 뚫어 꾸며 주시오.',
 'noble-crane-seat':'손님과 이야기를 나누며 앉을 물건을 부탁하오. 몸체에 학 무늬를 뚫어 넣어 주시오.',
 'royal-courtyard-seat':'뜰에서 잠시 앉아 쉬고 싶소. 몸체에 뚫린 무늬를 넣되, 무늬의 모양은 그대가 정하시오.',
 'lady-cloud-seat':'정원에서 앉아 꽃을 볼 물건이 필요하오. 몸체에는 구름 무늬를 뚫어 주시오.',
 'royal-crane-vessel':'내용물을 담아 둘 병이 필요하오. 입은 좁고 어깨는 풍성하게, 학 무늬는 상감으로 넣어 주시오.',
 'lady-cloud-vessel':'내용물을 담아 둘 병을 부탁하오. 좁은 입과 넓은 어깨를 빚고, 다른 색 흙으로 구름 무늬를 채우시오.',
 'noble-lotus-vessel':'입이 좁고 어깨가 넓은 병에 내용물을 담으려 하오. 연꽃 무늬를 상감으로 넣어 주시오.',
 'lady-crane-vessel':'내용물을 담을 병이 필요하오. 입은 좁게, 어깨는 넓게 만들고 학 무늬도 넣어 주시오.',
 'royal-simple-vessel':'내용물을 담을 병을 부탁하오. 좁은 입과 풍성한 어깨를 잘 표현하시오. 장식은 자유롭게 정해 보시오.',
 'example-pillow':'머리를 받칠 베개를 부탁하오. 베개의 넓은 옆면에 학을 상감으로 넣어 주시오.',
 'example-pitcher':'물을 따를 주전자가 필요하오. 용의 머리와 물고기의 몸을 닮은 어룡 형태를 고르고, 새 무늬는 넣지 마시오.',
 'example-incense':'둥근 칠보무늬 뚜껑의 향로 형태를 본떠 향 피울 그릇을 만드시오. 새 구름 구멍무늬도 뚫어 주시오.',
 'example-stool':'정원에서 앉아 쉴 투각 의자를 부탁하오. 몸통에 연꽃 모양 구멍무늬를 넣어 주시오.',
 'example-maebyeong':'재현 매병의 작은 입과 넓은 어깨를 살려 내용물을 담을 병을 부탁하오. 학과 구름 두 무늬를 상감으로 넣어 주시오.',
 'example-cupStand':'음료를 마실 잔과 그 잔을 올려 둘 받침이 함께 필요하오. 한 세트로 빚고 연꽃을 상감으로 넣어 주시오.',
 'example-chrysanthemumCup':'직접 음료를 마실 잔이 필요하오. 국화무늬 잔의 형태를 본떠 상감 국화를 넣어 주시오.',
 'example-willowMaebyeong':'내용물을 담을 매병에 물가의 풍경을 담고 싶소. 물가무늬 매병의 형태를 본떠 버드나무를 상감으로 넣으시오.',
 'example-pomegranatePitcher':'물을 담아 따를 주전자를 석류 열매 모양으로 빚으시오. 열매의 입체적인 모양을 살리고 새 무늬는 넣지 마시오.',
 'example-plumBambooMaebyeong':'매화·대나무 매병의 형태를 본떠 병을 만드시오. 매화와 대나무, 학 세 무늬를 모두 상감으로 넣어 주시오.',
 'example-cloudCraneMaebyeong':'구름·학 매병의 잘록한 허리와 어깨를 본떠 내용물을 담을 병을 만드시오. 구름과 학을 모두 상감으로 넣어 주시오.',
 'example-pomegranateDropper':'먹을 갈 때 벼루에 물을 조금씩 부을 연적을 부탁하오. 원숭이가 석류를 안은 형태를 고르고 새 무늬는 넣지 마시오.',
 'example-duckDropper':'벼루에 물을 조금씩 부을 오리 모양 연적이 필요하오. 오리 향로가 아닌 연적 형태를 고르고, 새 무늬는 넣지 마시오.',
 'example-gourdPitcher':'잔에 물을 따를 조롱박 주전자와 받침을 부탁하오. 손잡이와 주둥이가 있는 형태를 골라 포도무늬를 상감으로 넣어 주시오.',
 'example-bambooShootPitcher':'죽순을 본뜬 주전자로 손님에게 물을 따르려 하오. 죽순 형태를 고르고 새 무늬는 넣지 마시오.',
 'example-wildflowerPitcher':'풀꽃 주전자와 받침의 형태를 본떠 빚으시오. 음료를 따를 때 쓸 것이니 풀꽃을 상감으로 넣어 주시오.',
 'example-qilinIncense':'시기 미정으로 표시된 기린 향로를 참고해 향로를 만드시오. 세 다리와 동물 형태를 살리고 새 무늬는 넣지 마시오.',
 'example-qilinDecoratedIncense':'기린장식 향로를 본떠 향을 피울 그릇을 부탁하오. 동물 장식 아래 몸통에 구름무늬를 상감으로 넣어 주시오.',
 'example-duckIncense':'오리 모양 뚜껑이 이미 달린 향로 형태를 고르시오. 향을 피울 것이니 새 무늬는 넣지 마시오.',
 'example-peonyPitcher':'모란 주전자의 조롱박 몸통을 본떠 물을 따를 그릇을 만드시오. 새 작품에도 모란을 상감으로 넣어 주시오.',
 'example-lotusIncense':'연꽃 향로의 꽃잎 같은 몸통 형태를 고르시오. 향 연기가 통하도록 연꽃 구멍무늬도 넣어 주시오.',
 'example-gourdBottle':'조롱박 모양의 병에 내용물을 담아 두려 하오. 손잡이와 주둥이가 따로 없는 병 형태를 고르고 새 무늬는 넣지 마시오.',
 'example-poemGourdBottle':'조롱박 병의 형태로 내용물을 담을 병을 부탁하오. 연꽃과 글자 무늬를 모두 상감으로 표현해 주시오.',
});

// What the customer says, ending with the pattern part of the order (kinds and numbers) in the same way of speaking.
export function orderQuote(order){
 const spoken=ORDER_QUOTES[order?.id];
 if(!spoken)return String(order?.quote || '쓰임에 맞는 청자를 빚어 주시오.');
 const request=motifRequest(order,{archaic:true});
 return request?`${spoken} ${request}`:spoken;
}

const REVIEWS=Object.freeze({
 king:{
  happy:[['고맙소!','과인이 바라던 청자로구려. 쓰임과 솜씨를 두루 갖추었소.'],['참으로 흡족하오!','주문을 세심히 살핀 정성이 느껴지는구려. 오래도록 아껴 쓰겠소.'],['훌륭하오, 작은 도공!','그대의 손끝에서 고려의 아름다움이 피어났구려.']],
  uncertain:[['흠, 조금 아쉽구려…','정성은 보이오만, 주문과 다른 부분이 남아 있소. 한 번 더 살펴보시오.'],['조금만 더 다듬으시오.','이 청자가 제 쓰임을 다하도록 빠진 곳을 고쳐 주시오.'],['뜻은 알겠소만…','내가 부탁한 모양과 솜씨를 다시 맞춰 보시오.']],
  angry:[['형편없소!','이번 청자는 과인의 주문과 너무 다르오. 쓰임부터 다시 살펴 고쳐 오시오.'],['이대로 받기는 어렵소!','청자가 쓰일 자리를 먼저 생각하시오. 다시 빚을 기회는 주겠소.'],['주문과는 딴판이구려!','서두르지 말고 주문서를 다시 읽어 보시오. 고쳐 오면 다시 살피겠소.']],
 },
 queen:{
  happy:[['고맙소, 마음에 드는구려!','빛깔과 무늬가 어우러져 참 곱소. 정성스러운 설명도 잘 들었소.'],['참으로 곱게 빚었소!','바라던 쓰임에 알맞고 솜씨도 정갈하구려. 기쁘게 받아 두겠소.'],['마음이 환해지는구려!','작은 부분까지 살핀 그대의 정성이 느껴지오.']],
  uncertain:[['흠, 조금 아쉽구려…','아름다운 곳도 보이오만, 부탁한 부분을 조금 더 살펴 주시오.'],['마무리가 조금 아쉽소.','주문과 설명을 다시 맞추면 더 좋은 청자가 되겠구려.'],['한 번 더 살펴보시오.','정성을 들인 만큼 쓰임과 장식도 알맞게 갖춰 주시오.']],
  angry:[['이대로는 곤란하오!','부탁한 쓰임과 모양이 많이 다르구려. 주문을 읽고 다시 골라 보시오.'],['형편없소!','이번 청자는 부탁한 조건을 놓쳤소. 어디를 고칠지 차근히 살펴보시오.'],['내 주문을 놓쳤구려!','쓰임에 맞게 고쳐 주시오. 다시 가져오면 기꺼이 살펴보겠소.']],
 },
 noble:{
  happy:[['고맙소! 딱 바라던 것이오.','손님들께 내보이기에도 좋겠구려. 쓰임에 맞게 잘 빚었소.'],['허허, 솜씨가 좋구려!','모양과 장식에 담은 뜻을 들으니 더욱 마음에 드오.'],['이 청자로 하겠소!','주문한 조건을 꼼꼼히 맞췄구려. 수고하였소.']],
  uncertain:[['흠, 조금 아쉽구려…','그럴듯하오만, 부탁한 조건이 빠진 듯하오. 다시 확인하시오.'],['이 부분은 고쳐 주시오.','쓰임과 장식이 함께 맞아야 편히 쓸 수 있소.'],['조금 더 정성이 필요하오.','주문서를 옆에 두고 모양과 기법을 다시 살펴보시오.']],
  angry:[['형편없소!','이 청자로는 부탁한 일을 하기 어렵겠구려. 쓰임부터 다시 맞추시오.'],['주문과 많이 다르오!','내가 무엇에 쓰려 했는지 다시 읽어 보시오. 고쳐 만들 기회는 있소.'],['이 물건은 받을 수 없소!','형태와 제작 과정을 확인하여 다시 가져오시오.']],
 },
 noblewoman:{
  happy:[['고맙소, 참 마음에 드오!','우리 집에 두면 참 잘 어울리겠구려. 그대의 정성을 오래 기억하겠소.'],['어여쁘게 빚었구려!','쓰임도 좋고 무늬에 담긴 이야기도 훌륭하오.'],['기쁘게 받아 두겠소!','부탁한 뜻을 잘 헤아렸구려. 손끝의 솜씨가 느껴지오.']],
  uncertain:[['흠, 조금 아쉽구려…','정성은 고맙소만, 주문에서 빠진 부분을 찾아보시오.'],['조금 더 살펴 주시오.','내가 쓸 곳을 생각하며 모양과 무늬를 다시 맞추시오.'],['마음에 걸리는 곳이 있소.','작품의 쓰임과 설명을 한 번 더 다듬어 주시오.']],
  angry:[['이건 주문과 다르오!','이대로는 쓰기 어렵겠구려. 부탁한 조건부터 다시 확인하시오.'],['형편없소!','이번 청자는 쓰임을 놓쳤구려. 천천히 고쳐 다시 보여 주시오.'],['다시 빚어 주시오!','내가 부탁한 물건과 어떤 점이 다른지 먼저 살펴보시오.']],
 },
 artisan:{
  happy:[['잘했소, 작은 도공!','쓰임과 솜씨를 함께 생각했구려. 그대의 손끝이 한층 야무져졌소.'],['고맙소! 장인의 마음이 보이오.','흙을 다룬 과정과 그 까닭까지 잘 들었소.'],['참으로 훌륭하구려!','이 청자에 담은 생각을 다른 이에게도 들려주시오.']],
  uncertain:[['흠, 조금 아쉽구려…','좋은 시작이오. 빠진 조건을 찾아 한 번만 더 다듬어 보시오.'],['손끝을 조금 더 살펴보시오.','모양과 기법을 고른 까닭이 작품에도 드러나면 좋겠소.'],['아직 배울 곳이 남았소.','주문과 작품을 나란히 놓고 다른 부분을 찾아보시오.']],
  angry:[['이대로는 내보낼 수 없소!','쓰임부터 다시 생각해 보시오. 실패한 곳을 고치는 것도 도공의 일이오.'],['흠, 주문을 놓쳤구려!','모양과 제작 과정을 차근차근 확인하시오. 다시 하면 나아질 것이오.'],['형편없소, 이번 마무리는!','손을 놓지는 마시오. 고칠 부분을 찾아 다시 빚어 보시오.']],
 },
});
const hash=text=>{let n=0;for(const c of String(text))n=(Math.imul(n,31)+c.charCodeAt(0))>>>0;return n;};
export function reviewMood(score){return score?.objective>=80&&score?.total>=85?'happy':score?.total>=60?'uncertain':'angry';}
const EXPLANATION_REVIEWS=Object.freeze({
 king:[['청자는 잘 빚었소.','과인의 주문대로 모양과 제작을 잘 갖추었구려. 이제 그 까닭을 더 자세히 들려주시오.'],['기물은 마음에 드오.','부탁한 청자는 제대로 만들었소. 어디에 쓰고 어찌 만들었는지 이야기를 보태시오.'],['솜씨는 잘 보았소.','주문에 맞게 빚은 것은 흡족하오. 작품에 담은 생각도 듣고 싶구려.']],
 queen:[['청자는 곱게 완성했소.','부탁한 모양과 제작은 잘 갖추었소. 이 청자의 쓰임과 솜씨를 말로도 전해 주시오.'],['작품은 마음에 드는구려.','주문의 조건은 잘 맞췄소. 그 모양과 무늬를 고른 까닭을 조금 더 들려주시오.'],['이야기가 조금 아쉽소.','청자를 잘 만든 것은 보이오. 어디에 쓰고 어떤 공을 들였는지 보태 주시오.']],
 noble:[['청자는 제대로 만들었소.','주문한 모양과 제작은 모두 맞소. 이 물건을 어떻게 쓰고 만들었는지 설명해 주시오.'],['기물은 흡족하구려.','부탁한 조건을 꼼꼼히 갖췄소. 작품에 담은 까닭까지 들으면 좋겠구려.'],['설명을 더 듣고 싶소.','청자는 주문에 맞게 잘 빚었소. 그대가 생각한 쓰임과 솜씨를 들려주시오.']],
 noblewoman:[['청자는 마음에 드오.','부탁한 대로 잘 빚었구려. 우리 집 어디에 쓰면 좋을지 이야기도 보태 주시오.'],['잘 만든 것은 알겠소.','모양과 제작 조건은 모두 맞소. 무슨 생각으로 만들었는지 더 듣고 싶구려.'],['이야기만 더 들려주시오.','부탁한 기물은 잘 완성했소. 쓰임과 공들인 부분을 차근히 이야기해 주시오.']],
 artisan:[['손끝의 솜씨는 좋구려.','주문과 제작 과정은 모두 맞췄소. 이제 왜 그렇게 만들었는지 설명해 보시오.'],['청자는 잘 완성했소.','모양과 제작을 제대로 익혔구려. 그 까닭을 말로 풀어내는 연습도 해 보시오.'],['생각을 더 들려주시오.','주문에 맞게 잘 빚었소. 어느 곳에 쓰고 무엇에 공을 들였는지 이야기해 보시오.']],
});
const REPAIR_QUOTES=Object.freeze({
 king:{use:['과인이 무엇에 쓰려 했는지 다시 살피시오. 그 쓰임에 맞는 기물을 고르시오.','부탁한 쓰임과 고른 기물의 형태가 다르구려. 쓸 자리를 생각하여 다시 고르시오.'],process:['기물의 제작이 아직 끝나지 않았구려. 남은 과정을 차근히 마무리하시오.','제작 단계에 빠진 곳이 보이오. 마무리한 뒤 다시 가져오시오.'],design:['기법이나 무늬, 세부 형태에서 주문과 다른 조건이 있소. 아래 짚은 부분을 살피시오.','과인이 부탁한 세부 조건이 아직 맞지 않소. 짚어 드리는 조건을 다시 확인하시오.']},
 queen:{use:['부탁한 자리에 쓰기에는 기물의 종류가 다르구려. 쓰임에 맞는 형태를 골라 주시오.','내가 무엇을 하려 했는지 떠올려 보시오. 그 일에 알맞은 기물을 부탁하오.'],process:['완성까지 남은 제작 과정이 있소. 차례대로 마무리해 주시오.','제작의 한 단계가 빠졌구려. 남은 손질을 마친 뒤 다시 보여 주시오.'],design:['부탁한 기법과 무늬, 세부 형태 중 다른 조건이 보이오. 짚은 곳을 맞춰 주시오.','주문의 세부 조건을 조금 더 살펴 주시오. 고칠 곳을 아래에 짚어 두었소.']},
 noble:{use:['내가 부탁한 쓰임에는 다른 형태가 필요하오. 주문을 읽고 기물부터 다시 골라 주시오.','이 물건의 쓰임이 부탁한 것과 다르오. 어디에 쓸지 생각하며 형태를 고르시오.'],process:['제작이 덜 끝났구려. 남은 단계를 마쳐야 받아 쓸 수 있소.','완성에 필요한 과정이 빠졌소. 순서를 살펴 끝까지 마무리하시오.'],design:['기법과 무늬, 세부 형태 중 주문과 맞지 않는 조건이 있소. 아래 조건을 다시 보시오.','부탁한 세부 조건이 아직 빠져 있소. 짚어 드린 부분을 고쳐 주시오.']},
 noblewoman:{use:['내가 쓸 곳과 기물의 종류가 맞지 않소. 그 쓰임에 알맞은 형태로 골라 주시오.','어디에 두고 무엇을 할 물건인지 다시 살펴보시오. 그에 맞는 기물이 필요하오.'],process:['정성을 들여 마무리할 단계가 남았구려. 빠진 제작 과정을 이어 주시오.','아직 완성하지 못한 과정이 있소. 남은 손질을 마친 뒤 보여 주시오.'],design:['부탁한 기법이나 무늬, 세부 형태에 다른 점이 남았소. 짚은 조건을 다시 살펴 주시오.','주문에서 세세히 부탁한 부분을 더 맞춰 주시오. 고칠 조건을 아래에 적었소.']},
 artisan:{use:['먼저 이 기물의 쓰임을 떠올려 보시오. 주문한 일에 알맞은 형태를 다시 골라 보시오.','쓰임과 형태를 잇는 연습이 더 필요하오. 무엇을 할 물건인지부터 다시 살피시오.'],process:['제작 과정에 빠진 단계가 있구려. 순서대로 끝까지 해내는 것도 도공의 솜씨요.','마무리하지 못한 제작 단계를 살펴보시오. 남은 일을 차근히 끝내 보시오.'],design:['세부 형태와 기법, 무늬에서 주문과 다른 조건을 찾아보시오. 고칠 부분을 아래에 짚었소.','주문의 세부 조건을 다시 확인할 차례요. 짚어 준 조건부터 맞춰 보시오.']},
});
const glazeOnlyShortfall=shortfall=>shortfall?.key==='process'&&Number.isFinite(shortfall.glazeScore)&&shortfall.glazeScore<10&&shortfall.score===20+shortfall.glazeScore;
function reviewDetail(shortfall){
 if(!shortfall)return '그대가 붙인 이름과 이야기를 함께 간직하겠소.';
 const feedback=String(shortfall.feedback||'');
 if(shortfall.key==='use'){const shape=feedback.match(/이 주문에는 (.+?)의 쓰임/);return shape?`이 주문에는 ${shape[1]}의 쓰임이 알맞소. 그 형태를 골라 주시오.`:'무엇에 쓸 청자인지 생각하고, 쓰임에 알맞은 형태를 고르시오.';}
 if(glazeOnlyShortfall(shortfall))return feedback.includes('얇으면')?'유약을 조금 일찍 꺼냈구려. 다음에는 5초에 가깝게 담가 빛깔과 광택을 살려 보시오.':'유약을 오래 담갔구려. 다음에는 5초에 가깝게 꺼내 흘러내리는 유약을 줄여 보시오.';
 if(shortfall.key==='process')return feedback.includes('제작 단계를')?'선택한 표현 방법의 제작 단계를 먼저 마무리하시오.':'건조 → 초벌 → 유약 → 재벌의 과정을 순서대로 마무리하시오.';
 if(shortfall.key==='design'){
  if(feedback.includes('물이 샐'))return '몸통의 구멍으로 물이 샐 수 있소. 물 담을 기물에는 상감이나 무문을 고르시오.';
  if(feedback.includes('세부 형태'))return '주문에 제시된 참고 예시와 내가 고른 세부 형태를 비교하시오.';
  const motif=feedback.match(/주문에 있는 (.+?)를 다시/);if(motif)return `주문한 ${motif[1]} 무늬가 모두 들어 있는지 살피시오.`;
  const technique=feedback.match(/이 주문에는 (.+?) 기법이 필요/);if(technique)return `이 주문에는 ${technique[1]} 기법이 필요하오. 그 기법으로 표현하시오.`;
  return '주문한 기법과 무늬, 세부 형태 가운데 빠진 조건을 확인하시오.';
 }
 return ['selfBeauty','explanationBeauty'].includes(shortfall.key)?'공들인 부분과 그때 한 작업, 그렇게 표현한 까닭을 구체적으로 설명하시오.':'만든 모양·무늬가 어디에 쓰기 알맞은지 까닭을 덧붙여 주시오.';
}
export function customerReview(order,score,work={}){
 const character=castForOrder(order||{id:'unknown'},work.customerId),mood=reviewMood(score),seed=hash(`${work.id||''}:${order?.id||''}:${score?.total||0}`);
 const shortfalls=(score?.breakdown||[]).filter(item=>item.max>0&&item.score<item.max);
 const objectiveShortfalls=shortfalls.filter(item=>['use','process','design'].includes(item.key));
 // Diagnose the work before its written explanation. A full 80/80 never requests a new shape.
 const candidates=objectiveShortfalls.length?objectiveShortfalls:shortfalls;
 const shortfall=candidates.sort((a,b)=>(a.score/a.max)-(b.score/b.max))[0];
 let [headline,quote]=REVIEWS[character.id][mood][seed%REVIEWS[character.id][mood].length];
 const explanationOnly=Number(score?.objective)>=80&&mood!=='happy';
 if(explanationOnly){const variants=EXPLANATION_REVIEWS[character.id];[headline,quote]=variants[seed%variants.length];}
 else if(mood!=='happy'){
  const focus=objectiveShortfalls.length?shortfall.key:'design',variants=REPAIR_QUOTES[character.id][focus];
  quote=glazeOnlyShortfall(shortfall)?'제작 순서는 잘 지켰소. 유약을 담그는 시간을 조금 더 살펴보시오.':variants[seed%variants.length];
 }
 return {character:character.id,mood,headline,quote,detail:reviewDetail(shortfall),focus:shortfall?.key||'complete',learningFeedback:shortfall?.feedback||'',total:Number(score?.total)||0};
}
