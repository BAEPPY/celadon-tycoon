import {CHARACTERS} from './characters.js';

export const CUSTOMER_WAIT_MS=1500;
export const CUSTOMER_WALK_MS=1300;
const CUSTOMER_ASSET_WAIT_MS=3000;
export const TUTORIAL_STEPS=Object.freeze([
  {title:'흙 반죽',image:'01-knead.png',caption:'흙을 꼭꼭 누르고 밀어 공기를 빼요.'},
  {title:'모양 빚기',image:'02-shape.png',caption:'흙을 늘리고 눌러 만들고 싶은 모양으로 빚어요.'},
  {title:'무늬 파기',image:'03-carve.png',caption:'찍기나 그리기로 도자기 표면에 무늬를 파요.'},
  {title:'색흙 채우고 닦기',image:'04-inlay.png',caption:'파인 무늬에 색흙을 채운 뒤 겉을 닦아 무늬를 드러내요.'},
  {title:'말리고 굽기',image:'05-fire.png',caption:'부채로 건조 → 초벌 → 붓으로 유약 바르기 → 재벌'},
  {title:'좋은 청자 고르기',image:'06-inspect.png',caption:'네 점을 살펴 불량품 세 점을 깨고 가장 좋은 한 점을 골라요.'},
]);
export function tutorialMarkup(required=true,index=0,understood=false) {
  const current=Math.max(0,Math.min(TUTORIAL_STEPS.length-1,Math.round(index)||0)),step=TUTORIAL_STEPS[current],last=current===TUTORIAL_STEPS.length-1,download='./assets/tutorial/steps/'+step.image,src=download.replace('.png','.webp');
  return `<header class="tutorial-heading"><h2 id="tutorial-title">${step.title}</h2><span class="tutorial-counter" aria-label="전체 ${TUTORIAL_STEPS.length}단계 중 ${current+1}단계">${current+1} / ${TUTORIAL_STEPS.length}</span></header><div class="tutorial-content" data-tutorial-step="${current+1}" role="group" aria-roledescription="슬라이드" aria-label="${current+1}단계 ${step.title}"><img class="tutorial-process" src="${src}" alt="${step.title}. ${step.caption}" draggable="false"></div><div class="tutorial-navigation"><button type="button" class="small-button tutorial-arrow" data-action="tutorial-prev" aria-label="이전 만들기 순서" ${current===0?'disabled':''}>←</button><p class="tutorial-caption" role="status" aria-live="polite">${step.caption}</p><button type="button" class="small-button tutorial-arrow" data-action="tutorial-next" aria-label="다음 만들기 순서" ${last?'disabled':''}>→</button></div><div class="tutorial-footer"><a class="tutorial-download" href="${download}" download="청자-만들기-${current+1}.png">이 그림 저장 ↓</a>${required?`<div class="tutorial-completion" ${last?'':'hidden'}><label class="tutorial-check" for="tutorial-understood"><input id="tutorial-understood" type="checkbox" ${understood?'checked':''}> 이해했어요</label><button class="primary green" data-action="tutorial-start" ${understood?'':'disabled'}>시작하기 →</button></div>`:'<button class="primary green" data-action="close-popup">작업대로 돌아가기 →</button>'}</div>`;
}
export function walkingCustomerMarkup(id) {
  const customer=CHARACTERS.find(c=>c.id===id)||CHARACTERS[0];
  return `<div class="counter-walker" role="img" aria-label="걸어오는 ${customer.name}" data-walk-character="${customer.id}" style="--walk-sheet:url('./assets/characters/walk/${customer.id}.png')"></div>`;
}

// Arrival is a temporary view state, so resuming saved work never replays the wait.
export class CustomerArrival {
  constructor(workId,customerId) {
    this.workId=workId;this.phase='waiting';this.elapsed=0;this.paused=true;this.disposed=false;
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.abort=new AbortController();
    this.image=new Image();
    this.image.onload=()=>{if(!this.disposed){this.assetReady=true;this.assetSettled=true;}};
    this.image.onerror=()=>{if(!this.disposed)this.assetSettled=true;};
    this.image.src=`./assets/characters/walk/${customerId}.png`;
    document.addEventListener('visibilitychange',()=>{this.last=null;},{signal:this.abort.signal});
    this.tick=time=>{
      if(this.disposed||this.paused||this.done)return;
      if(!document.hidden){
        if(this.last!=null)this.elapsed+=time-this.last;
        this.last=time;
        if(this.phase==='waiting'&&this.elapsed>=CUSTOMER_WAIT_MS&&(this.assetSettled||this.reduced||this.elapsed>=CUSTOMER_ASSET_WAIT_MS)){
          if(this.reduced||!this.assetReady)this.finish();
          else {this.phase='walking';this.elapsed=0;this.sync();}
        }else if(this.phase==='walking'){
          if(this.elapsed>=CUSTOMER_WALK_MS)this.finish();
          else {
            const walker=this.scene?.querySelector('.counter-walker');
            if(walker){walker.style.transform=`translateX(${-140*(1-this.elapsed/CUSTOMER_WALK_MS)}%)`;walker.style.backgroundPosition=`${Math.floor(this.elapsed/150)%4*100/3}% 50%`;}
          }
        }
      }else this.last=null;
      if(!this.done)this.frame=requestAnimationFrame(this.tick);
    };
  }
  get done(){return this.phase==='ready';}
  mount(scene) {
    this.pause();this.scene=scene;this.sync();this.paused=false;this.last=null;
    if(!this.done&&!this.disposed)this.frame=requestAnimationFrame(this.tick);
  }
  sync() {
    if(!this.scene)return;
    this.scene.dataset.customerArrival=this.phase;
    this.scene.querySelector('.counter-dialogue')?.toggleAttribute('inert',!this.done);
    this.scene.querySelectorAll('.counter-dialogue button').forEach(button=>{button.disabled=!this.done;});
    const walker=this.scene.querySelector('.counter-walker');
    if(walker)walker.style.transform=`translateX(${-140*(1-(this.phase==='walking'?this.elapsed/CUSTOMER_WALK_MS:0))}%)`;
  }
  finish(){this.phase='ready';this.sync();cancelAnimationFrame(this.frame);}
  pause(){this.paused=true;this.last=null;cancelAnimationFrame(this.frame);}
  dispose(){this.disposed=true;this.pause();this.abort.abort();this.image.onload=null;this.image.onerror=null;this.scene=null;}
}
