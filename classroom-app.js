import {COMPARISON_ARTIFACTS, OBSERVATION_ARTIFACTS, COUNTRY_CHOICES, BEAUTY_ARTIFACT} from './lesson-artifacts.js';
import {mountLessonViewer} from './lesson-viewer.js';
import {extractClassroomCode, canUseClassroomAction, CLASSROOM_JOIN_CODE} from './classroom-access.js';
import {loadStudentEntryState, rememberStudentEntry, findStudentRejoin, clearActiveStudentSession} from './classroom-entry.js';
import {mountWordCloud} from './lesson-cloud.js';
import {mountCountryNameplates} from './country-nameplates.js';
import {GAME_DATA_TTL_MS, pruneGameSaves} from './game-retention.js';

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
const DEFAULT_SETTINGS={durations:{1:90,2:240,3:300},beautyDuration:90,submitButton:false,autoPause:true};
const BEAUTY_NAME='고려청자의 아름다움 찾기';
const ANSWER_KEYS=[1,2,'beauty'];
const countryName=id=>COUNTRY_CHOICES.find(c=>c.id===id)?.label||id;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const copy=value=>JSON.parse(JSON.stringify(value));
function stored(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
function store(key,value){try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,JSON.stringify(value));}catch{}}
// An observer opens /observe?code=XXXXXX#key=… ; the key stays in the fragment so it is never sent to the server in the URL.
function observerSession(){const code=extractClassroomCode(new URLSearchParams(location.search).get('code')||''),key=new URLSearchParams(location.hash.slice(1)).get('key')||'';if(code&&/^[A-Za-z0-9_-]{30,100}$/.test(key)){const value={code,observerToken:key};store(SESSION_KEY,value);return value;}return stored(SESSION_KEY);}
let session=observerMode?observerSession():teacherMode?stored(SESSION_KEY):loadStudentEntryState(),room=null,teacherData=null,student=null,answers={},offset=0,offsetSamples=[];
let currentObject='1',teacherActivity=1,teacherObject='1',teacherA1View='comparison',selectedCountry=null,cloudKind='name';
let teacherResultViews={1:'responses',2:'responses'},exhibitObjects={1:'1',2:'1'},completionDialog=null;
let worksSort=observerMode?'score':'number',workDialog=null;
let observerInviteDialog=null,observerInviteRequest=null,observerInviteVerified=null,observerInviteModule;
let drafts={1:{},2:{},beauty:{}},revisions={1:0,2:0,beauty:0},dirty={1:false,2:false,beauty:false},draftChanges={1:0,2:0,beauty:0},submitted={1:false,2:false,beauty:false};
let viewKey='',teacherSignature='',pollTimer=null,pollRunning=false,pollFailures=0,connectionError='',lastSuccessfulPoll=0;
let saveTimer=null,saving=false,saveAgain=false,finalAgain=false,saveState='ready',saveMessage='',controlBusy=false;
let settingsDirty=false,settingsOpen=false,participantsOpen=false,responsesOpen=false,manageOpen=false,toastTimer=null;
let disposed=false,frameRunId='',lastGameActive=null;
const viewers=[],workImages=new Map(),workDesigns=new Map(),workImagePending=new Set(),uploadedWorks=new Set(),pendingWorks=new Map(),terminalWorks=new Map();
let studentWorkViewerModule;
let teacherViewer=null,cloudView=null;
const teacherComparisonViewers=new Map();
const publicJoinCode=()=>room?.joinCode||session?.code||CLASSROOM_JOIN_CODE;
const actionAllowed=action=>canUseClassroomAction(action,{teacherMode:teacherMode&&!observerMode,observerMode,teacherToken:session?.teacherToken});

const logo=`<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M15 5h10v7c0 5 9 8 8 15-1 8-6 9-13 9S8 35 7 27c-1-7 8-10 8-15Z" fill="#88ae8d" stroke="currentColor" stroke-width="1.8"/><path d="M11 25c5-6 13-6 18 0M13 30c5-4 9-4 14 0" fill="none" stroke="#e7edcf" stroke-width="1.7"/></svg>`;
const timerIcon=`<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="18" r="11"/><path d="M16 10v8l5 3M12 3h8M16 3v4M24 7l3 3"/></svg>`;
const laptopIcon=`<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M20 30h60v39H20z"/><path d="M14 74h72l-6 7H20zM38 49l9 8 16-18"/></svg>`;
const closedLaptopIcon='<img class="closed-laptop-image" src="/assets/classroom-ui/close-chromebook.webp" width="512" height="512" alt="" aria-hidden="true" decoding="async">';

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
function observerInviteIdentity(){return actionAllowed('observer-link')&&room&&session?.code?{code:session.code,teacherToken:session.teacherToken}:null;}
function sameObserverInviteSession(identity){const saved=stored(SESSION_KEY);return identity&&!disposed&&actionAllowed('observer-link')&&room&&session?.code===identity.code&&session?.teacherToken===identity.teacherToken&&saved?.code===identity.code&&saved?.teacherToken===identity.teacherToken;}
function cancelObserverInviteRequest(){const request=observerInviteRequest;observerInviteRequest=null;request?.controller.abort();}
async function observerInviteUrl(identity){
  if(!sameObserverInviteSession(identity))return null;
  // Verify once per page/session so older cached links migrate to the server's stable invitation.
  let key=observerInviteVerified?.code===identity.code&&observerInviteVerified?.teacherToken===identity.teacherToken?observerInviteVerified.key:null;
  if(!/^[A-Za-z0-9_-]{30,100}$/.test(key||'')){
    let request=observerInviteRequest;
    if(!request||request.identity.code!==identity.code||request.identity.teacherToken!==identity.teacherToken){
      cancelObserverInviteRequest();const controller=new AbortController();request={identity,controller};
      const timeout=setTimeout(()=>controller.abort(),15000);
      request.promise=api('control',{method:'POST',body:{command:'observer-link'},signal:controller.signal}).finally(()=>{clearTimeout(timeout);if(observerInviteRequest===request)observerInviteRequest=null;});
      observerInviteRequest=request;
    }
    const payload=await request.promise;
    if(!sameObserverInviteSession(identity)||request.controller.signal.aborted)return null;
    key=payload.observerToken;
    if(!/^[A-Za-z0-9_-]{30,100}$/.test(key||''))throw new Error('참관 주소를 만들지 못했어요. 다시 시도해 주세요.');
    observerInviteVerified={...identity,key};session={...session,observerToken:key};store(SESSION_KEY,session);
  }
  const url=new URL('/observe',location.origin);url.searchParams.set('code',identity.code);url.hash=new URLSearchParams({key}).toString();return url.href;
}
function currentObserverInvite(current){return current&&observerInviteDialog===current&&current.dialog.isConnected&&sameObserverInviteSession(current.identity);}
function closeObserverInvite({restoreFocus=true}={}){
  const current=observerInviteDialog;observerInviteDialog=null;cancelObserverInviteRequest();if(!current)return;
  if(current.dialog.open)current.dialog.close();current.dialog.remove();
  const opener=current.opener?.isConnected?current.opener:app.querySelector('[data-action=observer-link]');
  opener?.setAttribute('aria-expanded','false');if(restoreFocus&&sameObserverInviteSession(current.identity))opener?.focus({preventScroll:true});
}
async function copyObserverAddress(current=null){
  const identity=current?.identity||observerInviteIdentity();if(!sameObserverInviteSession(identity)||current&&!currentObserverInvite(current))return;
  try{
    const url=current?.url||await observerInviteUrl(identity);if(!url||!sameObserverInviteSession(identity)||current&&!currentObserverInvite(current))return;
    try{await navigator.clipboard.writeText(url);if(sameObserverInviteSession(identity)&&(!current||currentObserverInvite(current)))toast('참관 주소를 복사했어요.');}
    catch{
      if(!sameObserverInviteSession(identity)||current&&!currentObserverInvite(current))return;
      if(!current){await openObserverInvite({selectUrl:true});return;}
      current.dialog.querySelector('[data-observer-status]').textContent='아래 참관 주소를 길게 눌러 복사해 주세요.';
      const input=current.dialog.querySelector('[data-observer-url]');input.focus();input.select();
    }
  }catch(error){if(sameObserverInviteSession(identity)&&error.name!=='AbortError')toast(error.message);}
}
async function loadObserverInvite(current){
  if(!currentObserverInvite(current)||current.loading)return;current.loading=true;
  const dialog=current.dialog,status=dialog.querySelector('[data-observer-status]'),retry=dialog.querySelector('[data-retry-observer-invite]');
  status.textContent='참관 QR을 준비하고 있어요…';retry.hidden=true;dialog.setAttribute('aria-busy','true');
  try{
    const url=await observerInviteUrl(current.identity);if(!url||!currentObserverInvite(current))return;current.url=url;
    const input=dialog.querySelector('[data-observer-url]');input.value=url;input.disabled=false;dialog.querySelector('[data-copy-observer-invite]').disabled=false;
    observerInviteModule||=import('./observer-invite.js').catch(error=>{observerInviteModule=null;throw error;});
    const module=await observerInviteModule;if(!currentObserverInvite(current))return;
    const images=await module.createObserverInvite({url,title:TITLE,roomLabel:'우리 반 청자 교실'});if(!currentObserverInvite(current))return;
    const image=dialog.querySelector('[data-observer-qr]');image.src=images.qrDataUrl;image.hidden=false;dialog.querySelector('.observer-invite-loading').hidden=true;
    const download=dialog.querySelector('[data-download-observer-qr]');download.href=images.posterDataUrl||images.qrDataUrl;download.hidden=false;
    dialog.querySelector('[data-print-observer-invite]').disabled=false;status.textContent='휴대폰 카메라로 QR 코드를 찍어 주세요.';
    if(current.selectUrl){input.focus();input.select();status.textContent='참관 주소를 길게 눌러 복사해 주세요.';current.selectUrl=false;}
  }catch(error){if(currentObserverInvite(current)){status.textContent=error.name==='AbortError'?'연결이 지연되고 있어요. 다시 시도해 주세요.':'참관 QR을 준비하지 못했어요. 다시 시도하거나 참관 주소를 복사해 주세요.';retry.hidden=false;}}
  finally{current.loading=false;if(currentObserverInvite(current))dialog.setAttribute('aria-busy','false');}
}
async function openObserverInvite({selectUrl=false}={}){
  const identity=observerInviteIdentity();if(!identity)return;
  if(currentObserverInvite(observerInviteDialog)){observerInviteDialog.dialog.querySelector('[data-close-observer-invite]').focus();return;}
  closeObserverInvite({restoreFocus:false});
  const dialog=document.createElement('dialog');dialog.id='observer-invite-dialog';dialog.className='observer-invite';dialog.setAttribute('aria-labelledby','observer-invite-title');
  dialog.innerHTML=`<header class="observer-invite-header"><div><span class="activity-label">함께 보는 우리 반 수업</span><h2 id="observer-invite-title">공개수업 참관</h2></div><button class="button secondary small" type="button" data-close-observer-invite aria-label="참관 QR 닫기">닫기 ×</button></header><div class="observer-invite-body"><section class="observer-invite-qr-panel" aria-label="참관 화면 QR 코드"><div class="observer-invite-qr"><p class="observer-invite-loading">QR을 불러오고 있어요…</p><img data-observer-qr hidden width="360" height="360" alt="휴대폰 카메라로 찍으면 익명 수업 참관 화면이 열리는 QR 코드"></div><p class="observer-invite-status" data-observer-status role="status"></p><button class="button secondary" type="button" data-retry-observer-invite hidden>다시 시도</button></section><section class="observer-invite-details"><h3>${TITLE}</h3><p>휴대폰으로 학생들의 생각과 완성한 청자를 함께 살펴보세요.</p><div class="observer-invite-features"><span>익명 답변</span><span>학생 작품</span></div><p class="observer-invite-privacy">학생 이름은 표시되지 않아요.<br>수업 진행은 선생님이 제어해요.</p><label class="observer-invite-address">참관 주소<input data-observer-url type="text" readonly disabled autocomplete="off" spellcheck="false" aria-label="참관 주소"></label><button class="button" type="button" data-copy-observer-invite disabled>참관 주소 복사</button></section></div><footer class="observer-invite-footer"><a class="button secondary" data-download-observer-qr download="공개수업-참관-QR.png" hidden>QR 안내문 저장</a><button class="button secondary" type="button" data-print-observer-invite disabled>안내문 인쇄</button></footer>`;
  const current={dialog,identity,opener:document.activeElement,selectUrl,url:null,loading:false};observerInviteDialog=current;
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeObserverInvite();});
  dialog.addEventListener('close',()=>{if(observerInviteDialog===current)closeObserverInvite();});
  dialog.addEventListener('click',event=>{
    if(event.target.closest('[data-close-observer-invite]'))closeObserverInvite();
    else if(event.target.closest('[data-copy-observer-invite]'))void copyObserverAddress(current);
    else if(event.target.closest('[data-retry-observer-invite]'))void loadObserverInvite(current);
    else if(event.target.closest('[data-print-observer-invite]')&&currentObserverInvite(current))window.print();
    else if(event.target===dialog){const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)closeObserverInvite();}
  });
  document.body.append(dialog);dialog.showModal();app.querySelector('[data-action=observer-link]')?.setAttribute('aria-expanded','true');dialog.querySelector('[data-close-observer-invite]').focus();await loadObserverInvite(current);
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
function beautyStage(){return room?.activity===1&&room.activity1Stage==='beauty';}
function answerActivity(){return beautyStage()?'beauty':room?.activity;}
function answerRun(activity,state=room){return activity==='beauty'?state?.runs?.beauty:state?.runs?.[activity]||(state?.activity===activity?state.runId:null);}
function recordDraft(activity,record){return activity==='beauty'?{text:record?.text||''}:copy(record?.answers||{});}
function expectedProgress(activity){return activity==='beauty'?1:activity===1?3:5;}
function answerLocked(activity){return submitted[activity]||(activity==='beauty'?!beautyStage()||!active(1):!active(activity)||activity===1&&beautyStage());}
function teacherBeautyView(){return teacherActivity===1&&teacherA1View==='beauty';}
function teacherViewActive(){return room.activity===teacherActivity&&(teacherActivity!==1||(room.activity1Stage||'comparison')===teacherA1View);}
function teacherViewDuration(){return teacherBeautyView()?room.settings?.beautyDuration||90:room.settings?.durations?.[teacherActivity]||0;}
function expiryMarkup(){return timeExpired()?'<div class="submitted-banner" data-testid="time-finished">시간이 끝났어요. 선생님이 마무리할 때까지 기다려 주세요.</div>':'';}
// Activity 3 has no time limit: it runs until the teacher ends it, so its clock shows elapsed time instead.
const untimed=activity=>activity===3;
function elapsed(){return room?.startedAt&&room.status==='active'?Math.max(0,Math.floor((now()-room.startedAt)/1000)):0;}
function remaining(){return room?.endsAt?Math.max(0,Math.ceil((room.endsAt-now())/1000)):(teacherMode?teacherViewDuration():beautyStage()?room.settings?.beautyDuration||90:room?.settings?.durations?.[room?.activity]||0);}
function formatTime(seconds){return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
function timerMarkup(activity=teacherMode?teacherActivity:room?.activity){const open=untimed(activity);return `<div class="timer" data-testid="lesson-timer" aria-label="${open?'활동 진행 시간':'남은 활동 시간'}">${timerIcon}<div><span>${open?'진행 시간':'남은 시간'}</span><strong>${open?formatTime(elapsed()):formatTime(remaining())}</strong></div></div>`;}
function stages(activity=room?.activity||0){
  return `<div class="current-activity" aria-label="현재 수업 활동"><span>${activity?`활동 ${activity} / 3`:'수업 준비'}</span><strong>${activity?(beautyStage()?BEAUTY_NAME:STAGE_NAMES[activity]):'선생님의 시작을 기다려요'}</strong><small>선생님이 진행해요</small></div>`;
}
// Kept in the header so it stays reachable on 1024×600, where the side panel has to scroll.
function manageMenu(){const status=room?effectiveStatus():'waiting';return `<details class="manage-menu" data-details="manage" ${manageOpen?'open':''}><summary class="button secondary small">수업 관리 <span aria-hidden="true">▾</span></summary><div class="manage-menu-list"><button class="button secondary small" data-action="copy-observer">참관 주소 복사</button>${room&&!room.joinCode?'<button class="button secondary small" data-action="claim-join-code">탑텐반 코드 연결</button>':''}<button class="button secondary small" data-action="end" ${status==='ended'||controlBusy?'disabled':''}>수업 종료</button><button class="button quiet small" data-action="new-room">새 수업</button></div></details>`;}
function header(){
  const studentGame=!teacherMode&&active(3);
  return `<header class="lesson-header ${teacherMode?'teacher-header':''}"><div class="brand"><span class="brand-mark">${logo}</span><div><div class="brand-title">우리 반 청자 교실</div><small>${observerMode?'참관 화면 · 읽기 전용':teacherMode?'선생님 진행 화면':'관찰하고 · 생각하고 · 만들어요'}</small></div></div>${teacherMode?`${observerMode?'<div class="observer-badge">참관 중 · 학생 이름은 보이지 않아요</div>':`<div class="teacher-room-code"><span>수업 코드</span><strong>${esc(publicJoinCode())}</strong><div class="code-actions"><button class="button secondary small" data-action="copy-code">수업 코드 복사</button><button class="button quiet small" data-action="copy-invite">참여 주소 복사</button></div></div>`}<div class="teacher-tools"><span class="pill" data-connection>연결됨</span><button class="button quiet small" data-action="fullscreen">전체 화면</button>${observerMode?'':`<button class="button secondary small observer-invite-open" type="button" data-action="observer-link" aria-haspopup="dialog" aria-controls="observer-invite-dialog" aria-expanded="${Boolean(observerInviteDialog)}">참관 QR</button>${manageMenu()}`}</div>`:`${studentGame?'':stages()}<div class="student-badge"><strong>${esc(student?.number||'')}번 ${esc(student?.name||'')}</strong><span class="pill" data-connection>연결됨</span></div>${studentGame?timerMarkup():''}`}</header><div class="connection-banner" data-connection-banner hidden><span></span><button class="button secondary small" data-action="retry-connection">다시 연결</button></div>`;
}
function updateConnection(){
  document.querySelectorAll('[data-connection]').forEach(el=>{el.textContent=connectionError?'다시 연결 중':'연결됨';el.classList.toggle('offline',Boolean(connectionError));});
  const banner=document.querySelector('[data-connection-banner]');if(banner){banner.hidden=!connectionError;banner.querySelector('span').textContent=connectionError?`연결이 잠시 끊겼어요. ${connectionError}`:'';}
}
function disposeViewers(){for(const v of viewers.splice(0)){try{v.dispose();}catch{}}}
function mountViewers(){document.querySelectorAll('[data-viewer]').forEach(el=>{const beauty=el.dataset.collection==='beauty',artifacts=beauty?[BEAUTY_ARTIFACT]:el.dataset.collection==='comparison'?COMPARISON_ARTIFACTS:OBSERVATION_ARTIFACTS,artifact=artifacts.find(a=>a.id===el.dataset.viewer);if(artifact)viewers.push(mountLessonViewer(el,artifact,beauty?beautyViewerOptions():{}));});}
function draftStorageKey(){return session?`celadon-classroom-drafts-v1:${session.code}:${session.participantId}`:'';}
function persistDrafts(){if(session&&!teacherMode)store(draftStorageKey(),{drafts,revisions,dirty,draftChanges,runs:room?.runs,runId:room?.runId});}
function initialDrafts(){
  const saved=stored(draftStorageKey());
  for(const n of ANSWER_KEYS){
    const record=answers[n],run=answerRun(n),savedRun=n==='beauty'?saved?.runs?.beauty:saved?.runs?.[n]||(room?.activity===n?saved?.runId:null);
    if(saved?.dirty?.[n]&&savedRun===run&&!record?.submitted){drafts[n]=saved.drafts[n]||{};revisions[n]=Math.max(saved.revisions[n]||0,record?.clientRevision||0);dirty[n]=true;draftChanges[n]=saved.draftChanges?.[n]||0;}
    else{drafts[n]=run&&record?.runId===run?recordDraft(n,record):{};revisions[n]=run&&record?.runId===run?record.clientRevision||0:0;dirty[n]=false;}
    submitted[n]=Boolean(run&&record?.runId===run&&record.submitted);
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
    teacherData={...(teacherData||{}),...payload};pruneTeacherWorks();if(initial)teacherActivity=room.activity||1;else if(observerMode&&room.activity&&room.activity!==previous?.activity)teacherActivity=room.activity;
    if(initial||room.activity1Stage!==previous?.activity1Stage)teacherA1View=room.activity1Stage==='beauty'?'beauty':'comparison';
    for(const activity of [1,2]){
      if(room.revealed?.[activity]&&!previous?.revealed?.[activity]){teacherResultViews[activity]='exhibit';exhibitObjects[activity]='1';}
      else if(!room.revealed?.[activity])teacherResultViews[activity]='responses';
    }
  }
  else{
    if(previous?.runs?.[3]&&room?.runs?.[3]!==previous.runs[3]){uploadedWorks.clear();clearPendingWorks();terminalWorks.clear();}
    student=payload.student||student;
    if(payload.answers){const merged={...answers};for(const n of [1,2]){const incoming=payload.answers[n],current=answers[n],run=room?.runs?.[n];if(incoming&&(incoming.runId!==current?.runId?incoming.runId===run:incoming.clientRevision>=current.clientRevision))merged[n]=incoming;}answers=merged;}
    if(payload.beautyAnswer){const incoming=payload.beautyAnswer,current=answers.beauty,run=answerRun('beauty');if(incoming.runId!==current?.runId?incoming.runId===run||!run:incoming.clientRevision>=current.clientRevision)answers={...answers,beauty:incoming};}
    // An original local game may upgrade an unexpired photo-only submission once.
    // Successful uploads still stay in this set; polling never requeues them.
    for(const work of payload.completedWorks||[])if(work.designVersion===1)uploadedWorks.add(work.id);
    if(initial)initialDrafts();
    else for(const n of ANSWER_KEYS){
      const oldRun=answerRun(n,previous),run=answerRun(n),record=answers[n];
      if(oldRun!==run){drafts[n]=run&&record?.runId===run?recordDraft(n,record):{};revisions[n]=run&&record?.runId===run?record.clientRevision||0:0;dirty[n]=false;draftChanges[n]=0;submitted[n]=false;}
      if(run&&record?.runId===run){submitted[n]=Boolean(record.submitted);if(record.submitted){dirty[n]=false;drafts[n]=recordDraft(n,record);revisions[n]=Math.max(revisions[n],record.clientRevision||0);}if(!dirty[n]&&!saving&&(record.clientRevision||0)>=revisions[n]){drafts[n]=recordDraft(n,record);revisions[n]=record.clientRevision||0;}}
    }
    persistDrafts();
  }
  render();updateConnection();heartbeatGame();return true;
}
function schedulePoll(delay=teacherMode?4000:3000){clearTimeout(pollTimer);if(session&&!disposed)pollTimer=setTimeout(poll,delay);}
async function poll(){
  if(pollRunning||!session)return;schedulePoll();pollRunning=true;const requestSession=session;
  try{const payload=await api(observerMode?'observe':teacherMode?'teacher':'state');if(session!==requestSession)return;receive(payload);if(!teacherMode&&active(room.activity)&&dirty[answerActivity()]&&!saving)queueSave();retryWorks();}
  catch(error){if(session!==requestSession)return;
    if(error.status===403||error.status===404)closeObserverInvite({restoreFocus:false});
    if((!teacherMode||observerMode)&&(error.status===403||error.status===404)){const message=observerMode||error.status===404?error.message:'선생님이 입장 정보를 정리했어요. 번호와 이름으로 다시 입장해 주세요.';resetRoom();renderWelcome(message);return;}
    pollFailures++;connectionError=error.name==='AbortError'?'응답을 기다리고 있어요.':error.message;updateConnection();}
  finally{pollRunning=false;schedulePoll(Math.min(12000,(teacherMode?4000:3000)*Math.max(1,pollFailures)));}
}
function welcomeArtwork(){return `<div class="welcome-art" aria-hidden="true"><img src="/assets/lesson/welcome-celadon.png" alt="" width="1774" height="887" fetchpriority="high"></div>`;}
function renderWelcome(message=''){
  observerInviteVerified=null;
  closeObserverInvite({restoreFocus:false});
  closeCompletionDialog();disposeViewers();disposeTeacherBoard();viewKey='welcome';const identity={},queryCode=extractClassroomCode(new URLSearchParams(location.search).get('code')||'');
  app.innerHTML=`<section class="welcome"><div class="welcome-copy"><span class="eyebrow">우리 반 청자 교실 · 고려의 문화</span><h1><em>고려청자의 우수성</em>과<br> 다양한 쓰임 알아보기</h1><p>빛깔과 모양을 살펴보고,<br>청자에 담긴 사람들의 생활을 찾아봐요.</p>${welcomeArtwork()}</div><div><section class="panel welcome-form"><h2>${observerMode?'수업 참관':teacherMode?'함께 시작하는 청자 수업':'수업에 들어가요'}</h2><p class="muted">${observerMode?'선생님이 보낸 참관 주소로 열면 수업 진행과 학생들의 생각을 함께 볼 수 있어요. 학생 이름은 보이지 않아요.':teacherMode?'우리 반 수업 코드는 ‘탑텐반’입니다.':'번호와 이름은 세 활동 동안 계속 사용해요.'}</p>${observerMode?'':teacherMode?`<form data-form="create"><button class="button" type="submit">새 수업 열기 <span aria-hidden="true">→</span></button></form><p class="welcome-note">활동 1 · 세 나라 비교 1분 30초<br>아름다움 찾기 1분 30초<br>활동 2 · 4분<br>활동 3 · 선생님이 마칠 때까지<br><br>선생님이 활동을 시작하고 마칠 때마다<br>학생 화면도 함께 바뀝니다.</p><a class="teacher-link" href="/lesson">학생 참여 화면 보기 →</a>`:`<form data-form="join"><label>수업 코드<input class="code-input" name="code" autocomplete="off" spellcheck="false" minlength="3" maxlength="6" pattern="(탑텐반|[A-Za-z2-9]{6})" required value="${esc(queryCode)}" placeholder="탑텐반"></label><div class="identity-fields"><label>번호<input name="number" type="number" autocomplete="off" min="1" max="99" inputmode="numeric" required value="${esc(identity.number||'')}" placeholder="번호"></label><label>이름<input name="name" autocomplete="off" maxlength="20" required value="${esc(identity.name||'')}" placeholder="이름을 적어 주세요"></label></div><button class="button" type="submit">수업 들어가기 <span aria-hidden="true">→</span></button></form><p class="welcome-note">입력한 번호와 이름, 수업 답변은 선생님께 전달돼요.</p>`}<p class="error-message" data-form-error>${esc(message)}</p></section></div></section>`;
}
function waitingMarkup(){
  const status=effectiveStatus(),initial=!room.activity||status==='waiting';
  const title=initial?'선생님이 수업을 시작하면<br>함께 관찰해요.':'크롬북을 닫고<br>선생님을 보세요';
  const detail=initial?`${esc(student?.name)} 학생, 반가워요.<br>잠시 선생님의 안내를 기다려 주세요.`:status==='ended'?'오늘 만든 청자와 친구들의 생각을<br>함께 나누어 보아요.':'관찰한 점과 떠오른 생각을<br>친구들과 함께 이야기해 보아요.';
  return `<section class="waiting" data-testid="${initial?'waiting-screen':'lock-screen'}"><div class="waiting-inner"><div class="waiting-illustration${initial?'':' is-closed-chromebook'}">${initial?laptopIcon:closedLaptopIcon}</div><h1>${title}</h1><p>${detail}</p><div class="waiting-status"><i></i>${status==='ended'?'수업을 마쳤어요':initial?'수업 시작을 기다리고 있어요':'다음 활동은 선생님이 열어 주세요'}</div></div></section>`;
}
function progress(activity){if(activity==='beauty')return drafts.beauty.text?.trim()?1:0;if(activity===1)return COMPARISON_ARTIFACTS.filter(a=>drafts[1][a.id]).length;return OBSERVATION_ARTIFACTS.filter(a=>drafts[2][a.id]?.name?.trim()&&drafts[2][a.id]?.use?.trim()).length;}
function saveMarkup(){return `<span class="save-status" data-save-status data-status="${saveState}">${esc(saveMessage||'생각을 적으면 자동으로 저장돼요.')}</span>`;}
function submitMarkup(activity){
  return `<button class="button" data-action="submit-answers" data-activity-done="${activity}" ${activity==='beauty'?'data-beauty-done':activity===1?'data-comparison-done':'data-observation-done'} ${answerLocked(activity)||progress(activity)<expectedProgress(activity)||saving?'disabled':''}>${submitted[activity]?'다했어요 ✓':saving?'저장 중…':'다했어요'}</button>`;
}
function closeCompletionDialog(){if(!completionDialog)return;completionDialog.close();completionDialog.remove();completionDialog=null;}
function syncCompletionDialog(){
  if(teacherMode||![1,2].includes(room?.activity)||effectiveStatus()!=='active'||!submitted[answerActivity()]){closeCompletionDialog();return;}
  if(completionDialog?.isConnected)return;
  const dialog=document.createElement('dialog');dialog.className='completion-dialog';dialog.tabIndex=-1;
  dialog.setAttribute('aria-labelledby','completion-title');dialog.setAttribute('aria-describedby','completion-message');
  dialog.innerHTML='<div class="completion-icon" aria-hidden="true">✓</div><h2 id="completion-title">다했어요!</h2><p id="completion-message">다른 친구들이 다 할 때까지<br>기다려 주세요.</p><small>선생님이 다음 활동을 시작하면 화면이 바뀌어요.</small>';
  dialog.addEventListener('cancel',event=>event.preventDefault());
  (document.fullscreenElement||document.body).append(dialog);completionDialog=dialog;dialog.showModal();dialog.focus();
}
function comparisonMarkup(){return `<div class="lesson-heading"><div><span class="activity-label">활동 1 · ${ACTIVITY_NAMES[1]}</span><h1>어느 나라에서 만든 도자기일까요?</h1><p>세 도자기의 빛깔과 모양을 비교하고, 나라 이름표를 붙여 보세요.</p></div>${timerMarkup()}</div>${expiryMarkup()}${submitted[1]?'<div class="submitted-banner">다했어요! 친구들을 기다리고 있어요.</div>':''}<div class="compare-grid">${COMPARISON_ARTIFACTS.map(a=>`<article class="panel object-card" data-country-drop="${esc(a.id)}"><div class="object-title"><h2>${esc(a.label)}</h2><span class="object-number">${esc(a.id)}</span></div><div class="viewer-host" data-viewer="${esc(a.id)}" data-collection="comparison"></div><div class="country-drop"><label class="visually-hidden" for="country-${esc(a.id)}">${esc(a.label)}의 나라</label><select id="country-${esc(a.id)}" class="country-select ${drafts[1][a.id]?'selected':''}" data-country-for="${esc(a.id)}" ${answerLocked(1)?'disabled':''}><option value="">나라 이름표 놓기</option>${COUNTRY_CHOICES.map(c=>`<option value="${c.id}" ${drafts[1][a.id]===c.id?'selected':''}>${esc(c.label)}</option>`).join('')}</select></div></article>`).join('')}</div><div class="country-tray"><span>이름표를 끌어 놓거나 골라 주세요</span>${COUNTRY_CHOICES.map(c=>`<button class="country-chip" draggable="false" data-country-chip="${c.id}" aria-pressed="${selectedCountry===c.id}" ${answerLocked(1)?'disabled':''}>${esc(c.label)}</button>`).join('')}</div><div class="answer-footer">${saveMarkup()}${submitMarkup(1)}</div>`;}
function observationMarkup(){
  const artifact=OBSERVATION_ARTIFACTS.find(a=>a.id===currentObject)||OBSERVATION_ARTIFACTS[0],answer=drafts[2][artifact.id]||{},nextLabel=artifact.id===OBSERVATION_ARTIFACTS.at(-1).id?'처음 작품':'다음 작품';
  return `<div class="lesson-heading"><div><span class="activity-label">활동 2 · ${ACTIVITY_NAMES[2]}</span><h1>모양 속에 어떤 쓰임이 숨어 있을까요?</h1><p>다섯 점을 돌려 보고, 쓰임과 이름을 자유롭게 짐작해 보세요.</p></div>${timerMarkup()}</div>${expiryMarkup()}${submitted[2]?'<div class="submitted-banner">다했어요! 친구들을 기다리고 있어요.</div>':''}<div class="observe-layout"><section class="panel observe-stage"><div class="object-title"><h2>${esc(artifact.label)}</h2><span class="object-number">${esc(artifact.id)}</span></div><div class="viewer-host" data-viewer="${esc(artifact.id)}" data-collection="observation"></div><div class="observe-navigation"><button class="nav-arrow" data-action="previous-object" aria-label="이전 청자">←</button><nav class="object-dots" aria-label="활동 2에서 관찰할 다섯 청자">${OBSERVATION_ARTIFACTS.map(a=>`<button class="object-dot ${a.id===artifact.id?'active':''} ${drafts[2][a.id]?.name?.trim()&&drafts[2][a.id]?.use?.trim()?'answered':''}" data-action="select-object" data-id="${a.id}" aria-label="청자 ${a.id} 관찰하기" title="같은 활동 안에서 청자 ${a.id} 관찰" ${a.id===artifact.id?'aria-current="true"':''}>${a.id}</button>`).join('')}</nav></div></section><section class="panel observation-writing"><div><div class="writing-heading"><span>✧</span><h2>내 생각을 적어 주세요</h2></div><p>청자를 돌려 보고, 떠오르는 쓰임과 이름을 적어요.</p></div><label for="guess-use">어디에 쓰던 물건일까요?<textarea id="guess-use" data-observation-field="use" maxlength="180" placeholder="이런 곳에 썼을 것 같아요." ${answerLocked(2)?'disabled':''}>${esc(answer.use||'')}</textarea></label><label for="guess-name">어떤 이름을 붙이면 좋을까요?<input id="guess-name" class="write-name" data-observation-field="name" maxlength="60" placeholder="내가 짐작한 이름" value="${esc(answer.name||'')}" ${answerLocked(2)?'disabled':''}></label><p class="field-help">쓴 생각은 이름 없이 선생님 화면에 함께 모여요.</p><div class="answer-footer">${saveMarkup()}<div class="observation-actions"><span class="observed-progress" data-progress>${progress(2)} / 5 관찰했어요</span><button type="button" class="button secondary observation-next" data-action="next-object">${nextLabel} <span aria-hidden="true">→</span></button>${submitMarkup(2)}</div></div></section></div>`;
}
function beautyViewerOptions(){return {getExpandedInfo:()=>({name:BEAUTY_ARTIFACT.label,note:'빛깔은 어떤가요? 무늬는 어떤가요? 청자를 돌려 보며 아름다운 점을 찾아보세요.',sourceUrl:BEAUTY_ARTIFACT.sourceUrl})};}
function beautyMarkup(){
  return `<div class="lesson-heading"><div><span class="activity-label">활동 1 · ${BEAUTY_NAME}</span><h1>고려청자에서는 어떤 아름다움을 찾을 수 있나요?</h1><p>청자를 천천히 돌려 보고, 내 눈에 들어온 아름다움을 적어 보세요.</p></div>${timerMarkup()}</div>${expiryMarkup()}<div class="beauty-layout"><section class="panel beauty-object"><span class="activity-label">함께 살펴볼 청자</span><h2>${esc(BEAUTY_ARTIFACT.label)}</h2><div class="viewer-host" data-viewer="${esc(BEAUTY_ARTIFACT.id)}" data-collection="beauty"></div></section><section class="panel beauty-writing"><div class="writing-heading"><span>✧</span><h2>내가 찾은 아름다움</h2></div><div class="beauty-prompts"><span>빛깔은 어떤가요?</span><span>무늬는 어떤가요?</span></div><label for="beauty-answer">어떤 점이 아름답다고 느꼈나요?<textarea id="beauty-answer" data-beauty-answer maxlength="300" rows="6" placeholder="관찰하며 찾은 아름다움을 자유롭게 적어 주세요." ${answerLocked('beauty')?'disabled':''}>${esc(drafts.beauty.text||'')}</textarea></label><p class="field-help">쓴 생각은 이름 없이 선생님 화면에 함께 모여요.</p><div class="answer-footer">${saveMarkup()}${submitMarkup('beauty')}</div></section></div>`;
}
function gameMarkup(){return `<div class="game-viewport" data-game-viewport><iframe class="game-frame" title="좋은 청자 위대한 청자 만들기 게임" src="/game?classroom=1&room=${encodeURIComponent(session.code)}&student=${encodeURIComponent(session.participantId)}&run=${encodeURIComponent(room.runId)}" allow="fullscreen" data-testid="classroom-game"></iframe></div><p class="game-save-status" data-game-status>완성한 작품은 선생님께 자동으로 전달돼요.</p>`;}
// Phones use the game's touch layout at their real size. Keep Chromebook fitting for the desktop layout.
// Keep this query in sync with mobile-game.css.
const GAME_PHONE_MEDIA=matchMedia('(max-width: 600px), (max-width: 1023px) and (pointer: coarse)');
const GAME_MIN_WIDTH=1024,GAME_MIN_HEIGHT=600;let gameFit=null;
function fitGameFrame(){const box=app.querySelector('[data-game-viewport]'),frame=box?.querySelector('iframe');if(!frame)return;const {width,height}=box.getBoundingClientRect();if(!width||!height)return;if(GAME_PHONE_MEDIA.matches){frame.style.width='100%';frame.style.height='100%';frame.style.transform='';return;}const borderX=frame.offsetWidth-frame.clientWidth,borderY=frame.offsetHeight-frame.clientHeight,scale=Math.min(1,width/(GAME_MIN_WIDTH+borderX),height/(GAME_MIN_HEIGHT+borderY));frame.style.width=`${width/scale}px`;frame.style.height=`${height/scale}px`;frame.style.transform=scale<1?`scale(${scale})`:'';}
GAME_PHONE_MEDIA.addEventListener('change',fitGameFrame);
function watchGameFrame(){gameFit?.disconnect();gameFit=null;const box=app.querySelector('[data-game-viewport]');if(!box)return;fitGameFrame();if('ResizeObserver' in window){gameFit=new ResizeObserver(fitGameFrame);gameFit.observe(box);}}
function renderStudent(){
  const status=effectiveStatus(),key=`student:${room.activity}:${status}:${room.runId}:${room.settings?.submitButton}:${submitted[answerActivity()]}:${room.activity1Stage}:${room.activity===2?currentObject:''}:${Boolean(timeExpired())}`;
  if(key!==viewKey){
    const oldFrame=app.querySelector('iframe');if(oldFrame)oldFrame.contentWindow?.postMessage({type:'celadon:classroom-state',active:false,runId:frameRunId,serverNow:now(),endsAt:room.endsAt},location.origin);
    endCountryDrag();selectCountry(null);disposeViewers();viewKey=key;const game=active(3);
    app.innerHTML=`<div class="lesson-shell ${game?'game-shell':''} ${status==='active'&&beautyStage()?'beauty-shell':''} ${status==='active'&&room.activity===1&&!beautyStage()?'compare-shell':''}">${header()}${status!=='active'||!room.activity?waitingMarkup():room.activity===1?(beautyStage()?beautyMarkup():comparisonMarkup()):room.activity===2?observationMarkup():gameMarkup()}</div>`;
    frameRunId=game?room.runId:'';mountViewers();watchGameFrame();
    if(game){const frame=app.querySelector('iframe');frame.addEventListener('load',()=>{heartbeatGame();frame.contentWindow?.postMessage({type:'celadon:request-completed'},location.origin);});}
  }
  updateSaveStatus();updateTimer();updateConnection();syncCompletionDialog();
}
function cloudMarkup(words,kind){
  const clean=(words||[]).filter(w=>typeof w.text==='string'&&w.text.trim()).slice(0,45),counts=clean.map(w=>Math.max(1,Number(w.count)||1)),max=Math.max(1,...counts),min=Math.min(max,...counts);
  const fontSize=count=>max===min?32:Math.round(18+54*Math.pow((Math.max(1,Number(count)||1)-min)/(max-min),1.4));
  const colors=['#e87854','#21948f','#507fa6','#9c73ad','#759651','#c09a45'];
  return `<div class="word-cloud" data-kind="${kind}" aria-label="${kind==='beauty'?'고려청자의 아름다움':kind==='name'?'예상한 이름':'예상한 쓰임'} 워드클라우드">${clean.length?clean.map((w,i)=>`<span style="font-size:${fontSize(w.count)}px;color:${colors[i%colors.length]}" title="${Number(w.count)||1}명이 쓴 말">${esc(w.text)}</span>`).join(''):'<span class="empty">아직 도착한 생각이 없어요.<br>학생들의 답변이 여기에 모입니다.</span>'}</div>`;
}
function revealedAnswer(activity,id){return teacherData?.reveal?.[activity===1?'comparison':'observations']?.[id];}
function teacherViewerOptions(activity,id){return {getExpandedInfo:()=>room.revealed?.[activity]?revealedAnswer(activity,id):null};}
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
  const stages=teacherActivity===1?`<nav class="beauty-stage-tabs" aria-label="활동 1 살펴볼 내용"><button type="button" data-action="teacher-a1-view" data-view="comparison" aria-pressed="${teacherA1View==='comparison'}">세 나라 도자기 비교</button><button type="button" data-action="teacher-a1-view" data-view="beauty" aria-pressed="${teacherA1View==='beauty'}">${BEAUTY_NAME}</button></nav>`:'';
  return stages+(teacherBeautyView()?teacherBeauty():teacherResultTabs()+(teacherResultViews[teacherActivity]==='exhibit'&&room.revealed?.[teacherActivity]?exhibitMarkup():teacherActivity===1?teacherComparison():teacherObservations()));
}
function teacherBeauty(){
  const item=teacherData?.beauty||{responses:[],words:[],respondents:0,total:0,submitted:0};
  return `<div class="observation-board beauty-board"><section class="board-context panel"><span class="activity-label">아름다움 찾아보기</span><h2>${esc(BEAUTY_ARTIFACT.label)}</h2><div class="viewer-host" data-beauty-viewer></div><h3>빛깔은 어떤가요?<br>무늬는 어떤가요?</h3><span class="anonymous-label">이름 없이 생각을 모아요</span></section><section class="board-canvas panel cloud-layout"><div class="board-toolbar"><strong>우리가 찾은 아름다움</strong><span class="board-response-count">${Number(item.respondents)||0}명 응답</span></div><h2 class="board-question">고려청자에서는 어떤 아름다움을 찾을 수 있나요?</h2>${cloudMarkup(item.words,'beauty')}<div class="board-caption">많이 나온 생각은 크게, 적게 나온 생각은 작게 보여요.</div></section></div><details class="panel settings-panel response-phrases" data-details="responses" ${responsesOpen?'open':''}><summary>학생들의 생각 그대로 보기 · 익명 ${item.responses.length}개</summary><div class="response-list">${item.responses.length?item.responses.map(text=>`<p>${esc(text)}</p>`).join(''):'<p>아직 모인 생각이 없어요.</p>'}</div></details>`;
}
function teacherComparison(){return `<div class="teacher-visuals teacher-comparison-grid">${COMPARISON_ARTIFACTS.map(a=>{const item=teacherData?.comparison?.find(c=>c.id===a.id)||{respondents:0,total:0,unanswered:0,choices:[]};return `<section class="panel result-panel comparison-result-card" data-comparison-result="${esc(a.id)}"><h2>${esc(a.label)} <small>${Number(item.respondents)||0}명 응답</small></h2><div class="teacher-comparison-viewer viewer-host" data-teacher-comparison-viewer="${esc(a.id)}"></div><div class="comparison-percentages" aria-label="${esc(a.label)}의 나라별 응답">${COUNTRY_CHOICES.map(c=>{const choice=item.choices.find(v=>v.country===c.id)||{percent:0,count:0};return `<div class="bar-row"><div class="row"><span>${esc(c.label)}<small>${Number(choice.count)||0}명</small></span><strong>${Number(choice.percent)||0}%</strong></div><div class="bar-track"><div class="bar-fill ${c.id}" style="width:${Math.min(100,Math.max(0,Number(choice.percent)||0))}%"></div></div></div>`;}).join('')}<p class="unanswered">아직 고르지 않은 학생 ${Number(item.unanswered)||0}명 · 응답한 학생 기준</p></div></section>`;}).join('')}</div>`;}
function teacherObservations(){
  const item=teacherData?.observations?.find(o=>o.id===teacherObject)||{responses:[],nameWords:[],useWords:[]};
  return `<div class="observation-board"><section class="board-context panel"><span class="activity-label">관찰할 청자</span><div class="object-title"><h2>청자 ${esc(teacherObject)}</h2><span class="object-number">${esc(teacherObject)} / 5</span></div><div class="teacher-observation-viewer viewer-host" data-teacher-viewer="${esc(teacherObject)}"></div><nav class="teacher-object-tabs" aria-label="답변을 볼 청자">${OBSERVATION_ARTIFACTS.map(a=>`<button class="${a.id===teacherObject?'active':''}" data-action="teacher-object" data-id="${a.id}" aria-label="청자 ${a.id} 응답 보기">${a.id}</button>`).join('')}</nav><h3>모양을 보고 짐작해요</h3><p>어디에 쓰던 물건일까요?<br>어떤 이름을 붙이면 좋을까요?</p><span class="anonymous-label">이름 없이 생각을 모아요</span></section><section class="board-canvas panel cloud-layout"><div class="board-toolbar"><div class="board-view-switch" aria-label="모아 볼 답변"><button data-action="cloud-kind" data-kind="name" aria-pressed="${cloudKind==='name'}" class="${cloudKind==='name'?'active':''}">예상한 이름</button><button data-action="cloud-kind" data-kind="use" aria-pressed="${cloudKind==='use'}" class="${cloudKind==='use'?'active':''}">예상한 쓰임</button></div><span class="board-response-count">${item.responses.length}개 생각</span></div><h2 class="board-question">${cloudKind==='name'?'어떤 이름을 붙였나요?':'어디에 썼을까요?'}</h2>${cloudMarkup(cloudKind==='name'?item.nameWords:item.useWords,cloudKind)}<div class="board-caption">많이 나온 생각은 크게, 적게 나온 생각은 작게 보여요.</div></section></div><details class="panel settings-panel response-phrases" data-details="responses" ${responsesOpen?'open':''}><summary>학생들의 생각 그대로 보기 · 익명 ${item.responses.length}개</summary><div class="response-list">${item.responses.length?item.responses.map(r=>`<p>${r.name?`<b>${esc(r.name)}</b>`:''}${esc(r.use||'')}</p>`).join(''):'<p>아직 모인 생각이 없어요.</p>'}</div></details>`;
}
function disposeComparisonViewers(){for(const entry of teacherComparisonViewers.values())entry.viewer.dispose();teacherComparisonViewers.clear();}
function disposeTeacherBoard(){cloudView?.dispose();cloudView=null;teacherViewer?.viewer.dispose();teacherViewer=null;disposeComparisonViewers();}
function mountTeacherBoard(){
  cloudView?.dispose();cloudView=null;
  const comparisonTargets=[...app.querySelectorAll('[data-teacher-comparison-viewer]')];
  const visibleIds=new Set(comparisonTargets.map(target=>target.dataset.teacherComparisonViewer));
  for(const [id,entry] of teacherComparisonViewers)if(!visibleIds.has(id)){entry.viewer.dispose();teacherComparisonViewers.delete(id);}
  // Response updates replace the surrounding cards, while the live canvases, controls,
  // camera positions and any expanded viewer remain the same objects.
  for(const target of comparisonTargets){
    const id=target.dataset.teacherComparisonViewer,artifact=COMPARISON_ARTIFACTS.find(a=>a.id===id),existing=teacherComparisonViewers.get(id);
    if(!artifact)continue;
    if(existing?.src===artifact.src){target.replaceWith(existing.element);existing.viewer.refreshExpandedInfo();}
    else{
      existing?.viewer.dispose();const viewer=mountLessonViewer(target,artifact,teacherViewerOptions(1,id));
      // Small statistics cards need the full silhouette visible, including the mouth.
      const controls=target.querySelector('.lesson-viewer__controls'),expand=target.querySelector('.lesson-viewer__expand');
      if(controls&&expand)controls.append(expand);
      teacherComparisonViewers.set(id,{src:artifact.src,element:target,viewer});
    }
  }
  const target=app.querySelector('[data-exhibit-viewer], [data-teacher-viewer], [data-beauty-viewer]');
  if(!target){teacherViewer?.viewer.dispose();teacherViewer=null;return;}
  const beauty=target.hasAttribute('data-beauty-viewer'),exhibit=target.hasAttribute('data-exhibit-viewer'),id=beauty?BEAUTY_ARTIFACT.id:exhibit?target.dataset.exhibitViewer:target.dataset.teacherViewer;
  const key=beauty?'beauty':exhibit?`exhibit:${teacherActivity}:${id}`:`observation:${id}`,artifacts=beauty?[BEAUTY_ARTIFACT]:exhibit&&teacherActivity===1?COMPARISON_ARTIFACTS:OBSERVATION_ARTIFACTS;
  if(teacherViewer?.key===key)target.replaceWith(teacherViewer.element);
  else{teacherViewer?.viewer.dispose();teacherViewer={key,element:target,viewer:mountLessonViewer(target,artifacts.find(a=>a.id===id),beauty?beautyViewerOptions():teacherViewerOptions(exhibit?teacherActivity:2,id))};}
  teacherViewer.viewer.refreshExpandedInfo();
  const cloud=app.querySelector('.word-cloud');if(cloud)cloudView=mountWordCloud(cloud);
}
function workKey(work){return `${session?.code}:${work.participantId}:${work.id}:${work.submittedAt||0}`;}
const workScore=work=>Number(work.score?.total??work.score)||0;
function sortedWorks(){
  return [...(teacherData?.works||[])].sort((a,b)=>{
    const number=(Number(a.number)||0)-(Number(b.number)||0),score=workScore(b)-workScore(a);
    return (worksSort==='score'?score||number:number||score)||(Number(a.submittedAt)||0)-(Number(b.submittedAt)||0)||workKey(a).localeCompare(workKey(b));
  });
}
function workImageMarkup(work){return workImages.has(workKey(work))?`<img src="${esc(workImages.get(workKey(work)))}" alt="${work.name?`${esc(work.number)}번 ${esc(work.name)} 학생의 완성한 청자`:'학생의 완성한 청자'}">`:'<span class="image-wait">완성한 청자를 불러오고 있어요.</span>';}
function workExplanationMarkup(work){return `<section><h3>모양 · 문양 · 쓰임</h3><p>${esc(work.explanationUse||'')}</p></section><section><h3>공들인 부분</h3><p>${esc(work.explanationBeauty||'')}</p></section>`;}
function teacherWorks(){
  const works=sortedWorks();
  return works.length?`<div class="works-toolbar"><h2>완성한 청자 <span>${works.length}점</span></h2><div class="works-sort" role="group" aria-label="작품 정렬">${[['score','점수순'],...(!observerMode?[['number','번호순']]:[])].map(([sort,label])=>`<button type="button" data-action="works-sort" data-sort="${sort}" aria-pressed="${worksSort===sort}">${label}</button>`).join('')}</div></div><div class="works-grid">${works.map(w=>`<article class="panel work-card" data-work-id="${esc(w.id)}"><div class="work-preview" data-work-preview="${esc(workKey(w))}">${workImageMarkup(w)}<span class="work-score">${workScore(w)}점</span></div><div class="work-details">${w.name?`<p class="student-line">${esc(w.number)}번 ${esc(w.name)}</p>`:''}<h2>${esc(w.title||'나의 청자')}</h2>${workExplanationMarkup(w)}<button type="button" class="button secondary work-expand" data-action="view-work" data-work-key="${esc(workKey(w))}" aria-label="${esc(w.title||'나의 청자')} 작품과 설명 크게 보기"><span aria-hidden="true">⛶</span> 크게 보기</button></div></article>`).join('')}</div>`:`<section class="panel teacher-empty"><h2>나만의 청자를 빚고 있어요.</h2><p>학생이 작품을 완성하고 설명을 전달하면<br>이곳에 청자와 이야기, 점수가 함께 모입니다.</p></section>`;
}
function workDialogMarkup(work){
  const breakdown=Number.isFinite(work.objectiveScore)&&Number.isFinite(work.explanationScore)?`<small>주문·제작 ${work.objectiveScore}점 · 설명 ${work.explanationScore}점</small>`:'';
  return `<header class="work-dialog-header"><span>작품과 이야기</span><button type="button" class="button secondary small" data-close-work aria-label="작품 크게 보기 닫기">닫기 <span aria-hidden="true">×</span></button></header><div class="work-dialog-body"><section class="work-dialog-media" aria-label="완성한 청자 살펴보기"><div class="work-dialog-stage" data-work-viewer><div class="work-preview work-dialog-preview" data-work-preview="${esc(workKey(work))}">${workImageMarkup(work)}</div></div></section><article class="work-dialog-details">${work.name?`<p class="student-line">${esc(work.number)}번 ${esc(work.name)}</p>`:''}<h2 id="work-dialog-title">${esc(work.title||'나의 청자')}</h2><div class="work-dialog-result"><span>작품 점수</span><strong>${workScore(work)}<small>점</small></strong>${breakdown}</div>${workExplanationMarkup(work)}</article></div>`;
}
function disposeWorkDialogViewer(current){
  if(!current)return;current.viewerGeneration=(current.viewerGeneration||0)+1;current.mounting=false;
  current.viewer?.dispose();current.viewer=null;current.viewerDesign=undefined;
}
function currentWorkDialog(current,generation=current?.viewerGeneration){return current&&workDialog===current&&current.dialog.isConnected&&current.viewerGeneration===generation&&teacherData?.works?.some(work=>workKey(work)===current.key&&now()<workExpiresAt(work));}
function mountWorkPhoto(container,work){
  container.innerHTML=`<div class="work-photo-viewer"><div class="work-photo-viewport" data-work-preview="${esc(workKey(work))}">${workImageMarkup(work)}</div><div class="work-photo-controls" role="group" aria-label="작품 사진 확대"><button type="button" data-photo-zoom="out" aria-label="작품 사진 축소">−</button><span data-photo-scale aria-live="polite">100%</span><button type="button" data-photo-zoom="in" aria-label="작품 사진 확대">+</button><button type="button" data-photo-zoom="reset">처음 크기</button></div><p class="work-photo-note">회전 정보가 없는 작품은 사진으로 보여 드려요.</p></div>`;
  const viewport=container.querySelector('.work-photo-viewport'),abort=new AbortController(),options={signal:abort.signal};let zoom=1,x=0,y=0,pointer=null;
  function paint(){const image=viewport.querySelector('img');if(image)image.style.transform=`translate(${x}px,${y}px) scale(${zoom})`;container.querySelector('[data-photo-scale]').textContent=`${Math.round(zoom*100)}%`;container.querySelector('[data-photo-zoom=out]').disabled=zoom<=1;container.querySelector('[data-photo-zoom=in]').disabled=zoom>=3.5;viewport.classList.toggle('can-pan',zoom>1);}
  function changeZoom(value){zoom=Math.max(1,Math.min(3.5,value));x=Math.max(-viewport.clientWidth*(zoom-1)/2,Math.min(viewport.clientWidth*(zoom-1)/2,x));y=Math.max(-viewport.clientHeight*(zoom-1)/2,Math.min(viewport.clientHeight*(zoom-1)/2,y));paint();}
  container.addEventListener('click',event=>{const action=event.target.closest('[data-photo-zoom]')?.dataset.photoZoom;if(action)changeZoom(action==='reset'?1:zoom+(action==='in'?.25:-.25));},options);
  viewport.addEventListener('wheel',event=>{event.preventDefault();changeZoom(zoom+(event.deltaY<0?.15:-.15));},{...options,passive:false});
  viewport.addEventListener('pointerdown',event=>{if(event.button!==0||zoom<=1)return;pointer={id:event.pointerId,x:event.clientX,y:event.clientY};viewport.setPointerCapture(event.pointerId);},options);
  viewport.addEventListener('pointermove',event=>{if(!pointer||pointer.id!==event.pointerId)return;x+=event.clientX-pointer.x;y+=event.clientY-pointer.y;pointer.x=event.clientX;pointer.y=event.clientY;changeZoom(zoom);},options);
  const end=event=>{if(pointer?.id===event.pointerId){pointer=null;if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);}};
  viewport.addEventListener('pointerup',end,options);viewport.addEventListener('pointercancel',end,options);paint();
  return {dispose(){if(pointer&&viewport.hasPointerCapture(pointer.id))viewport.releasePointerCapture(pointer.id);pointer=null;abort.abort();container.replaceChildren();}};
}
function fallbackWorkDialogViewer(current,work,design=workDesigns.get(current.key)){
  if(!currentWorkDialog(current))return;disposeWorkDialogViewer(current);
  current.viewerDesign=design;
  current.viewer=mountWorkPhoto(current.dialog.querySelector('[data-work-viewer]'),work);
}
async function refreshWorkDialogViewer(){
  const current=workDialog;if(!currentWorkDialog(current)||current.mounting||!workDesigns.has(current.key))return;
  const work=teacherData.works.find(item=>workKey(item)===current.key),design=workDesigns.get(current.key);
  if(current.viewer&&current.viewerDesign===design)return;
  if(current.viewer)disposeWorkDialogViewer(current);
  current.viewerDesign=design;
  if(design?.version!==1){fallbackWorkDialogViewer(current,work);return;}
  current.mounting=true;const generation=current.viewerGeneration=(current.viewerGeneration||0)+1;
  try{
    studentWorkViewerModule||=import('./student-work-viewer.js').catch(error=>{studentWorkViewerModule=null;throw error;});
    const module=await studentWorkViewerModule;if(!currentWorkDialog(current,generation))return;
    const host=current.dialog.querySelector('[data-work-viewer]');host.replaceChildren();
    current.viewer=module.mountStudentWorkViewer(host,design,{onError:()=>queueMicrotask(()=>{if(currentWorkDialog(current,generation))fallbackWorkDialogViewer(current,work,design);})});
    Promise.resolve(current.viewer.ready).catch(()=>{if(currentWorkDialog(current,generation))fallbackWorkDialogViewer(current,work,design);});
  }catch{if(currentWorkDialog(current,generation))fallbackWorkDialogViewer(current,work,design);}
  finally{if(currentWorkDialog(current,generation))current.mounting=false;}
}
function closeWorkDialog({restoreFocus=true}={}){
  const current=workDialog;if(!current)return;workDialog=null;
  disposeWorkDialogViewer(current);
  if(current.dialog.open)current.dialog.close();current.dialog.remove();
  if(restoreFocus){const opener=[...app.querySelectorAll('[data-action="view-work"]')].find(button=>button.dataset.workKey===current.key);opener?.focus({preventScroll:true});}
}
function syncWorkDialog(){
  if(!workDialog)return;
  const work=teacherActivity===3&&(teacherData?.works||[]).find(item=>workKey(item)===workDialog.key);
  if(!work){closeWorkDialog({restoreFocus:false});return;}
  const signature=JSON.stringify(work);
  if(signature!==workDialog.signature){disposeWorkDialogViewer(workDialog);workDialog.signature=signature;workDialog.dialog.innerHTML=workDialogMarkup(work);workDialog.dialog.querySelector('[data-close-work]')?.focus({preventScroll:true});}
  refreshWorkDialogViewer();
}
function openWorkDialog(key){
  if(teacherActivity!==3)return;
  const work=(teacherData?.works||[]).find(item=>workKey(item)===key);if(!work)return;
  closeWorkDialog({restoreFocus:false});
  const dialog=document.createElement('dialog');dialog.className='work-dialog';dialog.setAttribute('aria-labelledby','work-dialog-title');
  dialog.innerHTML=workDialogMarkup(work);workDialog={key,dialog,signature:JSON.stringify(work)};
  dialog.addEventListener('close',()=>{if(workDialog?.dialog===dialog)closeWorkDialog();});
  dialog.addEventListener('click',event=>{if(event.target.closest('[data-close-work]'))closeWorkDialog();else if(event.target===dialog){const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)closeWorkDialog();}});
  document.body.append(dialog);dialog.showModal();dialog.querySelector('[data-close-work]').focus();refreshWorkDialogViewer();loadWorkImages();
}
function teacherSettings(){const set=room.settings||DEFAULT_SETTINGS;return `<details class="panel settings-panel" data-details="settings" ${settingsOpen?'open':''}><summary>활동 시간 설정</summary><form data-form="settings"><div class="settings-grid">${[1,2].map(n=>`<label class="duration-field">활동 ${n} 시간 (초)<input type="number" name="duration-${n}" min="5" max="1800" step="1" value="${set.durations?.[n]||DEFAULT_SETTINGS.durations[n]}" required ${effectiveStatus()==='active'?'disabled':''}></label>`).join('')}<label class="duration-field">아름다움 찾기 (초)<input type="number" name="beauty-duration" min="5" max="1800" step="1" value="${set.beautyDuration||90}" required ${effectiveStatus()==='active'?'disabled':''}></label><label class="setting-toggle"><input type="checkbox" name="autoPause" ${set.autoPause!==false?'checked':''} ${effectiveStatus()==='active'?'disabled':''}><span>시간이 끝나면 활동 마무리<small>활동 3은 시간 제한 없이 선생님이 마칠 때까지 이어져요.</small></span></label></div><div class="settings-footer"><span class="settings-open-hint">활동을 시작하기 전에 설정할 수 있어요.</span><button type="submit" class="button secondary small" ${effectiveStatus()==='active'?'disabled':''}>설정 저장</button></div></form></details>`;}
function participantsMarkup(){const list=teacherData?.participants||[];return `<details class="panel participant-panel" data-details="participants" ${participantsOpen?'open':''}><summary>참여 학생 · ${list.length}명${room.locked?' · 입장 잠김':''}</summary>${entryTools()}<table class="participants-table"><thead><tr><th>번호</th><th>이름</th><th>활동 1</th><th>활동 2</th><th>완성작</th></tr></thead><tbody>${list.length?list.map(p=>`<tr><td>${esc(p.number)}</td><td>${esc(p.name)}${p.released?'<small class="released-tag">다시 입장 대기</small>':''}</td><td class="${p.activity1Complete?'status-ok':'empty-cell'}">${p.activity1Submitted?'제출 완료':p.activity1Complete?'작성 완료':'관찰 중'}</td><td class="${p.activity2Complete?'status-ok':'empty-cell'}">${p.activity2Submitted?'제출 완료':p.activity2Complete?'작성 완료':'관찰 중'}</td><td>${p.completedWorkCount||0}점</td></tr>`).join(''):'<tr><td colspan="5" class="empty-cell">학생들에게 수업 코드를 알려 주세요.</td></tr>'}</tbody></table></details>`;}
function entryTools(inManager=false){return `<div class="participant-tools"><button class="button secondary small" data-action="lock-room" data-locked="${room?.locked?'false':'true'}" ${controlBusy?'disabled':''}>${room?.locked?'입장 다시 열기':'입장 잠그기'}</button>${inManager?'':'<button class="button quiet small" data-action="manage-students">학생 관리</button>'}</div><p class="participant-note">${room?.locked?'새 번호로는 들어올 수 없어요. 번호를 푼 학생은 다시 들어올 수 있어요.':'수업 코드를 아는 사람은 누구나 들어올 수 있어요. 모두 들어오면 잠가 주세요.'}</p>`;}
// Lives outside #classroom-app so the teacher board can re-render underneath it; refreshed after every teacher render.
function studentManagerMarkup(){const list=teacherData?.participants||[];return `<div class="manager-head"><h2>학생 관리</h2><button class="button quiet small" type="button" data-close-manager>닫기</button></div><p class="muted">브라우저 기록이 지워져 다시 들어오지 못하는 학생은 <b>번호 풀기</b>를 누른 뒤 같은 번호로 입장하게 해 주세요. 쓰던 답과 작품은 그대로 이어져요.</p>${entryTools(true)}<div class="manager-scroll"><table class="manager-table"><thead><tr><th>번호</th><th>이름</th><th>상태</th><th>관리</th></tr></thead><tbody>${list.length?list.map(p=>`<tr><td>${esc(p.number)}</td><td>${esc(p.name)}</td><td>${p.released?'다시 입장 대기':'참여 중'}</td><td class="manager-actions"><button class="button secondary small" data-action="release-student" data-id="${esc(p.id)}" ${p.released||controlBusy?'disabled':''}>번호 풀기</button><button class="button danger small" data-action="remove-student" data-id="${esc(p.id)}" data-name="${esc(p.name)}" ${controlBusy?'disabled':''}>내보내기</button></td></tr>`).join(''):'<tr><td colspan="4" class="empty-cell">아직 들어온 학생이 없어요.</td></tr>'}</tbody></table></div>`;}
function refreshStudentManager(){const dialog=document.querySelector('dialog.student-manager');if(dialog?.open)dialog.innerHTML=studentManagerMarkup();}
function openStudentManager(){let dialog=document.querySelector('dialog.student-manager');if(!dialog){dialog=document.createElement('dialog');dialog.className='student-manager';dialog.setAttribute('aria-label','학생 관리');dialog.addEventListener('click',event=>{if(event.target.closest('[data-close-manager]')){dialog.close();return;}handleClick(event);});document.body.append(dialog);}dialog.innerHTML=studentManagerMarkup();if(!dialog.open)dialog.showModal();}
function teacherActionMarkup(live,status){
  if(observerMode)return '';
  const disabled=controlBusy||status==='active'||status==='ended';
  const start=teacherBeautyView()?`<button class="button" data-action="start-beauty" ${disabled||!room.runs?.[1]?'disabled':''}>아름다움 찾기 시작 →</button>`:`<button class="button" data-action="start" data-activity="${teacherActivity}" ${disabled?'disabled':''}>활동 ${teacherActivity} 시작 →</button>`;
  const reveal=teacherActivity<3&&!teacherBeautyView()?`<button class="button secondary" data-action="reveal" data-activity="${teacherActivity}" ${status==='active'||controlBusy||!room.runs?.[teacherActivity]||room.revealed?.[teacherActivity]?'disabled':''}>${room.revealed?.[teacherActivity]?'설명 공개됨':'함께 정답 보기'}</button>`:'';
  const next=teacherActivity===1&&!teacherBeautyView()&&room.runs?.[1]&&status==='paused'?`<button class="button secondary beauty-next" data-action="start-beauty" ${controlBusy?'disabled':''}>이어서 아름다움 찾기 →</button>`:'';
  return `<div class="teacher-action-buttons">${live?`<button class="button" data-action="pause" ${controlBusy?'disabled':''}>활동 마치기 →</button>`:start}${reveal}${next}</div>${teacherBeautyView()&&!room.runs?.[1]?'<p class="beauty-start-note">먼저 세 나라 도자기 비교를 진행한 뒤 시작해 주세요.</p>':''}`;
}
function renderTeacher(){
  if(!teacherMode||!(session?.teacherToken||session?.observerToken))return;
  syncWorkDialog();
  if(observerInviteDialog&&!sameObserverInviteSession(observerInviteDialog.identity))closeObserverInvite({restoreFocus:false});
  const status=effectiveStatus(),dataSignature=JSON.stringify({state:{...room,serverNow:0},participants:teacherData?.participants,participantCount:teacherData?.participantCount,completionCounts:teacherData?.completionCounts,comparison:teacherData?.comparison,observations:teacherData?.observations,works:teacherData?.works,reveal:teacherData?.reveal,teacherActivity,teacherObject,cloudKind,teacherResultViews,exhibitObjects,worksSort,teacherA1View,beauty:teacherData?.beauty,status,controlBusy});
  if(settingsDirty&&viewKey==='teacher'){updateTimer();updateConnection();return;}
  if(viewKey==='teacher'&&teacherSignature===dataSignature){updateTimer();updateConnection();if(teacherActivity===3)loadWorkImages();return;}
  teacherSignature=dataSignature;viewKey='teacher';disposeViewers();cloudView?.dispose();cloudView=null;
  const live=teacherViewActive()&&status==='active',participantCount=observerMode?Number(teacherData?.participantCount)||0:teacherData?.participants?.length||0;
  const completed=teacherBeautyView()?Number(teacherData?.beauty?.respondents)||0:teacherActivity===3?(teacherData?.works||[]).length:observerMode?Number(teacherData?.completionCounts?.[teacherActivity])||0:(teacherData?.participants||[]).filter(p=>p[`activity${teacherActivity}Complete`]).length;
  app.innerHTML=`<div class="lesson-shell teacher-shell">${header()}<div class="teacher-workspace"><section class="teacher-main"><div class="teacher-overview"><div><span class="activity-label">고려의 문화 · 함께 생각하는 시간</span><h1>${TITLE}</h1></div></div><nav class="teacher-stage-nav" aria-label="교사용 활동 선택">${[1,2,3].map(n=>`<button class="${teacherActivity===n?'active':''}" data-action="teacher-activity" data-activity="${n}">${room.activity===n&&status==='active'?'<i class="live-dot"></i>':''}<span><b>${n}</b> ${ACTIVITY_NAMES[n]}</span></button>`).join('')}</nav><div class="teacher-content">${teacherContent()}</div></section><aside class="teacher-sidebar" aria-label="교사용 수업 진행"><section class="teacher-control-bar"><span class="activity-label">수업 진행</span><div class="stage-caption">${teacherBeautyView()?BEAUTY_NAME:ACTIVITY_NAMES[teacherActivity]}<small>${observerMode?(live?'학생들이 활동하고 있어요.':status==='active'?`지금은 활동 ${room.activity}${room.activity===2?'가':'이'} 진행 중이에요.`:status==='ended'?'수업을 마쳤어요.':room.activity===teacherActivity&&status==='paused'?'학생들이 선생님을 보고 있어요.':'아직 진행하지 않은 활동이에요.'):live?(timeExpired()?'입력이 마감됐어요. 활동을 마쳐 주세요.':'학생들이 활동하고 있어요.'):status==='active'?`지금은 활동 ${room.activity}${room.activity===2?'가':'이'} 진행 중이에요. 먼저 활동을 마쳐 주세요.`:room.activity===teacherActivity&&status==='paused'?'학생들이 선생님을 보고 있어요.':status==='ended'?'수업을 마쳤어요.':'시작하면 학생 화면이 함께 열립니다.'}</small></div>${timerMarkup()}<div class="teacher-metrics"><span>참여 <strong>${participantCount}</strong>명</span><span>${teacherActivity===3?'완성작':'모두 작성'} <strong>${completed}</strong>${teacherActivity===3?'점':'명'}</span></div>${teacherActionMarkup(live,status)}</section>${status==='paused'?'<div class="teacher-pause-note">학생 화면은 지금<br>“크롬북을 닫고 선생님을 보세요”</div>':''}${observerMode?'':participantsMarkup()+teacherSettings()+'<section class="panel teacher-data-actions"><button class="button danger small" data-action="delete-room">수업 데이터 삭제</button><p>학생 정보 · 답변 · 작품을 삭제합니다.</p></section>'}</aside></div></div>`;
  updateTimer();updateConnection();mountTeacherBoard();refreshStudentManager();if(teacherActivity===3)loadWorkImages();
}
const workExpiresAt=work=>Math.min(work.submittedAt+GAME_DATA_TTL_MS,Number.isFinite(work.expiresAt)?work.expiresAt:Infinity);
function pruneTeacherWorks(){
  if(!teacherData)return false;
  const works=teacherData.works||[],kept=works.filter(work=>Number.isFinite(work.submittedAt)&&now()<workExpiresAt(work));
  const currentKeys=new Set(kept.map(workKey));
  for(const key of workImages.keys())if(!currentKeys.has(key))workImages.delete(key);
  for(const key of workDesigns.keys())if(!currentKeys.has(key))workDesigns.delete(key);
  if(kept.length===works.length)return false;
  // The settings form can defer a board rerender; expired images and text must still leave the DOM now.
  for(const preview of app.querySelectorAll('.work-card [data-work-preview]'))if(!currentKeys.has(preview.dataset.workPreview))preview.closest('.work-card')?.remove();
  teacherData={...teacherData,works:kept};return true;
}
function pruneLocalGameData(){try{pruneGameSaves(localStorage);}catch{}}
async function loadWorkImages(){
  const requestSession=session;
  for(const work of teacherData?.works||[]){
    const key=workKey(work),designReady=workDesigns.has(key)&&(!work.designVersion||workDesigns.get(key)?.version===work.designVersion);if(workImages.has(key)&&designReady||workImagePending.has(key))continue;
    workImagePending.add(key);
    try{
      const value=await api('artwork',{body:{participantId:work.participantId,workId:work.id}});
      if(session!==requestSession)return;
      if(!teacherData?.works?.some(current=>workKey(current)===key)||now()>=workExpiresAt(work))continue;
      if(typeof value.preview==='string'&&/^data:image\/(png|webp);base64,/.test(value.preview)){
        workImages.set(key,value.preview);
        workDesigns.set(key,value.design?.version===1?value.design:null);
        for(const container of document.querySelectorAll('[data-work-preview]'))if(container.dataset.workPreview===key){
          const image=document.createElement('img');image.src=value.preview;image.alt=work.name?`${work.number}번 ${work.name} 학생의 완성한 청자`:'학생의 완성한 청자';container.querySelector('.image-wait')?.replaceWith(image);
        }
        refreshWorkDialogViewer();
      }
    }catch{
      for(const container of document.querySelectorAll('[data-work-preview]'))if(container.dataset.workPreview===key&&container.querySelector('.image-wait'))container.querySelector('.image-wait').textContent='작품 사진을 다시 불러올게요.';
    }finally{workImagePending.delete(key);}
  }
}
function resetRoom({keepTeacherKey=false}={}){
  observerInviteVerified=null;
  closeObserverInvite({restoreFocus:false});closeWorkDialog({restoreFocus:false});closeCompletionDialog();teacherResultViews={1:'responses',2:'responses'};exhibitObjects={1:'1',2:'1'};
  heartbeatGame();disposeViewers();disposeTeacherBoard();clearTimeout(pollTimer);clearTimeout(saveTimer);session=null;room=null;teacherData=null;student=null;answers={};
  drafts={1:{},2:{},beauty:{}};revisions={1:0,2:0,beauty:0};dirty={1:false,2:false,beauty:false};draftChanges={1:0,2:0,beauty:0};submitted={1:false,2:false,beauty:false};teacherA1View='comparison';
  viewKey='';teacherSignature='';currentObject='1';teacherActivity=1;teacherObject='1';selectedCountry=null;cloudKind='name';settingsDirty=false;connectionError='';
  uploadedWorks.clear();clearPendingWorks();terminalWorks.clear();workImages.clear();workDesigns.clear();workImagePending.clear();if(teacherMode){if(!keepTeacherKey)store(SESSION_KEY,null);}else clearActiveStudentSession();
}
function render(){if(!session||!room)return renderWelcome();if(teacherMode)renderTeacher();else renderStudent();}
function updateTimer(){
  const timer=document.querySelector('[data-testid=lesson-timer]');if(!timer)return;
  const viewed=teacherMode?teacherActivity:room?.activity;
  if(untimed(viewed)){const live=room?.activity===viewed&&effectiveStatus()==='active';timer.querySelector('strong').textContent=live?formatTime(elapsed()):'제한 없음';timer.classList.remove('warning','finished');return;}
  let seconds=remaining();if(teacherMode&&(!teacherViewActive()||effectiveStatus()!=='active'))seconds=teacherViewActive()&&deadlinePassed()?0:teacherViewDuration();timer.querySelector('strong').textContent=formatTime(seconds);timer.classList.toggle('warning',active(room?.activity)&&seconds<=20&&seconds>0);timer.classList.toggle('finished',seconds===0);
}
function updateSaveStatus(){
  app.querySelectorAll('[data-activity-done]').forEach(done=>{const activity=done.dataset.activityDone==='beauty'?'beauty':Number(done.dataset.activityDone);done.disabled=answerLocked(activity)||progress(activity)<expectedProgress(activity)||saving;done.textContent=submitted[activity]?'다했어요 ✓':saving?'저장 중…':'다했어요';});
  document.querySelectorAll('[data-save-status]').forEach(el=>{el.dataset.status=saveState;el.textContent=saveMessage||'생각을 적으면 자동으로 저장돼요.';});
  const progressEl=document.querySelector('[data-progress]');if(progressEl)progressEl.textContent=`${progress(room?.activity)} / ${room?.activity===1?3:5} 관찰했어요`;
  if(room?.activity===2)document.querySelectorAll('[data-action=select-object]').forEach(el=>{const a=drafts[2][el.dataset.id]||{};el.classList.toggle('answered',Boolean(a.name?.trim()&&a.use?.trim()));});
}
function changed(activity){dirty[activity]=true;draftChanges[activity]++;saveState='pending';saveMessage='생각을 적고 있어요…';persistDrafts();updateSaveStatus();clearTimeout(saveTimer);saveTimer=setTimeout(()=>queueSave(),800);}
async function queueSave(final=false){
  if(teacherMode||!session||![1,2].includes(room?.activity)||!active(room.activity))return;
  const activity=answerActivity();if(submitted[activity])return;
  if(final&&progress(activity)!==expectedProgress(activity)){toast(activity==='beauty'?'청자에서 찾은 아름다움을 한 가지 이상 적어 주세요.':activity===1?'세 도자기에 나라 이름표를 모두 골라 주세요.':'다섯 점의 쓰임과 이름을 모두 적어 주세요.');return;}
  if(saving){saveAgain=true;finalAgain||=final;return;}
  if(!dirty[activity]&&!final)return;
  clearTimeout(saveTimer);saving=true;const requestSession=session,runId=room.runId,change=draftChanges[activity],clientRevision=++revisions[activity];
  saveState='saving';saveMessage='선생님께 전달하고 있어요…';updateSaveStatus();
  try{
    const payload=await api(activity==='beauty'?'beauty-answer':'answer',{method:'POST',body:{participantId:session.participantId,runId,clientRevision,final,...(activity==='beauty'?{text:drafts.beauty.text||''}:{activity,answers:copy(drafts[activity])})}});
    if(session!==requestSession)return;
    if(answerRun(activity)===runId){
      const record=activity==='beauty'?payload.beautyAnswer:payload.answers?.[activity],confirmed=record?.runId===runId&&record.clientRevision>=clientRevision;
      if(confirmed){
        revisions[activity]=Math.max(revisions[activity],record.clientRevision);submitted[activity]=Boolean(record.submitted);
        if(record.submitted){drafts[activity]=recordDraft(activity,record);dirty[activity]=false;}
        else if(!payload.ignored&&draftChanges[activity]===change){dirty[activity]=false;drafts[activity]=recordDraft(activity,record);}
        answers={...answers,[activity]:record};
      }
      if(payload.ignored&&!submitted[activity]){saveAgain=true;finalAgain||=final;saveState='pending';saveMessage='수정한 생각을 다시 저장하고 있어요…';}
      else{saveState=confirmed?'saved':'pending';saveMessage=record?.submitted?'생각을 제출했어요.':confirmed?'저장했어요 ✓':'저장 상태를 확인하고 있어요…';}
      receive({...payload,answers:undefined,beautyAnswer:undefined});persistDrafts();render();
    }
  }catch(error){if(session!==requestSession)return;saveState='error';saveMessage=error.status===409?error.message:'저장하지 못했어요. 다시 연결하면 이어서 보낼게요.';connectionError=error.status===409?'':error.message;updateSaveStatus();updateConnection();}
  finally{saving=false;if(saveAgain){const nextFinal=finalAgain;saveAgain=false;finalAgain=false;queueSave(nextFinal);}updateSaveStatus();}
}
function setCountry(id,value){
  if(answerLocked(1)||!COMPARISON_ARTIFACTS.some(a=>a.id===id)||(value!==''&&!COUNTRY_CHOICES.some(c=>c.id===value)))return false;
  const select=app.querySelector(`[data-country-for="${id}"]`);if(select){select.value=value;select.classList.toggle('selected',Boolean(value));}
  if(drafts[1][id]!==value){drafts[1][id]=value;changed(1);}return true;
}
function selectCountry(value){selectedCountry=value;app.querySelectorAll('[data-country-chip]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.countryChip===value)));}
function endCountryDrag(){countryDragController.cancel();}
function selectObject(id){if(!OBSERVATION_ARTIFACTS.some(a=>a.id===id))return;clearTimeout(saveTimer);if(dirty[2])queueSave();currentObject=id;renderStudent();}
function heartbeatGame(){const frame=app.querySelector('.game-frame');if(!frame)return;const enabled=active(3)&&Date.now()-lastSuccessfulPoll<14000;frame.contentWindow?.postMessage({type:'celadon:classroom-state',active:enabled,runId:room.runId,endsAt:room.endsAt,serverNow:now()},location.origin);lastGameActive=enabled;}
function pendingWorkExpired(entry){return !Number.isFinite(entry?.expiresAt)||Date.now()>=entry.expiresAt;}
function dropPendingWork(entry){
  if(!entry||pendingWorks.get(entry.id)!==entry)return;
  pendingWorks.delete(entry.id);clearTimeout(entry.expiryTimer);clearTimeout(entry.uploadTimer);entry.controller?.abort();entry.controller=null;
  entry.work=null;entry.preview=null;
}
function clearPendingWorks(){for(const entry of pendingWorks.values())dropPendingWork(entry);}
function prunePendingWorks(){
  for(const entry of pendingWorks.values())if(pendingWorkExpired(entry))dropPendingWork(entry);
  for(const [id,expiresAt] of terminalWorks)if(Date.now()>=expiresAt)terminalWorks.delete(id);
}
function schedulePendingWorkExpiry(entry){clearTimeout(entry.expiryTimer);entry.expiryTimer=setTimeout(()=>{if(pendingWorkExpired(entry))dropPendingWork(entry);else schedulePendingWorkExpiry(entry);},Math.max(0,entry.expiresAt-Date.now()));}
async function sendWork(entry){
  if(!entry)return;if(pendingWorkExpired(entry)){dropPendingWork(entry);return;}
  if(pendingWorks.get(entry.id)!==entry||uploadedWorks.has(entry.id)||terminalWorks.has(entry.id)||entry.sending||!canSendWork()||entry.runId!==room.runId)return;
  entry.sending=true;entry.controller=new AbortController();entry.uploadTimer=setTimeout(()=>entry.controller?.abort(),15000);
  const requestSession=session,status=app.querySelector('[data-game-status]');if(status)status.textContent='완성한 작품을 선생님께 전달하고 있어요…';
  try{await api('work',{method:'POST',signal:entry.controller.signal,body:{participantId:session.participantId,runId:entry.runId,work:entry.work,preview:entry.preview,expiresAt:entry.expiresAt}});if(session!==requestSession||pendingWorks.get(entry.id)!==entry)return;if(pendingWorkExpired(entry)){dropPendingWork(entry);return;}uploadedWorks.add(entry.id);dropPendingWork(entry);if(status)status.textContent='완성한 작품을 선생님께 전달했어요 ✓';}
  catch(error){if(session!==requestSession||pendingWorks.get(entry.id)!==entry)return;if(pendingWorkExpired(entry)||error.status===410){if(error.status===410)terminalWorks.set(entry.id,entry.expiresAt);dropPendingWork(entry);if(status)status.textContent='보관 시간이 지난 작품 기록을 지웠어요.';return;}entry.error=error.message;if(status)status.textContent='작품을 아직 보내지 못했어요. 연결되면 다시 보낼게요.';}
  finally{clearTimeout(entry.uploadTimer);entry.controller=null;entry.sending=false;}
}
// Mirrors WORK_UPLOAD_GRACE_MS on the server: keep delivering works finished just before the activity closed.
function canSendWork(){if(active(3))return true;if(room?.activity!==3||room.status==='ended')return false;const closedAt=room.status==='paused'?room.pausedAt:room.endsAt;return Number.isFinite(closedAt)&&now()>=closedAt&&now()<closedAt+20000;}
function retryWorks(){prunePendingWorks();if(!teacherMode&&canSendWork())for(const entry of pendingWorks.values())sendWork(entry);}
window.addEventListener('message',event=>{
  if(teacherMode||event.origin!==location.origin)return;const frame=app.querySelector('.game-frame');if(!frame||event.source!==frame.contentWindow||!event.data||typeof event.data!=='object')return;
  if(event.data.type==='celadon:ready'){heartbeatGame();frame.contentWindow?.postMessage({type:'celadon:request-completed'},location.origin);}
  if(event.data.type==='celadon:completed'&&event.data.work?.step===4&&typeof event.data.work.id==='string'&&event.data.runId===room?.runId){const {work,preview,runId,expiresAt}=event.data;if(typeof preview!=='string'||preview.length>420000||!/^data:image\/(png|webp);base64,/.test(preview)||!Number.isFinite(expiresAt)||expiresAt<=Date.now()||expiresAt>Date.now()+GAME_DATA_TTL_MS)return;prunePendingWorks();if(uploadedWorks.has(work.id)||terminalWorks.has(work.id))return;let entry=pendingWorks.get(work.id);if(entry)entry.expiresAt=Math.min(entry.expiresAt,expiresAt);else{entry={id:work.id,work,preview,runId,expiresAt,sending:false};pendingWorks.set(work.id,entry);}schedulePendingWorkExpiry(entry);sendWork(entry);}
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
      const settings={durations:Object.fromEntries([1,2].map(n=>[n,Number(values.get(`duration-${n}`))])),beautyDuration:Number(values.get('beauty-duration')),autoPause:values.has('autoPause')};
      await control('settings',{settings});settingsDirty=false;toast('활동 시간을 저장했어요.');teacherSignature='';render();
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
  const chip=event.target.closest('[data-country-chip]');if(chip){if(answerLocked(1))return;selectCountry(selectedCountry===chip.dataset.countryChip?null:chip.dataset.countryChip);if(selectedCountry)toast(`${countryName(selectedCountry)} 이름표를 놓을 도자기의 칸을 눌러 주세요.`);return;}
  const drop=event.target.closest('[data-country-drop]');if(drop&&selectedCountry&&!answerLocked(1)&&!event.target.closest('[data-viewer] button,[data-viewer] a')){event.preventDefault();if(setCountry(drop.dataset.countryDrop,selectedCountry))selectCountry(null);return;}
  const button=event.target.closest('[data-action]');if(!button||button.disabled)return;const action=button.dataset.action;if(!actionAllowed(action))return;
  if(['copy-observer','end','new-room','delete-room'].includes(action)){manageOpen=false;button.closest('details')?.removeAttribute('open');}
  try{
    if(action==='retry-connection'){saveState='pending';await poll();if(!teacherMode)queueSave();return;}
    if(action==='submit-answers'){queueSave(true);return;}
    if(action==='next-object'||action==='previous-object'){const index=OBSERVATION_ARTIFACTS.findIndex(a=>a.id===currentObject),step=action==='next-object'?1:-1;selectObject(OBSERVATION_ARTIFACTS[(index+step+OBSERVATION_ARTIFACTS.length)%OBSERVATION_ARTIFACTS.length].id);return;}
    if(action==='select-object'){selectObject(button.dataset.id);return;}
    if(action==='teacher-activity'){teacherActivity=Number(button.dataset.activity);settingsDirty=false;renderTeacher();return;}
    if(action==='teacher-a1-view'){teacherA1View=button.dataset.view==='beauty'?'beauty':'comparison';settingsDirty=false;renderTeacher();return;}
    if(action==='start-beauty'){settingsDirty=false;await control('start-beauty');return;}
    if(action==='teacher-object'){teacherObject=button.dataset.id;renderTeacher();return;}
    if(action==='works-sort'){worksSort=!observerMode&&button.dataset.sort==='number'?'number':'score';renderTeacher();app.querySelector(`[data-action="works-sort"][data-sort="${worksSort}"]`)?.focus({preventScroll:true});return;}
    if(action==='view-work'){openWorkDialog(button.dataset.workKey);return;}
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
    if(action==='observer-link'){await openObserverInvite();return;}
    if(action==='copy-observer'){await copyObserverAddress();return;}
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
  const beautyField=event.target.closest('[data-beauty-answer]');if(beautyField&&!answerLocked('beauty')){drafts.beauty={text:beautyField.value};changed('beauty');}
  const field=event.target.closest('[data-observation-field]');if(field&&active(2)&&!submitted[2]){drafts[2][currentObject]={...(drafts[2][currentObject]||{}),[field.dataset.observationField]:field.value};changed(2);}
  if(event.target.closest('[data-form=settings]'))settingsDirty=true;
});
app.addEventListener('toggle',event=>{if(event.target.dataset.details==='settings')settingsOpen=event.target.open;if(event.target.dataset.details==='participants')participantsOpen=event.target.open;if(event.target.dataset.details==='responses')responsesOpen=event.target.open;if(event.target.dataset.details==='manage')manageOpen=event.target.open;},true);
const countryDragController=mountCountryNameplates(app,{
  canDrag:()=>!teacherMode&&!answerLocked(1),getRunId:()=>room?.runId,
  onDragStart:()=>selectCountry(null),
  onDrop:(id,value)=>{if(setCountry(id,value)){selectCountry(null);toast(`청자 ${id}에 ${countryName(value)} 이름표를 놓았어요.`);}},
});
// A selected chip is placed before a native select opens its popup on pointer down.
app.addEventListener('pointerdown',event=>{
  const select=event.target.closest('[data-country-for]');
  if(select&&selectedCountry&&event.isPrimary&&event.button===0&&!answerLocked(1)){event.preventDefault();if(setCountry(select.dataset.countryFor,selectedCountry))selectCountry(null);}
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&session)poll();else if(!teacherMode&&room&&dirty[answerActivity()])queueSave();});
window.addEventListener('online',()=>{if(session)poll();});
window.addEventListener('storage',event=>{if(event.key!==SESSION_KEY||!teacherMode||observerMode)return;const saved=stored(SESSION_KEY);if(!saved||saved.code!==session?.code||saved.teacherToken!==session?.teacherToken){observerInviteVerified=null;closeObserverInvite({restoreFocus:false});}});
window.addEventListener('pageshow',event=>{
  if(!teacherMode){
    if(event.persisted){resetRoom();renderWelcome();}
    // Chrome can restore form values after rendering a reopened tab. Ask for identity again.
    if(viewKey==='welcome')app.querySelector('[data-form=join]')?.reset();
  }else if(event.persisted&&session){render();poll();}
});
let lastRetentionSweep=0;
window.addEventListener('focus',pruneLocalGameData);
const clock=setInterval(()=>{
  prunePendingWorks();
  if(Date.now()-lastRetentionSweep>=60000){lastRetentionSweep=Date.now();pruneLocalGameData();}
  if(teacherMode&&pruneTeacherWorks())renderTeacher();
  if(!room)return;updateTimer();
  if(!teacherMode&&active(room.activity)&&[1,2].includes(room.activity)&&dirty[answerActivity()]&&remaining()<=2&&!saving)queueSave();
  if(timeExpired()){render();heartbeatGame();}
  if(!teacherMode&&lastGameActive&&Date.now()-lastSuccessfulPoll>14000)heartbeatGame();
},250);
window.addEventListener('pagehide',event=>{observerInviteVerified=null;closeObserverInvite({restoreFocus:false});if(event.persisted)return;disposed=true;clearTimeout(pollTimer);clearTimeout(saveTimer);clearInterval(clock);clearPendingWorks();terminalWorks.clear();closeWorkDialog({restoreFocus:false});closeCompletionDialog();disposeViewers();disposeTeacherBoard();});

async function boot(){
  pruneLocalGameData();
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
