import {Craft2D} from './craft-2d.js';

const KINDS=Object.freeze(['sound','crack','warped','glaze']);
const FEEDBACK=Object.freeze({sound:'금이나 기울어짐이 없고 유약도 고른 청자예요. 이 한 점을 남겨야 해요.',crack:'몸통에 금이 있어 물이 새거나 더 깨질 수 있어요.',warped:'몸통과 입이 기울고 균형이 흐트러졌어요.',glaze:'유약이 벗겨진 듯한 거친 갈색 부분이 보여요.'});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function shuffled(rng){const items=[...KINDS];for(let i=items.length-1;i>0;i--){const n=Number(rng()),j=Number.isFinite(n)?Math.min(i,Math.max(0,Math.floor(n*(i+1)))):0;[items[i],items[j]]=[items[j],items[i]];}return items;}
export function newInspection(rng=Math.random){return {version:2,items:shuffled(rng),broken:[],failed:false,done:false,attempts:0,lastBroken:null,index:0,correct:0,answer:null};}
export function normalizeInspection(value,rng=Math.random){
 if(!value||!Array.isArray(value.items)||value.items.length!==4||new Set(value.items).size!==4||value.items.some(k=>!KINDS.includes(k)))return newInspection(rng);
 if(value.version!==2){const next=newInspection(rng);next.items=[...value.items];if(value.done){next.broken=next.items.flatMap((kind,i)=>kind==='sound'?[]:[i]);next.done=true;next.correct=3;}return next;}
 const broken=[...new Set((Array.isArray(value.broken)?value.broken:[]).filter(i=>Number.isInteger(i)&&i>=0&&i<4))];
 const failed=broken.some(i=>value.items[i]==='sound'),correct=broken.filter(i=>value.items[i]!=='sound').length;
 return {...value,version:2,items:[...value.items],broken,failed,done:!failed&&correct===3,correct,attempts:Math.max(0,Number(value.attempts)||0)};
}
export function smashSample(value,index){
 const state=normalizeInspection(value);
 if(state.failed||state.done||!Number.isInteger(index)||index<0||index>3||state.broken.includes(index))return state;
 const broken=[...state.broken,index],failed=state.items[index]==='sound',correct=broken.filter(i=>state.items[i]!=='sound').length;
 return {...state,broken,failed,done:!failed&&correct===3,correct,lastBroken:index,answer:{kind:state.items[index],correct:!failed,feedback:FEEDBACK[state.items[index]]}};
}
export function retryInspection(value,rng=Math.random){const state=normalizeInspection(value);return {...newInspection(rng),attempts:state.attempts+1};}

// Compatibility for earlier saved lessons and archived sequential-classification tests.
export function classifySample(state,bin){if(state.done||state.answer||!['deliver','hold'].includes(bin))return {...state};const kind=state.items[state.index],correct=(kind==='sound')===(bin==='deliver');return {...state,answer:{kind,correct,feedback:FEEDBACK[kind]},correct:state.correct+(correct?1:0)};}
export function nextSample(state){if(!state.answer)return {...state};return state.index===state.items.length-1?{...state,done:true}:{...state,index:state.index+1,answer:null};}
export function sampleMarkup(kind,preview){return `<div class="sample-image ${esc(kind)}" data-sample-kind="${esc(kind)}"><img src="${esc(preview)}" alt="청자"></div>`;}
function hammer(){return '<svg viewBox="0 0 110 155" aria-hidden="true"><path d="M53 50L40 139Q42 149 52 145L67 55" fill="#c49261" stroke="#795a4a" stroke-width="4"/><path d="M53 64L45 131" fill="none" stroke="#e7bd87" stroke-width="4" stroke-linecap="round"/><path d="M16 17Q15 11 23 9L83 13Q92 16 91 25L88 53Q87 60 80 61L19 54Q12 52 13 44Z" fill="#b88b69" stroke="#795a4a" stroke-width="4"/><path d="M25 14L22 50M78 17L75 56" stroke="#e7c29a" stroke-width="5"/><path d="M32 23L65 27M30 39L61 43" stroke="#946a4f" stroke-width="2" stroke-linecap="round"/></svg>';}
function shards(){return Array.from({length:14},(_,i)=>{const x=((i*37)%101)-50,y=((i*19)%35)-17,turn=((i*61)%180)-90;return `<i class="ceramic-shard" style="--shard-x:${x}px;--shard-y:${y}px;--shard-turn:${turn}deg;--shard-delay:${(i%4)*12}ms;--shard-size:${15+(i%4)*5}px;--shard-light:${i%3===0?'#d7e0b8':i%3===1?'#9cb592':'#6f947e'}"></i>`;}).join('');}
export function inspectionMarkup(work){
 const state=normalizeInspection(work.inspection);work.inspection=state;
 const preview=work.preview||`./assets/vessels/${/^[a-zA-Z]+$/.test(work.modelId||'')?work.modelId:'stool'}.webp`;
 return `<section class="station-scene inspection-scene four-inspection${state.done?' is-complete':''}${state.failed?' is-failed':''}"><header class="station-heading"><span>가장 잘 만든 한 점</span><button class="small-button" data-action="order">주문서 보기</button></header><div class="inspection-intro"><div><h2>${state.done?'흠 없는 청자 한 점을 남겼어요!':'장인의 눈으로 골라요'}</h2><p>${state.done?'고른 빛깔과 반듯한 모양을 잘 살폈어요.':'금·기울어짐·벗겨진 유약을 살펴보고,<br>흠이 있는 세 점을 망치로 깨뜨려요.'}</p></div><div class="inspection-tool-note">${hammer()}<span>흠이 있는 도자기를<br><b>눌러서 깨뜨리기</b></span></div></div><div class="inspection-lineup" aria-label="비교할 도자기 네 점">${state.items.map((kind,i)=>{const broken=state.broken.includes(i);return `<button class="inspection-pot${broken?' is-broken':''}${state.done&&!broken?' is-kept':''}" data-inspect-index="${i}" data-sample-kind="${kind}" aria-label="${i+1}번 도자기${broken?' · 깨진 조각':'를 살피고 망치로 깨뜨리기'}" ${broken||state.failed||state.done?'disabled':''}><span class="inspection-pot-art"><img src="${esc(preview)}" alt="${i+1}번 청자" draggable="false"></span><span class="inspection-hammer">${hammer()}</span><span class="inspection-impact" aria-hidden="true">✦</span><span class="inspection-shards" aria-hidden="true">${shards()}</span><span class="inspection-pot-number">${broken?'깨진 조각':`${i+1}번`}</span>${state.done&&!broken?'<span class="inspection-kept-seal">남길 한 점 ✓</span>':''}</button>`;}).join('')}</div><p class="inspection-note" role="status">${state.done?'세 점을 골라내고 가장 잘 만든 청자를 남겼어요.':state.failed?'':'흠이 있는 청자 '+state.correct+' / 3점 골랐어요'}</p>${state.failed?`<div class="inspection-outcome is-failure" role="alert"><span class="inspection-outcome-spark" aria-hidden="true">앗!</span><h2>실패…</h2><p>흠 없는 청자를 깨뜨렸어요.<br>다시 골라볼까요?</p><button class="primary green" data-inspection-retry>다시 고르기 ↻</button></div>`:''}<nav class="station-nav inspection-navigation">${state.done?'<span>금·모양·유약을 모두 확인했어요.</span><button class="primary green" data-action="inspection-finish">손님께 돌아가기 →</button>':'<span></span><span class="inspection-shortcut">마우스 클릭 · Tab + Enter</span>'}</nav></section>`;
}

function cropBounds(data,width,height){let x=width,y=height,r=-1,b=-1;for(let yy=0;yy<height;yy++)for(let xx=0;xx<width;xx++)if(data[(yy*width+xx)*4+3]>48){x=Math.min(x,xx);y=Math.min(y,yy);r=Math.max(r,xx);b=Math.max(b,yy);}return r<0?{x:0,y:0,width,height}:{x,y,width:r-x+1,height:b-y+1};}
async function inspectionSource(work,signal){
 // Re-render the saved marks at source resolution. The saved preview is a
 // 512px-wide scene thumbnail, so cropping/enlarging it softens small vessels.
 if(work.modelId||work.shape){
  const renderer=new Craft2D(()=>{},()=>{},()=>{},()=>{},{readOnly:true}),dispose=()=>renderer.dispose();
  signal.addEventListener('abort',dispose,{once:true});
  try{
   await renderer.update({...structuredClone(work),step:3,tool:'rotate'},'finished');
   if(signal.aborted)throw new DOMException('Inspection closed','AbortError');
   const surface=renderer.exportWorkSurface()?.glazedImage;
   if(surface)return surface;
  }finally{signal.removeEventListener('abort',dispose);renderer.dispose();}
 }
 if(signal.aborted)throw new DOMException('Inspection closed','AbortError');
 const img=new Image();img.src=work.preview||`./assets/vessels/${/^[a-zA-Z]+$/.test(work.modelId||'')?work.modelId:'stool'}.webp`;await img.decode();return img;
}
async function copies(work,signal){
 const img=await inspectionSource(work,signal);
 if(signal.aborted)throw new DOMException('Inspection closed','AbortError');
 const raw=document.createElement('canvas');raw.width=img.naturalWidth||img.width;raw.height=img.naturalHeight||img.height;const rc=raw.getContext('2d',{willReadFrequently:true});rc.drawImage(img,0,0);
 const bounds=cropBounds(rc.getImageData(0,0,raw.width,raw.height).data,raw.width,raw.height),scale=Math.min(340/bounds.width,352/bounds.height),dw=bounds.width*scale,dh=bounds.height*scale,dx=(400-dw)/2,dy=394-dh,result={};
 const density=Math.min(2,Math.max(1,globalThis.devicePixelRatio||1));
 for(const kind of KINDS){const canvas=document.createElement('canvas');canvas.width=Math.round(400*density);canvas.height=canvas.width;const c=canvas.getContext('2d');c.scale(density,density);c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
  if(kind==='warped'){const slices=Math.ceil(dh*density);for(let i=0;i<slices;i++){const t=i/slices,sh=bounds.height/slices,lean=(1-t)*(1-t)*dw*.18,squash=.82+.18*t,sw=dw*squash;c.drawImage(img,bounds.x,bounds.y+i*sh,bounds.width,sh,dx+(dw-sw)/2+lean,dy+t*dh,sw,dh/slices+.5/density);}}
  else c.drawImage(img,bounds.x,bounds.y,bounds.width,bounds.height,dx,dy,dw,dh);
  c.globalCompositeOperation='source-atop';
  if(kind==='crack'){c.lineCap='round';c.lineJoin='round';c.strokeStyle='#e4d5ab';c.lineWidth=6.5;const path=new Path2D();if(dw>dh*1.45){path.moveTo(dx+dw*.15,dy+dh*.42);path.lineTo(dx+dw*.31,dy+dh*.56);path.lineTo(dx+dw*.46,dy+dh*.38);path.lineTo(dx+dw*.62,dy+dh*.58);path.lineTo(dx+dw*.86,dy+dh*.45);path.moveTo(dx+dw*.46,dy+dh*.38);path.lineTo(dx+dw*.5,dy+dh*.77);}else{path.moveTo(dx+dw*.48,dy+dh*.15);path.lineTo(dx+dw*.39,dy+dh*.34);path.lineTo(dx+dw*.53,dy+dh*.47);path.lineTo(dx+dw*.41,dy+dh*.61);path.lineTo(dx+dw*.54,dy+dh*.76);path.lineTo(dx+dw*.46,dy+dh*.92);path.moveTo(dx+dw*.41,dy+dh*.61);path.lineTo(dx+dw*.25,dy+dh*.67);path.lineTo(dx+dw*.21,dy+dh*.8);}c.stroke(path);c.strokeStyle='#654e43';c.lineWidth=3.8;c.stroke(path);}
  if(kind==='glaze'){c.fillStyle='#c69d79';c.strokeStyle='#aa7b61';c.lineWidth=2;for(const [u,v,rr]of[[.37,.58,.2],[.65,.8,.13]]){const x=dx+dw*u,y=dy+dh*v,rx=dw*rr,ry=dh*rr;c.beginPath();c.moveTo(x-rx,y);c.bezierCurveTo(x-rx*.9,y-ry*1.2,x-rx*.2,y-ry*1.25,x+rx*.4,y-ry*.8);c.bezierCurveTo(x+rx*1.25,y-ry*.5,x+rx*1.2,y+ry*.6,x+rx*.3,y+ry);c.bezierCurveTo(x-rx*.3,y+ry*1.2,x-rx*1.2,y+ry*.7,x-rx,y);c.fill();c.stroke();c.fillStyle='#e0bb94';for(let j=0;j<8;j++){c.beginPath();c.arc(x+Math.sin(j*2.3)*rx*.7,y+Math.cos(j*3.8)*ry*.7,2,0,Math.PI*2);c.fill();}c.fillStyle='#c69d79';}}
  c.globalCompositeOperation='destination-over';c.fillStyle='#70534038';c.beginPath();c.ellipse(200,395,Math.min(147,dw*.43),4,0,0,Math.PI*2);c.fill();result[kind]=canvas.toDataURL('image/png');
 }
 return {images:result,hitY:(dy+dh*.52)/400};
}
export class InspectionGame{
 constructor(element,work,{onChange=()=>{}}={}){
  this.el=element;this.work=work;this.onChange=onChange;this.state=normalizeInspection(work.inspection);this.work.inspection=this.state;this.abort=new AbortController();this.timers=[];this.disposed=false;this.locked=false;
  element.addEventListener('click',e=>{const retry=e.target.closest('[data-inspection-retry]');if(retry){e.preventDefault();e.stopPropagation();if(this.locked)return;this.state=retryInspection(this.state);this.work.inspection=this.state;this.onChange(this.state,{settled:true});return;}const pot=e.target.closest('[data-inspect-index]');if(!pot||pot.disabled||this.locked)return;e.preventDefault();e.stopPropagation();this.strike(pot,Number(pot.dataset.inspectIndex));},{signal:this.abort.signal});
  this.resize=new ResizeObserver(()=>this.place());this.resize.observe(element);this.place();
  element.setAttribute('aria-busy','true');for(const pot of element.querySelectorAll('[data-inspect-index]'))pot.disabled=true;const note=element.querySelector('.inspection-note'),noteText=note.textContent;if(!this.state.failed&&!this.state.done)note.textContent='청자 네 점을 꺼내고 있어요…';
  this.ready=copies(work,this.abort.signal).then(({images,hitY})=>{if(this.disposed)return;this.hitY=hitY;for(const pot of element.querySelectorAll('[data-inspect-index]')){pot.querySelector('img').src=images[this.state.items[Number(pot.dataset.inspectIndex)]];pot.style.setProperty('--hit-y',`${hitY*100}%`);pot.disabled=this.state.failed||this.state.done||this.state.broken.includes(Number(pot.dataset.inspectIndex));}this.place();element.dataset.inspectionReady='true';element.removeAttribute('aria-busy');note.textContent=noteText;const focus=this.state.failed?element.querySelector('[data-inspection-retry]'):this.state.done?element.querySelector('[data-action=inspection-finish]'):(this.state.lastBroken!==null||this.state.attempts>0)?element.querySelector('[data-inspect-index]:not([disabled])'):null;focus?.focus({preventScroll:true});}).catch(()=>{if(!this.disposed){element.dataset.inspectionReady='error';element.querySelector('.inspection-note').textContent='청자 그림을 불러오지 못했어요. 새로고침해서 다시 살펴봐요.';for(const pot of element.querySelectorAll('[data-inspect-index]'))pot.disabled=true;}});
 }
 place(){
  const mobile=getComputedStyle(this.el).getPropertyValue('--inspection-mobile').trim()==='1';
  this.el.dataset.inspectionLayout=mobile?'grid':'counter';
  if(mobile){
   // The phone layout owns its two-column grid; a desktop counter baseline
   // would shrink the pots or move them over labels when the page scrolls.
   this.el.style.removeProperty('--inspection-baseline');this.el.style.removeProperty('--inspection-pot-size');
  }else{
   const w=this.el.clientWidth,h=this.el.clientHeight,s=Math.max(w/1672,h/941),intro=this.el.querySelector('.inspection-intro'),nav=this.el.querySelector('.inspection-navigation');
   const top=(intro?.offsetTop||0)+(intro?.offsetHeight||0)+18,navTop=nav?.offsetTop||h-48;
   const baseline=Math.min(h-941*s+800*s,navTop-70),available=Math.max(60,baseline-top),size=Math.max(60,Math.min(230,available,(w*.92-48)/4*.9));
   this.el.style.setProperty('--inspection-baseline',`${baseline}px`);this.el.style.setProperty('--inspection-pot-size',`${Math.floor(size)}px`);
  }
  for(const pot of this.el.querySelectorAll('[data-inspect-index]'))pot.style.setProperty('--shatter-rise',`${-pot.clientHeight*(.98-(this.hitY||.5))}px`);
 }
 later(fn,delay){const id=setTimeout(()=>{if(!this.disposed)fn();},delay);this.timers.push(id);}
 strike(pot,index){if(this.el.dataset.inspectionReady!=='true'||this.state.failed||this.state.done)return;this.locked=true;this.el.setAttribute('aria-busy','true');for(const b of this.el.querySelectorAll('[data-inspect-index]'))b.disabled=true;pot.classList.add('is-striking');
  this.later(()=>{pot.classList.add('is-shattering');this.state=smashSample(this.state,index);this.work.inspection=this.state;this.onChange(this.state,{settled:false});},220);
  this.later(()=>{this.locked=false;this.el.removeAttribute('aria-busy');this.onChange(this.state,{settled:true});},1050);
 }
 dispose(){this.disposed=true;this.abort.abort();this.resize.disconnect();for(const timer of this.timers)clearTimeout(timer);}
}
