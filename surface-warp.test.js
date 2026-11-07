import test from 'node:test';
import assert from 'node:assert/strict';
import {surfaceAnchor,projectCurvedSurface,inlayCell} from './surface-warp.js';
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
