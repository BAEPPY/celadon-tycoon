export const CLAYS=Object.freeze([
 {id:'celadon',name:'태토',label:'몸통을 빚는 흙',color:'#b59a86',description:'그릇의 몸통을 빚는 바탕 흙이에요. 청자용 태토를 꼭꼭 눌러 공기를 빼고 고르게 반죽해요.'},
 {id:'white',name:'백토',label:'밝은 상감용 흙',color:'#f3e9d2',description:'흰 상감무늬를 만드는 흙이에요. 물에 개어 파인 무늬를 채워요.'},
 {id:'dark',name:'자토',label:'짙은 상감용 색흙',color:'#815958',description:'검은 상감무늬를 만드는 흙이에요. 실제 흙과 가마 조건에 따라 구운 뒤의 색은 달라져요.'},
]);
export function freshClay(){return {body:true,slip:'white',kneads:0,prepared:false};}
export function chooseClay(state,id){if(!CLAYS.some(c=>c.id===id))return {...state};return id==='celadon'?{...state,body:true}:{...state,slip:id};}
export function kneadClay(state){if(!state.body||state.prepared)return {...state};const kneads=Math.min(6,state.kneads+1);return {...state,kneads,prepared:kneads>=6};}
export class ClayKneading {
 constructor(element,work,onProgress){
  this.element=element;this.work=work;this.onProgress=onProgress;this.abort=new AbortController();
  this.lump=element.querySelector('.knead-lump');this.shadow=element.querySelector('.clay-contact-shadow');
  this.area=element.closest('.kneading-area');this.scene=element.closest('.clay-scene');
  this.pose={x:0,squash:1,skew:0};this.target={...this.pose};this.pointer=null;this.keyHeld=false;
  this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const signal=this.abort.signal;
  element.addEventListener('pointerdown',e=>{
   if(!this.work.clay?.body||e.button!==0||this.pointer)return;
   e.preventDefault();element.focus({preventScroll:true});element.setPointerCapture(e.pointerId);
   this.pointer={id:e.pointerId,startX:e.clientX,startY:e.clientY,lastX:e.clientX,lastY:e.clientY,distance:0};
   this.element.classList.add('is-kneading');this.press();this.deform(0,.79,0);
  },{signal});
  element.addEventListener('pointermove',e=>{
   const p=this.pointer;if(!p||p.id!==e.pointerId)return;
   const dx=e.clientX-p.startX,dy=e.clientY-p.startY,limit=element.clientWidth*.07;
   p.distance+=Math.hypot(e.clientX-p.lastX,e.clientY-p.lastY);p.lastX=e.clientX;p.lastY=e.clientY;
   this.deform(Math.max(-limit,Math.min(limit,dx*.35)),Math.max(.73,Math.min(.9,.8-dy/900)),Math.max(-8,Math.min(8,dx/12)));
   if(p.distance>Math.max(45,element.clientWidth*.18)){p.distance=0;this.press();}
  },{signal});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(name,e=>{
   if(this.pointer?.id===e.pointerId)this.release(name!=='pointerup');
  },{signal});
  element.addEventListener('keydown',e=>{
   if(e.code!=='Space')return;e.preventDefault();
   if(e.repeat||!this.work.clay?.body)return;
   this.keyHeld=true;this.element.classList.add('is-kneading');this.press();this.deform(0,.77,0);
  },{signal});
  element.addEventListener('keyup',e=>{if(e.code==='Space'){e.preventDefault();this.release();}},{signal});
  element.addEventListener('blur',()=>this.release(true),{signal});
  window.addEventListener('blur',()=>this.release(true),{signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.release(true);},{signal});
  this.resize=new ResizeObserver(()=>this.placeOnWheel());this.resize.observe(this.scene);
  this.placeOnWheel();this.paint();
 }
 placeOnWheel(){
  // Match the cover-scaled illustration: the wheel centre is (876, 712) in the 1672 × 941 scene.
  const w=this.scene.clientWidth,h=this.scene.clientHeight,scale=Math.max(w/1672,h/941);
  this.area.style.setProperty('--wheel-x',`${(w-1672*scale)/2+876*scale}px`);
  this.area.style.setProperty('--wheel-y',`${(h-941*scale)/2+712*scale}px`);
  this.area.style.setProperty('--clay-width',`${Math.min(500,590*scale)}px`);
 }
 press(){
  clearTimeout(this.releaseTimer);this.releaseTimer=null;this.pressedAt=performance.now();
  const before=this.work.clay.kneads;this.work.clay=kneadClay(this.work.clay);
  this.element.dataset.kneads=String(this.work.clay.kneads);
  this.element.classList.toggle('prepared',this.work.clay.prepared);
  if(before!==this.work.clay.kneads)this.onProgress(this.work.clay);
 }
 deform(x,squash,skew){this.target={x,squash,skew};if(!this.frame)this.frame=requestAnimationFrame(()=>this.animate());}
 release(immediate=false){
  const id=this.pointer?.id;this.pointer=null;this.keyHeld=false;
  if(id!==undefined&&this.element.hasPointerCapture(id))this.element.releasePointerCapture(id);
  this.element.classList.remove('is-kneading');clearTimeout(this.releaseTimer);
  // A quick tap may end before its first animation frame. Keep the pressed
  // pose briefly so every click, including one on finished clay, is visible.
  const remaining=immediate?0:Math.max(0,140-(performance.now()-(this.pressedAt||0)));
  if(remaining)this.releaseTimer=setTimeout(()=>{this.releaseTimer=null;this.deform(0,1,0);},remaining);
  else{this.releaseTimer=null;this.deform(0,1,0);}
 }
 animate(){
  this.frame=null;let moving=false;const blend=this.reduced?1:.28;
  for(const key of ['x','squash','skew']){const delta=this.target[key]-this.pose[key];this.pose[key]+=delta*blend;if(Math.abs(delta)>.001)moving=true;}
  this.paint();if(moving)this.frame=requestAnimationFrame(()=>this.animate());
 }
 paint(){
  const {x,squash,skew}=this.pose,stretch=1+(1-squash)*.8;
  this.lump.style.transform=`translateX(${x}px) skewX(${skew}deg) scale(${stretch},${squash})`;
  if(this.shadow){this.shadow.style.transform=`translateX(${x*.45}px) scaleX(${stretch})`;this.shadow.style.opacity=String(.24+(1-squash)*.35);}
 }
 dispose(){this.abort.abort();this.resize.disconnect();clearTimeout(this.releaseTimer);if(this.frame)cancelAnimationFrame(this.frame);}
}
export function clayLumpSVG(){return `<svg viewBox="0 0 400 260" aria-hidden="true"><ellipse class="clay-contact-shadow" cx="200" cy="225" rx="132" ry="13" fill="#72584f" opacity=".24"/><g class="knead-lump"><path d="M72 177C52 129 91 83 131 77C137 39 227 36 253 71C302 63 342 111 331 158C355 191 301 224 247 218C190 238 100 225 72 177Z" fill="#baa18e" stroke="#72584f" stroke-width="4"/><path d="M112 148C155 107 253 110 295 151M120 176C165 152 241 151 282 175" fill="none" stroke="#917364" stroke-width="5" stroke-linecap="round"/><path d="M145 78C183 58 227 65 244 82" fill="none" stroke="#d6c0a8" stroke-width="9" stroke-linecap="round"/><g fill="#6b4c44" opacity=".25"><circle cx="162" cy="127" r="4"/><circle cx="247" cy="165" r="3"/><circle cx="203" cy="93" r="3"/></g></g></svg>`;}
