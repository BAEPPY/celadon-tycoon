import test from 'node:test';
import assert from 'node:assert/strict';
import {classroomContext,classroomStorageKey,classroomWorkPayload} from './classroom-game-bridge.js';
import {rubricAssessment,normalizeAssessment,assessmentFingerprint,assessmentInput,explanationHints} from './assessment-rules.js';
import {evaluateWork} from './domain.js';
import {MAX_WORK_DESIGN_BYTES, WORK_DESIGN_VERSION, sanitizeWorkDesign} from './work-design.js';

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

test('rendering payload preserves every stamp size, backside anchor, and drawing point without changing assessment inputs',()=>{
  const coordinate={uv:[.37,.62],surfaceAngle:5.987654321,surfaceV:.523456789,surfaceRadius:.327654321};
  const work={id:'faithful-design',orderId:'royal-rest',shape:'pillow',modelId:'pillow',step:4,technique:'inlay',pattern:'crane',
    width:1.07,viewFrame:19,decorPhase:2,decorDone:true,clay:{slip:'dark'},
    placements:Array.from({length:24},(_,index)=>({...coordinate,uv:[.2+index/100,.62],x:100+index,y:200,pattern:'crane',stampSize:index%2?.5:1.75})),
    strokes:[{points:Array.from({length:8},(_,index)=>({...coordinate,uv:[.3+index/100,.62],surfaceAngle:coordinate.surfaceAngle+index/100}))}],
    inlay:{slip:'dark',fillDone:true,wipeDone:true,fill:['95:-6','0:48'],wipe:['95:-6']},
    firing:['dry','biscuit','glaze','fire'],title:'청자 학무늬 베개',explanationUse:'머리를 편안하게 받치는 학 무늬 베개예요.',explanationBeauty:'학 무늬를 파고 검은 흙을 채워 또렷하게 만들었어요.'};
  work.assessment=rubricAssessment(work);
  const before=structuredClone(work),payload=classroomWorkPayload(work),design=payload.design;
  assert.equal(design.version,WORK_DESIGN_VERSION);
  assert.equal(design.width,work.width);assert.equal(design.viewFrame,19);
  assert.equal(design.placements.length,24);assert.equal(design.placements[23].stampSize,.5);
  assert.equal(design.placements[22].stampSize,1.75);assert.equal(design.placements[23].surfaceAngle,coordinate.surfaceAngle);
  assert.equal(design.strokes[0].points.length,8);
  assert.deepEqual(design.strokes[0].points[7],work.strokes[0].points[7]);
  assert.deepEqual(design.inlay,work.inlay);
  assert.deepEqual(work,before,'sanitizing must not anchor or mutate the student original');
  assert.equal(assessmentFingerprint(payload),assessmentFingerprint(work));
  assert.equal(evaluateWork(payload).total,evaluateWork(work).total);
  assert.ok(normalizeAssessment(payload.assessment,payload));
  design.strokes[0].points[7].uv[0]=.99;
  assert.deepEqual(work,before,'the transmitted design owns its coordinate arrays');
});

test('rendering designs allow only supported geometry and remove unrelated or private fields at every level',()=>{
  const raw={version:1,shape:'incense',modelId:'duckIncense',width:.85,viewFrame:23,technique:'openwork',pattern:'lotus',
    id:'private-id',studentName:'학생',teacherToken:'private-token',title:'private-title',assessment:{feedback:'private-feedback'},preview:'private-image',
    step:1,tool:'draw',knead:0,decorDone:false,clay:{slip:'dark',participantToken:'private-token'},
    placements:[{uv:[.25,.5],point:[1,2,3],x:25,y:50,screen:[9,8],pattern:'lotus',stampSize:1.75,surfaceAngle:4.8,surfaceV:.43,surfaceRadius:.31,token:'private-token'}],
    strokes:[{points:[{point:[-.3,.2,.1],screen:[1,2]},{x:120,y:180,token:'private-token'}],renderer:'irrelevant'}],
    inlay:{slip:'white',fill:['0:2','95:-6'],wipe:['0:2'],fillDone:true,wipeDone:false,targets:[{studentName:'학생'}]}};
  const design=sanitizeWorkDesign(raw);
  assert.equal(design.step,4);assert.equal(design.tool,'rotate');assert.equal(design.knead,3);assert.equal(design.decorDone,true);
  assert.deepEqual(design.placements[0],{uv:[.25,.5],surfaceAngle:4.8,surfaceV:.43,surfaceRadius:.31,pattern:'lotus',stampSize:1.75});
  assert.deepEqual(design.strokes[0].points,[{point:[-.3,.2,.1]},{x:120,y:180}]);
  const encoded=JSON.stringify(design);
  for(const privateValue of ['private-','studentName','teacherToken','participantToken','assessment','preview','screen','targets','renderer'])assert.ok(!encoded.includes(privateValue),privateValue);
  assert.deepEqual(sanitizeWorkDesign(design),design,'stored designs can be validated again without changing their geometry');
  for(const invalid of [{...raw,version:2},{...raw,shape:'../../private'},{...raw,modelId:'constructor'},{...raw,modelId:'../../private'},
    {...raw,width:0},{...raw,viewFrame:24},{...raw,technique:'script'},{...raw,pattern:'unknown'},
    {...raw,placements:[{uv:[Infinity,.5]}]},{...raw,placements:[{uv:[.2,.3],surfaceRadius:0}]},
    {...raw,strokes:[{points:[{surfaceAngle:NaN}]}]},{...raw,inlay:{fill:['96:0']}}])assert.equal(sanitizeWorkDesign(invalid),null);
});

test('the complete maximum current drawing fits without truncation while oversized designs are rejected',()=>{
  const point={uv:[.12345678901234567,.9876543210987654],surfaceAngle:5.123456789012345,surfaceV:.8765432109876543,surfaceRadius:.4567890123456789};
  const raw={shape:'pillow',modelId:'pillow',technique:'inlay',pattern:'crane',
    placements:Array.from({length:24},()=>({...point,pattern:'crane',stampSize:1.75})),
    strokes:Array.from({length:40},()=>({points:Array.from({length:512},()=>({...point}))}))};
  const design=sanitizeWorkDesign(raw);
  assert.ok(design);assert.equal(design.strokes.length,40);
  assert.equal(design.strokes.reduce((count,stroke)=>count+stroke.points.length,0),20480);
  assert.deepEqual(design.strokes[39].points[511],point);
  assert.ok(new TextEncoder().encode(JSON.stringify(design)).byteLength<=MAX_WORK_DESIGN_BYTES);
  assert.equal(sanitizeWorkDesign({...raw,strokes:[...raw.strokes,{points:[point]}]}),null);
  assert.equal(sanitizeWorkDesign({...raw,strokes:[{points:Array.from({length:513},()=>point)}]}),null);
  assert.equal(sanitizeWorkDesign({...raw,placements:Array.from({length:1201},()=>point)}),null);
  const cells=Array.from({length:145},(_,row)=>Array.from({length:96},(_,angle)=>`${angle}:${row-48}`)).flat();
  assert.equal(sanitizeWorkDesign({...raw,placements:Array.from({length:1200},()=>({...point,pattern:'crane',stampSize:1.75})),
    inlay:{fill:cells,wipe:cells}}),null,'the separate UTF-8 byte budget also bounds otherwise valid legacy geometry');
});

test('흰 흙과 검은 흙을 섞어 쓴 작품은 칸마다 색을 지키고, 예전 한 가지 색 작품도 그대로 읽는다',async()=>{
  const {beginInlay,setInlaySlip,slipSummary}=await import('./inlay-game.js');
  // A fresh work starts with the brush colour and no dark cells; the summary follows what was actually filled.
  const work={clay:{slip:'white'},placements:[],strokes:[]},state=beginInlay(work);
  assert.deepEqual(state.dark,[]);assert.equal(state.slip,'white');
  state.targets=['0:1','1:1','2:1','3:1'].map(key=>({key}));
  setInlaySlip(work,'dark');assert.equal(work.clay.slip,'dark','before anything is filled the summary is the brush colour');
  state.fill=['0:1','1:1'];state.dark=['1:1'];assert.equal(slipSummary(work),'mixed');
  state.dark=[];assert.equal(slipSummary(work),'white');
  state.fillDone=true;state.dark=['0:1','1:1','2:1','3:1'];assert.equal(slipSummary(work),'dark');
  setInlaySlip(work,'unknown');assert.equal(state.slip,'dark','only white and dark can go on the brush');
  // A draft saved before mixing existed: everything it filled was its one colour.
  const old={clay:{slip:'dark'},inlay:{slip:'dark',fill:['4:2','5:2'],wipe:[],targets:[{key:'4:2'},{key:'5:2'},{key:'6:2'}],fillDone:false,wipeDone:false}};
  assert.deepEqual(beginInlay(old).dark,['4:2','5:2']);
  const oldDone={clay:{slip:'dark'},inlay:{slip:'dark',fill:[],wipe:[],targets:[{key:'4:2'},{key:'5:2'}],fillDone:true,wipeDone:true}};
  assert.deepEqual(beginInlay(oldDone).dark,['4:2','5:2']);
  assert.deepEqual(beginInlay({clay:{slip:'mixed'}}).slip,'white','a mixed summary never becomes a brush colour');

  // The classroom copy keeps the colour of every cell and the mixed summary; older designs stay valid unchanged.
  const raw={version:1,shape:'pillow',modelId:'pillow',technique:'inlay',pattern:'crane',clay:{slip:'mixed'},placements:[{uv:[.4,.5],pattern:'crane'}],strokes:[],
    inlay:{slip:'dark',fill:['0:2','95:-6'],wipe:['0:2'],dark:['95:-6','95:-6'],fillDone:true,wipeDone:true}};
  const design=sanitizeWorkDesign(raw);
  assert.equal(design.clay.slip,'mixed');assert.deepEqual(design.inlay.dark,['95:-6']);
  assert.deepEqual(sanitizeWorkDesign(design),design);
  assert.equal('dark' in sanitizeWorkDesign({...raw,clay:{slip:'dark'},inlay:{slip:'dark',fill:['0:2'],wipe:[],fillDone:true}}).inlay,false,'a single-colour design is stored as before');
  for(const invalid of [{...raw,inlay:{...raw.inlay,dark:['96:0']}},{...raw,inlay:{...raw.inlay,dark:'all'}},{...raw,clay:{slip:'rainbow'}}])assert.equal(sanitizeWorkDesign(invalid),null);

  // Sending to the classroom keeps the summary, so the explanation check is made for the same work on both sides.
  const finished={id:'mixed-1',step:4,orderId:'royal-rest',shape:'pillow',technique:'inlay',pattern:'crane',clay:{slip:'mixed',body:true,prepared:true,kneads:6},
    placements:[{x:.4,y:.5,pattern:'crane'}],strokes:[],decorDone:true,firing:['dry','biscuit','glaze','fire'],
    explanationUse:'머리를 받치는 베개예요. 누워서 쉴 때 써요.',explanationBeauty:'학 무늬에 흰 흙과 검은 흙을 함께 채웠어요. 닦아서 또렷하게 했어요.'};
  assert.equal(classroomWorkPayload(finished).clay.slip,'mixed');
  assert.equal(assessmentInput(finished).slip,'mixed');
  assert.notEqual(assessmentFingerprint(finished),assessmentFingerprint({...finished,clay:{...finished.clay,slip:'white'}}));
  assert.match(explanationHints(finished).beauty,/학 무늬를 파고 흰 흙과 붉은 흙을 채운 다음/,'the writing example names both colours');
});
