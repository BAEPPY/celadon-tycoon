import test from 'node:test';
import assert from 'node:assert/strict';
import {restartFrom,restartInlay} from './workflow.js';
import {randomCustomerId} from './characters.js';
import {suggestedName,motifLabel} from './naming.js';
import {EXAMPLE_DESIGNS} from './example-orders.js';

const finished=()=>({id:'draft',orderId:'royal-rest',shape:'incense',modelId:'duckIncense',step:4,
 clay:{body:true,prepared:true,kneads:6,slip:'dark'},knead:3,sculpt:{complete:true},
 placements:[{pattern:'cloud'}],strokes:[],decorDone:true,decorPhase:2,inlay:{fillDone:true,wipeDone:true},inlayMode:'done',
 firing:['dry','biscuit','glaze','fire'],processVersion:2,glazeDip:{version:1,elapsedMs:5000},preview:'old',inspection:{done:true},assessment:{accepted:true},title:'old',explanationUse:'old',explanationBeauty:'old'});
test('뒤로 흙 준비에 가면 반죽과 이후 작업을 모두 다시 시작한다',()=>{
 const w=finished();restartFrom(w,'clay');assert.equal(w.clay.body,true);assert.equal(w.clay.kneads,0);assert.equal(w.clay.prepared,false);assert.equal(w.knead,0);assert.equal(w.sculpt,null);assert.equal(w.decorDone,false);assert.deepEqual(w.placements,[]);assert.deepEqual(w.firing,[]);assert.equal(w.preview,null);assert.equal(w.assessment,null);assert.equal(w.stationView,'clay');assert.equal(w.orderId,'royal-rest');
});
test('앞 단계로 돌아가면 해당 단계부터만 재시작한다',()=>{
 const w=finished();restartFrom(w,'decorate');assert.equal(w.clay.prepared,true);assert.equal(w.sculpt.complete,true);assert.equal(w.step,1);assert.deepEqual(w.placements,[]);assert.equal(w.inlay,undefined);assert.equal(w.inspection,null);
 restartFrom(w,'shape');assert.equal(w.clay.prepared,true);assert.equal(w.sculpt,null);assert.equal(w.knead,0);assert.equal(w.modelId,'duckIncense');
});
test('닦기에서 색흙으로 돌아가면 무늬는 두고 색흙부터 다시 채운다',()=>{
 const w=finished();restartInlay(w);assert.equal(w.inlayMode,'fill');assert.equal(w.inlay,undefined);assert.equal(w.placements.length,1);assert.equal(w.decorDone,false);assert.deepEqual(w.firing,[]);
});
test('앞 공정이나 상감으로 돌아가면 이전 유약 결과를 버리고 새 과정으로 평가한다',()=>{
 for(const station of ['clay','shape','decorate','kiln']) {
  const work=finished();work.processVersion=1;restartFrom(work,station);
  assert.equal(work.glazeDip,undefined,station);assert.equal(work.processVersion,2);assert.deepEqual(work.firing,[]);
 }
 const work=finished();restartInlay(work);assert.equal(work.glazeDip,undefined);assert.equal(work.processVersion,2);
});
test('손님은 난수로 선택하고 직전 손님을 반복하지 않는다',()=>{
 const ids=new Set([0,.21,.41,.61,.81].map(n=>randomCustomerId(undefined,()=>n)));assert.equal(ids.size,5);
 for(const id of ids)assert.notEqual(randomCustomerId(id,()=>.5),id);
});
test('청자 이름 힌트는 실제 기법·문양·형태를 사용한다',()=>{
 assert.equal(motifLabel('cloud'),'구름(운)');assert.equal(motifLabel('crane'),'학');
 assert.equal(suggestedName({shape:'maebyeong',technique:'inlay',placements:[{pattern:'crane'},{pattern:'cloud'}]}),'청자 상감 운학문 매병');
 assert.equal(suggestedName({shape:'incense',technique:'plain'}),'청자 향로');
});
test('오리 향로는 고를 수 있는 세부 형태이며 오리 도장을 요구하지 않는다',()=>{
 const duck=EXAMPLE_DESIGNS.find(d=>d.modelId==='duckIncense');assert.equal(duck.shape,'incense');assert.equal(duck.technique,'plain');assert.equal(duck.pattern,'any');assert.match(duck.request,/형태를 고르시오/);
});

test('되돌아가 새 무늬를 만들면 이름 힌트도 새 문양을 반영한다',()=>{
 const w=finished();w.technique='inlay';w.titleMotif='운문';restartFrom(w,'decorate');
 w.placements=[{pattern:'crane'},{pattern:'cloud'}];
 assert.equal(suggestedName(w),'청자 상감 운학문 향로');
 w.titleMotif='';assert.equal(suggestedName(w),'청자 상감 운학문 향로');
});
