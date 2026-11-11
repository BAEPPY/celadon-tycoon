import test from 'node:test';
import assert from 'node:assert/strict';
import {LoadingMotion} from './loading-motion.js';

function loadWithCadence(interval){
 const motion=new LoadingMotion(0);
 let completed=0,rate;
 for(let now=16;now<=interval*8;now+=16){
  const ready=Math.min(8,Math.floor(now/interval));
  if(ready>completed){completed=ready;motion.observe(completed/8,now);}
  rate=motion.rateAt(now);
 }
 return {motion,rate};
}

test('the same resources arriving quickly produce visibly faster footsteps',()=>{
 const fast=loadWithCadence(120),slow=loadWithCadence(1200);
 assert.ok(fast.rate>slow.rate+.7,`fast ${fast.rate}, slow ${slow.rate}`);
 assert.ok(fast.rate<=2.4&&slow.rate>=.35);
});

test('a stalled transfer slows down even if unchanged progress is reported repeatedly',()=>{
 const motion=new LoadingMotion(0);
 for(let now=100;now<=400;now+=100){motion.observe(now/500,now);motion.rateAt(now);}
 const fast=motion.playbackRate;
 for(let now=416;now<=6400;now+=16){motion.observe(.8,now);motion.rateAt(now);}
 assert.equal(motion.progress,.8,'animation never invents download progress');
 assert.ok(motion.playbackRate<fast-.7);
 assert.ok(motion.playbackRate>=.35&&motion.playbackRate<.42);
});

test('a speed observation changes cadence smoothly without restarting animation time',()=>{
 const motion=new LoadingMotion(0);
 motion.rateAt(1000);
 const before=motion.playbackRate;
 motion.observe(.5,1000);
 assert.equal(motion.rateAt(1000),before,'an observation does not jump at the same instant');
 const after=motion.rateAt(1016);
 assert.ok(after>before&&after-before<.15);
 const repeated=motion.rateAt(1016);
 assert.equal(repeated,after,'reading twice at one animation frame cannot advance it twice');
 for(let now=1032;now<=1300;now+=16)motion.rateAt(now);
 assert.ok(motion.playbackRate>after);
});

test('cache hits can complete immediately and malformed or stale observations stay harmless',()=>{
 const motion=new LoadingMotion(100);
 for(const progress of [.25,.5,.75,1])motion.observe(progress,100);
 assert.equal(motion.progress,1,'no minimum duration gates completion');
 for(const [progress,time] of [[NaN,110],[.5,120],[Infinity,130],[.9,90]])motion.observe(progress,time);
 assert.equal(motion.progress,1);
 for(const time of [100,116,NaN,80,300,10000]){
  const rate=motion.rateAt(time);
  assert.ok(Number.isFinite(rate)&&rate>=.35&&rate<=2.4);
 }
});

test('steady animation frames alone never turn an unfinished load into completion',()=>{
 const motion=new LoadingMotion(0);
 for(let now=16;now<60000;now+=16)motion.rateAt(now);
 assert.equal(motion.progress,0);
 assert.ok(motion.playbackRate>=.35&&motion.playbackRate<.351);
 motion.observe(.2,60000);
 assert.equal(motion.progress,.2);
});
