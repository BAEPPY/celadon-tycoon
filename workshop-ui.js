import {SHAPES,ORDERS,TECHNIQUES,PATTERNS,FIRING,evaluateWork} from './domain.js';
import {getModelArtifact} from './models-manifest.js';
import {designsForShape} from './example-orders.js';
import {ROTATION_IDS} from './rotation-rules.js';
import {clayLumpSVG} from './clay.js';
import {motifPath} from './motif-paths.js';
import {inlayProgress} from './inlay-game.js';
import {motifLabel} from './naming.js';
import {normalizeStampSize} from './motif-size.js';
import {explanationHints} from './assessment.js';
import {reactionMarkup} from './characters.js';
import {customerReview} from './dialogue.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sel=(a,b)=>a===b?' selected':'';
const modelName=w=>getModelArtifact(w?.modelId||w?.shape)?.shortName||'새 청자';
const defaultModel=shape=>designsForShape(shape).find(d=>ROTATION_IDS.includes(d.modelId))?.modelId||designsForShape(shape)[0]?.modelId;

export function orderSummary(work) {
  const o=ORDERS.find(o=>o.id===work.orderId);if(!o)return '';
  const motifs=o.requiredPatterns||(o.pattern==='any'?[]:[o.pattern]);
  return `<aside class="order-summary" aria-label="주문 요약"><h3>오늘의 주문</h3><dl><dt>모양</dt><dd>${esc(o.modelId?getModelArtifact(o.modelId)?.shortName:SHAPES.find(s=>s.id===o.shape)?.name.replace('청자 ',''))}</dd><dt>기법</dt><dd>${{inlay:'상감',openwork:'투각',plain:'무문',any:'자유롭게'}[o.technique]}</dd><dt>무늬</dt><dd>${o.technique==='plain'?'새 무늬 없음':motifs.length?esc(motifs.map(motifLabel).join(' · ')):'자유롭게'}</dd></dl><button class="text-button" data-action="order">주문 전체 보기</button></aside>`;
}
function heading(title){return `<header class="station-heading"><span>${title}</span><button class="small-button" data-action="order">주문서 보기</button></header>`;}
export function clayMarkup(work) {
 const s=work.clay;
 return `<section class="station-scene clay-scene">${heading('흙 준비하는 곳')}<div class="station-rack clay-rack automatic-clay"><span class="prepared-clay-icon" aria-hidden="true">●</span><div><strong>태토가 준비됐어요</strong><p>흙을 꼭꼭 누르며 공기를 빼요.</p></div><div class="knead-counts" aria-label="반죽 여섯 번">${Array.from({length:6},(_,i)=>`<i class="${i<s.kneads?'done':''}">${i+1}</i>`).join('')}</div></div><aside class="station-info"><h2>흙을 반죽해요</h2><p>흙을 누르거나 좌우로 밀어 공기를 빼주세요.</p><p>여섯 번 고르게 반죽하면 다음 작업대로 갈 수 있어요.</p><button class="text-button" data-action="clay-help">흙의 쓰임 알아보기</button></aside>${orderSummary(work)}<div class="kneading-area"><div class="knead-pad ${s.prepared?'prepared':''}" role="application" aria-label="흙을 누르거나 좌우로 밀어 반죽해요. 스페이스바로도 반죽할 수 있어요." tabindex="0" data-kneads="${s.kneads}">${clayLumpSVG()}</div><div class="sculpt-progress" id="clay-progress"><i style="width:${s.kneads/6*100}%"></i></div><p id="clay-status" role="status">${s.prepared?'공기를 빼고 고르게 반죽했어요.':`꼭꼭 반죽하기 ${s.kneads}/6`}</p></div><nav class="station-nav"><button class="small-button" data-action="back-counter">← 손님에게</button><button class="primary green" data-action="clay-ready" ${s.prepared?'':'disabled'}>모양 빚으러 가기 →</button></nav></section>`;
}
const tip={inlay:'무늬를 파고 흰 흙이나 검은 흙을 채운 뒤, 겉을 닦아 무늬를 드러내요.',openwork:'도자기의 벽을 뚫어 구멍으로 무늬를 나타내요. 구멍 안에는 반대편 벽이 보여요.',plain:'새 무늬를 넣지 않고 도자기 자체의 모양과 푸른빛을 살려요.'};
function techniqueChoices(work){return `<div class="rack-techniques">${TECHNIQUES.map(t=>`<div class="technique-option"><button class="small-button${sel(work.technique,t.id)}" data-technique="${t.id}">${t.id==='plain'?'무문':t.name}</button><div class="technique-help"><button class="help-dot" aria-label="${t.id==='plain'?'무문':t.name} 설명" aria-describedby="tip-${t.id}">?</button><span class="technique-tooltip" role="tooltip" id="tip-${t.id}">${tip[t.id]}</span></div></div>`).join('')}</div>`;}
function patternIcon(id){return `<svg viewBox="-125 -125 250 250" aria-hidden="true"><path d="${motifPath(id)}" fill="none" stroke="currentColor" stroke-width="9" stroke-linejoin="round" stroke-linecap="round"/></svg>`;}
function variants(work){return `<div class="variant-shelf" role="group" aria-label="세부 형태 고르기"><h3>${SHAPES.find(s=>s.id===work.shape)?.name.replace('청자 ','')}의 모양을 골라요</h3><div class="variant-options">${designsForShape(work.shape).map(d=>`<button class="variant-card${sel(work.modelId,d.modelId)}" data-model="${d.modelId}"><img src="./assets/vessels/${d.modelId}.webp" alt=""><span>${esc(getModelArtifact(d.modelId).shortName)}</span></button>`).join('')}</div></div>`;}
export function stationMarkup(work,{choosingVariant=false}={}) {
 const complete=work.sculpt?.complete||work.knead>=3,mode=work.inlayMode,t=work.technique,phase=work.decorPhase,progress=inlayProgress(work);let rack='',info='',tools='',title='',next='',label='',enabled=false,back='station-back',backLabel='이전 작업대',classes='';
 if(work.step===0){
  title='모양 빚는 작업대';classes='shaping-scene';next='next-shape';label='무늬 작업대로 →';enabled=complete&&!choosingVariant;backLabel='흙 준비';
  rack=`<div class="shape-trays">${SHAPES.map(s=>`<button class="tray-bin shape-bin${sel(work.shape,s.id)}" data-shape="${s.id}" aria-pressed="${work.shape===s.id}"><img src="./assets/vessels/${defaultModel(s.id)||s.id}.webp" alt=""><span>${s.name.replace('청자 ','')}</span></button>`).join('')}</div><div class="shape-family"><span>${esc(work.shape?modelName(work):'큰 분류부터 골라요')}</span><button class="small-button" data-action="variants" ${work.shape?'':'disabled'}>모양 다시 고르기</button></div>`;
  info=`<h2>${choosingVariant?'세부 모양을 골라요':'목표 모양을 빚어요'}</h2><p>${esc(work.shape?modelName(work):'위에서 만들 물건을 골라요.')}</p><p>${choosingVariant?'펼쳐진 그림 중 만들고 싶은 모양을 눌러요.':'흙을 잡아 원하는 방향으로 자유롭게 늘리고 눌러요.'}</p><p class="sculpt-goal">목표 모양과 <b>90%</b> 이상<br>맞추면 통과!</p><div class="sculpt-progress"><i style="width:${complete?100:(work.sculpt?.fraction||0)*100}%"></i></div><p id="sculpt-status" role="status">${complete?'통과! 목표 모양 완성':`모양 일치 ${Math.floor((work.sculpt?.fraction||0)*100)}% · 목표 90%`}</p><label class="width-control">너비<input id="width" type="range" min="85" max="115" value="${Math.round((work.width||1)*100)}" ${work.shape?'':'disabled'}></label>`;
 }else if(work.step===1){
  const finishing=t==='inlay'&&mode;
  classes=finishing?'inlay-scene':'decoration-scene';
  if(finishing){
   const wiping=mode==='wipe'||mode==='done';title=wiping?'겉의 색흙 닦아내기':'색흙 채우기';next=wiping?'next-decor':'inlay-wipe';label=wiping?'가마 작업대로 →':'닦아내기 →';enabled=wiping?work.decorDone:progress.fillDone;back=wiping?'back-inlay-fill':'back-inlay-carve';backLabel=wiping?'색흙 채우기':'무늬 넣기';
   rack=`<div class="inlay-choices">${[['white','흰 색흙','백토','#f3e9d2'],['dark','검은 색흙','자토','#514345']].map(([id,name,sub,color])=>`<button class="inlay-choice${sel(work.clay?.slip,id)}" data-slip="${id}" ${wiping?'disabled':''}><i class="soil-swatch" style="--clay-color:${color}"></i><span>${name}<small>${sub}</small></span></button>`).join('')}</div>`;
   const n=wiping?progress.wipe:progress.fill;
   info=`<h2>${wiping?'스펀지로 쓱쓱 닦아요':'색흙으로 무늬를 채워요'}</h2><p>${wiping?'겉에 묻은 흙을 닦으면 파인 무늬 속 색흙만 남아요.':'위에서 흰색이나 검은색을 고르고, 무늬 위를 붓으로 문질러요.'}</p><p>도자기를 돌려 가며 모든 무늬를 살펴요.</p><div class="inlay-progress"><i style="width:${n*100}%"></i></div><p class="inlay-status" role="status">${Math.floor(n*100)}% ${wiping?'닦았어요':'채웠어요'}</p><p class="inlay-keyboard">방향키로 위치 고르기 · Enter로 문지르기</p>`;
  }else{
   title='무늬 넣는 작업대';next=work.decorDone?'next-decor':t==='inlay'?'inlay-fill':'decorate';label=work.decorDone?'가마 작업대로 →':t==='inlay'?'색흙 채우기 →':t==='openwork'?'구멍 가장자리 다듬기 →':'표면 다듬기 →';enabled=t==='plain'||Boolean(work.placements.length||work.strokes.length);if(work.decorDone)enabled=true;
   rack=`<div class="pattern-trays">${PATTERNS.map(p=>`<button class="tray-bin pattern-bin${sel(work.pattern,p.id)}" data-pattern="${p.id}" ${phase>0||t==='plain'?'disabled':''} aria-label="${esc(motifLabel(p))}">${patternIcon(p.id)}<span>${p.name}${p.reading!==p.name?`<small>(${p.reading})</small>`:''}</span></button>`).join('')}</div>${techniqueChoices(work)}`;
   info=`<h2>${t==='plain'?'무문':TECHNIQUES.find(x=>x.id===t).name}</h2><p>${tip[t]}</p>${t==='plain'?'<p>오리·기린 같은 형태는 모양 빚기에서 골라요.</p>':'<p>무늬를 넣은 뒤 오른쪽 아래 화살표로 다음 순서를 진행해요.</p>'}${work.decorDone?'<button class="text-button" data-action="reset-decor">무늬 처음부터 다시</button>':''}`;
   if((work.tool||'stamp')==='stamp'&&t!=='plain'&&phase===0){const percent=Math.round(normalizeStampSize(work.stampSize)*100);info+=`<div class="stamp-size-control"><label for="stamp-size">찍을 무늬 크기 <output id="stamp-size-value" for="stamp-size">${percent}%</output></label><input id="stamp-size" type="range" min="50" max="175" step="5" value="${percent}" aria-describedby="stamp-size-hint" aria-valuetext="${percent}%"><p id="stamp-size-hint">도자기 위에서 크기를 살펴보고 찍어요.</p></div>`;}
   if(work.tool==='draw'&&t!=='plain') info+=`<label class="drawing-meaning" for="drawing-label">그림의 뜻<select id="drawing-label"><option value="">무엇을 그렸나요?</option>${PATTERNS.map(p=>`<option value="${p.id}" ${work.drawingLabel===p.id?'selected':''}>${motifLabel(p)}</option>`).join('')}</select></label>`;
   tools=`<div class="hand-tools">${[['stamp','찍기','✿'],['draw','그리기','〰'],['rotate','돌려보기','↻']].map(([id,text,icon])=>`<button class="tool-tile${sel(work.tool||'stamp',id)}" data-tool="${id}" ${(phase>0||t==='plain')&&id!=='rotate'?'disabled':''}><i>${icon}</i>${text}</button>`).join('')}<button class="tool-tile" data-action="undo" ${phase>0||t==='plain'?'disabled':''}><i>↶</i>지우기</button></div>`;
  }
 }else{
  title='말리고 굽는 가마';classes='kiln-scene';next='next-fire';label='불량품 살펴보기 →';enabled=work.firing.length===4;
  rack=`<div class="firing-trays">${FIRING.map(f=>`<button class="tray-bin firing-bin ${work.firing.includes(f.id)?'done':''}" data-fire="${f.id}" ${work.firing.includes(f.id)?'disabled':''}><i>${{dry:'☀',biscuit:'♨',glaze:'◒',fire:'♨'}[f.id]}</i><strong>${f.name}</strong><small>${work.firing.includes(f.id)?'완료 ✓':{dry:'부채로 고르게 말리기',biscuit:'풀무질로 불 지키기',glaze:'붓으로 쓱쓱 칠하기',fire:'다시 불 지키기'}[f.id]}</small></button>`).join('')}</div>`;
  info='<p class="firing-order">건조 → 초벌 →<br>유약 → 재벌</p><p>순서대로 작업해요.</p>';
 }
 return `<section class="station-scene ${classes} ${choosingVariant?'is-choosing-variant':''}">${heading(title)}<div class="station-rack">${rack}</div><aside class="station-info">${info}</aside>${orderSummary(work)}<div class="station-workspace"><div id="workpiece" class="workpiece">${work.shape?'':`<div class="empty-clay">${clayLumpSVG()}<p>어떤 형태를 빚을까요?</p></div>`}</div><div id="minigame-host"></div></div>${choosingVariant?variants(work):''}${tools}<nav class="station-nav"><button class="small-button" data-action="${back}">← ${backLabel}</button><button class="primary green" data-action="${next}" ${enabled?'':'disabled'}>${label}</button></nav></section>`;
}

export function explainMarkup(work) {
 const hints=explanationHints(work),feedback=work.assessment;
 return `<h2>내 작품을 소개해요</h2><div class="name-workshop"><label class="field-label" for="work-title">청자의 이름을 지어요</label><input id="work-title" data-field="title" maxlength="60" value="${esc(work.title||'')}" placeholder="내가 지은 작품 이름" aria-label="내 청자 이름" aria-describedby="naming-hint title-feedback" required><p class="naming-tip" id="naming-hint">재료 · 만드는 방법 · 무늬 · 모양을 떠올리며 이름을 지어 보세요.</p><p id="title-feedback" class="title-feedback" role="alert" hidden></p></div><div class="explanation-fields"><div><label class="field-label" for="explain-use">어떤 모양과 문양으로 만들었나요?<br>어디에 쓰면 좋을지 설명해 주세요.</label><textarea id="explain-use" data-field="explanationUse" maxlength="300" placeholder="${esc(hints.use)}">${esc(work.explanationUse)}</textarea><p class="explanation-feedback" id="use-feedback" role="status">${esc(feedback?.use?.feedback||'만든 모양·무늬와 어울리는 쓰임을 이야기해 주세요.')}</p></div><div><label class="field-label" for="explain-beauty">어느 부분에 가장 공을 들였나요?<br>어떻게 만들었는지 이야기해 주세요.</label><textarea id="explain-beauty" data-field="explanationBeauty" maxlength="300" placeholder="${esc(hints.beauty)}">${esc(work.explanationBeauty)}</textarea><p class="explanation-feedback" id="beauty-feedback" role="status">${esc(feedback?.beauty?.feedback||'공들인 부분이나 사용한 기법을 짧게 이야기해 주세요.')}</p></div></div><p class="assessment-notice" role="status">${esc(feedback?.notice||'작품에 맞는 내용을 짧게 적어도 괜찮아요.')}</p><button class="primary green" data-action="submit">설명을 전하고 평가받기 →</button>`;
}
export function reviewMarkup(work) {
 const score=evaluateWork(work),review=customerReview(ORDERS.find(o=>o.id===work.orderId),score,work);
 return `<section class="customer-review-scene" data-mood="${review.mood}"><div class="counter-front"><div class="desk-props" aria-hidden="true"><img class="desk-ink" src="./assets/scenes/desk-ink-tidy.webp" alt=""></div><button class="counter-order reference-book" data-action="reference" aria-label="청자 도감 펼치기"><img src="./assets/scenes/desk-reference-book.webp" alt=""><span>청자 도감</span></button></div><div class="review-person">${reactionMarkup(review.character,review.mood)}</div><div class="review-dialogue"><div class="review-speech"><p class="review-speaker">${esc(work.title||'나의 청자')}에 대한 답장</p><h2>${esc(review.headline)}</h2><p class="review-quote">${esc(review.quote)}</p><p class="review-detail">${esc(review.detail)}</p></div><div class="review-score"><strong>${score.total}점</strong><span>주문·제작 ${score.objective}/80 · 설명 ${score.self}/20</span><button class="text-button" data-action="score-details">평가 자세히</button></div><div class="review-actions"><button class="small-button" data-action="revise">다시 빚기</button><button class="small-button" data-action="download">작품 사진 저장</button><button class="primary green" data-action="next-customer">다음 손님 →</button></div></div></section>`;
}
