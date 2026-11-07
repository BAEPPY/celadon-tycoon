import test from 'node:test';
import assert from 'node:assert/strict';
import {newInspection,normalizeInspection,smashSample,retryInspection,inspectionMarkup} from './inspection.js';

test('네 청자는 정상 하나와 세 종류의 흠으로 구성되고 잘못된 난수에도 빠지지 않는다',()=>{
 for(const value of [0,.3,.999,1,-1,NaN]){const state=newInspection(()=>value);assert.equal(state.version,2);assert.deepEqual([...state.items].sort(),['crack','glaze','sound','warped']);assert.deepEqual(state.broken,[]);assert.equal(state.done,false);}
});
test('흠 있는 세 점만 깨면 정상 한 점을 남기고 원래 상태를 바꾸지 않는다',()=>{
 const original=newInspection(()=>.3),copy=structuredClone(original);let state=original;
 for(const [i,kind]of state.items.entries())if(kind!=='sound'){state=smashSample(state,i);assert.equal(state.failed,false);}
 assert.equal(state.done,true);assert.equal(state.correct,3);assert.equal(state.broken.length,3);assert.equal(state.items.find((_,i)=>!state.broken.includes(i)),'sound');assert.deepEqual(original,copy);
 assert.deepEqual(smashSample(state,state.items.indexOf('sound')),state,'완료 뒤에는 남긴 청자를 깰 수 없다');
});
test('같은 도자기를 중복 선택해도 추가 파손이나 완료가 되지 않는다',()=>{
 const initial=newInspection(()=>0),index=initial.items.indexOf('crack'),once=smashSample(initial,index);
 assert.deepEqual(smashSample(once,index),once);for(const invalid of [-1,4,NaN,1.5,'1'])assert.deepEqual(smashSample(once,invalid),once);
});
test('정상 청자를 깨면 실패하고 재도전에서 네 점을 온전히 복원한다',()=>{
 const initial=newInspection(()=>.2),failed=smashSample(initial,initial.items.indexOf('sound'));
 assert.equal(failed.failed,true);assert.equal(failed.done,false);assert.equal(failed.correct,0);assert.deepEqual(smashSample(failed,0),failed);
 const retry=retryInspection(failed,()=>.7);assert.equal(retry.failed,false);assert.equal(retry.done,false);assert.deepEqual(retry.broken,[]);assert.equal(retry.attempts,1);assert.deepEqual([...retry.items].sort(),['crack','glaze','sound','warped']);assert.equal(failed.broken.length,1);
});
test('이전 선별 저장은 새 게임으로 이어지고 완료 저장은 한 점을 남긴 상태로 복원한다',()=>{
 const legacy={items:['sound','crack','warped','glaze'],index:2,correct:2,answer:null,done:false};
 const restored=normalizeInspection(legacy);assert.equal(restored.version,2);assert.deepEqual(restored.broken,[]);assert.equal(restored.done,false);
 const done=normalizeInspection({...legacy,done:true});assert.equal(done.done,true);assert.deepEqual(done.broken,[1,2,3]);
 const bad=normalizeInspection({version:2,items:['sound','sound','warped','glaze'],broken:[1,2,3]});assert.equal(bad.done,false);assert.equal(new Set(bad.items).size,4);
 const state=normalizeInspection({...newInspection(()=>0),broken:[0,0,-1,99,'1']});assert.deepEqual(state.broken,[0]);
});
test('선별 화면은 네 청자를 동시에 보여 주며 실패와 재도전·전달 상태를 구분한다',()=>{
 const work={preview:'data:image/webp;base64,example',inspection:newInspection(()=>0)};const html=inspectionMarkup(work);assert.equal((html.match(/data-inspect-index=/g)||[]).length,4);assert.ok(!html.includes('inspection-sample'));assert.ok(!html.includes('inspection-feedback'));assert.ok(!html.includes('inspection-retry'));
 work.inspection=smashSample(work.inspection,work.inspection.items.indexOf('sound'));const failure=inspectionMarkup(work);assert.match(failure,/실패\.\./);assert.match(failure,/다시 골라볼까요/);assert.match(failure,/data-inspection-retry/);assert.equal(work.preview,'data:image/webp;base64,example');
});
