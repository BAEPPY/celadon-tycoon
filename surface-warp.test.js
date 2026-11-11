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
test('베개를 돌려도 가까운 모서리는 바닥선에 머물러 무늬가 아래로 처지지 않는다',()=>{
  const box=sectionFor('pillow');
  // Rows as wide as the box's outline in each view, as its pictures are (all of them stand on one floor line).
  const rowFor=view=>{const phi=view*Math.PI/12,radius=.35*(Math.abs(Math.cos(phi))+box.depth*Math.abs(Math.sin(phi)));return ()=>[.5-radius,.5+radius];};
  // The right end of the front face becomes the nearest corner as the pillow turns: it keeps its height.
  const corner=surfaceAnchor([.5+.35*.995,.9],undefined,rowFor(0)(),0,box);
  for(const view of [1,2,3,4,5]){
    const seen=projectCurvedSurface(corner.angle,corner.level,view,rowFor(view),false,box);
    assert.ok(seen&&Math.abs(seen.uv[1]-.9)<.004,`view ${view}: the corner is at ${seen&&seen.uv[1]}`);
  }
  // The far end of that face rises steadily as the face turns away, so the face's lower edge slopes like the picture's.
  const far=surfaceAnchor([.5-.35*.9,.9],undefined,rowFor(0)(),0,box);
  let last=.9;
  for(const view of [1,2,3,4,5]){
    const seen=projectCurvedSurface(far.angle,far.level,view,rowFor(view),false,box);
    assert.ok(seen&&seen.uv[1]<last,`view ${view}`);last=seen.uv[1];
  }
  assert.ok(last>.68&&last<.76,`at 75 degrees the far end is about where the picture has it (${last})`);
});
test('오리 연적은 길쭉한 타원이라 무늬가 옆면에 붙어 돌고, 깊이 1인 타원은 원통과 같다',()=>{
  const duck=sectionFor('duckDropper');
  assert.equal(duck.shape,'oval');assert.ok(duck.depth>.45&&duck.depth<.65);
  assert.ok(!duck.wholeOutline,'a rounded body is placed across the row at its own height');
  // An oval as deep as it is wide is the cylinder the round vessels use.
  const round={shape:'oval',depth:1},row=()=>[.25,.75];
  assert.ok(Math.abs(sectionScale(round)-1)<1e-4);
  for(const view of [0,3,7,12,19])for(const u of [.3,.45,.6,.72]){
    const a=surfaceAnchor([u,.6],undefined,row(),view),b=surfaceAnchor([u,.6],undefined,row(),view,round);
    assert.ok(Math.abs(wrap(a.angle-b.angle))<1e-3&&Math.abs(a.level-b.level)<1e-9,`press ${view} ${u}`);
    for(const later of [view+2,view+5]){
      const p=projectCurvedSurface(a.angle,a.level,later,row),q=projectCurvedSurface(b.angle,b.level,later,row,false,round);
      assert.equal(Boolean(p),Boolean(q));if(p)assert.ok(Math.abs(p.uv[0]-q.uv[0])<1e-3&&Math.abs(p.uv[1]-q.uv[1])<1e-6,`view ${later}`);
    }
  }
  // The duck: what is pressed lands where it was pressed, in every view.
  for(const view of [0,2,4,6,9,13,18])for(const u of [.3,.45,.6,.72]){
    const a=surfaceAnchor([u,.6],undefined,row(),view,duck),p=projectCurvedSurface(a.angle,a.level,view,row,false,duck);
    assert.ok(p&&Math.abs(p.uv[0]-u)<1e-6&&Math.abs(p.uv[1]-.6)<1e-9,`view ${view}, u ${u}`);
  }
  // Rows as wide as the oval seen in each view: the nearest point stays on its line, and motifs on the long side stay
  // spread over the part of the body that side takes (a cylinder would push them to the edge by 60 degrees).
  const rowFor=view=>{const phi=view*Math.PI/12,radius=.35*Math.hypot(Math.cos(phi),duck.depth*Math.sin(phi));return ()=>[.5-radius,.5+radius];};
  const marks=[.3,.5,.7].map(u=>surfaceAnchor([u,.6],undefined,rowFor(0)(),0,duck));
  const seen=marks.map(mark=>projectCurvedSurface(mark.angle,mark.level,4,rowFor(4),false,duck)),width=rowFor(4)()[1]-rowFor(4)()[0];
  assert.ok(seen.every(Boolean));assert.ok((seen[2].uv[0]-seen[0].uv[0])/width>.25,`spread over ${(seen[2].uv[0]-seen[0].uv[0])/width} of the width at 60 degrees`);
  const cylinder=marks.map((mark,i)=>{const a=surfaceAnchor([[.3,.5,.7][i],.6],undefined,rowFor(0)(),0);return projectCurvedSurface(a.angle,a.level,4,rowFor(4));});
  const shown=cylinder.filter(Boolean),cylinderSpread=shown.length>1?shown[shown.length-1].uv[0]-shown[0].uv[0]:0;
  assert.ok(shown.length<3||cylinderSpread<seen[2].uv[0]-seen[0].uv[0],'on a cylinder they would be hidden or crowded');
  // The side is edge-on from the front (a quarter turn), so its middle is hidden then.
  assert.equal(projectCurvedSurface(marks[1].angle,marks[1].level,6,rowFor(6),false,duck),null);
});
const wrap=value=>Math.atan2(Math.sin(value),Math.cos(value));
