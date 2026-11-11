import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ORDERS} from './domain.js';
import {CHARACTERS,reactionMarkup} from './characters.js';
import {ORDER_QUOTES,orderQuote,reviewMood,customerReview} from './dialogue.js';

test('a completed pot with a glazing timing miss receives glazing feedback, not missing-stage feedback',()=>{
 for(const [glazeScore,feedback] of [[5,'유약이 얇으면 광택과 빛깔이 덜 나타날 수 있어요.'],[3,'유약이 너무 두꺼우면 흘러내리거나 갈라질 수 있어요.']]){
  const score={objective:70+glazeScore,total:90+glazeScore,breakdown:[{key:'process',score:20+glazeScore,max:30,glazeScore,feedback}]};
  const review=customerReview(ORDERS[0],score,{id:'glaze-timing'});
  assert.match(review.quote,/제작 순서는 잘/);assert.match(review.detail,/5초/);
  assert.doesNotMatch(review.quote+' '+review.detail,/빠진|남은|끝나지|마무리하시오/);
 }
});

test('all playable orders have archaic dialogue and retain their motif and technique requirements',()=>{
 const words={crane:'학',cloud:'구름',lotus:'연꽃',chrysanthemum:'국화',willow:'버드나무',plum:'매화',bamboo:'대나무',grape:'포도',wildflower:'풀꽃',peony:'모란',text:'글자'};
 for(const order of ORDERS){const quote=orderQuote(order);assert.ok(ORDER_QUOTES[order.id],order.id);assert.doesNotMatch(quote,/주세요|필요해요|합니다|주실래요|맡길게요/);assert.match(quote,/하오|시오|싶소|겠소|있소/);
  for(const id of order.requiredPatterns||[order.pattern])if(id!=='any')assert.ok(quote.includes(words[id]),`${order.id}: ${id}`);
  if(order.technique==='openwork')assert.match(quote,/뚫|구멍/);
  if(order.technique==='inlay')assert.match(quote,/상감|다른 색.*흙/);
  if(order.technique==='plain')assert.match(quote,/새 무늬는 넣지 마시오/);
 }
});
test('animal-shaped vessels do not ask for nonexistent animal stamps',()=>{
 for(const id of ['example-duckIncense','example-duckDropper']){const quote=ORDER_QUOTES[id];assert.match(quote,/형태를 고르/);assert.match(quote,/새 무늬는 넣지 마시오/);assert.doesNotMatch(quote,/오리 무늬|오리무늬/);}
});
test('portrait mood follows fulfillment while each customer has varied appropriate dialogue',()=>{
 assert.equal(reviewMood({objective:80,total:95}),'happy');assert.equal(reviewMood({objective:70,total:90}),'uncertain');assert.equal(reviewMood({objective:40,total:50}),'angry');
 for(const order of ORDERS){const lines=new Set();for(let i=0;i<12;i++){const review=customerReview(order,{objective:80,total:100,breakdown:[]},{id:'work-'+i});lines.add(review.headline);assert.equal(review.mood,'happy');assert.ok(CHARACTERS.some(c=>c.id===review.character));}assert.ok(lines.size>=2);}
});
test('portrait paths cannot be changed by arbitrary ids and moods',()=>{const markup=reactionMarkup('../oops','<script>');assert.ok(markup.includes('king-uncertain.webp'));assert.ok(!markup.includes('<script>'));});
test('all 15 expression images preserve generated sources and recorded hashes',async()=>{
 const manifest=JSON.parse(await readFile(new URL('./assets/characters/reactions/manifest.json',import.meta.url),'utf8'));
 assert.deepEqual(manifest.moods,['happy','uncertain','angry']);assert.equal(manifest.characters.length,5);
 for(const char of manifest.characters){const original=await readFile(new URL('./assets/characters/reactions/'+char.source,import.meta.url));assert.equal(createHash('sha256').update(original).digest('hex'),char.sourceSha256);assert.equal(original[25],6,'source has alpha');assert.equal(char.frames.length,3);
 for(const frame of char.frames){if(frame.source){const source=await readFile(new URL('./assets/characters/reactions/'+frame.source,import.meta.url));assert.equal(createHash('sha256').update(source).digest('hex'),frame.sourceSha256);assert.equal(source.readUInt32BE(16),frame.sourceWidth);assert.equal(source.readUInt32BE(20),frame.sourceHeight);}const bytes=await readFile(new URL(frame.src,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),frame.sha256);assert.equal(bytes.subarray(8,12).toString(),'WEBP');}}
});

test('perfect construction with weak explanations praises the pot and asks only for its story',()=>{
 const score={objective:80,self:0,total:80,breakdown:[{key:'use',score:40,max:40},{key:'process',score:30,max:30},{key:'design',score:10,max:10},{key:'selfUse',score:0,max:10,feedback:'이유를 보태 주세요.'},{key:'selfBeauty',score:0,max:10}]};
 for(const character of CHARACTERS){const lines=new Set();for(let i=0;i<12;i++){const review=customerReview(ORDERS[0],score,{customerId:character.id,id:'explanation-'+i});assert.equal(review.mood,'uncertain');assert.equal(review.focus,'selfUse');assert.match(review.quote,/잘|맞|제대로|흐뭇|갖추|좋|완성|익혔/);assert.match(review.quote,/까닭|설명|이야기|생각|말로|들려|보태/);assert.doesNotMatch(review.headline+' '+review.quote,/형편없|주문과.*다르|모양.*다시 맞|쓰임을 놓|다시 빚|빠진 조건|고쳐/);lines.add(review.quote);}assert.ok(lines.size>=2);}
});
test('the actual deficient construction criterion takes precedence over low writing points',()=>{
 const make=(key,feedback)=>({objective:key==='use'?40:key==='process'?50:70,total:key==='use'?40:key==='process'?50:70,breakdown:[{key:'use',score:key==='use'?0:40,max:40,feedback:key==='use'?feedback:''},{key:'process',score:key==='process'?0:30,max:30,feedback:key==='process'?feedback:''},{key:'design',score:key==='design'?0:10,max:10,feedback:key==='design'?feedback:''},{key:'selfUse',score:0,max:10}]});
 for(const character of CHARACTERS){
  const work={id:'criterion',customerId:character.id};
  const use=customerReview(ORDERS[0],make('use','이 주문에는 베개의 쓰임이 어울려요.'),work);assert.equal(use.focus,'use');assert.match(use.detail,/베개/);
  const process=customerReview(ORDERS[0],make('process','건조 → 초벌구이 → 유약 바르기 → 재벌구이 순서로 다시 확인해 보세요.'),work);assert.equal(process.focus,'process');assert.match(process.quote,/제작|과정|단계/);assert.doesNotMatch(process.quote,/형태.*다르|쓰임.*다르/);
  const technique=customerReview(ORDERS[0],make('design','이 주문에는 상감 기법이 필요해요.'),work);assert.equal(technique.focus,'design');assert.match(technique.detail,/상감/);assert.doesNotMatch(technique.quote,/기물의 종류|쓰임.*다르/);
  const motif=customerReview(ORDERS[0],make('design','주문에 있는 학를 다시 확인해 보세요.'),work);assert.match(motif.detail,/학 무늬/);
 }
});
