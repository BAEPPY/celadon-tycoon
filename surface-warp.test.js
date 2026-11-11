import test from 'node:test';
import assert from 'node:assert/strict';
import {surfaceAnchor,projectCurvedSurface,inlayCell,sectionFor,sectionScale} from './surface-warp.js';
const row=()=>[.2,.8];
test('문양의 수평선은 원통의 앞면과 가장자리에서 타원 곡선을 따른다',()=>{
  const points=[-.9,0,.9].map(a=>projectCurvedSurface(a,.5,0,row));
  assert.ok(points[1].uv[1]>points[0].uv[1]+.02,'front bows below the receding edge');
  assert.ok(Math.abs(points[0].uv[1]-points[2].uv[1])<1e-9);
  const right=[.3,.6,.9].map(a=>projectCurvedSurface(a,.5,0,row));
  assert.ok(right[2].uv[0]-right[1].uv[0]<right[1].uv[0]-right[0].uv[0],'horizontal spacing compresses at the edge');
});
test('누른 표면 좌표는 곡면에 투영해도 같은 위치에 남는다',()=>{
  for(const uv of [[.5,.55],[.31,.48],[.69,.7]]){
    const a=surfaceAnchor(uv,undefined,row(),0),p=projectCurvedSurface(a.angle,a.level,0,row);
    assert.ok(Math.abs(p.uv[0]-uv[0])<1e-9);assert.ok(Math.abs(p.uv[1]-uv[1])<1e-9);
  }
});
test('곡면 문양은 앞벽과 뒷벽에서 별도로 보이고 반 바퀴 돌면 서로 바뀐다',()=>{
  const a=surfaceAnchor([.5,.55],0,row(),0);
  assert.ok(projectCurvedSurface(a.angle,a.level,0,row));
  assert.equal(projectCurvedSurface(a.angle,a.level,0,row,true),null);
  assert.equal(projectCurvedSurface(a.angle,a.level,12,row),null);
  const rear=projectCurvedSurface(a.angle,a.level,12,row,true);
  assert.ok(rear);assert.ok(Math.abs(rear.uv[1]-.55)<1e-9);
});
test('색흙 칠하기 좌표는 한 바퀴 회전해도 같은 저장 칸을 쓴다',()=>{
  assert.equal(inlayCell(.37,.52),inlayCell(.37+Math.PI*2,.52));
  assert.equal(inlayCell(-.37,.52),inlayCell(-.37+Math.PI*2,.52));
});
test('베개는 상자 모양이라 찍은 무늬가 그 면에 붙어 돌고 모서리를 지나 옆면으로 간다',()=>{
  const box=sectionFor('pillow'),wide=()=>[.15,.85];
  assert.equal(sectionFor('cloudCraneMaebyeong'),null,'round vessels keep the cylinder');
  assert.ok(Math.abs(sectionScale(box)-1)<.01,'one turn is still 2π');assert.equal(sectionScale(null),1);
  // What is pressed lands where it was pressed, in every view.
  for(const view of [0,2,3,6,9,12,17,21])for(const u of [.2,.35,.5,.65,.8]){
    const a=surfaceAnchor([u,.6],undefined,wide(),view,box),p=projectCurvedSurface(a.angle,a.level,view,wide,false,box);
    assert.ok(p&&Math.abs(p.uv[0]-u)<1e-9&&Math.abs(p.uv[1]-.6)<1e-9,`view ${view}, u ${u}`);
  }
  // Three motifs across the front face keep their order and even spacing while the pillow turns (on a cylinder the
  // outer ones would slide toward the edge), and are squeezed alike because they share one flat face.
  const marks=[.3,.5,.7].map(u=>surfaceAnchor([u,.6],undefined,wide(),0,box));
  for(const view of [1,2,3,4]){
    const seen=marks.map(mark=>projectCurvedSurface(mark.angle,mark.level,view,wide,false,box));
    assert.ok(seen.every(Boolean));
    const gaps=[seen[1].uv[0]-seen[0].uv[0],seen[2].uv[0]-seen[1].uv[0]];
    assert.ok(gaps[0]>0&&Math.abs(gaps[0]-gaps[1])<1e-9,`evenly spaced at view ${view}`);
    assert.ok(Math.abs(seen[0].squeeze-seen[2].squeeze)<1e-9);assert.ok(seen[1].uv[0]<.5,'the face moves aside as it turns');
  }
  // Seen from the end (a quarter turn) the front face is edge-on: its motifs are gone, and the end face shows.
  assert.equal(projectCurvedSurface(marks[1].angle,marks[1].level,6,wide,false,box),null);
  const end=surfaceAnchor([.5,.6],undefined,wide(),6,box);
  assert.ok(projectCurvedSurface(end.angle,end.level,6,wide,false,box));assert.equal(projectCurvedSurface(end.angle,end.level,0,wide,false,box),null,'an end face is not seen from the front');
  // A motif keeps its size: the width kept with it is half the front face, whatever view it was pressed in.
  assert.ok(Math.abs(surfaceAnchor([.5,.6],undefined,wide(),0,box).radius-.35)<1e-9);
  assert.ok(Math.abs(end.radius-.35/.567)<1e-9,'the outline seen from the end is the narrow side');
  // Half a turn later the front face is the back wall.
  assert.equal(projectCurvedSurface(marks[1].angle,marks[1].level,12,wide,false,box),null);assert.ok(projectCurvedSurface(marks[1].angle,marks[1].level,12,wide,true,box));
});
