import test from 'node:test';
import assert from 'node:assert/strict';
import {followRotation,releasedRotationTarget} from './rotation-motion.js';

test('drag follows continuously across the last/first authored pose without overshooting',()=>{
  let position=23;
  const samples=[];
  for(let n=0;n<30;n++){position=followRotation(position,26,16);samples.push(position);}
  assert.ok(samples[0]>23&&samples[0]<24);
  assert.ok(samples.every((p,i)=>p<=26&&(!i||p>=samples[i-1])));
  assert.equal(samples.at(-1),26);
  assert.ok(samples.some(p=>p!==Math.round(p)));
});
test('release momentum stays small and disappears after a held pointer or reduced motion',()=>{
  assert.equal(releasedRotationTarget(10,.5,5),12);
  assert.equal(releasedRotationTarget(10,-.5,5),9);
  assert.equal(releasedRotationTarget(10.3,.5,100),10);
  assert.equal(releasedRotationTarget(10.3,.5,5,true),10);
  assert.equal(followRotation(2,9,16,true),9);
  assert.equal(followRotation(2,9,0),2);
});
