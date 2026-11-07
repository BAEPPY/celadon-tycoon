import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ORDERS} from './domain.js';
import {CHARACTERS,reactionMarkup} from './characters.js';
import {ORDER_QUOTES,orderQuote,reviewMood,customerReview} from './dialogue.js';

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
 for(const frame of char.frames){const bytes=await readFile(new URL(frame.src,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),frame.sha256);assert.equal(bytes.subarray(8,12).toString(),'WEBP');}}
});
