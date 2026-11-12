import test from 'node:test';
import assert from 'node:assert/strict';
import {settleSculptLocks, nextUnlockedSculptPoint, snapSculptGrip} from './sculpt-locks.js';
import {Craft2D} from './craft-2d.js';

const guide = [[.5,.1],[.8,.5],[.5,.9],[.2,.5]];
test('a grip locks only to its own nearby goal, not an unrelated crossing edge', () => {
  const clay = [[.5,.3],[.79,.5],[.5,.8],[.8,.5]];
  const result = settleSculptLocks(clay,guide,[],400,400);
  assert.deepEqual(result.locked,[false,true,false,false]);
  assert.deepEqual(result.points[1],guide[1]);
  assert.deepEqual(result.points[3],clay[3],'a point on a different target is not frozen there');
  assert.deepEqual(clay[1],[.79,.5],'input geometry stays unchanged');
});

test('locks remain exact when later movement comes from an older drag snapshot', () => {
  const clay = guide.map(p=>[p[0]+.1,p[1]+.1]);
  const before = structuredClone(clay);
  const result = settleSculptLocks(clay,guide,[true,false,true,false],400,400);
  assert.deepEqual(result.points[0],guide[0]);assert.deepEqual(result.points[2],guide[2]);
  assert.deepEqual(result.points[1],before[1]);assert.deepEqual(result.points[3],before[3]);
  assert.deepEqual(result.locked,[true,false,true,false]);
});

test('restoring undo or an unlocked saved state does not silently acquire locks', () => {
  const clay=guide.map(p=>[p[0]+.001,p[1]]),locked=[false,true,false,false];
  const result=settleSculptLocks(clay,guide,locked,400,400,false);
  assert.deepEqual(result.locked,locked);
  assert.deepEqual(result.points[0],clay[0]);
  assert.deepEqual(result.points[1],guide[1]);
});

test('the snap allowance scales with the target rather than the screen or display density', () => {
  const clay=guide.map((p,i)=>[p[0]+(i%2?.01:.04),p[1]]);
  const reference=settleSculptLocks(clay,guide,[],400,400);
  for(const [width,height,scale] of [[1024,600,270],[390,844,180],[2048,1200,540]]){
    const screen=points=>points.map(([x,y])=>[(40+x*scale)/width,(70+y*scale)/height]);
    const result=settleSculptLocks(screen(clay),screen(guide),[],width,height);
    assert.deepEqual(result.locked,reference.locked);
  }
});

test('keyboard and touch helpers move between only unfinished grips and stop safely when all are fixed', () => {
  assert.equal(nextUnlockedSculptPoint([true,false,true,false],1),3);
  assert.equal(nextUnlockedSculptPoint([true,false,true,false],1,-1),3);
  assert.equal(nextUnlockedSculptPoint([true,false,true,false],3),1);
  assert.equal(nextUnlockedSculptPoint([true,true,true],1),1);
});

test('sculpt rendering stays in the guide coordinates even during whole-pot motion effects', () => {
  let drawn = 0;
  const context = {clearRect() {}};
  for (const method of ['translate','rotate','scale']) context[method] = () => assert.fail(`${method} would move fixed edges away from green grips`);
  const craft = {
    ctx:context,canvas:{width:800,height:600},el:{dataset:{}},source:{},box:{},
    progress:.5,pulse:1,tilt:.1,sway:.1,work:{step:0,sculpt:{complete:false}},sculptMesh:{},
    drawStretchClay(c,w,h) {assert.equal(c,context);assert.deepEqual([w,h],[800,600]);drawn++;},
  };
  Craft2D.prototype.draw.call(craft);
  assert.equal(drawn,1);
  Craft2D.prototype.setSculptProgress.call(craft,.6);
  assert.equal(craft.pulse,0,'each sculpt movement must not restart the squash effect');
});

test('the clay silhouette passes exactly through fixed grips when their neighbours move', () => {
  const points=[[.3,.1],[.8,.2],[.9,.8],[.4,.9],[.1,.5]];
  for (const pinned of [[0],[4],[0,1],[0,2,4],[0,1,2,3,4]]) {
    for (const displacement of [0,.08]) {
      let path=[],silhouette;
      const context={
        save(){},restore(){},ellipse(){},fill(){},clip(){},
        beginPath(){path=[];},closePath(){silhouette=[...path];},stroke(){},
        moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},
        quadraticCurveTo(_cx,_cy,x,y){path.push([x,y]);},
      };
      const moved=points.map((p,i)=>p.map(v=>v+(pinned.includes(i)?0:displacement)));
      Craft2D.prototype.drawStretchClay.call({sculptMesh:{points:moved,fraction:.4,locked:points.map((_,i)=>pinned.includes(i))}},context,800,600);
      for (const i of pinned) assert.ok(silhouette.some(p=>p[0]===points[i][0]*800&&p[1]===points[i][1]*600),`fixed grip ${i} remains on the rendered edge`);
    }
  }
});

test('a grip let go a little short of its own spot lands on it; one far away stays', () => {
  const ring = Array.from({length: 8}, (_, i) => [.5 + .3 * Math.cos(i / 8 * Math.PI * 2), .5 + .3 * Math.sin(i / 8 * Math.PI * 2)]);
  const size = 400, diag = Math.hypot(.6 * size, .6 * size), locked = ring.map(() => false);
  const near = ring.map((p, i) => i === 2 ? [p[0] + diag * .045 / size, p[1]] : [.5, .5]);
  const snapped = snapSculptGrip(near, ring, locked, 2, size, size);
  assert.deepEqual(snapped.points[2], ring[2]);assert.equal(snapped.locked[2], true);assert.equal(snapped.locked.filter(Boolean).length, 1);
  const far = ring.map((p, i) => i === 2 ? [p[0] + diag * .08 / size, p[1]] : [.5, .5]);
  const kept = snapSculptGrip(far, ring, locked, 2, size, size);
  assert.equal(kept.points, far, 'too far: nothing changes');assert.equal(kept.locked[2], false);
  // Green comes within 3% of the target's diagonal, at any screen size.
  const close = ring.map((p, i) => i === 5 ? [p[0], p[1] + diag * .025 / size] : [.5, .5]);
  assert.equal(settleSculptLocks(close, ring, locked, size, size).locked[5], true);
  const short = ring.map((p, i) => i === 5 ? [p[0], p[1] + diag * .035 / size] : [.5, .5]);
  assert.equal(settleSculptLocks(short, ring, locked, size, size).locked[5], false);
});
