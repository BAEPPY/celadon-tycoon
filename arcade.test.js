import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {carveAlong,newKiln,stepKiln,timingHit,timingPosition} from './arcade-rules.js';
import {subtractPunch,makePunch} from './openwork.js';
import {CHARACTERS,castForOrder} from './characters.js';
import {ORDERS} from './domain.js';

test('흙 깎기는 목표 윤곽을 따라야 진행되고 바깥 드래그는 진행되지 않는다',()=>{const guide=[[.2,.2],[.8,.2],[.8,.8],[.2,.8]];let state=carveAlong(guide,[],[0,0],[.05,.05]);assert.equal(state.fraction,0);state=carveAlong(guide,state.visited,[.2,.2],[.8,.2]);assert.equal(state.fraction,.5);assert.equal(state.complete,false);state=carveAlong(guide,state.visited,[.8,.8],[.2,.8]);assert.equal(state.complete,true);});
test('건조는 초록 구간의 정확한 타이밍만 성공한다',()=>{assert.equal(timingHit(.65),true);assert.equal(timingHit(.3),false);for(let t=0;t<10;t+=.01)assert.ok(timingPosition(t)>=0&&timingPosition(t)<=1);});
test('초벌과 재벌은 누르고 떼며 초록 온도를 유지해야 완료된다',()=>{for(const kind of ['biscuit','fire']){let state=newKiln(kind);for(let i=0;i<1000&&!state.complete&&!state.failed;i++)state=stepKiln(state,.025,state.heat<.51);assert.equal(state.complete,true);assert.ok(state.steady>=5.5);}});
test('스페이스바를 계속 누르거나 놓아두면 가마 실패 후 재도전한다',()=>{for(const held of [true,false]){let state=newKiln('fire');for(let i=0;i<500;i++)state=stepKiln(state,.025,held);assert.equal(state.failed,true);assert.equal(state.complete,false);assert.equal(newKiln('fire').failed,false);}});
test('새로 고침이나 긴 프레임으로 가마가 순간 완료되지 않는다',()=>{const state=stepKiln(newKiln('fire'),60,true);assert.ok(state.elapsed<=.1);assert.equal(state.complete,false);});
test('투각은 실제 삼각형을 제거하여 앞뒤가 관통하고, undo용 원본은 보존한다',()=>{const original=new T.BoxGeometry(2,2,2);const originalCount=original.attributes.position.count,punch=makePunch({pattern:'lotus',point:[0,0,1],normal:[0,0,1]},new T.Vector3());const ray=new T.Raycaster(new T.Vector3(0,0,3),new T.Vector3(0,0,-1));const material=new T.MeshBasicMaterial({side:T.DoubleSide}),solid=new T.Mesh(original,material);solid.updateMatrixWorld(true);assert.ok(ray.intersectObject(solid).length>0);const cut=subtractPunch(original,punch),perforated=new T.Mesh(cut,material);perforated.updateMatrixWorld(true);assert.equal(ray.intersectObject(perforated).length,0);ray.ray.origin.x=.9;assert.ok(ray.intersectObject(perforated).length>0);assert.equal(original.attributes.position.count,originalCount);original.dispose();cut.dispose();punch.geometry.dispose();material.dispose();});
test('다섯 손님이 실제 주문의 배역으로 등장한다',()=>{assert.equal(CHARACTERS.length,5);assert.equal(new Set(ORDERS.map(castForOrder).map(c=>c.id)).size,5);});

test('캐릭터 5명은 투명 4방향 원본과 게임용 이미지의 해시를 보존한다', async()=>{
 const {readFile}=await import('node:fs/promises');const {createHash}=await import('node:crypto');
 const manifest=JSON.parse(await readFile(new URL('./assets/characters/manifest.json',import.meta.url),'utf8'));
 assert.equal(manifest.assets.length,5);
 for(const character of CHARACTERS){const record=manifest.assets.find(r=>r.id===character.id);assert.ok(record);assert.deepEqual(record.frames,['front','back','left','right']);assert.equal(record.alpha,true);assert.ok(record.width/4>200&&record.height>600);for(const [field,hash] of [['source','sourceSha256'],['runtime','runtimeSha256']]){const bytes=await readFile(new URL('./assets/characters/'+record[field],import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),record[hash]);}}
});

test('태토는 몸통용, 백토와 자토는 상감용으로 선택되며 반죽 6회 뒤에만 준비된다',async()=>{
 const {freshClay,chooseClay,kneadClay}=await import('./clay.js');let clay=freshClay();clay=chooseClay(clay,'dark');assert.equal(clay.body,true);assert.equal(clay.slip,'dark');assert.equal(kneadClay(clay).kneads,1);clay=chooseClay(clay,'celadon');for(let i=0;i<5;i++)clay=kneadClay(clay);assert.equal(clay.prepared,false);clay=kneadClay(clay);assert.equal(clay.prepared,true);assert.equal(clay.kneads,6);assert.equal(clay.slip,'dark');assert.equal(kneadClay(clay).kneads,6);
});

test('선별 연습은 정상·금·기울어짐·유약 비교품을 하나씩 보여 주며 본 작품을 바꾸지 않는다',async()=>{
 const {newInspection,classifySample,nextSample}=await import('./inspection.js');let inspection=newInspection(()=>.3);assert.deepEqual([...inspection.items].sort(),['crack','glaze','sound','warped']);const original=structuredClone(inspection);for(let i=0;i<4;i++){const bin=inspection.items[inspection.index]==='sound'?'deliver':'hold';inspection=classifySample(inspection,bin);assert.equal(inspection.answer.correct,true);inspection=nextSample(inspection);}assert.equal(inspection.done,true);assert.equal(inspection.correct,4);assert.equal(original.correct,0);
});

test('불량품을 납품으로 잘못 골라도 이유를 알려 주고 중복 채점하지 않는다',async()=>{
 const {classifySample,nextSample}=await import('./inspection.js');const state={items:['crack'],index:0,correct:0,answer:null,done:false};const judged=classifySample(state,'deliver');assert.equal(judged.correct,0);assert.match(judged.answer.feedback,/금/);assert.equal(classifySample(judged,'hold').correct,0);assert.equal(nextSample(judged).done,true);assert.equal(state.answer,null);
});
