import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleSculptOutline, sculptMatch} from './sculpt-rules.js';

const vase = sampleSculptOutline([[.4,0],[.6,0],[.6,.16],[.82,.28],[1,.48],[.91,.75],[.72,1],[.28,1],[.09,.75],[0,.48],[.18,.28],[.4,.16]], 40);
const pillow = sampleSculptOutline([[0,.1],[.25,.16],[.5,.18],[.75,.16],[1,.1],[1,.55],[.75,.62],[.25,.62],[0,.55]], 40);
const resize = (points, factor) => points.map(([x,y]) => [.5 + (x-.5)*factor, .5 + (y-.5)*factor]);
const score = (points, guide = vase) => sculptMatch(points, guide).fraction;

test('geometrically identical outlines get full credit independent of vertex order and density', () => {
  for (const points of [vase, [...vase].reverse(), [...vase.slice(7),...vase.slice(0,7)], vase.flatMap(p => [p,p])]) {
    assert.ok(Math.abs(score(points)-1) < 1e-10);
    assert.equal(sculptMatch(points,vase).matches.length, vase.length);
  }
});

test('small hand-control errors pass but clear undersize, oversize and collapse do not', () => {
  for (const guide of [vase,pillow]) {
    assert.ok(score(resize(guide,.95),guide) >= .9, '5% size error remains achievable for a learner');
    assert.ok(score(guide.map(([x,y],i) => [x+Math.sin(i*2.3)*.01,y+Math.cos(i*1.7)*.01]),guide) > .97, '1% hand jitter is allowed');
    for (const factor of [.9,1.1,.5]) assert.ok(score(resize(guide,factor),guide) < .85, `scale ${factor} cannot pass`);
    assert.ok(score(guide.map(([x,y])=>[x+.03,y+.03]),guide) < .9, 'a visibly shifted outline cannot pass');
  }
});

test('a broad correct body cannot hide an unfinished neck or a large local dent', () => {
  const flatNeck = vase.map(([x,y]) => [x,Math.max(y,.2)]);
  const dent = vase.map(([x,y]) => [y>.25 && y<.6 && x>.5 ? x-.22 : x,y]);
  for (const points of [flatNeck,dent]) {
    const result = sculptMatch(points,vase);
    assert.ok(result.fraction < .85);
    assert.ok(result.local < result.contour, 'the poorest outline region contributes separately');
  }
});

test('missing/excess filled clay matters even when many edges are close', () => {
  const result=sculptMatch(resize(vase,1.1),vase);
  assert.ok(result.overlap < .84 && result.overlap > .8);
  assert.ok(result.fraction < result.contour*.45 + .3 + result.local*.25, 'area mismatch lowers the combined score');
  const flat=sculptMatch(vase.map(([x])=>[x,.5]),vase);
  assert.equal(flat.overlap,0);
  assert.ok(flat.fraction<.1, 'a flat line is not a completed vessel');
});

test('the same physical shape has the same score at every viewport and display scale', () => {
  const clay=vase.map(([x,y])=>[x*(y>.2 && y<.5?.9:1),y]);
  const reference=sculptMatch(clay,vase);
  for(const [width,height,scale] of [[1366,768,420],[1024,600,270],[390,844,180],[2048,1200,540]]) {
    const screen=points=>points.map(([x,y])=>[(40+x*scale)/width,(70+y*scale)/height]);
    const actual=sculptMatch(screen(clay),screen(vase),width,height);
    assert.ok(Math.abs(actual.fraction-reference.fraction)<1e-10);
    const sampled=sampleSculptOutline(screen(vase),40,width,height).map(([x,y])=>[(x*width-40)/scale,(y*height-70)/scale]);
    const expected=sampleSculptOutline(vase,40);
    sampled.forEach((p,i)=>p.forEach((v,j)=>assert.ok(Math.abs(v-expected[i][j])<1e-10)));
  }
});

test('invalid or collapsed input never produces NaN or a passing score', () => {
  for (const points of [[], [[0,0]], [[0,0],[0,0],[0,0]], [[NaN,0],[0,1],[1,0]]]) {
    const result=sculptMatch(points,vase);
    assert.ok(Number.isFinite(result.fraction) && result.fraction>=0 && result.fraction<.9);
  }
  assert.equal(sculptMatch(vase,[[0,0],[0,0],[0,0]]).fraction,0);
});
