import {CLAYS,freshClay,chooseClay,ClayKneading,clayLumpSVG} from './clay.js';
import {newInspection,inspectionMarkup,InspectionGame} from './inspection.js';
import {InlayGame,beginInlay,inlayProgress,setInlaySlip} from './inlay-game.js';
import {requestAssessment,assessmentMatches} from './assessment.js';
import {normalizeStampSize} from './motif-size.js';
import {restartFrom,restartInlay} from './workflow.js';
import {orderQuote} from './dialogue.js';
import {clayMarkup,stationMarkup,explainMarkup,reviewMarkup} from './workshop-ui.js';
import {motifPath} from './motif-paths.js';
import {ROTATION_IDS} from './rotation-rules.js';
import {SHAPES,ORDERS,TECHNIQUES,PATTERNS,FIRING,evaluateWork,drawNextOrder} from './domain.js';
import {MODEL_CATALOG,getModelArtifact} from './models-manifest.js';
import {designsForShape} from './example-orders.js';
import {Craft2D} from './craft-2d.js';
import {SculptGame} from './sculpt-game.js';
import {KilnGame} from './kiln-game.js';
import {castForOrder,characterMarkup,randomCustomerId} from './characters.js';
import {recognizeDrawing} from './drawing.js';
import {vesselSVG} from './art.js';
import {classroomStorageKey,createClassroomGameBridge} from './classroom-game-bridge.js';
import {GAME_DATA_TTL_MS,gameSaveExpired,hasResumableGameProgress,pruneGameSaves,readGameSave,writeGameSave} from './game-retention.js';
import {tutorialMarkup,TUTORIAL_STEPS,walkingCustomerMarkup,CustomerArrival} from './game-onboarding.js';

const app=document.querySelector('#app'),popup=document.querySelector('#popup'),museum=document.querySelector('#museum');
const KEY=classroomStorageKey(),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let clayGame,inlayGame,inspectionGame,galleryCraft,galleryOriginal,assessmentRequest,classroomBridge,choosingVariant=false;
let tutorialSeen=false,pendingEntry=null,tutorialSession=null,customerArrival=null,renderedPhoneStage=null;
const emptyState=()=>({history:[],gallery:[],draft:null,sound:false});
let state=emptyState(),work=null,screen='cover',craft,sculpt,mini,busy=false,toastTimer,modelModule,modelToken=0,selectedCatalog='pillow',galleryPage=0,retentionTimer;
let gameStorage;try{gameStorage=localStorage;}catch{}
const valid=w=>w&&ORDERS.some(o=>o.id===w.orderId)&&SHAPES.some(s=>s.id===w.shape||w.shape===null)&&Array.isArray(w.placements)&&Array.isArray(w.firing)&&Number.isInteger(w.step)&&w.step>=0&&w.step<=4;
pruneGameSaves(gameStorage);
const saved=readGameSave(gameStorage,KEY);if(saved){state={...state,...saved,history:(Array.isArray(saved.history)?saved.history:[]).filter(id=>ORDERS.some(o=>o.id===id)),gallery:(Array.isArray(saved.gallery)?saved.gallery:[]).filter(valid).slice(0,60),draft:valid(saved.draft)?saved.draft:null};}
const order=()=>ORDERS.find(o=>o.id===work?.orderId),modelName=w=>getModelArtifact(w?.modelId||w?.shape)?.shortName||'새 청자';
const selected=(a,b)=>a===b?' selected':'',pressed=(a,b)=>String(a===b);
function clearToast(){clearTimeout(toastTimer);document.querySelector('#toast')?.classList.remove('show');}
function toast(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3500);}
function scheduleExpiration(){clearTimeout(retentionTimer);if(Number.isFinite(state.retentionStartedAt))retentionTimer=setTimeout(()=>{if(!expireGameData(true))scheduleExpiration();},Math.max(0,state.retentionStartedAt+GAME_DATA_TTL_MS-Date.now()));}
function expireGameData(sweep=false){
 if(sweep)pruneGameSaves(gameStorage);
 if(!gameSaveExpired(state))return false;
 customerArrival?.dispose();customerArrival=null;pendingEntry=null;tutorialSession=null;
 readGameSave(gameStorage,KEY);clearTimeout(retentionTimer);assessmentRequest?.abort();assessmentRequest=null;
 mini?.dispose();mini=null;busy=false;sculpt?.dispose();sculpt=null;clayGame?.dispose();clayGame=null;inlayGame?.dispose();inlayGame=null;inspectionGame?.dispose();inspectionGame=null;craft?.dispose();craft=null;
 closePopup();closeMuseum();clearToast();state=emptyState();work=null;screen='cover';choosingVariant=false;galleryPage=0;render();return true;
}
function persist(){try{if(!writeGameSave(gameStorage,KEY,state)){expireGameData();return false;}}catch{toast('저장 공간이 부족해요. 완성품을 사진으로 보관해 주세요.');}scheduleExpiration();return true;}
function save(){if(expireGameData())return false;if(work){state.draft=structuredClone(work);return persist();}return true;}
function stage(){if(work.step===0)return 'clay';if(work.step===1)return work.decorPhase>=2?'scraped':work.decorPhase===1?'filled':work.placements.length||work.strokes?.length?'carved':'clay';if(work.step===2)return ['scraped','scraped','biscuit','glazed','finished'][work.firing.length];return 'finished';}
function hud(){const phase=screen==='counter'?'주문 받기':screen==='clay'?'흙 준비':screen==='inspection'?'불량품 선별':screen==='counter-delivery'?'작품 전달':screen==='reaction'?'손님의 답장':screen==='game'?['모양 빚기','무늬 넣기','말리고 굽기','완성품 살피기'][work?.step]:'처음 화면',visitors=state.history.length;return `<header class="hud"><button class="mini-logo" data-action="home">좋은 청자, 위대한 청자</button><div class="shift-status">${esc(phase)}</div><div class="hud-stats"><span>✦ 명성 ${state.gallery.reduce((n,w)=>n+evaluateWork(w).total,0)}</span><span>${visitors?`${visitors}번째 손님`:'첫 손님 대기'}</span></div><nav class="hud-tools" aria-label="공방 메뉴"><button data-action="gallery">작품함</button><button data-action="museum">청자 도감</button><button data-action="guide">도움말</button><button data-action="fullscreen" aria-label="전체 화면">⛶</button></nav></header>`;}
function canResume(){return hasResumableGameProgress(state.draft);}
function cover(){return `<section class="cover shop-cover"><div class="cover-content"><span class="ribbon">고려의 작은 도공이 되어 보아요</span><h1>좋은 청자<br><em>위대한 청자</em></h1><p>손님을 만나고, 흙을 반죽하고, 손끝으로 빚어요.</p><div class="cover-actions">${canResume()?'<button class="primary green cover-start" data-action="start">공방 일 이어하기 ▶</button>':''}<button class="primary green cover-start" data-action="new-order">새 주문 받기 ▶</button></div><div class="cover-features"><span>흙 준비</span><span>성형과 장식</span><span>가마와 선별</span></div></div></section>`;}
function readableText(root){for(const el of root.querySelectorAll('button,p,span,small,label,select,input,textarea,a,dt,dd,h1,h2,h3'))if(parseFloat(getComputedStyle(el).fontSize)<14)el.style.fontSize='14px';}
function render(){
 if(expireGameData())return;
 const phoneStage=[screen,work?.id,work?.step,work?.inlayMode,choosingVariant].join(':');
 const enteredPhoneStage=phoneStage!==renderedPhoneStage;renderedPhoneStage=phoneStage;
 customerArrival?.pause();
 sculpt?.dispose();sculpt=null;clayGame?.dispose();clayGame=null;inlayGame?.dispose();inlayGame=null;inspectionGame?.dispose();inspectionGame=null;craft?.el.remove();
 const content=screen==='cover'?cover():screen==='reaction'?reviewMarkup(work):screen==='counter'||screen==='counter-delivery'?counterScreen():screen==='clay'?clayMarkup(work):screen==='inspection'?inspectionMarkup(work):stationMarkup(work,{choosingVariant});
 app.innerHTML=`<div class="game-window shop-game ${screen==='cover'?'is-cover':'is-playing'} is-${screen}">${hud()}${content}</div>`;
 const piece=document.querySelector('#workpiece');
 if(piece&&work?.shape){
  craft??=new Craft2D(stampPattern,addStroke,()=>toast('도자기 그림을 불러오지 못했어요. 다시 형태를 골라 주세요.'),()=>save());craft.mount(piece,work,stage());
  if(screen==='game'&&work.step===0&&!choosingVariant&&work.knead<3&&!work.sculpt?.complete)sculpt=new SculptGame(craft,work,value=>{if(!save())return;const bar=document.querySelector('.sculpt-progress i'),status=document.querySelector('#sculpt-status'),next=document.querySelector('[data-action=next-shape]');if(bar)bar.style.width=`${value.fraction*100}%`;if(status)status.textContent=value.complete?'통과! 목표 모양을 잘 빚었어요.':`모양 일치 ${Math.floor(value.fraction*100)}% · 목표 90%`;if(next)next.disabled=!value.complete;if(value.complete)document.querySelector('.sculpt-canvas')?.classList.add('completed');});
  if(screen==='game'&&work.step===1&&['fill','wipe','done'].includes(work.inlayMode))inlayGame=new InlayGame(craft,work,{mode:work.inlayMode==='fill'?'fill':'wipe',onProgress:value=>{if(!save())return;const bar=document.querySelector('.inlay-progress i'),status=document.querySelector('.inlay-status'),next=document.querySelector('[data-action="inlay-wipe"], [data-action="next-decor"]');if(bar)bar.style.width=`${value.fraction*100}%`;if(status)status.textContent=value.complete?(value.mode==='fill'?'색흙을 다 채웠어요! 닦으러 가요.':'무늬가 또렷하게 드러났어요!'):`${Math.floor(value.fraction*100)}% ${value.mode==='fill'?'채웠어요':'닦았어요'}`;if(next)next.disabled=!value.complete;}});
 }else if(craft){craft.dispose();craft=null;}
 if(screen==='clay')clayGame=new ClayKneading(document.querySelector('.knead-pad'),work,value=>{if(!save())return;document.querySelector('#clay-progress i').style.width=`${value.kneads/6*100}%`;document.querySelector('#clay-status').textContent=value.prepared?'공기를 빼고 고르게 반죽했어요.':`꼭꼭 반죽하기 ${value.kneads}/6`;document.querySelector('[data-action=clay-ready]').disabled=!value.prepared;document.querySelectorAll('.knead-counts i').forEach((el,i)=>el.classList.toggle('done',i<value.kneads));});
 readableText(app);
 if(screen==='counter'&&customerArrival?.workId===work?.id)customerArrival.mount(document.querySelector('.counter-scene'));
 if(screen==='inspection')inspectionGame=new InspectionGame(document.querySelector('.inspection-scene'),work,{onChange:(next,{settled})=>{if(expireGameData()||!work)return;work.inspection=next;save();if(settled)render();}});
 // Phone stations scroll as documents. A new step starts at its heading, while
 // stamping, drawing and inspection updates keep the learner's current view.
 if(enteredPhoneStage&&matchMedia('(max-width:600px), (max-width:1023px) and (pointer:coarse)').matches)window.scrollTo(0,0);
}

function begin(fresh=false){if(expireGameData())return;choosingVariant=false;customerArrival?.dispose();customerArrival=null;if(fresh){state.draft=null;work=null;}if(state.draft&&state.draft.step<4)work=structuredClone(state.draft);else if(!work||work.step===4){const o=drawNextOrder(state.history);state.history.push(o.id);const customerId=randomCustomerId(state.lastCustomerId);state.lastCustomerId=customerId;work={id:crypto.randomUUID(),customerId,orderId:o.id,accepted:false,clay:freshClay(),shape:null,modelId:null,technique:'inlay',pattern:'crane',placements:[],strokes:[],width:1,knead:0,sculpt:null,decorPhase:0,decorDone:false,firing:[],step:0,explanationUse:'',explanationBeauty:'',selfUse:false,selfBeauty:false};if(!save())return;customerArrival=new CustomerArrival(work.id,customerId);}work.strokes??=[];work.explanationUse??='';work.explanationBeauty??='';if(!work.clay)work.clay={...freshClay(),body:true,kneads:6,prepared:true};work.clay.body=true;if(!work.customerId){work.customerId=randomCustomerId(state.lastCustomerId);state.lastCustomerId=work.customerId;if(!save())return;}screen=work.stationView||(work.shape?(work.step===3?'counter-delivery':'game'):'counter');render();}
function resetDecor(){delete work.inlay;delete work.inlayMode;work.assessment=null;work.placements=[];work.strokes=[];work.drawingLabel=null;work.decorPhase=0;work.decorDone=false;work.firing=[];}
function defaultIllustration(shape){return designsForShape(shape).find(d=>ROTATION_IDS.includes(d.modelId))?.modelId||designsForShape(shape)[0]?.modelId;}
function setShape(shape,modelId){choosingVariant=false;work.shape=shape;work.modelId=modelId||defaultIllustration(shape);work.knead=0;work.viewFrame=0;work.sculpt=null;resetDecor();if(!save())return;render();}
function stampPattern(mark){if(expireGameData()||!work)return;if(work.step!==1||work.decorPhase>0||work.technique==='plain')return;if(work.placements.length>=24){toast('문양은 24개까지 놓을 수 있어요.');return;}work.placements.push(mark);if(!save())return;render();}
function addStroke(stroke){if(expireGameData()||!work)return;work.strokes??=[];if(work.strokes.length>=40){toast('선은 40개까지 그릴 수 있어요.');return;}work.strokes.push(stroke);work.recognition=recognizeDrawing(work.strokes);if(!save())return;render();if(work.recognition)toast(`${PATTERNS.find(p=>p.id===work.recognition.id)?.name} 무늬${work.recognition.confidence} · 그림의 뜻은 직접 골라주세요.`);}
function showPopup(html,extra=''){galleryCraft?.dispose();galleryCraft=null;popup.removeAttribute('aria-labelledby');popup.className='popup '+extra;popup.innerHTML=`<button class="close" data-action="close-popup" aria-label="닫기">×</button>${html}`;if(!popup.open)popup.showModal();readableText(popup);}
function showTutorial(entry=null,{restore=false}={}){if(!restore||!tutorialSession)tutorialSession={entry,index:0,understood:false,paused:false};pendingEntry=tutorialSession.entry;showPopup(tutorialMarkup(Boolean(pendingEntry),tutorialSession.index,tutorialSession.understood),'tutorial-popup');popup.setAttribute('aria-labelledby','tutorial-title');}
function moveTutorial(delta){if(!tutorialSession||!popup.open||!popup.classList.contains('tutorial-popup'))return;tutorialSession.index=Math.max(0,Math.min(TUTORIAL_STEPS.length-1,tutorialSession.index+delta));showTutorial(tutorialSession.entry,{restore:true});const preferred=popup.querySelector(`[data-action="tutorial-${delta<0?'prev':'next'}"]`);(preferred?.disabled?popup.querySelector(`[data-action="tutorial-${delta<0?'next':'prev'}"]`):preferred)?.focus();}
popup.addEventListener('cancel',()=>{pendingEntry=null;tutorialSession=null;});
popup.addEventListener('keydown',event=>{if(!popup.classList.contains('tutorial-popup')||!['ArrowLeft','ArrowRight'].includes(event.key)||(classroomBridge&&!classroomBridge.active))return;event.preventDefault();moveTutorial(event.key==='ArrowLeft'?-1:1);});
popup.addEventListener('close',()=>{assessmentRequest?.abort();assessmentRequest=null;galleryCraft?.dispose();galleryCraft=null;galleryOriginal=null;});
function closePopup(){galleryCraft?.dispose();galleryCraft=null;galleryOriginal=null;popup.close();popup.replaceChildren();popup.removeAttribute('aria-labelledby');}
function explain(){if(!save())return;showPopup(explainMarkup(work),'explanation-popup');}

function result(){closePopup();setView('reaction');}

function showFinishedWork(id){const original=state.gallery.find(w=>w.id===id);if(!original)return;const copy=structuredClone(original);copy.step=4;showPopup(`<h2>${esc(copy.title||modelName(copy))}</h2><div class="finished-preview" id="finished-preview"></div><p class="tip">그림을 좌우로 드래그하거나 회전 화살표로 살펴봐요. 회전 원화가 없는 예시는 한 방향으로 보여요.</p><button class="small-button" data-action="download-view">지금 보는 방향 사진 저장 ↓</button>`,'finished-popup');galleryOriginal=original;galleryCraft=new Craft2D(()=>{},()=>{},()=>toast('그림을 불러오지 못했어요.'));galleryCraft.mount(document.querySelector('#finished-preview'),copy,'finished');}
function gallery(){const list=state.gallery.slice(galleryPage*2,galleryPage*2+2);showPopup(`<h2>나의 작품 선반</h2><div class="gallery-grid">${list.map(w=>`<article><img src="${esc(w.preview||'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(vesselSVG({shape:w.shape,placements:w.placements,pattern:w.pattern,technique:w.technique,uid:'legacy'})))}" alt="${esc(w.title||modelName(w))}" onerror="this.style.visibility='hidden'"><h3>${esc(w.title||modelName(w))}</h3><p>${evaluateWork(w).total}점</p><button class="small-button" data-gallery-view="${w.id}">작품 살펴보기</button><button class="small-button" data-download="${w.id}">사진 저장</button></article>`).join('')||'<p>첫 작품을 기다리고 있어요.</p>'}</div><div class="popup-actions"><button class="small-button" data-gallery-page="${galleryPage-1}" ${galleryPage?'':'disabled'}>←</button><span>${galleryPage+1} / ${Math.max(1,Math.ceil(state.gallery.length/2))}</span><button class="small-button" data-gallery-page="${galleryPage+1}" ${(galleryPage+1)*2<state.gallery.length?'':'disabled'}>→</button></div>`,'gallery-popup');}
async function showModel(id=work?.modelId||'pillow'){if(!getModelArtifact(id))id='pillow';selectedCatalog=id;const token=++modelToken;if(!museum.open)museum.showModal();document.querySelector('#model-tabs').innerHTML=`<label for="catalog-select">관찰할 예시<select id="catalog-select">${MODEL_CATALOG.map(m=>`<option value="${m.id}" ${m.id===id?'selected':''}>${esc(m.shortName)}</option>`).join('')}</select></label>`;const container=document.querySelector('#model-viewer');modelModule?.disposeArtifact(container);try{modelModule??=await import('./model-viewer.js');if(token!==modelToken||!museum.open)return;await modelModule.openArtifact(container,id);readableText(museum);}catch{container.textContent='자료를 불러오지 못했어요. 다시 선택해 주세요.';}}
function closeMuseum(){++modelToken;modelModule?.disposeArtifact(document.querySelector('#model-viewer'));museum.close();}
museum.addEventListener('cancel',()=>{++modelToken;modelModule?.disposeArtifact(document.querySelector('#model-viewer'));});
function fire(kind){if(busy)return;const next=FIRING[work.firing.length];if(!next)return;if(kind!==next.id){toast(`${next.name}부터 해주세요. ${next.description}`);return;}if(craft?.el.dataset.status!=='ready'){toast('청자를 불러오는 중이에요. 잠시 후 다시 눌러 주세요.');return;}const workSurface=craft.exportWorkSurface();if(!workSurface)return;busy=true;document.querySelectorAll('[data-fire]').forEach(b=>b.disabled=true);mini=new KilnGame(document.querySelector('#minigame-host'),kind,{workSurface,workbench:craft.el,controlsHost:document.querySelector('.kiln-scene .station-info'),onComplete:()=>{if(expireGameData()||!work)return;busy=false;mini=null;work.firing.push(kind);if(!save())return;render();toast(`${next.name} 성공!`);},onCancel:()=>{busy=false;mini=null;render();}});}
async function download(w=work){if(!w)return;const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=1250;const c=canvas.getContext('2d');c.fillStyle='#fff8e8';c.fillRect(0,0,1000,1250);c.fillStyle='#245a48';c.textAlign='center';c.font='bold 42px sans-serif';c.fillText('좋은 청자 위대한 청자',500,90);c.font='26px sans-serif';c.fillText(w.title||modelName(w),500,145);const img=new Image();img.src=w.preview||(w===work?craft?.snapshot():'');try{await img.decode();c.drawImage(img,230,170,540,540);}catch{}c.textAlign='left';c.font='24px sans-serif';let y=790;for(const line of ['쓰임: '+w.explanationUse,'솜씨: '+w.explanationBeauty]){let current='';for(const char of line){if(c.measureText(current+char).width>840){c.fillText(current,80,y);y+=36;current='';}current+=char;}c.fillText(current,80,y);y+=70;}c.font='20px sans-serif';c.fillText(`학습 점검 ${evaluateWork(w).total}점 · 손끝으로 만든 고려의 아름다움`,80,1170);const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=`청자_${modelName(w)}.png`;a.click();}
async function submitWork(){
 if(expireGameData()||!work||assessmentRequest||(classroomBridge&&!classroomBridge.active))return;
 if(!work.title?.trim()){
  const input=popup.querySelector('#work-title'),feedback=popup.querySelector('#title-feedback');
  if(feedback){feedback.textContent='작품에 붙이고 싶은 이름을 적어 주세요.';feedback.hidden=false;}
  input?.setAttribute('aria-invalid','true');input?.focus();return;
 }
 const id=work.id,controller=new AbortController();assessmentRequest=controller;
 const button=popup.querySelector('[data-action=submit]');if(button){button.disabled=true;button.textContent='작품 설명을 확인하고 있어요…';}
 popup.querySelectorAll('textarea,input,select').forEach(el=>el.disabled=true);
 try{
  const assessment=await requestAssessment(work,{signal:controller.signal});
  if(expireGameData()||controller.signal.aborted||work?.id!==id||!popup.open||(classroomBridge&&!classroomBridge.active))return;
  work.assessment=assessment;if(!save())return;
  if(!assessment.accepted){showPopup(explainMarkup(work),'explanation-popup needs-revision');popup.querySelector(assessment.use.score<5?'#explain-use':'#explain-beauty')?.focus();return;}
  work.step=4;work.preview=craft?.snapshot()||work.preview;const at=state.gallery.findIndex(w=>w.id===work.id);if(at>=0)state.gallery[at]=structuredClone(work);else state.gallery.unshift(structuredClone(work));state.gallery=state.gallery.slice(0,60);if(!save())return;result();void classroomBridge?.completed(work);
 }catch(error){if(error.name!=='AbortError')toast('설명을 확인하지 못했어요. 다시 눌러 주세요.');}
 finally{if(assessmentRequest===controller)assessmentRequest=null;popup.querySelectorAll('textarea,input,select,[data-action=submit]').forEach(el=>el.disabled=false);}
}
async function action(id){
 if(expireGameData())return;
 if(classroomBridge&&!classroomBridge.active)return;
 if(busy&&id!=='fullscreen'){toast('가마 작업을 마치거나 작업대로 돌아가 주세요.');return;}
 if(['start','new-order','confirm-new-order'].includes(id)&&!tutorialSeen){showTutorial(id);return;}
 switch(id){
 case'accept':if(customerArrival?.workId===work?.id&&!customerArrival.done)return;work.accepted=true;setView(work.clay?.prepared?'game':'clay');break;
 case'clay-ready':if(work.clay?.prepared)setView('game');break;
 case'clay-yard':restartFrom(work,'clay');setView('clay');break;
 case'clay-help':showPopup('<h2>몸통 흙과 무늬 흙</h2>'+CLAYS.map(c=>`<div class="guide-card"><h3>${c.name}</h3><p>${c.description}</p></div>`).join(''));break;
 case'back-counter':restartFrom(work,'clay');work.accepted=false;setView('counter');break;
 case'station-back':{const target=work.step===2?'decorate':work.step===1?'shape':'clay';restartFrom(work,target);choosingVariant=false;setView(target==='clay'?'clay':'game');break;}
 case'back-inlay-carve':restartFrom(work,'decorate');setView('game');break;
 case'back-inlay-fill':restartInlay(work);beginInlay(work);if(!save())return;render();break;
 case'inspection-finish':if(work.inspection.done)setView('counter-delivery');break;
 case'home':clearToast();screen='cover';choosingVariant=false;render();break;
 case'start':closePopup();begin();break;
 case'new-order':if(canResume()){const pending=ORDERS.find(o=>o.id===state.draft.orderId);showPopup(`<h2>새 주문을 받을까요?</h2><p>진행 중인 「${esc(pending?.title||'주문')}」 작업은 더 이어서 할 수 없어요.<br>작품함에 저장한 완성품은 그대로 남아요.</p><div class="popup-actions"><button class="small-button" data-action="start">하던 작업 이어하기</button><button class="primary green" data-action="confirm-new-order">새 주문 받기</button></div>`,'confirm-popup');}else begin(true);break;
 case'confirm-new-order':closePopup();begin(true);break;
 case'tutorial-prev':moveTutorial(-1);break;case'tutorial-next':moveTutorial(1);break;
 case'tutorial-start':{if(!pendingEntry||tutorialSession?.index!==TUTORIAL_STEPS.length-1||!tutorialSession.understood||!popup.querySelector('#tutorial-understood')?.checked)return;const entry=pendingEntry;pendingEntry=null;tutorialSession=null;tutorialSeen=true;closePopup();await action(entry);break;}
 case'close-popup':pendingEntry=null;tutorialSession=null;assessmentRequest?.abort();assessmentRequest=null;closePopup();break;
 case'close-museum':closeMuseum();break;case'museum':await showModel();break;
 case'reference':await showModel(order().exampleId||work.modelId||'pillow');break;
 case'variants':choosingVariant=!choosingVariant;render();break;
 case'gallery':galleryPage=0;gallery();break;
 case'guide':showTutorial();break;
 case'order':showPopup(`<h2>${esc(order().title)}</h2><p class="order-quote">${esc(orderQuote(order()))}</p><p>${esc(order().hint)}</p><button class="primary green order-reference" data-action="reference">참고 예시 살펴보기</button>`);break;
 case'technique-info':showPopup('<h2>상감 · 투각 · 무문</h2>'+TECHNIQUES.map(t=>`<div class="guide-card"><h3>${t.name}</h3><p>${t.description}</p></div>`).join(''));break;
 case'next-shape':if(work.knead<3&&!work.sculpt?.complete)return;work.step=1;if(!save())return;render();break;
 case'stamp':craft?.stamp();break;
 case'undo':if(work.tool==='draw'&&(work.strokes||[]).length)work.strokes.pop();else work.placements.pop();work.assessment=null;if(!save())return;render();break;
 case'inlay-fill':if(!work.placements.length&&!work.strokes.length)return;work.inlayMode='fill';work.decorPhase=1;beginInlay(work);if(!save())return;render();break;
 case'inlay-wipe':if(!inlayProgress(work).fillDone)return;work.inlayMode='wipe';if(!save())return;render();break;
 case'decorate':if(work.technique==='inlay'){await action('inlay-fill');return;}if(work.technique==='openwork'&&!work.placements.length&&!work.strokes.length)return;work.decorPhase=2;work.decorDone=true;if(!save())return;render();break;
 case'reset-decor':restartFrom(work,'decorate');if(!save())return;render();break;
 case'next-decor':if(!work.decorDone)return;work.step=2;if(!save())return;render();break;
 case'next-fire':if(work.firing.length!==4)return;work.preview=craft?.snapshot();work.step=3;work.inspection=newInspection();setView('inspection');break;
 case'explain':explain();break;case'submit':await submitWork();break;
 case'result':result();break;
 case'score-details':{const score=evaluateWork(work);showPopup(`<h2>작품을 살펴본 결과</h2>${score.breakdown.map(b=>`<div class="guide-card"><h3>${esc(b.label)} ${b.score}/${b.max}</h3><p>${esc(b.feedback)}</p></div>`).join('')}<p>${esc(work.assessment?.notice||'')}</p>`);break;}
 case'revise':closePopup();restartFrom(work,'shape');setView('game');break;
 case'next-customer':closePopup();state.draft=null;work=null;begin();break;
 case'download-view':if(galleryCraft&&galleryOriginal)await download({...galleryOriginal,preview:galleryCraft.snapshot()});break;
 case'download':await download();break;
 case'fullscreen':try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('이 환경에서는 전체 화면을 열 수 없어요.');}break;
 }
}
document.addEventListener('click',async e=>{if(expireGameData())return;const b=e.target.closest('button');if(!b||b.disabled)return;if(b.dataset.action){await action(b.dataset.action);return;}if(busy)return;if(b.dataset.clay){work.clay=chooseClay(work.clay||freshClay(),b.dataset.clay);if(!save())return;render();toast(CLAYS.find(c=>c.id===b.dataset.clay).description);}else if(b.dataset.shape){setShape(b.dataset.shape);if(!work)return;choosingVariant=designsForShape(work.shape).length>1;if(choosingVariant)render();}else if(b.dataset.model){setShape(work.shape,b.dataset.model);}else if(b.dataset.slip){setInlaySlip(work,b.dataset.slip);work.assessment=null;if(!save())return;render();}else if(b.dataset.pattern){work.pattern=b.dataset.pattern;if(!save())return;render();}else if(b.dataset.galleryPage!==undefined){galleryPage=Number(b.dataset.galleryPage);gallery();}else if(b.dataset.galleryView){showFinishedWork(b.dataset.galleryView);}else if(b.dataset.download){await download(state.gallery.find(w=>w.id===b.dataset.download));}else if(b.dataset.technique){if(work.technique!==b.dataset.technique){work.technique=b.dataset.technique;resetDecor();if(!save())return;render();}}else if(b.dataset.tool){work.tool=b.dataset.tool;if(!save())return;render();}else if(b.dataset.fire)fire(b.dataset.fire);else if(b.dataset.step!==undefined){const step=Number(b.dataset.step);if(step<=work.step&&work.step<4){restartFrom(work,step===0?'shape':step===1?'decorate':'kiln');if(!save())return;render();}}});
document.addEventListener('change',async e=>{if(expireGameData())return;const el=e.target;if(el.id==='tutorial-understood'){if(tutorialSession)tutorialSession.understood=el.checked;const start=popup.querySelector('[data-action=tutorial-start]');if(start)start.disabled=!el.checked;return;}if(el.id==='catalog-select'){await showModel(el.value);return;}if(busy||!work)return;if(el.id==='shape-select'){if(el.value)setShape(el.value);}else if(el.id==='variant-select')setShape(work.shape,el.value);else if(el.id==='pattern-select'){work.pattern=el.value;if(!save())return;render();}else if(el.id==='drawing-label'){work.drawingLabel=el.value;save();}else if(el.dataset.check){work[el.dataset.check]=el.checked;save();}});
document.addEventListener('input',e=>{if(expireGameData())return;const el=e.target;if(!work||busy)return;if(el.id==='stamp-size'){
 if(work.step!==1||work.decorPhase!==0||work.technique==='plain'||(work.tool||'stamp')!=='stamp')return;
 work.stampSize=normalizeStampSize(Number(el.value)/100);const percent=Math.round(work.stampSize*100);el.value=String(percent);el.setAttribute('aria-valuetext',percent+'%');const output=document.querySelector('#stamp-size-value');if(output)output.value=percent+'%';if(!save())return;if(craft){craft.work=work;craft.dirty=true;}
}else if(el.dataset.field){work[el.dataset.field]=el.value;work.assessment=null;if(el.id==='work-title'){el.removeAttribute('aria-invalid');const feedback=popup.querySelector('#title-feedback');if(feedback)feedback.hidden=true;}save();}else if(el.id==='width'){const ratio=(Number(el.value)/100)/(work.width||1);work.width=Number(el.value)/100;for(const mark of [...work.placements,...(work.strokes||[]).flatMap(s=>s.points)])if(mark.point){mark.point[0]*=ratio;if(mark.normal){const [x,y,z]=mark.normal,n=Math.hypot(x/ratio,y,z)||1;mark.normal=[x/ratio/n,y/n,z/n];}}if(craft){craft.work=work;craft.deform();craft.fitCamera();if(sculpt){sculpt.resize();craft.setSculptGuide(sculpt.guide);}craft.paint();}save();}});
let retentionSweep=setInterval(()=>expireGameData(true),60_000);
window.addEventListener('focus',()=>expireGameData(true));
window.addEventListener('pageshow',()=>{expireGameData(true);scheduleExpiration();clearInterval(retentionSweep);retentionSweep=setInterval(()=>expireGameData(true),60_000);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)expireGameData(true);});
window.addEventListener('pagehide',()=>{customerArrival?.dispose();clearInterval(retentionSweep);clearTimeout(retentionTimer);assessmentRequest?.abort();clayGame?.dispose();inlayGame?.dispose();inspectionGame?.dispose();galleryCraft?.dispose();mini?.dispose();sculpt?.dispose();craft?.dispose();classroomBridge?.dispose();});

function setView(view){if(expireGameData()||!work)return;clearToast();screen=view;work.stationView=view;if(!save())return;render();}
function counterScreen(){const customer=castForOrder(order(),work?.customerId),done=work.step===4,delivery=screen==='counter-delivery',arriving=!delivery&&customerArrival?.workId===work.id&&!customerArrival.done;return `<section class="counter-scene" ${arriving?`data-customer-arrival="${customerArrival.phase}"`:''}><div class="counter-person">${characterMarkup(customer.id)}</div>${arriving?walkingCustomerMarkup(customer.id):''}<div class="counter-dialogue" ${arriving?'inert':''}><div class="counter-speech"><span>${customer.name}${delivery?(done?'의 답장':'의 질문'):'의 주문'}</span><p>${delivery?(done?'정성껏 빚은 청자를 잘 받았소. 고맙소!':'청자가 완성되었구려! 어떤 모양과 무늬로 빚고, 어디에 쓰면 좋을지 들려주시오.'):esc(orderQuote(order()))}</p></div><div class="counter-responses">${delivery?`<button class="primary" data-action="${done?'result':'explain'}">${done?'답장 확인':'작품 이야기 전하기'}</button>${done?'<button class="primary green" data-action="next-customer">다음 손님 →</button>':''}`:`<button class="primary green" data-action="accept" ${arriving?'disabled':''}>알겠어요</button><button class="small-button" data-action="order" ${arriving?'disabled':''}>주문 다시 살피기</button>`}</div></div><div class="counter-front"><div class="desk-props" aria-hidden="true"><img class="desk-ink" src="./assets/scenes/desk-ink-tidy.webp" alt=""></div><button class="counter-order reference-book" data-action="reference" aria-label="청자 도감 펼치기"><img src="./assets/scenes/desk-reference-book.webp" alt=""><span>청자 도감</span></button></div>${delivery&&work.shape?'<div class="counter-piece"><div id="workpiece" class="workpiece"></div></div>':''}</section>`;}

scheduleExpiration();
render();
classroomBridge=createClassroomGameBridge({
 onPause:()=>{
  if(tutorialSession&&popup.open&&popup.classList.contains('tutorial-popup'))tutorialSession.paused=true;
  customerArrival?.pause();
  assessmentRequest?.abort();assessmentRequest=null;clearToast();save();
  mini?.dispose();mini=null;busy=false;
  sculpt?.dispose();sculpt=null;clayGame?.dispose();clayGame=null;inlayGame?.dispose();inlayGame=null;inspectionGame?.dispose();inspectionGame=null;
  craft?.dispose();craft=null;closePopup();closeMuseum();
 },
 onResume:()=>{expireGameData(true);render();if(tutorialSession?.paused){tutorialSession.paused=false;showTutorial(tutorialSession.entry,{restore:true});}},
 getCompleted:()=>{expireGameData();return state.gallery;},
 isCurrent:w=>{expireGameData();return state.gallery.some(saved=>saved.id===w.id);},
 getExpiresAt:()=>state.retentionStartedAt+GAME_DATA_TTL_MS,
 previewSource:w=>w.preview||'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(vesselSVG({shape:w.shape,placements:w.placements,pattern:w.pattern,technique:w.technique,uid:'classroom'})),
});
