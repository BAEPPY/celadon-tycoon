import {COMPARISON_ARTIFACTS, OBSERVATION_ARTIFACTS, COUNTRY_CHOICES} from './lesson-artifacts.js';
import {mountLessonViewer} from './lesson-viewer.js';
import {extractClassroomCode, canUseClassroomAction, CLASSROOM_JOIN_CODE} from './classroom-access.js';
import {loadStudentEntryState, rememberStudentEntry, findStudentRejoin, clearActiveStudentSession} from './classroom-entry.js';
import {mountWordCloud} from './lesson-cloud.js';

const TITLE='고려청자의 우수성과 다양한 쓰임 알아보기';
// /observe is a read-only copy of the teacher board for visitors at an open class: no controls, no student names.
const observerMode=location.pathname.startsWith('/observe');
const teacherMode=location.pathname.startsWith('/teacher')||observerMode;
const app=document.querySelector('#classroom-app'),toastElement=document.querySelector('#classroom-toast');
const SESSION_KEY=observerMode?'celadon-classroom-observer-v1':teacherMode?'celadon-classroom-teacher-v1':'celadon-classroom-student-v1';
// One name per activity on every screen (teacher tabs and panel, student header, observer view).
const ACTIVITY_NAMES={1:'세 나라 도자기 비교',2:'쓰임과 이름 짐작하기',3:'좋은 청자 위대한 청자'};
const STAGE_NAMES=ACTIVITY_NAMES;
const PENDING_CLASSROOM_KEY='celadon-classroom-create-v1';
const DEFAULT_SETTINGS={durations:{1:90,2:240,3:300},submitButton:false,autoPause:true};
const countryName=id=>COUNTRY_CHOICES.find(c=>c.id===id)?.label||id;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const copy=value=>JSON.parse(JSON.stringify(value));
function stored(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
function store(key,value){try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,JSON.stringify(value));}catch{}}
// An observer opens /observe?code=XXXXXX#key=… ; the key stays in the fragment so it is never sent to the server in the URL.
function observerSession(){const code=extractClassroomCode(new URLSearchParams(location.search).get('code')||''),key=new URLSearchParams(location.hash.slice(1)).get('key')||'';if(code&&/^[A-Za-z0-9_-]{30,100}$/.test(key)){const value={code,observerToken:key};store(SESSION_KEY,value);return value;}return stored(SESSION_KEY);}
let session=observerMode?observerSession():teacherMode?stored(SESSION_KEY):loadStudentEntryState(),room=null,teacherData=null,student=null,answers={},offset=0,offsetSamples=[];
let currentObject='1',teacherActivity=1,teacherObject='1',selectedCountry=null,cloudKind='name';
let teacherResultViews={1:'responses',2:'responses'},exhibitObjects={1:'1',2:'1'},completionDialog=null;
let drafts={1:{},2:{}},revisions={1:0,2:0},dirty={1:false,2:false},draftChanges={1:0,2:0},submitted={1:false,2:false};
let viewKey='',teacherSignature='',pollTimer=null,pollRunning=false,pollFailures=0,connectionError='',lastSuccessfulPoll=0;
let saveTimer=null,saving=false,saveAgain=false,finalAgain=false,saveState='ready',saveMessage='',controlBusy=false;
let settingsDirty=false,settingsOpen=false,participantsOpen=false,responsesOpen=false,manageOpen=false,toastTimer=null;
let disposed=false,frameRunId='',lastGameActive=null;
const viewers=[],workImages=new Map(),workImagePending=new Set(),uploadedWorks=new Set(),pendingWorks=new Map();
let teacherViewer=null,cloudView=null;
const publicJoinCode=()=>room?.joinCode||session?.code||CLASSROOM_JOIN_CODE;
const actionAllowed=action=>canUseClassroomAction(action,{teacherMode:teacherMode&&!observerMode,observerMode,teacherToken:session?.teacherToken});

const logo=`<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M15 5h10v7c0 5 9 8 8 15-1 8-6 9-13 9S8 35 7 27c-1-7 8-10 8-15Z" fill="#88ae8d" stroke="currentColor" stroke-width="1.8"/><path d="M11 25c5-6 13-6 18 0M13 30c5-4 9-4 14 0" fill="none" stroke="#e7edcf" stroke-width="1.7"/></svg>`;
const timerIcon=`<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="18" r="11"/><path d="M16 10v8l5 3M12 3h8M16 3v4M24 7l3 3"/></svg>`;
const laptopIcon=`<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M20 30h60v39H20z"/><path d="M14 74h72l-6 7H20zM38 49l9 8 16-18"/></svg>`;
const closedLaptopIcon=`<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M15 64h70l-5 10H20zM24 55h52M36 39l14-12 14 12M50 28v27"/><path d="M18 64l6-9M82 64l-6-9"/></svg>`;

function toast(message){clearTimeout(toastTimer);toastElement.textContent=message;toastElement.classList.add('visible');toastTimer=setTimeout(()=>toastElement.classList.remove('visible'),3500);}
async function copyClassroomValue(value,label){
  try{await navigator.clipboard.writeText(value);toast(`${label}를 복사했어요.`);}
  catch{
    document.querySelector('.copy-fallback')?.remove();
    const dialog=document.createElement('dialog');dialog.className='copy-fallback';
    dialog.innerHTML=`<h2>${esc(label)}</h2><p>아래 내용을 선택해 직접 복사해 주세요.</p><input readonly aria-label="${esc(label)}" value="${esc(value)}"><button class="button" type="button">닫기</button>`;
    dialog.querySelector('button').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();dialog.querySelector('input').select();
  }
}
function token(){return observerMode?session?.observerToken:teacherMode?session?.teacherToken:session?.participantToken;}
async function api(action,{method='GET',body={},signal,keepalive=false}={}){
  const params=new URLSearchParams({action});
  if(session?.code)params.set('code',session.code);
  if(!teacherMode&&session?.participantId)params.set('participantId',session.participantId);
  if(method==='GET')for(const [k,v] of Object.entries(body))if(v!==undefined)params.set(k,v);
  const controller=signal?null:new AbortController(),timeout=controller?setTimeout(()=>controller.abort(),15000):null;
  try{
    const response=await fetch(`/api/classroom${method==='GET'?`?${params}`:''}`,{
      method,headers:{...(method==='POST'?{'Content-Type':'application/json'}:{}),...(token()?{Authorization:`Bearer ${token()}`}:{})},
      ...(method==='POST'?{body:JSON.stringify({action,...(session?.code?{code:session.code}:{}),...body})}:{}),
      signal:signal||controller.signal,cache:'no-store',keepalive,
    });
    let value;try{value=await response.json();}catch{throw new Error('연결을 확인하고 다시 시도해 주세요.');}
    if(!response.ok){const error=new Error(value.error||value.message||'요청을 마치지 못했어요. 다시 시도해 주세요.');error.status=response.status;throw error;}
    return value;
  }finally{clearTimeout(timeout);}
}
function now(){return Date.now()+offset;}
function timeExpired(){return room?.status==='active'&&Boolean(room.endsAt)&&now()>=room.endsAt;}
function deadlinePassed(){return timeExpired()&&(room.activity===3||room.settings?.autoPause!==false);}
function effectiveStatus(){return deadlinePassed()?'paused':room?.status||'waiting';}
function active(activity){return room?.activity===activity&&effectiveStatus()==='active'&&!timeExpired();}
function answerLocked(activity){return submitted[activity]||!active(activity);}
function expiryMarkup(){return timeExpired()?'<div class="submitted-banner" data-testid="time-finished">시간이 끝났어요. 선생님이 마무리할 때까지 기다려 주세요.</div>':'';}
// Activity 3 has no time limit: it runs until the teacher ends it, so its clock shows elapsed time instead.
const untimed=activity=>activity===3;
function elapsed(){return room?.startedAt&&room.status==='active'?Math.max(0,Math.floor((now()-room.startedAt)/1000)):0;}
function remaining(){return room?.endsAt?Math.max(0,Math.ceil((room.endsAt-now())/1000)):room?.settings?.durations?.[teacherMode?teacherActivity:room?.activity]||0;}
function formatTime(seconds){return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
function timerMarkup(activity=teacherMode?teacherActivity:room?.activity){const open=untimed(activity);return `<div class="timer" data-testid="lesson-timer" aria-label="${open?'활동 진행 시간':'남은 활동 시간'}">${timerIcon}<div><span>${open?'진행 시간':'남은 시간'}</span><strong>${open?formatTime(elapsed()):formatTime(remaining())}</strong></div></div>`;}
function stages(activity=room?.activity||0){
  return `<div class="current-activity" aria-label="현재 수업 활동"><span>${activity?`활동 ${activity} / 3`:'수업 준비'}</span><strong>${activity?STAGE_NAMES[activity]:'선생님의 시작을 기다려요'}</strong><small>선생님이 진행해요</small></div>`;
}
// Kept in the header so it stays reachable on 1024×600, where the side panel has to scroll.
function manageMenu(){const status=room?effectiveStatus():'waiting';return `<details class="manage-menu" data-details="manage" ${manageOpen?'open':''}><summary class="button secondary small">수업 관리 <span aria-hidden="true">▾</span></summary><div class="manage-menu-list"><button class="button secondary small" data-action="copy-observer">참관 주소 복사</button>${room&&!room.joinCode?'<button class="button secondary small" data-action="claim-join-code">탑텐반 코드 연결</button>':''}<button class="button secondary small" data-action="end" ${status==='ended'||controlBusy?'disabled':''}>수업 종료</button><button class="button quiet small" data-action="new-room">새 수업</button><button class="button danger small" data-action="delete-room">수업 자료 삭제</button></div></details>`;}
function header(){
  const studentGame=!teacherMode&&active(3);
  return `<header class="lesson-header ${teacherMode?'teacher-header':''}"><div class="brand"><span class="brand-mark">${logo}</span><div><div class="brand-title">우리 반 청자 교실</div><small>${observerMode?'참관 화면 · 읽기 전용':teacherMode?'선생님 진행 화면':'관찰하고 · 생각하고 · 만들어요'}</small></div></div>${teacherMode?`${observerMode?'<div class="observer-badge">참관 중 · 학생 이름은 보이지 않아요</div>':`<div class="teacher-room-code"><span>수업 코드</span><strong>${esc(publicJoinCode())}</strong><div class="code-actions"><button class="button secondary small" data-action="copy-code">수업 코드 복사</button><button class="button quiet small" data-action="copy-invite">참여 주소 복사</button></div></div>`}<div class="teacher-tools"><span class="pill" data-connection>연결됨</span><button class="button quiet small" data-action="fullscreen">전체 화면</button>${observerMode?'':manageMenu()}</div>`:`${studentGame?'':stages()}<div class="student-badge"><strong>${esc(student?.number||'')}번 ${esc(student?.name||'')}</strong><span class="pill" data-connection>연결됨</span></div>${studentGame?timerMarkup():''}`}</header><div class="connection-banner" data-connection-banner hidden><span></span><button class="button secondary small" data-action="retry-connection">다시 연결</button></div>`;
}
function updateConnection(){
  document.querySelectorAll('[data-connection]').forEach(el=>{el.textContent=connectionError?'다시 연결 중':'연결됨';el.classList.toggle('offline',Boolean(connectionError));});
  const banner=document.querySelector('[data-connection-banner]');if(banner){banner.hidden=!connectionError;banner.querySelector('span').textContent=connectionError?`연결이 잠시 끊겼어요. ${connectionError}`:'';}
}
function disposeViewers(){for(const v of viewers.splice(0)){try{v.dispose();}catch{}}}
function mountViewers(){document.querySelectorAll('[data-viewer]').forEach(el=>{const artifacts=el.dataset.collection==='comparison'?COMPARISON_ARTIFACTS:OBSERVATION_ARTIFACTS,artifact=artifacts.find(a=>a.id===el.dataset.viewer);if(artifact)viewers.push(mountLessonViewer(el,artifact));});}
function draftStorageKey(){return session?`celadon-classroom-drafts-v1:${session.code}:${session.participantId}`:'';}
function persistDrafts(){if(session&&!teacherMode)store(draftStorageKey(),{drafts,revisions,dirty,draftChanges,runs:room?.runs,runId:room?.runId});}
function initialDrafts(){
  const saved=stored(draftStorageKey());
  for(const n of [1,2]){
    const record=answers[n],run=room?.runs?.[n]|| (room?.activity===n?room.runId:null);
    const savedRun=saved?.runs?.[n]||(room?.activity===n?saved?.runId:null);
    if(saved?.dirty?.[n]&&savedRun===run&&!record?.submitted){drafts[n]=saved.drafts[n]||{};revisions[n]=Math.max(saved.revisions[n]||0,record?.clientRevision||0);dirty[n]=true;draftChanges[n]=saved.draftChanges?.[n]||0;}
    else{drafts[n]=record?.runId===run?copy(record.answers||{}):{};revisions[n]=record?.runId===run?record.clientRevision||0:0;dirty[n]=false;}
    submitted[n]=Boolean(record?.runId===run&&record.submitted);
  }
}
function receive(payload,{initial=false}={}){
  const previous=room;
  if(payload.state&&room&&payload.state.code===room.code&&(Number(payload.state.revision)<Number(room.revision)||(Number(payload.state.revision)===Number(room.revision)&&Number(payload.state.serverNow)<Number(room.serverNow)))){lastSuccessfulPoll=Date.now();heartbeatGame();return false;}
  room=payload.state||room;
  // Network delay only makes an estimate smaller, so the largest recent one is the best. Older samples age out, so a
  // corrected device clock (e.g. after waking a Chromebook) is followed within a few polls instead of never.
  if(room?.serverNow){const estimate=Number(room.serverNow)-Date.now();offsetSamples=previous?[...offsetSamples.slice(-4),estimate]:[estimate];offset=Math.max(...offsetSamples);}
  connectionError='';pollFailures=0;lastSuccessfulPoll=Date.now();
  if(teacherMode){
    teacherData={...(teacherData||{}),...payload};if(initial)teacherActivity=room.activity||1;else if(observerMode&&room.activity&&room.activity!==previous?.activity)teacherActivity=room.activity;
    for(const activity of [1,2]){
      if(room.revealed?.[activity]&&!previous?.revealed?.[activity]){teacherResultViews[activity]='exhibit';exhibitObjects[activity]='1';}
      else if(!room.revealed?.[activity])teacherResultViews[activity]='responses';
    }
  }
  else{
    if(previous?.runs?.[3]&&room?.runs?.[3]!==previous.runs[3]){uploadedWorks.clear();pendingWorks.clear();}
    student=payload.student||student;
    if(payload.answers){const merged={...answers};for(const n of [1,2]){const incoming=payload.answers[n],current=answers[n],run=room?.runs?.[n];if(incoming&&(incoming.runId!==current?.runId?incoming.runId===run:incoming.clientRevision>=current.clientRevision))merged[n]=incoming;}answers=merged;}
    for(const work of payload.completedWorks||[])uploadedWorks.add(work.id);
    if(initial)initialDrafts();
    else for(const n of [1,2]){
      const oldRun=previous?.runs?.[n]||(previous?.activity===n?previous.runId:null),run=room?.runs?.[n]||(room?.activity===n?room.runId:null),record=answers[n];
      if(oldRun!==run&&run){drafts[n]=record?.runId===run?copy(record.answers||{}):{};revisions[n]=record?.runId===run?record.clientRevision||0:0;dirty[n]=false;draftChanges[n]=0;submitted[n]=false;}
      if(record?.runId===run){submitted[n]=Boolean(record.submitted);if(record.submitted){dirty[n]=false;drafts[n]=copy(record.answers||{});revisions[n]=Math.max(revisions[n],record.clientRevision||0);}if(!dirty[n]&&!saving&&(record.clientRevision||0)>=revisions[n]){drafts[n]=copy(record.answers||{});revisions[n]=record.clientRevision||0;}}
    }
    persistDrafts();
  }
  render();updateConnection();heartbeatGame();return true;
}
function schedulePoll(delay=teacherMode?4000:3000){clearTimeout(pollTimer);if(session&&!disposed)pollTimer=setTimeout(poll,delay);}
async function poll(){
  if(pollRunning||!session)return;schedulePoll();pollRunning=true;const requestSession=session;
  try{const payload=await api(observerMode?'observe':teacherMode?'teacher':'state');if(session!==requestSession)return;receive(payload);if(!teacherMode&&active(room.activity)&&dirty[room.activity]&&!saving)queueSave();retryWorks();}
  catch(error){if(session!==requestSession)return;
    if((!teacherMode||observerMode)&&(error.status===403||error.status===404)){const message=observerMode||error.status===404?error.message:'선생님이 입장 정보를 정리했어요. 번호와 이름으로 다시 입장해 주세요.';resetRoom();renderWelcome(message);return;}
    pollFailures++;connectionError=error.name==='AbortError'?'응답을 기다리고 있어요.':error.message;updateConnection();}
  finally{pollRunning=false;schedulePoll(Math.min(12000,(teacherMode?4000:3000)*Math.max(1,pollFailures)));}
}
function welcomeArtwork(){return `<div class="welcome-art" aria-hidden="true"><img src="/assets/lesson/welcome-celadon.png" alt="" width="1774" height="887" fetchpriority="high"></div>`;}
function renderWelcome(message=''){
  closeCompletionDialog();disposeViewers();viewKey='welcome';const identity={},queryCode=extractClassroomCode(new URLSearchParams(location.search).get('code')||'');
  app.innerHTML=`<section class="welcome"><div class="welcome-copy"><span class="eyebrow">우리 반 청자 교실 · 고려의 문화</span><h1><em>고려청자의 우수성</em>과<br> 다양한 쓰임 알아보기</h1><p>빛깔과 모양을 살펴보고,<br>청자에 담긴 사람들의 생활을 찾아봐요.</p>${welcomeArtwork()}</div><div><section class="panel welcome-form"><h2>${observerMode?'수업 참관':teacherMode?'함께 시작하는 청자 수업':'수업에 들어가요'}</h2><p class="muted">${observerMode?'선생님이 보낸 참관 주소로 열면 수업 진행과 학생들의 생각을 함께 볼 수 있어요. 학생 이름은 보이지 않아요.':teacherMode?'우리 반 수업 코드는 ‘탑텐반’입니다.':'번호와 이름은 세 활동 동안 계속 사용해요.'}</p>${observerMode?'':teacherMode?`<form data-form="create"><button class="button" type="submit">새 수업 열기 <span aria-hidden="true">→</span></button></form><p class="welcome-note">활동 1 · 1분 30초<br>활동 2 · 4분<br>활동 3 · 선생님이 마칠 때까지<br><br>선생님이 활동을 시작하고 마칠 때마다<br>학생 화면도 함께 바뀝니다.</p><a class="teacher-link" href="/lesson">학생 참여 화면 보기 →</a>`:`<form data-form="join"><label>수업 코드<input class="code-input" name="code" autocomplete="off" spellcheck="false" minlength="3" maxlength="6" pattern="(탑텐반|[A-Za-z2-9]{6})" required value="${esc(queryCode)}" placeholder="탑텐반"></label><div class="identity-fields"><label>번호<input name="number" type="number" autocomplete="off" min="1" max="99" inputmode="numeric" required value="${esc(identity.number||'')}" placeholder="번호"></label><label>이름<input name="name" autocomplete="off" maxlength="20" required value="${esc(identity.name||'')}" placeholder="이름을 적어 주세요"></label></div><button class="button" type="submit">수업 들어가기 <span aria-hidden="true">→</span></button></form><p class="welcome-note">입력한 번호와 이름, 수업 답변은 선생님께 전달돼요.</p>`}<p class="error-message" data-form-error>${esc(message)}</p></section></div></section>`;
}
function waitingMarkup(){
  const status=effectiveStatus(),initial=!room.activity||status==='waiting';
  const title=initial?'선생님이 수업을 시작하면<br>함께 관찰해요.':'크롬북을 닫고<br>선생님을 보세요';
  const detail=initial?`${esc(student?.name)} 학생, 반가워요.<br>잠시 선생님의 안내를 기다려 주세요.`:status==='ended'?'오늘 만든 청자와 친구들의 생각을<br>함께 나누어 보아요.':'관찰한 점과 떠오른 생각을<br>친구들과 함께 이야기해 보아요.';
  return `<section class="waiting" data-testid="${initial?'waiting-screen':'lock-screen'}"><div class="waiting-inner"><div class="waiting-illustration">${initial?laptopIcon:closedLaptopIcon}</div><h1>${title}</h1><p>${detail}</p><div class="waiting-status"><i></i>${status==='ended'?'수업을 마쳤어요':initial?'수업 시작을 기다리고 있어요':'다음 활동은 선생님이 열어 주세요'}</div></div></section>`;
}
function progress(activity){if(activity===1)return COMPARISON_ARTIFACTS.filter(a=>drafts[1][a.id]).length;return OBSERVATION_ARTIFACTS.filter(a=>drafts[2][a.id]?.name?.trim()&&drafts[2][a.id]?.use?.trim()).length;}
function saveMarkup(){return `<span class="save-status" data-save-status data-status="${saveState}">${esc(saveMessage||'생각을 적으면 자동으로 저장돼요.')}</span>`;}
function submitMarkup(activity){
  if(activity===1)return `<button class="button" data-action="submit-answers" data-comparison-done ${answerLocked(1)||progress(1)<3||saving?'disabled':''}>${submitted[1]?'다했어요 ✓':saving?'저장 중…':'다했어요'}</button>`;
  return room.settings?.submitButton?`<button class="button" data-action="submit-answers" ${answerLocked(activity)?'disabled':''}>${submitted[activity]?'제출했어요 ✓':'내 생각 제출하기 →'}</button>`:`<span class="observed-progress" data-progress>${progress(activity)} / 5 관찰했어요</span>`;
}
function closeCompletionDialog(){if(!completionDialog)return;completionDialog.close();completionDialog.remove();completionDialog=null;}
function syncCompletionDialog(){
  if(teacherMode||!active(1)||!submitted[1]){closeCompletionDialog();return;}
  if(completionDialog?.isConnected)return;
  const dialog=document.createElement('dialog');dialog.className='completion-dialog';dialog.tabIndex=-1;
  dialog.setAttribute('aria-labelledby','completion-title');dialog.setAttribute('aria-describedby','completion-message');
  dialog.innerHTML='<div class="completion-icon" aria-hidden="true">✓</div><h2 id="completion-title">다했어요!</h2><p id="completion-message">다른 친구들이 다 할 때까지<br>기다려 주세요.</p><small>선생님이 다음 활동을 시작하면 화면이 바뀌어요.</small>';
  dialog.addEventListener('cancel',event=>event.preventDefault());
  (document.fullscreenElement||document.body).append(dialog);completionDialog=dialog;dialog.showModal();dialog.focus();
}
function comparisonMarkup(){return `<div class="lesson-heading"><div><span class="activity-label">활동 1 · ${ACTIVITY_NAMES[1]}</span><h1>어느 나라에서 만든 도자기일까요?</h1><p>세 도자기의 빛깔과 모양을 비교하고, 나라 이름표를 붙여 보세요.</p></div>${timerMarkup()}</div>${expiryMarkup()}${submitted[1]?'<div class="submitted-banner">다했어요! 친구들을 기다리고 있어요.</div>':''}<div class="compare-grid">${COMPARISON_ARTIFACTS.map(a=>`<article class="panel object-card"><div class="object-title"><h2>${esc(a.label)}</h2><span class="object-number">${esc(a.id)}</span></div><div class="viewer-host" data-viewer="${esc(a.id)}" data-collection="comparison"></div><div class="country-drop" data-country-drop="${esc(a.id)}"><label class="visually-hidden" for="country-${esc(a.id)}">${esc(a.label)}의 나라</label><select id="country-${esc(a.id)}" class="country-select ${drafts[1][a.id]?'selected':''}" data-country-for="${esc(a.id)}" ${answerLocked(1)?'disabled':''}><option value="">나라 이름표 놓기</option>${COUNTRY_CHOICES.map(c=>`<option value="${c.id}" ${drafts[1][a.id]===c.id?'selected':''}>${esc(c.label)}</option>`).join('')}</select></div></article>`).join('')}</div><div class="country-tray"><span>이름표를 끌어 놓거나 골라 주세요</span>${COUNTRY_CHOICES.map(c=>`<button class="country-chip" draggable="${!answerLocked(1)}" data-country-chip="${c.id}" aria-pressed="${selectedCountry===c.id}" ${answerLocked(1)?'disabled':''}>${esc(c.label)}</button>`).join('')}</div><div class="answer-footer">${saveMarkup()}${submitMarkup(1)}</div>`;}
function observationMarkup(){
  const artifact=OBSERVATION_ARTIFACTS.find(a=>a.id===currentObject)||OBSERVATION_ARTIFACTS[0],answer=drafts[2][artifact.id]||{};
  return `<div class="lesson-heading"><div><span class="activity-label">활동 2 · ${ACTIVITY_NAMES[2]}</span><h1>모양 속에 어떤 쓰임이 숨어 있을까요?</h1><p>다섯 점을 돌려 보고, 쓰임과 이름을 자유롭게 짐작해 보세요.</p></div>${timerMarkup()}</div>${expiryMarkup()}${submitted[2]?'<div class="submitted-banner">다섯 점에 대한 생각을 선생님께 전달했어요.</div>':''}<div class="observe-layout"><section class="panel observe-stage"><div class="object-title"><h2>${esc(artifact.label)}</h2><span class="object-number">${esc(artifact.id)}</span></div><div class="viewer-host" data-viewer="${esc(artifact.id)}" data-collection="observation"></div><div class="observe-navigation"><button class="nav-arrow" data-action="previous-object" aria-label="이전 청자">←</button><nav class="object-dots" aria-label="활동 2에서 관찰할 다섯 청자">${OBSERVATION_ARTIFACTS.map(a=>`<button class="object-dot ${a.id===artifact.id?'active':''} ${drafts[2][a.id]?.name?.trim()&&drafts[2][a.id]?.use?.trim()?'answered':''}" data-action="select-object" data-id="${a.id}" aria-label="청자 ${a.id} 관찰하기" title="같은 활동 안에서 청자 ${a.id} 관찰" ${a.id===artifact.id?'aria-current="true"':''}>${a.id}</button>`).join('')}</nav><button class="nav-arrow" data-action="next-object" aria-label="다음 청자">→</button></div></section><section class="panel observation-writing"><div><div class="writing-heading"><span>✧</span><h2>내 생각을 적어 주세요</h2></div><p>청자를 돌려 보고, 떠오르는 쓰임과 이름을 적어요.</p></div><label for="guess-use">어디에 쓰던 물건일까요?<textarea id="guess-use" data-observation-field="use" maxlength="180" placeholder="이런 곳에 썼을 것 같아요." ${answerLocked(2)?'disabled':''}>${esc(answer.use||'')}</textarea></label><label for="guess-name">어떤 이름을 붙이면 좋을까요?<input id="guess-name" class="write-name" data-observation-field="name" maxlength="60" placeholder="내가 짐작한 이름" value="${esc(answer.name||'')}" ${answerLocked(2)?'disabled':''}></label><p class="field-help">쓴 생각은 이름 없이 선생님 화면에 함께 모여요.</p><div class="answer-footer">${saveMarkup()}${submitMarkup(2)}</div></section></div>`;
}
function gameMarkup(){return `<div class="game-viewport" data-game-viewport><iframe class="game-frame" title="좋은 청자 위대한 청자 만들기 게임" src="/game?classroom=1&room=${encodeURIComponent(session.code)}&student=${encodeURIComponent(session.participantId)}&run=${encodeURIComponent(room.runId)}" allow="fullscreen" data-testid="classroom-game"></iframe></div><p class="game-save-status" data-game-status>완성한 작품은 선생님께 자동으로 전달돼요.</p>`;}
// The game is laid out for Chromebook screens of at least 1024×600. When the lesson header leaves less room, render it at that size and scale it down.
const GAME_MIN_WIDTH=1024,GAME_MIN_HEIGHT=600;let gameFit=null;
function fitGameFrame(){const box=app.querySelector('[data-game-viewport]'),frame=box?.querySelector('iframe');if(!frame)return;const {width,height}=box.getBoundingClientRect();if(!width||!height)return;const borderX=frame.offsetWidth-frame.clientWidth,borderY=frame.offsetHeight-frame.clientHeight,scale=Math.min(1,width/(GAME_MIN_WIDTH+borderX),height/(GAME_MIN_HEIGHT+borderY));frame.style.width=`${width/scale}px`;frame.style.height=`${height/scale}px`;frame.style.transform=scale<1?`scale(${scale})`:'';}
function watchGameFrame(){gameFit?.disconnect();gameFit=null;const box=app.querySelector('[data-game-viewport]');if(!box)return;fitGameFrame();if('ResizeObserver' in window){gameFit=new ResizeObserver(fitGameFrame);gameFit.observe(box);}}
function renderStudent(){
  const status=effectiveStatus(),key=`student:${room.activity}:${status}:${room.runId}:${room.settings?.submitButton}:${submitted[room.activity]}:${room.activity===2?currentObject:''}:${Boolean(timeExpired())}`;
  if(key!==viewKey){
    const oldFrame=app.querySelector('iframe');if(oldFrame)oldFrame.contentWindow?.postMessage({type:'celadon:classroom-state',active:false,runId:frameRunId,serverNow:now(),endsAt:room.endsAt},location.origin);
    disposeViewers();viewKey=key;const game=active(3);
    app.innerHTML=`<div class="lesson-shell ${game?'game-shell':''} ${status==='active'&&room.activity===1?'compare-shell':''}">${header()}${status!=='active'||!room.activity?waitingMarkup():room.activity===1?comparisonMarkup():room.activity===2?observationMarkup():gameMarkup()}</div>`;
    frameRunId=game?room.runId:'';mountViewers();watchGameFrame();
    if(game){const frame=app.querySelector('iframe');frame.addEventListener('load',()=>{heartbeatGame();frame.contentWindow?.postMessage({type:'celadon:request-completed'},location.origin);});}
  }
  updateSaveStatus();updateTimer();updateConnection();syncCompletionDialog();
}
function cloudMarkup(words,kind){
  const clean=(words||[]).filter(w=>typeof w.text==='string'&&w.text.trim()).slice(0,45),counts=clean.map(w=>Math.max(1,Number(w.count)||1)),max=Math.max(1,...counts),min=Math.min(max,...counts);
  const fontSize=count=>max===min?32:Math.round(18+54*Math.pow((Math.max(1,Number(count)||1)-min)/(max-min),1.4));
  const colors=['#e87854','#21948f','#507fa6','#9c73ad','#759651','#c09a45'];
  return `<div class="word-cloud" data-kind="${kind}" aria-label="${kind==='name'?'예상한 이름':'예상한 쓰임'} 워드클라우드">${clean.length?clean.map((w,i)=>`<span style="font-size:${fontSize(w.count)}px;color:${colors[i%colors.length]}" title="${Number(w.count)||1}명이 쓴 말">${esc(w.text)}</span>`).join(''):'<span class="empty">아직 도착한 생각이 없어요.<br>학생들의 답변이 여기에 모입니다.</span>'}</div>`;
}
function revealedAnswer(activity,id){return teacherData?.reveal?.[activity===1?'comparison':'observations']?.[id];}
function teacherResultTabs(){
  if(![1,2].includes(teacherActivity))return '';
  const exhibit=teacherResultViews[teacherActivity]==='exhibit'&&room.revealed?.[teacherActivity];
  return `<nav class="teacher-result-tabs" aria-label="활동 결과 보기"><button data-action="teacher-result-view" data-view="responses" class="${exhibit?'':'active'}" aria-pressed="${!exhibit}">학생 응답 보기</button><button data-action="teacher-result-view" data-view="exhibit" class="${exhibit?'active':''}" aria-pressed="${Boolean(exhibit)}" ${room.revealed?.[teacherActivity]?'':'disabled'}>청자 설명 보기</button></nav>`;
}
function exhibitMarkup(){
  const artifacts=teacherActivity===1?COMPARISON_ARTIFACTS:OBSERVATION_ARTIFACTS;
  const artifact=artifacts.find(a=>a.id===exhibitObjects[teacherActivity])||artifacts[0],index=artifacts.indexOf(artifact),answer=revealedAnswer(teacherActivity,artifact.id);
  if(!answer)return '<section class="panel teacher-empty"><p>청자 설명을 불러오고 있어요.</p></section>';
  return `<section class="exhibit-page panel" data-testid="exhibit-page" data-exhibit-activity="${teacherActivity}" data-exhibit-id="${esc(artifact.id)}"><div class="exhibit-layout"><div class="exhibit-model"><span class="activity-label">${esc(artifact.label)} · 함께 살펴보기</span><div class="viewer-host" data-exhibit-viewer="${esc(artifact.id)}"></div></div><article class="exhibit-description" aria-live="polite"><div class="exhibit-meta">${answer.countryLabel?`<span>${esc(answer.countryLabel)}</span>`:''}${answer.date&&answer.date!==answer.countryLabel?`<span>${esc(answer.date)}</span>`:''}</div><h2>${esc(answer.name)}</h2>${answer.use?`<p class="exhibit-use"><strong>쓰임</strong>${esc(answer.use)}</p>`:''}<p class="exhibit-note">${esc(answer.note||'')}</p>${answer.sourceUrl?`<a class="exhibit-source" href="${esc(answer.sourceUrl)}" target="_blank" rel="noopener noreferrer">자료 출처 보기 ↗</a>`:''}${answer.licenseUrl?`<a class="exhibit-source" href="${esc(answer.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(answer.license)}</a>`:''}</article></div><div class="exhibit-navigation"><button class="button secondary" data-action="exhibit-previous" ${index===0?'disabled':''} aria-label="이전 청자 설명">← 이전</button><nav class="exhibit-number-pages" aria-label="청자별 설명 페이지">${artifacts.map(a=>`<button data-action="exhibit-object" data-id="${a.id}" class="${a.id===artifact.id?'active':''}" aria-label="청자 ${a.id} 설명 보기" ${a.id===artifact.id?'aria-current="page"':''}>${a.id}</button>`).join('')}</nav><button class="button secondary" data-action="exhibit-next" ${index===artifacts.length-1?'disabled':''} aria-label="다음 청자 설명">다음 →</button></div><p class="exhibit-page-count">청자 ${index+1} / ${artifacts.length}</p></section>`;
}
function teacherContent(){
  if(teacherActivity===3)return teacherWorks();
  return teacherResultTabs()+(teacherResultViews[teacherActivity]==='exhibit'&&room.revealed?.[teacherActivity]?exhibitMarkup():teacherActivity===1?teacherComparison():teacherObservations());
}
function teacherComparison(){return `<div class="teacher-visuals">${COMPARISON_ARTIFACTS.map(a=>{const item=teacherData?.comparison?.find(c=>c.id===a.id)||{respondents:0,total:0,unanswered:0,choices:[]};return `<section class="panel result-panel"><h2>${esc(a.label)} <small>${Number(item.respondents)||0}명 응답</small></h2>${COUNTRY_CHOICES.map(c=>{const choice=item.choices.find(v=>v.country===c.id)||{percent:0,count:0};return `<div class="bar-row"><div class="row"><span>${esc(c.label)}<small>${Number(choice.count)||0}명</small></span><strong>${Number(choice.percent)||0}%</strong></div><div class="bar-track"><div class="bar-fill ${c.id}" style="width:${Math.min(100,Math.max(0,Number(choice.percent)||0))}%"></div></div></div>`;}).join('')}<p class="unanswered">아직 고르지 않은 학생 ${Number(item.unanswered)||0}명 · 응답한 학생 기준</p></section>`;}).join('')}</div>`;}
function teacherObservations(){
  const item=teacherData?.observations?.find(o=>o.id===teacherObject)||{responses:[],nameWords:[],useWords:[]};
  return `<div class="observation-board"><section class="board-context panel"><span class="activity-label">관찰할 청자</span><div class="object-title"><h2>청자 ${esc(teacherObject)}</h2><span class="object-number">${esc(teacherObject)} / 5</span></div><div class="teacher-observation-viewer viewer-host" data-teacher-viewer="${esc(teacherObject)}"></div><nav class="teacher-object-tabs" aria-label="답변을 볼 청자">${OBSERVATION_ARTIFACTS.map(a=>`<button class="${a.id===teacherObject?'active':''}" data-action="teacher-object" data-id="${a.id}" aria-label="청자 ${a.id} 응답 보기">${a.id}</button>`).join('')}</nav><h3>모양을 보고 짐작해요</h3><p>어디에 쓰던 물건일까요?<br>어떤 이름을 붙이면 좋을까요?</p><span class="anonymous-label">이름 없이 생각을 모아요</span></section><section class="board-canvas panel cloud-layout"><div class="board-toolbar"><div class="board-view-switch" aria-label="모아 볼 답변"><button data-action="cloud-kind" data-kind="name" aria-pressed="${cloudKind==='name'}" class="${cloudKind==='name'?'active':''}">예상한 이름</button><button data-action="cloud-kind" data-kind="use" aria-pressed="${cloudKind==='use'}" class="${cloudKind==='use'?'active':''}">예상한 쓰임</button></div><span class="board-response-count">${item.responses.length}개 생각</span></div><h2 class="board-question">${cloudKind==='name'?'어떤 이름을 붙였나요?':'어디에 썼을까요?'}</h2>${cloudMarkup(cloudKind==='name'?item.nameWords:item.useWords,cloudKind)}<div class="board-caption">많이 나온 생각은 크게, 적게 나온 생각은 작게 보여요.</div></section></div><details class="panel settings-panel response-phrases" data-details="responses" ${responsesOpen?'open':''}><summary>학생들의 생각 그대로 보기 · 익명 ${item.responses.length}개</summary><div class="response-list">${item.responses.length?item.responses.map(r=>`<p>${r.name?`<b>${esc(r.name)}</b>`:''}${esc(r.use||'')}</p>`).join(''):'<p>아직 모인 생각이 없어요.</p>'}</div></details>`;
}
function disposeTeacherBoard(){cloudView?.dispose();cloudView=null;teacherViewer?.viewer.dispose();teacherViewer=null;}
function mountTeacherBoard(){
  cloudView?.dispose();cloudView=null;
  const target=app.querySelector('[data-exhibit-viewer], [data-teacher-viewer]');
  if(!target){teacherViewer?.viewer.dispose();teacherViewer=null;return;}
  const exhibit=target.hasAttribute('data-exhibit-viewer'),id=exhibit?target.dataset.exhibitViewer:target.dataset.teacherViewer;
  const key=exhibit?`exhibit:${teacherActivity}:${id}`:`observation:${id}`,artifacts=exhibit&&teacherActivity===1?COMPARISON_ARTIFACTS:OBSERVATION_ARTIFACTS;
  if(teacherViewer?.key===key)target.replaceWith(teacherViewer.element);
  else{teacherViewer?.viewer.dispose();teacherViewer={key,element:target,viewer:mountLessonViewer(target,artifacts.find(a=>a.id===id))};}
  const cloud=app.querySelector('.word-cloud');if(cloud)cloudView=mountWordCloud(cloud);
}
function workKey(work){return `${session?.code}:${work.participantId}:${work.id}`;}
function teacherWorks(){const works=teacherData?.works||[];return works.length?`<div class="works-grid">${works.map(w=>`<article class="panel work-card" data-work-id="${esc(w.id)}"><div class="work-preview" data-work-preview="${esc(workKey(w))}">${workImages.has(workKey(w))?`<img src="${esc(workImages.get(workKey(w)))}" alt="${w.name?`${esc(w.number)}번 ${esc(w.name)} 학생의 완성한 청자`:'학생의 완성한 청자'}">`:'<span class="image-wait">완성한 청자를 불러오고 있어요.</span>'}<span class="work-score">${Number(w.score?.total??w.score)||0}점</span></div><div class="work-details">${w.name?`<p class="student-line">${esc(w.number)}번 ${esc(w.name)}</p>`:''}<h2>${esc(w.title||'나의 청자')}</h2><h3>모양 · 문양 · 쓰임</h3><p>${esc(w.explanationUse||'')}</p><h3>공들인 부분</h3><p>${esc(w.explanationBeauty||'')}</p></div></article>`).join('')}</div>`:`<section class="panel teacher-empty"><h2>나만의 청자를 빚고 있어요.</h2><p>학생이 작품을 완성하고 설명을 전달하면<br>이곳에 청자와 이야기, 점수가 함께 모입니다.</p></section>`;}
function teacherSettings(){const set=room.settings||DEFAULT_SETTINGS;return `<details class="panel settings-panel" data-details="settings" ${settingsOpen?'open':''}><summary>시간과 제출 방식 설정</summary><form data-form="settings"><div class="settings-grid">${[1,2].map(n=>`<label class="duration-field">활동 ${n} 시간 (초)<input type="number" name="duration-${n}" min="5" max="1800" step="1" value="${set.durations?.[n]||DEFAULT_SETTINGS.durations[n]}" required ${effectiveStatus()==='active'?'disabled':''}></label>`).join('')}<label class="setting-toggle"><input type="checkbox" name="submitButton" ${set.submitButton?'checked':''} ${effectiveStatus()==='active'?'disabled':''}><span>활동 2 제출 버튼 사용<small>활동 1은 항상 ‘다했어요’로 마칩니다.</small></span></label><label class="setting-toggle"><input type="checkbox" name="autoPause" ${set.autoPause!==false?'checked':''} ${effectiveStatus()==='active'?'disabled':''}><span>시간이 끝나면 활동 마무리<small>활동 3은 시간 제한 없이 선생님이 마칠 때까지 이어져요.</small></span></label></div><div class="settings-footer"><span class="settings-open-hint">활동을 시작하기 전에 설정할 수 있어요.</span><button type="submit" class="button secondary small" ${effectiveStatus()==='active'?'disabled':''}>설정 저장</button></div></form></details>`;}
function participantsMarkup(){const list=teacherData?.participants||[];return `<details class="panel participant-panel" data-details="participants" ${participantsOpen?'open':''}><summary>참여 학생 · ${list.length}명${room.locked?' · 입장 잠김':''}</summary>${entryTools()}<table class="participants-table"><thead><tr><th>번호</th><th>이름</th><th>활동 1</th><th>활동 2</th><th>완성작</th></tr></thead><tbody>${list.length?list.map(p=>`<tr><td>${esc(p.number)}</td><td>${esc(p.name)}${p.released?'<small class="released-tag">다시 입장 대기</small>':''}</td><td class="${p.activity1Complete?'status-ok':'empty-cell'}">${p.activity1Submitted?'제출 완료':p.activity1Complete?'작성 완료':'관찰 중'}</td><td class="${p.activity2Complete?'status-ok':'empty-cell'}">${p.activity2Submitted?'제출 완료':p.activity2Complete?'작성 완료':'관찰 중'}</td><td>${p.completedWorkCount||0}점</td></tr>`).join(''):'<tr><td colspan="5" class="empty-cell">학생들에게 수업 코드를 알려 주세요.</td></tr>'}</tbody></table></details>`;}
function entryTools(inManager=false){return `<div class="participant-tools"><button class="button secondary small" data-action="lock-room" data-locked="${room?.locked?'false':'true'}" ${controlBusy?'disabled':''}>${room?.locked?'입장 다시 열기':'입장 잠그기'}</button>${inManager?'':'<button class="button quiet small" data-action="manage-students">학생 관리</button>'}</div><p class="participant-note">${room?.locked?'새 번호로는 들어올 수 없어요. 번호를 푼 학생은 다시 들어올 수 있어요.':'수업 코드를 아는 사람은 누구나 들어올 수 있어요. 모두 들어오면 잠가 주세요.'}</p>`;}
// Lives outside #classroom-app so the teacher board can re-render underneath it; refreshed after every teacher render.
function studentManagerMarkup(){const list=teacherData?.participants||[];return `<div class="manager-head"><h2>학생 관리</h2><button class="button quiet small" type="button" data-close-manager>닫기</button></div><p class="muted">브라우저 기록이 지워져 다시 들어오지 못하는 학생은 <b>번호 풀기</b>를 누른 뒤 같은 번호로 입장하게 해 주세요. 쓰던 답과 작품은 그대로 이어져요.</p>${entryTools(true)}<div class="manager-scroll"><table class="manager-table"><thead><tr><th>번호</th><th>이름</th><th>상태</th><th>관리</th></tr></thead><tbody>${list.length?list.map(p=>`<tr><td>${esc(p.number)}</td><td>${esc(p.name)}</td><td>${p.released?'다시 입장 대기':'참여 중'}</td><td class="manager-actions"><button class="button secondary small" data-action="release-student" data-id="${esc(p.id)}" ${p.released||controlBusy?'disabled':''}>번호 풀기</button><button class="button danger small" data-action="remove-student" data-id="${esc(p.id)}" data-name="${esc(p.name)}" ${controlBusy?'disabled':''}>내보내기</button></td></tr>`).join(''):'<tr><td colspan="4" class="empty-cell">아직 들어온 학생이 없어요.</td></tr>'}</tbody></table></div>`;}
function refreshStudentManager(){const dialog=document.querySelector('dialog.student-manager');if(dialog?.open)dialog.innerHTML=studentManagerMarkup();}
function openStudentManager(){let dialog=document.querySelector('dialog.student-manager');if(!dialog){dialog=document.createElement('dialog');dialog.className='student-manager';dialog.setAttribute('aria-label','학생 관리');dialog.addEventListener('click',event=>{if(event.target.closest('[data-close-manager]')){dialog.close();return;}handleClick(event);});document.body.append(dialog);}dialog.innerHTML=studentManagerMarkup();if(!dialog.open)dialog.showModal();}
function renderTeacher(){
  if(!teacherMode||!(session?.teacherToken||session?.observerToken))return;
  const status=effectiveStatus(),dataSignature=JSON.stringify({state:{...room,serverNow:0},participants:teacherData?.participants,comparison:teacherData?.comparison,observations:teacherData?.observations,works:teacherData?.works,reveal:teacherData?.reveal,teacherActivity,teacherObject,cloudKind,teacherResultViews,exhibitObjects,status,controlBusy});
  if(settingsDirty&&viewKey==='teacher'){updateTimer();updateConnection();return;}
  if(viewKey==='teacher'&&teacherSignature===dataSignature){updateTimer();updateConnection();if(teacherActivity===3)loadWorkImages();return;}
  teacherSignature=dataSignature;viewKey='teacher';disposeViewers();cloudView?.dispose();cloudView=null;
  const live=room.activity===teacherActivity&&status==='active',participantCount=teacherData?.participants?.length||0;
  const completed=teacherActivity===1?(teacherData?.participants||[]).filter(p=>p.activity1Complete).length:teacherActivity===2?(teacherData?.participants||[]).filter(p=>p.activity2Complete).length:(teacherData?.works||[]).length;
  app.innerHTML=`<div class="lesson-shell teacher-shell">${header()}<div class="teacher-workspace"><section class="teacher-main"><div class="teacher-overview"><div><span class="activity-label">고려의 문화 · 함께 생각하는 시간</span><h1>${TITLE}</h1></div></div><nav class="teacher-stage-nav" aria-label="교사용 활동 선택">${[1,2,3].map(n=>`<button class="${teacherActivity===n?'active':''}" data-action="teacher-activity" data-activity="${n}">${room.activity===n&&status==='active'?'<i class="live-dot"></i>':''}<span><b>${n}</b> ${ACTIVITY_NAMES[n]}</span></button>`).join('')}</nav><div class="teacher-content">${teacherContent()}</div></section><aside class="teacher-sidebar" aria-label="교사용 수업 진행"><section class="teacher-control-bar"><span class="activity-label">수업 진행</span><div class="stage-caption">${ACTIVITY_NAMES[teacherActivity]}<small>${observerMode?(live?'학생들이 활동하고 있어요.':status==='active'?`지금은 활동 ${room.activity}${room.activity===2?'가':'이'} 진행 중이에요.`:status==='ended'?'수업을 마쳤어요.':room.activity===teacherActivity&&status==='paused'?'학생들이 선생님을 보고 있어요.':'아직 진행하지 않은 활동이에요.'):live?(timeExpired()?'입력이 마감됐어요. 활동을 마쳐 주세요.':'학생들이 활동하고 있어요.'):status==='active'?`지금은 활동 ${room.activity}${room.activity===2?'가':'이'} 진행 중이에요. 먼저 활동을 마쳐 주세요.`:room.activity===teacherActivity&&status==='paused'?'학생들이 선생님을 보고 있어요.':status==='ended'?'수업을 마쳤어요.':'시작하면 학생 화면이 함께 열립니다.'}</small></div>${timerMarkup()}<div class="teacher-metrics"><span>참여 <strong>${participantCount}</strong>명</span><span>${teacherActivity===3?'완성작':'모두 작성'} <strong>${completed}</strong>${teacherActivity===3?'점':'명'}</span></div>${observerMode?'':`<div class="teacher-action-buttons">${live?`<button class="button" data-action="pause" ${controlBusy?'disabled':''}>활동 마치기 →</button>`:`<button class="button" data-action="start" data-activity="${teacherActivity}" ${controlBusy||status==='active'||status==='ended'?'disabled':''}>활동 ${teacherActivity} 시작 →</button>`}${teacherActivity<3?`<button class="button secondary" data-action="reveal" data-activity="${teacherActivity}" ${status==='active'||controlBusy||!room.runs?.[teacherActivity]||room.revealed?.[teacherActivity]?'disabled':''}>${room.revealed?.[teacherActivity]?'설명 공개됨':'함께 정답 보기'}</button>`:''}</div>`}</section>${status==='paused'?'<div class="teacher-pause-note">학생 화면은 지금<br>“크롬북을 닫고 선생님을 보세요”</div>':''}${observerMode?'':participantsMarkup()+teacherSettings()}</aside></div></div>`;
  updateTimer();updateConnection();mountTeacherBoard();refreshStudentManager();if(teacherActivity===3)loadWorkImages();
}
async function loadWorkImages(){const requestSession=session;for(const work of teacherData?.works||[]){const key=workKey(work);if(workImages.has(key)||workImagePending.has(key))continue;workImagePending.add(key);try{const value=await api('artwork',{body:{participantId:work.participantId,workId:work.id}});if(session!==requestSession)return;if(typeof value.preview==='string'&&/^data:image\/(png|webp);base64,/.test(value.preview)){workImages.set(key,value.preview);const container=[...document.querySelectorAll('[data-work-preview]')].find(el=>el.dataset.workPreview===key);if(container){const image=document.createElement('img');image.src=value.preview;image.alt=work.name?`${work.number}번 ${work.name} 학생의 완성한 청자`:'학생의 완성한 청자';container.querySelector('.image-wait')?.replaceWith(image);}}}catch{const container=[...document.querySelectorAll('[data-work-preview]')].find(el=>el.dataset.workPreview===key);if(container?.querySelector('.image-wait'))container.querySelector('.image-wait').textContent='작품 사진을 다시 불러올게요.';}finally{workImagePending.delete(key);}}}
function resetRoom({keepTeacherKey=false}={}){
  closeCompletionDialog();teacherResultViews={1:'responses',2:'responses'};exhibitObjects={1:'1',2:'1'};
  heartbeatGame();disposeViewers();disposeTeacherBoard();clearTimeout(pollTimer);clearTimeout(saveTimer);session=null;room=null;teacherData=null;student=null;answers={};
  drafts={1:{},2:{}};revisions={1:0,2:0};dirty={1:false,2:false};draftChanges={1:0,2:0};submitted={1:false,2:false};
  viewKey='';teacherSignature='';currentObject='1';teacherActivity=1;teacherObject='1';selectedCountry=null;cloudKind='name';settingsDirty=false;connectionError='';
  uploadedWorks.clear();pendingWorks.clear();workImages.clear();workImagePending.clear();if(teacherMode){if(!keepTeacherKey)store(SESSION_KEY,null);}else clearActiveStudentSession();
}
function render(){if(!session||!room)return renderWelcome();if(teacherMode)renderTeacher();else renderStudent();}
function updateTimer(){
  const timer=document.querySelector('[data-testid=lesson-timer]');if(!timer)return;
  const viewed=teacherMode?teacherActivity:room?.activity;
  if(untimed(viewed)){const live=room?.activity===viewed&&effectiveStatus()==='active';timer.querySelector('strong').textContent=live?formatTime(elapsed()):'제한 없음';timer.classList.remove('warning','finished');return;}
  let seconds=remaining();if(teacherMode&&(room.activity!==teacherActivity||effectiveStatus()!=='active'))seconds=room.activity===teacherActivity&&deadlinePassed()?0:room.settings?.durations?.[teacherActivity]||0;timer.querySelector('strong').textContent=formatTime(seconds);timer.classList.toggle('warning',active(room?.activity)&&seconds<=20&&seconds>0);timer.classList.toggle('finished',seconds===0);
}
function updateSaveStatus(){
  const done=app.querySelector('[data-comparison-done]');if(done){done.disabled=answerLocked(1)||progress(1)<3||saving;done.textContent=submitted[1]?'다했어요 ✓':saving?'저장 중…':'다했어요';}
  document.querySelectorAll('[data-save-status]').forEach(el=>{el.dataset.status=saveState;el.textContent=saveMessage||'생각을 적으면 자동으로 저장돼요.';});
  const progressEl=document.querySelector('[data-progress]');if(progressEl)progressEl.textContent=`${progress(room?.activity)} / ${room?.activity===1?3:5} 관찰했어요`;
  if(room?.activity===2)document.querySelectorAll('[data-action=select-object]').forEach(el=>{const a=drafts[2][el.dataset.id]||{};el.classList.toggle('answered',Boolean(a.name?.trim()&&a.use?.trim()));});
}
function changed(activity){dirty[activity]=true;draftChanges[activity]++;saveState='pending';saveMessage='생각을 적고 있어요…';persistDrafts();updateSaveStatus();clearTimeout(saveTimer);saveTimer=setTimeout(()=>queueSave(),800);}
async function queueSave(final=false){
  if(teacherMode||!session||![1,2].includes(room?.activity)||!active(room.activity))return;
  const activity=room.activity;if(submitted[activity])return;
  if(final&&progress(activity)!==(activity===1?3:5)){toast(activity===1?'세 도자기에 나라 이름표를 모두 골라 주세요.':'다섯 점의 쓰임과 이름을 모두 적어 주세요.');return;}
  if(saving){saveAgain=true;finalAgain||=final;return;}
  if(!dirty[activity]&&!final)return;
  clearTimeout(saveTimer);saving=true;const requestSession=session,runId=room.runId,change=draftChanges[activity],clientRevision=++revisions[activity];
  saveState='saving';saveMessage='선생님께 전달하고 있어요…';updateSaveStatus();
  try{
    const payload=await api('answer',{method:'POST',body:{participantId:session.participantId,activity,runId,clientRevision,answers:copy(drafts[activity]),final}});
    if(session!==requestSession)return;
    if((room?.runs?.[activity]||room?.runId)===runId){
      const record=payload.answers?.[activity],confirmed=record?.runId===runId&&record.clientRevision>=clientRevision;
      if(confirmed){
        revisions[activity]=Math.max(revisions[activity],record.clientRevision);submitted[activity]=Boolean(record.submitted);
        if(record.submitted){drafts[activity]=copy(record.answers||{});dirty[activity]=false;}
        else if(!payload.ignored&&draftChanges[activity]===change){dirty[activity]=false;drafts[activity]=copy(record.answers||{});}
        answers={...answers,[activity]:record};
      }
      if(payload.ignored&&!submitted[activity]){saveAgain=true;finalAgain||=final;saveState='pending';saveMessage='수정한 생각을 다시 저장하고 있어요…';}
      else{saveState=confirmed?'saved':'pending';saveMessage=record?.submitted?'생각을 제출했어요.':confirmed?'저장했어요 ✓':'저장 상태를 확인하고 있어요…';}
      receive({...payload,answers:undefined});persistDrafts();render();
    }
  }catch(error){if(session!==requestSession)return;saveState='error';saveMessage=error.status===409?error.message:'저장하지 못했어요. 다시 연결하면 이어서 보낼게요.';connectionError=error.status===409?'':error.message;updateSaveStatus();updateConnection();}
  finally{saving=false;if(saveAgain){const nextFinal=finalAgain;saveAgain=false;finalAgain=false;queueSave(nextFinal);}updateSaveStatus();}
}
function setCountry(id,value){if(!active(1)||submitted[1])return;drafts[1][id]=value;const select=document.querySelector(`[data-country-for="${id}"]`);if(select){select.value=value;select.classList.toggle('selected',Boolean(value));}changed(1);}
function selectObject(id){if(!OBSERVATION_ARTIFACTS.some(a=>a.id===id))return;clearTimeout(saveTimer);if(dirty[2])queueSave();currentObject=id;renderStudent();}
function heartbeatGame(){const frame=app.querySelector('.game-frame');if(!frame)return;const enabled=active(3)&&Date.now()-lastSuccessfulPoll<14000;frame.contentWindow?.postMessage({type:'celadon:classroom-state',active:enabled,runId:room.runId,endsAt:room.endsAt,serverNow:now()},location.origin);lastGameActive=enabled;}
async function sendWork(entry){
  if(!entry||uploadedWorks.has(entry.work.id)||entry.sending||!canSendWork()||entry.runId!==room.runId)return;
  entry.sending=true;const requestSession=session,status=app.querySelector('[data-game-status]');if(status)status.textContent='완성한 작품을 선생님께 전달하고 있어요…';
  try{await api('work',{method:'POST',body:{participantId:session.participantId,runId:entry.runId,work:entry.work,preview:entry.preview}});if(session!==requestSession)return;uploadedWorks.add(entry.work.id);pendingWorks.delete(entry.work.id);if(status)status.textContent='완성한 작품을 선생님께 전달했어요 ✓';}
  catch(error){entry.error=error.message;if(status)status.textContent='작품을 아직 보내지 못했어요. 연결되면 다시 보낼게요.';}
  finally{entry.sending=false;}
}
// Mirrors WORK_UPLOAD_GRACE_MS on the server: keep delivering works finished just before the activity closed.
function canSendWork(){if(active(3))return true;if(room?.activity!==3||room.status==='ended')return false;const closedAt=room.status==='paused'?room.pausedAt:room.endsAt;return Number.isFinite(closedAt)&&now()>=closedAt&&now()<closedAt+20000;}
function retryWorks(){if(!teacherMode&&canSendWork())for(const entry of pendingWorks.values())sendWork(entry);}
window.addEventListener('message',event=>{
  if(teacherMode||event.origin!==location.origin)return;const frame=app.querySelector('.game-frame');if(!frame||event.source!==frame.contentWindow||!event.data||typeof event.data!=='object')return;
  if(event.data.type==='celadon:ready'){heartbeatGame();frame.contentWindow?.postMessage({type:'celadon:request-completed'},location.origin);}
  if(event.data.type==='celadon:completed'&&event.data.work?.step===4&&typeof event.data.work.id==='string'&&event.data.runId===room?.runId){const {work,preview,runId}=event.data;if(typeof preview!=='string'||preview.length>420000||!/^data:image\/(png|webp);base64,/.test(preview))return;if(uploadedWorks.has(work.id))return;const existing=pendingWorks.get(work.id);if(!existing)pendingWorks.set(work.id,{work,preview,runId,sending:false});sendWork(pendingWorks.get(work.id));}
});

function restoreEntryName(form){
  if(!form||form.dataset.form!=='join')return;
  const field=form.elements.namedItem('name');if(!field||field.dataset.edited==='true')return;
  const previous=findStudentRejoin({code:extractClassroomCode(form.elements.namedItem('code')?.value||''),number:form.elements.namedItem('number')?.value});
  field.value=previous?.student?.name||'';
}
async function createTeacherClassroom(){
  let pending=stored(PENDING_CLASSROOM_KEY);
  if(!pending||!/^[A-Za-z0-9_-]{43}$/.test(pending.createToken||'')||pending.previousCode!==(session?.code||null)){
    const bytes=crypto.getRandomValues(new Uint8Array(32));
    pending={createToken:btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''),previousCode:session?.code||null};
    store(PENDING_CLASSROOM_KEY,pending);
  }
  const savedPending=stored(PENDING_CLASSROOM_KEY);
  if(savedPending?.createToken!==pending.createToken||savedPending?.previousCode!==pending.previousCode)throw new Error('수업 정보를 이 브라우저에 저장하지 못했어요. 저장 공간과 브라우저 설정을 확인한 뒤 다시 눌러 주세요.');
  const payload=await api('create',{method:'POST',body:{joinCode:CLASSROOM_JOIN_CODE,createToken:pending.createToken,...(pending.previousCode?{previousCode:pending.previousCode}:{})}});
  const nextSession={code:payload.code,teacherToken:payload.teacherToken};store(SESSION_KEY,nextSession);
  const savedSession=stored(SESSION_KEY);
  if(savedSession?.code!==nextSession.code||savedSession?.teacherToken!==nextSession.teacherToken)throw new Error('수업 정보를 이 브라우저에 저장하지 못했어요. 저장 공간과 브라우저 설정을 확인한 뒤 다시 눌러 주세요.');
  resetRoom({keepTeacherKey:true});session=nextSession;store(PENDING_CLASSROOM_KEY,null);
  receive(payload,{initial:true});await poll();schedulePoll();
}

app.addEventListener('submit',async event=>{
  const form=event.target.closest('form[data-form]');if(!form)return;event.preventDefault();if(!actionAllowed(form.dataset.form))return;const values=new FormData(form),button=form.querySelector('button[type=submit]');if(button)button.disabled=true;
  try{
    if(form.dataset.form==='create'){
      await createTeacherClassroom();
    }else if(form.dataset.form==='join'){
      const code=extractClassroomCode(String(values.get('code')||'')),number=Number(values.get('number')),name=String(values.get('name')||'').trim();
      const previous=findStudentRejoin({code,number});session=null;clearActiveStudentSession();
      const payload=await api('join',{method:'POST',body:{code,number,name,...(previous?{participantToken:previous.participantToken}:{})}});
      student=payload.student||{number,name};session={code:payload.code||code,participantId:payload.participantId,participantToken:payload.participantToken,student,joinCode:payload.state?.joinCode||code};rememberStudentEntry(session);receive(payload,{initial:true});schedulePoll();
    }else if(form.dataset.form==='settings'){
      const settings={durations:Object.fromEntries([1,2].map(n=>[n,Number(values.get(`duration-${n}`))])),submitButton:values.has('submitButton'),autoPause:values.has('autoPause')};
      await control('settings',{settings});settingsDirty=false;toast('시간과 제출 방식을 저장했어요.');teacherSignature='';render();
    }
  }catch(error){const message=app.querySelector('[data-form-error]');if(message)message.textContent=error.message;else toast(error.message);}
  finally{if(button?.isConnected)button.disabled=false;}
});
async function control(command,extra={}){
  if(!actionAllowed(command)||controlBusy)return;controlBusy=true;const requestSession=session;renderTeacher();
  try{const payload=await api('control',{method:'POST',body:{command,...extra}});if(session!==requestSession)return;receive(payload);await poll();}
  finally{controlBusy=false;teacherSignature='';render();}
}
async function handleClick(event){
  const chip=event.target.closest('[data-country-chip]');if(chip){selectedCountry=selectedCountry===chip.dataset.countryChip?null:chip.dataset.countryChip;document.querySelectorAll('[data-country-chip]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.countryChip===selectedCountry)));if(selectedCountry)toast(`${countryName(selectedCountry)} 이름표를 놓을 도자기의 칸을 눌러 주세요.`);return;}
  const drop=event.target.closest('[data-country-drop]');if(drop&&selectedCountry&&!submitted[1]){event.preventDefault();setCountry(drop.dataset.countryDrop,selectedCountry);selectedCountry=null;document.querySelectorAll('[data-country-chip]').forEach(el=>el.setAttribute('aria-pressed','false'));return;}
  const button=event.target.closest('[data-action]');if(!button||button.disabled)return;const action=button.dataset.action;if(!actionAllowed(action))return;
  if(['copy-observer','end','new-room','delete-room'].includes(action)){manageOpen=false;button.closest('details')?.removeAttribute('open');}
  try{
    if(action==='retry-connection'){saveState='pending';await poll();if(!teacherMode)queueSave();return;}
    if(action==='submit-answers'){queueSave(true);return;}
    if(action==='next-object'||action==='previous-object'){const index=OBSERVATION_ARTIFACTS.findIndex(a=>a.id===currentObject),step=action==='next-object'?1:-1;selectObject(OBSERVATION_ARTIFACTS[(index+step+OBSERVATION_ARTIFACTS.length)%OBSERVATION_ARTIFACTS.length].id);return;}
    if(action==='select-object'){selectObject(button.dataset.id);return;}
    if(action==='teacher-activity'){teacherActivity=Number(button.dataset.activity);settingsDirty=false;renderTeacher();return;}
    if(action==='teacher-object'){teacherObject=button.dataset.id;renderTeacher();return;}
    if(action==='teacher-result-view'){if([1,2].includes(teacherActivity)&&(button.dataset.view==='responses'||room.revealed?.[teacherActivity])){teacherResultViews[teacherActivity]=button.dataset.view==='exhibit'?'exhibit':'responses';renderTeacher();}return;}
    if(['exhibit-object','exhibit-previous','exhibit-next'].includes(action)){
      if(![1,2].includes(teacherActivity)||!room.revealed?.[teacherActivity])return;
      const artifacts=teacherActivity===1?COMPARISON_ARTIFACTS:OBSERVATION_ARTIFACTS,index=artifacts.findIndex(a=>a.id===exhibitObjects[teacherActivity]);
      const id=action==='exhibit-object'?button.dataset.id:artifacts[index+(action==='exhibit-next'?1:-1)]?.id;
      if(artifacts.some(a=>a.id===id)){exhibitObjects[teacherActivity]=id;teacherResultViews[teacherActivity]='exhibit';renderTeacher();app.querySelector(`[data-action=exhibit-object][data-id="${id}"]`)?.focus({preventScroll:true});}return;
    }
    if(action==='cloud-kind'){cloudKind=button.dataset.kind==='use'?'use':'name';renderTeacher();return;}
    if(action==='claim-join-code'){await control('claim-join-code');return;}
    if(action==='copy-code'){await copyClassroomValue(publicJoinCode(),'수업 코드');return;}
    if(action==='copy-invite'){await copyClassroomValue(`${location.origin}/lesson?code=${encodeURIComponent(publicJoinCode())}`,'참여 주소');return;}
    if(action==='fullscreen'){if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();return;}
    if(action==='start'){settingsDirty=false;await control('start',{activity:Number(button.dataset.activity)});return;}
    if(action==='pause'){await control('pause');return;}
    if(action==='reveal'){await control('reveal',{activity:Number(button.dataset.activity)});return;}
    if(action==='end'){if(confirm('모든 학생의 활동을 마치고 수업을 종료할까요?'))await control('end');return;}
    if(action==='retry-boot'){boot();return;}
    if(action==='manage-students'){openStudentManager();return;}
    if(action==='lock-room'){await control('lock-room',{locked:button.dataset.locked==='true'});return;}
    if(action==='release-student'){if(confirm(`${button.dataset.id}번 학생의 입장 정보를 풀까요?\n\n학생이 같은 번호로 다시 입장하면 쓰던 답과 작품을 이어서 할 수 있어요.`))await control('release-student',{participantId:button.dataset.id});return;}
    if(action==='remove-student'){if(confirm(`${button.dataset.id}번 ${button.dataset.name||''} 학생을 내보낼까요?\n\n이 학생의 답과 완성작이 서버에서 삭제되고 되돌릴 수 없어요.`))await control('remove-student',{participantId:button.dataset.id});return;}
    if(action==='copy-observer'){let key=session.observerToken;if(!key){const payload=await api('control',{method:'POST',body:{command:'observer-link'}});key=payload.observerToken;if(!key)throw new Error('참관 주소를 만들지 못했어요. 다시 눌러 주세요.');session={...session,observerToken:key};store(SESSION_KEY,session);}await copyClassroomValue(`${location.origin}/observe?code=${encodeURIComponent(session.code)}#key=${key}`,'참관 주소');return;}
    if(action==='new-room'){if(!confirm('탑텐반 코드를 새 수업에 연결할까요?\n\n기존 수업의 응답은 서버에 남고, 새 수업은 처음부터 시작합니다.'))return;button.disabled=true;try{await createTeacherClassroom();}finally{if(button.isConnected)button.disabled=false;}return;}
    if(action==='delete-room'){if(!confirm('이 수업의 학생 정보, 답변, 작품을 모두 삭제할까요? 삭제한 자료는 되돌릴 수 없습니다.'))return;await api('control',{method:'POST',body:{command:'delete'}});resetRoom();renderWelcome();toast('수업 자료를 삭제했어요.');return;}
  }catch(error){toast(error.message);}
}
app.addEventListener('click',handleClick);
app.addEventListener('paste',event=>{
  const input=event.target.closest('input[name=code]');if(!input)return;
  const code=extractClassroomCode(event.clipboardData?.getData('text')||'');
  if(code){event.preventDefault();input.value=code;input.setCustomValidity('');restoreEntryName(input.form);}
  else if((event.clipboardData?.getData('text')||'').length>6){event.preventDefault();toast('수업 코드 ‘탑텐반’ 또는 이 수업의 참여 주소를 붙여 주세요.');}
});
app.addEventListener('change',event=>{const select=event.target.closest('[data-country-for]');if(select)setCountry(select.dataset.countryFor,select.value);if(event.target.closest('[data-form=settings]'))settingsDirty=true;});
app.addEventListener('input',event=>{
  const entry=event.target.closest('[data-form=join]');if(entry){if(event.target.name==='name')event.target.dataset.edited='true';else if(['code','number'].includes(event.target.name))restoreEntryName(entry);}
  const field=event.target.closest('[data-observation-field]');if(field&&active(2)&&!submitted[2]){drafts[2][currentObject]={...(drafts[2][currentObject]||{}),[field.dataset.observationField]:field.value};changed(2);}
  if(event.target.closest('[data-form=settings]'))settingsDirty=true;
});
app.addEventListener('toggle',event=>{if(event.target.dataset.details==='settings')settingsOpen=event.target.open;if(event.target.dataset.details==='participants')participantsOpen=event.target.open;if(event.target.dataset.details==='responses')responsesOpen=event.target.open;if(event.target.dataset.details==='manage')manageOpen=event.target.open;},true);
app.addEventListener('dragstart',event=>{const chip=event.target.closest('[data-country-chip]');if(chip&&!submitted[1]){event.dataTransfer.setData('text/plain',chip.dataset.countryChip);event.dataTransfer.effectAllowed='copy';}});
app.addEventListener('dragover',event=>{const drop=event.target.closest('[data-country-drop]');if(drop&&active(1)&&!submitted[1]){event.preventDefault();event.dataTransfer.dropEffect='copy';drop.classList.add('drop-over');}});
app.addEventListener('dragleave',event=>{event.target.closest('[data-country-drop]')?.classList.remove('drop-over');});
app.addEventListener('drop',event=>{const drop=event.target.closest('[data-country-drop]');if(!drop)return;event.preventDefault();drop.classList.remove('drop-over');const value=event.dataTransfer.getData('text/plain');if(COUNTRY_CHOICES.some(c=>c.id===value))setCountry(drop.dataset.countryDrop,value);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&session)poll();else if(!teacherMode&&room&&dirty[room.activity])queueSave();});
window.addEventListener('online',()=>{if(session)poll();});
window.addEventListener('pageshow',event=>{
  if(!teacherMode){
    if(event.persisted){resetRoom();renderWelcome();}
    // Chrome can restore form values after rendering a reopened tab. Ask for identity again.
    if(viewKey==='welcome')app.querySelector('[data-form=join]')?.reset();
  }else if(event.persisted&&session){render();poll();}
});
const clock=setInterval(()=>{
  if(!room)return;updateTimer();
  if(!teacherMode&&active(room.activity)&&[1,2].includes(room.activity)&&dirty[room.activity]&&remaining()<=2&&!saving)queueSave();
  if(timeExpired()){render();heartbeatGame();}
  if(!teacherMode&&lastGameActive&&Date.now()-lastSuccessfulPoll>14000)heartbeatGame();
},250);
window.addEventListener('pagehide',event=>{if(event.persisted)return;disposed=true;clearTimeout(pollTimer);clearTimeout(saveTimer);clearInterval(clock);closeCompletionDialog();disposeViewers();disposeTeacherBoard();});

async function boot(){
  document.title=observerMode?`참관 · ${TITLE}`:teacherMode?`교사용 · ${TITLE}`:TITLE;
  const queryCode=(new URLSearchParams(location.search).get('code')||'').toUpperCase();
  if(session&&queryCode&&session.code!==queryCode&&session.joinCode!==queryCode&&!teacherMode){session=null;clearActiveStudentSession();}
  if(teacherMode&&!observerMode){
    const pending=stored(PENDING_CLASSROOM_KEY);
    if(pending&&pending.previousCode===(session?.code||null)){try{await createTeacherClassroom();return;}catch(error){toast(error.message);}}
  }
  if(!session){renderWelcome();return;}
  app.innerHTML='<section class="waiting"><div class="waiting-inner"><div class="waiting-status"><i></i>우리 반 수업에 다시 연결하고 있어요.</div></div></section>';
  try{
    let payload=await api(observerMode?'observe':teacherMode?'teacher':'state');
    if(teacherMode&&!observerMode&&!payload.state?.joinCode){
      try{await api('control',{method:'POST',body:{command:'claim-join-code'}});payload=await api('teacher');}
      catch(error){toast(error.message);}
    }
    receive(payload,{initial:true});schedulePoll();
  }
  catch(error){
    if(error.status===403||error.status===404){if(observerMode)store(SESSION_KEY,null);if(!teacherMode)clearActiveStudentSession();session=null;room=null;renderWelcome(error.message);return;}
    // Keep the saved key: rejoining or opening a new class here would lock the student out or lose the teacher's class.
    viewKey='';app.innerHTML=`<section class="waiting"><div class="waiting-inner"><div class="waiting-status"><i></i>${esc(error.message||'연결을 확인하고 다시 시도해 주세요.')}</div><button class="button" type="button" data-action="retry-boot">다시 연결</button></div></section>`;
  }
}
boot();
