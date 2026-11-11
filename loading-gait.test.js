import test from 'node:test';
import assert from 'node:assert/strict';
import {RUN_FRAME_COUNT,RUN_GAIT,getRunPose,getRunFrame} from './loading-gait.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const close=(a,b,epsilon=1e-9)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} differs from ${b}`);

test('24 running frames preserve leg identity, depth, proportions, and a single forward knee hinge',()=>{
 assert.equal(RUN_FRAME_COUNT,24);
 for(let frame=0;frame<RUN_FRAME_COUNT;frame++){
  const pose=getRunFrame(frame);
  assert.equal(pose.left.side,'left');assert.equal(pose.left.depth,'far');
  assert.equal(pose.right.side,'right');assert.equal(pose.right.depth,'near');
  close(pose.left.hip.x,.47);close(pose.right.hip.x,.50);
  close(pose.left.hip.y,pose.right.hip.y);
  for(const leg of [pose.left,pose.right]){
   for(const point of [leg.hip,leg.knee,leg.ankle])assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y));
   close(distance(leg.hip,leg.knee),RUN_GAIT.thighLength);
   close(distance(leg.knee,leg.ankle),RUN_GAIT.shinLength);
   const dx=leg.ankle.x-leg.hip.x,dy=leg.ankle.y-leg.hip.y;
   const forwardBend=(leg.knee.x-leg.hip.x)*dy-(leg.knee.y-leg.hip.y)*dx;
   assert.ok(forwardBend>.001,'the knee always uses the same visibly bent forward hinge');
   assert.ok(Math.cos(leg.footAngle*Math.PI/180)>0,'toes never turn backward');
  }
 }
});

test('ground contact is flat and backward-moving, alternating between permanent legs',()=>{
 let rightContacts=0,leftContacts=0,airborne=0;
 for(let frame=0;frame<24;frame++){
  const pose=getRunFrame(frame);
  assert.equal(pose.left.grounded&&pose.right.grounded,false,'a run has no double-support phase');
  rightContacts+=pose.right.grounded?1:0;leftContacts+=pose.left.grounded?1:0;
  airborne+=!pose.left.grounded&&!pose.right.grounded?1:0;
 }
 assert.equal(rightContacts,8);assert.equal(leftContacts,8);assert.equal(airborne,8);
 for(let i=0;i<=320;i++){
  const phase=i/1000,leg=getRunPose(phase).right;
  assert.equal(leg.grounded,true);close(leg.ankle.y,RUN_GAIT.groundY);close(leg.footAngle,0);
  if(i)assert.ok(leg.ankle.x<getRunPose((i-1)/1000).right.ankle.x);
 }
 const start=getRunPose(0),opposite=getRunPose(.5);
 close(start.right.ankle.x-start.right.hip.x,opposite.left.ankle.x-opposite.left.hip.x);
 close(start.right.ankle.y,opposite.left.ankle.y);
});

test('recovery folds the heel, brings the foot forward, and lands without limb flips or overextension',()=>{
 const early=getRunPose(.46).right,middle=getRunPose(.62).right,late=getRunPose(.91).right;
 assert.ok(early.ankle.x<early.hip.x&&early.ankle.y<.8,'heel lifts behind the hip');
 assert.ok(middle.ankle.y<middle.knee.y,'folded heel passes above the knee during recovery');
 assert.ok(late.ankle.x>late.hip.x&&late.ankle.y<RUN_GAIT.groundY,'foot reaches forward before landing');
 for(const phase of [.44,.46,.48,.50]){const angle=getRunPose(phase).right.footAngle;assert.ok(angle>=75&&angle<=85,'the recovered heel points its shoe down, clear of the folded calf');}
 close(middle.footAngle,40);close(getRunPose(.8).right.footAngle,-20);
 let previous=getRunPose(0);
 for(let i=1;i<=2400;i++){
  const current=getRunPose(i/2400);
  assert.ok(current.body.bob>=0&&current.body.bob<=.012);
  for(const side of ['left','right']){
   const leg=current[side];
   close(distance(leg.hip,leg.knee),RUN_GAIT.thighLength);
   close(distance(leg.knee,leg.ankle),RUN_GAIT.shinLength);
   assert.ok(distance(leg.hip,leg.ankle)<(RUN_GAIT.thighLength+RUN_GAIT.shinLength)*.986);
   assert.ok(leg.ankle.y<=RUN_GAIT.groundY+1e-9,'feet never pass through the floor');
   assert.ok(distance(previous[side].knee,leg.knee)<.003,'no instantaneous knee hinge flip');
   assert.ok(distance(previous[side].ankle,leg.ankle)<.003,'no foot jump between keys');
  }
  previous=current;
 }
});

test('the stride loops continuously and each frame has the opposite leg pose half a stride later',()=>{
 const start=getRunPose(0),end=getRunPose(1);
 assert.deepEqual(start,end);
 for(const side of ['left','right'])for(const joint of ['hip','knee','ankle'])assert.ok(distance(getRunPose(1-1e-6)[side][joint],start[side][joint])<1e-5);
 assert.deepEqual(getRunFrame(24),getRunFrame(0));
 assert.deepEqual(getRunFrame(-1),getRunFrame(23));
 assert.deepEqual(getRunPose(NaN),start);
 for(let frame=0;frame<24;frame++){
  const a=getRunFrame(frame).right,b=getRunFrame(frame+12).left;
  for(const joint of ['hip','knee','ankle']){close(a[joint].x-a.hip.x,b[joint].x-b.hip.x);close(a[joint].y,b[joint].y);}
  close(a.footAngle,b.footAngle);assert.equal(a.grounded,b.grounded);
 }
});
