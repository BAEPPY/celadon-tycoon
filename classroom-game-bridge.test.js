import test from 'node:test';
import assert from 'node:assert/strict';
import {classroomContext,classroomStorageKey,classroomWorkPayload} from './classroom-game-bridge.js';
import {rubricAssessment,normalizeAssessment,assessmentFingerprint,assessmentInput} from './assessment-rules.js';
import {evaluateWork} from './domain.js';

test('수업 게임은 방과 학생마다 저장 공간을 분리하고 일반 게임은 보존한다',()=>{
  const url='https://example.test/?classroom=1&room=AB3DEF&student=17';
  assert.deepEqual(classroomContext(url),{room:'AB3DEF',student:'17'});
  assert.equal(classroomStorageKey('https://example.test/'),'celadon-tycoon-v2');
  assert.notEqual(classroomStorageKey(url),classroomStorageKey(url.replace('student=17','student=18')));
  assert.notEqual(classroomStorageKey(url),classroomStorageKey(url.replace('AB3DEF','XY3DEF')));
  assert.notEqual(classroomStorageKey(url+'&run=first-run'),classroomStorageKey(url+'&run=next-run'));
  assert.equal(classroomContext('https://example.test/?classroom=1&room=../../x&student=17'),null);
});

test('교실에는 완성품만 전하고 번호·이름·인증 정보와 초안은 보내지 않는다',()=>{
  assert.equal(classroomWorkPayload({id:'draft',step:3}),null);
  const payload=classroomWorkPayload({id:'complete',step:4,title:'나의 청자',studentName:'학생 이름',teacherToken:'secret',participantToken:'secret',preview:'large image',draft:{secret:true}});
  assert.equal(payload.title,'나의 청자');
  for(const key of ['studentName','teacherToken','participantToken','preview','draft'])assert.ok(!(key in payload));
});

test('완성품 전달은 원래 평가 점수와 설명 지문을 보존한다',()=>{
  const work={id:'work-1',orderId:'royal-rest',shape:'pillow',modelId:'pillow',step:4,technique:'inlay',pattern:'crane',drawingLabel:'cloud',
    placements:[{x:100,y:120,pattern:'crane',uv:[.4,.5]}],strokes:[{points:[{x:1,y:2},{x:3,y:4},{x:5,y:6}]}],decorDone:true,decorPhase:2,
    firing:['dry','biscuit','glaze','fire'],clay:{body:true,prepared:true,kneads:6,slip:'dark'},inspection:{done:true},
    title:'청자 상감 학무늬 베개',explanationUse:'학 무늬 베개예요. 머리를 받치면 좋아요.',explanationBeauty:'학 무늬를 파고 검은 흙을 채웠어요.'};
  work.assessment=rubricAssessment(work);
  const payload=classroomWorkPayload(work);
  assert.ok(normalizeAssessment(payload.assessment,payload));
  assert.equal(evaluateWork(payload).total,evaluateWork(work).total);
  assert.equal(payload.explanationUse,work.explanationUse);assert.equal(payload.explanationBeauty,work.explanationBeauty);
  assert.equal(payload.strokes[0].points.length,2,'점수 검증에 필요한 선 정보만 보낸다');
});

test('나중에 놓인 문양과 긴 설명·줄바꿈도 원래 설명 지문과 점수를 보존한다',()=>{
  const work={id:'work-late-pattern',orderId:'royal-rest',shape:'pillow',modelId:'pillow',step:4,technique:'inlay',pattern:'cloud',
    placements:[...Array.from({length:30},(_,i)=>({x:i,y:12,pattern:'cloud'})),{x:200,y:100,pattern:'crane'}],
    strokes:[...Array.from({length:45},()=>({points:[]})),{points:[{x:2,y:2},{x:3,y:3}]}],
    decorDone:true,firing:['dry','biscuit','glaze','fire'],clay:{slip:'dark'},
    title:'   '+ '청자 베개 '.repeat(25),
    explanationUse:'   학 무늬 베개예요.\n머리를 받치면 좋아요. '+ '편안하게 쉬어요. '.repeat(40),
    explanationBeauty:'   학 무늬를 파고 검은 흙을 채웠어요.\n또렷한 무늬를 만들려고 여러 번 닦았어요. '+ '정성껏 빚었어요. '.repeat(40)};
  work.assessment=rubricAssessment(work);
  const payload=classroomWorkPayload(work);
  assert.equal(payload.placements[30].pattern,'crane');
  assert.equal(payload.strokes[45].points.length,2);
  assert.equal(assessmentFingerprint(payload),assessmentFingerprint(work));
  assert.ok(normalizeAssessment(payload.assessment,payload));
  assert.equal(evaluateWork(payload).total,evaluateWork(work).total);
  assert.equal(payload.title,assessmentInput(work).title);
  assert.equal(payload.explanationUse,assessmentInput(work).explanationUse);
  assert.ok(payload.explanationUse.includes('\n'));
});
