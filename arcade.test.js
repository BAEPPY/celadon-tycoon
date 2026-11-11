import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {carveAlong,newKiln,stepKiln,fanKiln,KILN_HEAT_RULES,timingHit,timingPosition,dryingFanGeometry,dryingFanGrabOffset,dryWithFan} from './arcade-rules.js';
import {subtractPunch,makePunch} from './openwork.js';
import {CHARACTERS,castForOrder} from './characters.js';
import {ORDERS} from './domain.js';

test('흙 깎기는 목표 윤곽을 따라야 진행되고 바깥 드래그는 진행되지 않는다',()=>{const guide=[[.2,.2],[.8,.2],[.8,.8],[.2,.8]];let state=carveAlong(guide,[],[0,0],[.05,.05]);assert.equal(state.fraction,0);state=carveAlong(guide,state.visited,[.2,.2],[.8,.2]);assert.equal(state.fraction,.5);assert.equal(state.complete,false);state=carveAlong(guide,state.visited,[.8,.8],[.2,.8]);assert.equal(state.complete,true);});
test('건조는 초록 구간의 정확한 타이밍만 성공한다',()=>{assert.equal(timingHit(.65),true);assert.equal(timingHit(.3),false);for(let t=0;t<10;t+=.01)assert.ok(timingPosition(t)>=0&&timingPosition(t)<=1);});
test('초벌과 재벌은 약 초당 두 번의 부채질로 적정 온도를 유지할 수 있다',()=>{for(const kind of ['biscuit','fire']){let state=newKiln(kind);for(let i=0;i<1000&&!state.complete&&!state.failed;i++){if(i%20===0)state=fanKiln(state);state=stepKiln(state,.025);}assert.equal(state.complete,true);assert.ok(state.steady>=KILN_HEAT_RULES.steadySeconds);assert.ok(state.elapsed<7);}});
test('한 번 누르고 계속 유지하거나 손을 놓으면 자동 완료되지 않는다',()=>{for(const tap of [true,false]){let state=newKiln('fire');if(tap)state=fanKiln(state);for(let i=0;i<500;i++)state=stepKiln(state,.025,true);assert.equal(state.failed,true);assert.equal(state.complete,false);assert.equal(newKiln('fire').failed,false);}});
test('적정 온도는 같은 중심에서 1.5배 넓어진 41.5~68.5%이며 한 번의 부채질 세기는 같다',()=>{
 assert.equal(KILN_HEAT_RULES.safeMin,.415);assert.equal(KILN_HEAT_RULES.safeMax,.685);
 assert.ok(Math.abs((KILN_HEAT_RULES.safeMin+KILN_HEAT_RULES.safeMax)/2-.55)<1e-12);
 assert.ok(Math.abs((KILN_HEAT_RULES.safeMax-KILN_HEAT_RULES.safeMin)/(.64-.46)-1.5)<1e-12);
 for(const kind of ['biscuit','fire']){
  const initial=newKiln(kind),tapped=fanKiln(initial);assert.equal(initial.heat,.5);assert.equal(tapped.heat,.6);
  // Supply the pre-cooling heat so the assertion tests each exact judged edge.
  const dt=.01,cooling=KILN_HEAT_RULES.cooling*dt;
  for(const heat of [.415,.44,.55,.66,.685])assert.ok(stepKiln({...tapped,heat:heat+cooling},dt).steady>0,`${kind}: ${heat} is accepted`);
  for(const heat of [.414,.686])assert.equal(stepKiln({...tapped,heat:heat+cooling},dt).steady,0,`${kind}: ${heat} is outside`);
 }
});
test('부채질 전에는 진행되지 않고 멈추면 초벌과 재벌 진행 막대가 0으로 돌아간다',()=>{
 for(const kind of ['biscuit','fire']){
  let state=newKiln(kind);
  for(let i=0;i<4;i++){state=stepKiln(state,.025);assert.equal(state.steady,0);}
  state=newKiln(kind);
  for(let i=0;i<120;i++){if(i%20===0)state=fanKiln(state);state=stepKiln(state,.025);}
  assert.ok(state.steady>2.9&&state.steady<3.1);
  const earned=state.steady;
  for(let i=0;i<32;i++)state=stepKiln(state,.025);
  assert.ok(state.steady<earned&&state.steady>0,'cooling visibly drains progress instead of instantly resetting');
  for(let i=0;i<80;i++)state=stepKiln(state,.025);
  assert.equal(state.steady,0);assert.equal(state.complete,false);
  for(let i=0;i<100;i++)state=stepKiln(state,.025);
  assert.equal(state.failed,true);assert.equal(state.steady,0);
 }
});
test('짧은 부채질 간격은 진행을 지키며 식었다가 다시 부채질해도 완료할 수 있다',()=>{
 for(const kind of ['biscuit','fire']){
  let state=fanKiln(newKiln(kind));
  for(let i=0;i<20;i++)state=stepKiln(state,.025);
  assert.ok(state.steady>.49,'a normal half-second tap interval remains in the good range');
  for(let i=0;i<32;i++)state=stepKiln(state,.025);
  assert.equal(state.steady,0);assert.equal(state.failed,false);
  for(let i=0;i<400&&!state.complete&&!state.failed;i++){
   if(state.heat<.52)state=fanKiln(state);
   state=stepKiln(state,.025);
  }
  assert.equal(state.complete,true);assert.equal(state.failed,false);
 }
});
test('과열 실패는 남은 진행을 지우고 완료된 가마의 점수는 유지한다',()=>{
 for(const kind of ['biscuit','fire']){
  const active={...fanKiln(newKiln(kind)),steady:4,heat:1,elapsed:3,overheat:.84};
  const failed=stepKiln(active,.025);assert.equal(failed.failed,true);assert.equal(failed.steady,0);
  const complete={...active,complete:true,steady:KILN_HEAT_RULES.steadySeconds};
  assert.deepEqual(stepKiln(complete,.1),complete);assert.deepEqual(fanKiln(complete),complete);
 }
});
test('지나치게 자주 부채질하면 과열되어 다시 도전해야 한다',()=>{let state=newKiln('fire');for(let i=0;i<200;i++){state=fanKiln(state);state=stepKiln(state,.025);}assert.equal(state.failed,true);assert.equal(state.complete,false);});
test('새로 고침이나 긴 프레임으로 가마가 순간 완료되지 않는다',()=>{const state=stepKiln(newKiln('fire'),60);assert.ok(state.elapsed<=.1);assert.equal(state.complete,false);});
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

const dryTargets=bounds=>Array.from({length:24},(_,row)=>Array.from({length:36},(_,col)=>({x:bounds.x+(col+.5)/36*bounds.width,y:bounds.y+(row+.5)/24*bounds.height}))).flat();
const sum=values=>values.reduce((a,b)=>a+b,0);
test('말리기는 손잡이가 낮은 청자 밖에 있어도 보이는 부채 면의 접촉을 따른다',()=>{
 const viewport={width:600,height:400},bounds={x:.2,y:.52,width:.6,height:.18},targets=dryTargets(bounds),from=[.45,.7626],to=[.48,.7626];
 const blade=dryingFanGeometry(from,viewport);
 assert.ok(from[1]>bounds.y+bounds.height,'the handle lies below the short vessel');
 assert.ok(blade.center[1]/viewport.height>bounds.y&&blade.center[1]/viewport.height<bounds.y+bounds.height);
 const progress=dryWithFan([0,0,0],from,to,viewport,targets,bounds);
 assert.ok(sum(progress)>.03&&sum(progress)<.07,'an 18px sweep contributes only a small amount');
 assert.ok(progress[1]>progress[0]&&progress[1]>progress[2],'the blade over the middle mainly dries the middle');
});
test('아주 작은 이동도 누적되며 같은 부채 경로의 진행도는 이벤트 횟수에 좌우되지 않는다',()=>{
 const viewport={width:600,height:400},bounds={x:.2,y:.52,width:.6,height:.18},targets=dryTargets(bounds),from=[.45,.7626],to=[.48,.7626];
 const coarse=dryWithFan([0,0,0],from,to,viewport,targets,bounds);let fine=[0,0,0];
 for(let i=0;i<72;i++){const a=[from[0]+(to[0]-from[0])*i/72,from[1]],b=[from[0]+(to[0]-from[0])*(i+1)/72,from[1]];fine=dryWithFan(fine,a,b,viewport,targets,bounds);}
 assert.ok(sum(fine)>.03,'0.25px moves are not discarded');
 fine.forEach((value,i)=>assert.ok(Math.abs(value-coarse[i])<.001));
});
test('한 곳만 부채질하면 다른 건조 구역은 완료되지 않는다',()=>{
 const viewport={width:600,height:500},bounds={x:.35,y:.12,width:.3,height:.74},targets=dryTargets(bounds);
 const handleY=bounds.y+bounds.height/6+(.928571-.42)*120/viewport.height,from=[.46,handleY],to=[.54,handleY];
 let progress=[0,0,0];for(let i=0;i<20;i++)progress=dryWithFan(progress,i%2?to:from,i%2?from:to,viewport,targets,bounds);
 assert.equal(progress[0],1);assert.equal(progress[1],0);assert.equal(progress[2],0);
});
test('정지·빈 공간·화면 끝에서 부채가 움직이지 않는 드래그는 건조되지 않는다',()=>{
 const viewport={width:600,height:400},bounds={x:.2,y:.52,width:.6,height:.18},targets=dryTargets(bounds),initial=[.1,.2,.3];
 for(const [a,b] of [[[.5,.76],[.5,.76]],[[.1,.2],[.2,.2]],[[0,.75],[.01,.75]]])assert.deepEqual(dryWithFan(initial,a,b,viewport,targets,bounds),initial);
 assert.deepEqual(dryWithFan(initial,[.45,.76],[.48,.76],viewport,[],bounds),initial,'transparent openings have no drying targets');
});
test('키보드 부채질도 같은 보이는 부채 접촉을 사용하고 한 번에 전체를 완료하지 않는다',()=>{
 const viewport={width:600,height:400},bounds={x:.2,y:.52,width:.6,height:.18},targets=dryTargets(bounds),point=[.5,.7626];
 const progress=dryWithFan([0,0,0],point,point,viewport,targets,bounds,{keyboard:true});
 assert.ok(sum(progress)>.3&&sum(progress)<=.34);
 assert.ok(progress[1]>progress[0]&&progress[1]>progress[2]);
 assert.deepEqual(dryWithFan([0,0,0],[.1,.2],[.1,.2],viewport,targets,bounds,{keyboard:true}),[0,0,0]);
});
test('부채 면을 잡아도 그림이 뛰지 않고 가장자리에서도 실제 보이는 손잡이를 기준으로 끈다',()=>{
 const viewport={width:390,height:330};
 for(const current of [[.5,.7],[.01,.01],[.99,.99]]){
  const before=dryingFanGeometry(current,viewport),point=[before.center[0]/viewport.width,before.center[1]/viewport.height],offset=dryingFanGrabOffset(point,current,viewport);
  const after=dryingFanGeometry(point.map((v,i)=>v+offset[i]),viewport);
  assert.ok(Math.abs(before.x-after.x)<1e-8&&Math.abs(before.y-after.y)<1e-8);
 }
 assert.deepEqual(dryingFanGrabOffset([.95,.05],[.5,.7],viewport),[0,0],'empty-space presses place the fan normally');
});
