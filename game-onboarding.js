import {CHARACTERS} from './characters.js';

export const CUSTOMER_WAIT_MS=3500;
export const CUSTOMER_WALK_MS=1300;
const CUSTOMER_ASSET_WAIT_MS=6000;
export const TUTORIAL_STEPS=Object.freeze([
  '흙 반죽', '모양 빚기', '무늬 파기', '색흙 채우고 닦기',
  '말리고 굽기: 부채로 말리기, 초벌, 유약 붓칠, 재벌', '네 점을 살펴 불량품 세 점을 깨고 가장 좋은 한 점 고르기',
]);
export function tutorialMarkup(required=true) {
  return `<h2 id="tutorial-title">상감 청자, 이렇게 만들어요</h2><p class="tutorial-intro">그림을 아래로 내려 여섯 순서를 살펴보세요.</p><div class="tutorial-content" tabindex="0" aria-label="상감 청자 만들기 안내 그림과 여섯 순서"><img class="tutorial-process" src="./assets/tutorial/celadon-inlay-process.png" alt="상감 청자 만들기 순서: ${TUTORIAL_STEPS.join(' → ')}" draggable="false"><ol class="tutorial-steps">${TUTORIAL_STEPS.map(step=>`<li>${step}</li>`).join('')}</ol></div><p class="tutorial-inlay-tip"><strong>상감</strong>은 무늬를 파고 색흙을 채운 다음, 겉을 닦아 무늬를 드러내는 방법이에요.</p><div class="tutorial-footer"><a class="tutorial-download" href="./assets/tutorial/celadon-inlay-process.png" download="청자-만들기-안내.png">안내 그림 저장 ↓</a>${required?'<label class="tutorial-check" for="tutorial-understood"><input id="tutorial-understood" type="checkbox"> 이해했어요</label><button class="primary green" data-action="tutorial-start" disabled>시작하기 →</button>':'<button class="primary green" data-action="close-popup">작업대로 돌아가기 →</button>'}</div>`;
}
export function walkingCustomerMarkup(id) {
  const customer=CHARACTERS.find(c=>c.id===id)||CHARACTERS[0];
  return `<div class="counter-walker" role="img" aria-label="걸어오는 ${customer.name}" data-walk-character="${customer.id}" style="--walk-sheet:url('./assets/characters/walk/${customer.id}.png')"></div><p class="customer-arrival-status" role="status">곧 손님이 찾아와요.</p>`;
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
    const status=this.scene.querySelector('.customer-arrival-status');
    if(status){status.textContent=this.phase==='walking'?'손님이 공방으로 걸어오고 있어요.':this.done?'손님이 도착했어요.':'곧 손님이 찾아와요.';status.hidden=this.done;}
  }
  finish(){this.phase='ready';this.sync();cancelAnimationFrame(this.frame);}
  pause(){this.paused=true;this.last=null;cancelAnimationFrame(this.frame);}
  dispose(){this.disposed=true;this.pause();this.abort.abort();this.image.onload=null;this.image.onerror=null;this.scene=null;}
}
