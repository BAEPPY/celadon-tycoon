export const CHARACTERS=Object.freeze([
 {id:'king',name:'왕',description:'높은 검은 오사모와 넉넉한 담황색 상포, 금·푸른 실 장식의 자색 허리띠. 사용자 제공 「고려도경」 왕복 설명과 복식 예시를 참고한 게임용 재현.'},
 {id:'queen',name:'왕비',description:'붉은 치마와 금색 장식, 녹색 겉옷과 황색 소매의 층이 보이는 예복. 사용자 제공 고려 왕비 복식 예시 참고.'},
 {id:'noble',name:'귀족 관원',description:'곧은 양각의 복두와 둥근 무늬가 있는 청색 공복. 사용자 제공 관원 공복 예시 참고.'},
 {id:'noblewoman',name:'귀족 부인',description:'보랏빛 겉옷 아래 녹색 속옷과 붉은 치마가 보이는 가을·겨울 외출복. 사용자 제공 복식 예시 참고.'},
 {id:'artisan',name:'도공 선생님',description:'소박한 남색 작업복과 흙이 묻은 앞치마. 교육용으로 창작한 도공 캐릭터.'},
]);
export const DIRECTIONS=['front','back','left','right'];
export const DIRECTION_NAMES=['앞','뒤','왼쪽','오른쪽'];
export function castForOrder(order,customerId){if(CHARACTERS.some(c=>c.id===customerId))return CHARACTERS.find(c=>c.id===customerId);let hash=0;for(const c of order.id)hash=(hash*31+c.charCodeAt(0))>>>0;const id=order.kind==='king'?(hash%2?'king':'queen'):order.kind==='noblewoman'?'noblewoman':hash%3===0?'artisan':'noble';return CHARACTERS.find(c=>c.id===id);}
export function characterMarkup(id,direction='front',extra=''){const c=CHARACTERS.find(c=>c.id===id)||CHARACTERS[0],index=Math.max(0,DIRECTIONS.indexOf(direction));return `<div class="character-sprite ${extra}" data-character="${c.id}" data-direction="${DIRECTIONS[index]}" role="img" aria-label="${c.name} · ${DIRECTION_NAMES[index]} 모습" style="--character-sheet:url('./assets/characters/${c.id}.webp');--character-position:${index*100/3}%"></div>`;}

export const REACTION_MOODS=Object.freeze(['happy','uncertain','angry']);
const REACTION_LABELS={happy:'기쁘게 웃는',uncertain:'조금 아쉬워하는',angry:'화가 난'};
export function reactionMarkup(id,mood='happy'){
 const c=CHARACTERS.find(item=>item.id===id)||CHARACTERS[0];
 const expression=REACTION_MOODS.includes(mood)?mood:'uncertain';
 return `<img class="reaction-portrait" src="./assets/characters/reactions/${c.id}-${expression}.webp" alt="${REACTION_LABELS[expression]} ${c.name}의 반신상" data-character="${c.id}" data-mood="${expression}" width="512" height="768" draggable="false">`;
}

export function randomCustomerId(previous,rng=Math.random){const pool=CHARACTERS.filter(c=>c.id!==previous);const n=Number(rng());return pool[Math.max(0,Math.min(pool.length-1,Math.floor((Number.isFinite(n)?n:0)*pool.length)))].id;}
