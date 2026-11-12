import {clamp} from './arcade-rules.js';
import {sculptMatch, sampleSculptOutline, SCULPT_PASS, SCULPT_SPREAD, SCULPT_HELP_AFTER} from './sculpt-rules.js';
import {settleSculptLocks, nextUnlockedSculptPoint, snapSculptGrip} from './sculpt-locks.js';
function inside(p,points){let yes=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
function bounds(points){const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);return {left:Math.min(...xs),top:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};}
function localPoint(p,b){return [(p[0]-b.left)/(b.width||1),(p[1]-b.top)/(b.height||1)];}
function worldPoint(p,b){return [b.left+p[0]*b.width,b.top+p[1]*b.height];}
export class SculptGame {
 constructor(craft,work,onProgress){
  this.craft=craft;this.work=work;this.onProgress=onProgress;this.abort=new AbortController();this.running=true;this.guide=[];this.starts=[];this.points=[];this.matches=[];this.locked=[];this.selected=0;this.drag=null;this.touch=matchMedia('(pointer: coarse)').matches;this.range=['wide','part','fine'].includes(work.sculpt?.gripRange)?work.sculpt.gripRange:'wide';this.undoStack=[];this.redoStack=[];this.pendingHistory=null;this.keyboardMove=false;
  this.canvas=document.createElement('canvas');this.canvas.className='sculpt-canvas';this.canvas.tabIndex=0;this.canvas.setAttribute('aria-label','흙을 잡아 점선에 맞춰요. 초록 점은 고정되어 움직이지 않아요. 넓게, 부분, 섬세하게 중 잡는 범위를 고를 수 있어요. Q와 E로 잡을 곳을 바꾸고 방향키로 움직여요. Ctrl Z로 되돌릴 수 있어요. Enter로 목표선 쪽으로 조금씩 옮길 수도 있어요. 모양이 90퍼센트 이상 맞으면 통과해요.');
  this.hint=document.createElement('span');this.hint.className='sculpt-key-hint';this.hint.textContent='Q / E 잡을 곳 · 방향키 움직이기 · Enter 점선 쪽으로 · Ctrl Z 되돌리기';this.hint.id=`sculpt-keys-${Math.random().toString(36).slice(2)}`;this.canvas.setAttribute('aria-describedby',this.hint.id);
  this.touchControls=document.createElement('div');this.touchControls.className='sculpt-touch-controls';this.touchControls.setAttribute('role','group');this.touchControls.setAttribute('aria-label','흙 잡을 곳과 움직임');this.touchControls.innerHTML='<button type="button" data-sculpt-touch="previous" aria-label="이전 잡을 곳">←</button><button type="button" data-sculpt-touch="toward">점선 쪽으로 조금</button><button type="button" data-sculpt-touch="next" aria-label="다음 잡을 곳">→</button>';
  this.controls=document.createElement('aside');this.controls.className='sculpt-shaping-tools';this.controls.setAttribute('aria-label','흙 모양 빚기 도구');this.controls.innerHTML='<h3>흙 잡는 범위</h3><div class="sculpt-ranges" role="group" aria-label="흙이 함께 움직이는 범위"><button type="button" data-sculpt-range="wide" aria-pressed="true"><i aria-hidden="true"></i>넓게</button><button type="button" data-sculpt-range="part" aria-pressed="false"><i aria-hidden="true"></i>부분</button><button type="button" data-sculpt-range="fine" aria-pressed="false"><i aria-hidden="true"></i>섬세하게</button></div><p>초록 점은 고정돼요. 남은 부분을 빚어요.</p><button type="button" class="sculpt-assist" data-sculpt-assist="toward" aria-label="선택한 부분을 점선 쪽으로 조금 옮기기">점선 쪽으로 조금</button><button type="button" class="sculpt-assist sculpt-help" data-sculpt-assist="rest" hidden aria-label="아직 맞추지 않은 흙을 모두 점선 쪽으로 반씩 옮기기">남은 부분 다듬기</button><div class="sculpt-history"><button type="button" data-sculpt-history="undo" disabled>↶ 되돌리기</button><button type="button" data-sculpt-history="redo" disabled>↷ 다시하기</button></div>';
  craft.el.append(this.canvas,this.hint,this.touchControls);(craft.el.closest('.station-scene')||craft.el).append(this.controls);this.ctx=this.canvas.getContext('2d');const opt={signal:this.abort.signal};
  this.controls.addEventListener('click',e=>{const button=e.target.closest('button');if(!button||button.disabled)return;this.release();if(button.dataset.sculptRange){this.range=button.dataset.sculptRange;this.publish(true);this.draw();}else if(button.dataset.sculptAssist==='rest')this.smoothRest();else if(button.dataset.sculptAssist)this.towardGuide();else this.history(button.dataset.sculptHistory);},opt);
  this.controls.addEventListener('keydown',e=>this.historyKey(e),opt);
  this.touchControls.addEventListener('click',e=>{const action=e.target.closest('[data-sculpt-touch]')?.dataset.sculptTouch;if(!action||!this.guide.length||work.sculpt?.complete)return;this.release();if(action==='toward')this.towardGuide();else{this.selected=nextUnlockedSculptPoint(this.locked,this.selected,action==='previous'?-1:1);this.draw();}},opt);
  this.canvas.addEventListener('pointerdown',e=>{
   if(e.button!==0||e.isPrimary===false||!this.points.length||work.sculpt?.complete||this.drag)return;e.preventDefault();this.canvas.focus({preventScroll:true});const p=this.pos(e);let at=0,d=Infinity;
   // Pressing right on a green grip leaves it fixed. Anywhere else the nearest grip that is not green yet is taken, so
   // a green grip near the finger does not stop the pull of the unfinished clay next to it.
   let green=-1,greenDistance=Infinity;this.points.forEach((q,i)=>{const delta=this.distance(p,q);if(delta<greenDistance){green=i;greenDistance=delta;}});
   if(this.locked[green]&&greenDistance<=(this.touch?14:10)){this.selected=green;this.draw();return;}
   this.points.forEach((q,i)=>{if(this.locked[i])return;const delta=this.distance(p,q);if(delta<d){at=i;d=delta;}});if(d===Infinity||(!inside(p,this.points)&&d>(this.touch?44:34)))return;
   this.selected=at;this.beginHistory();this.drag={id:e.pointerId,start:p,points:this.points.map(q=>[...q])};this.canvas.setPointerCapture(e.pointerId);this.canvas.classList.add('is-pulling');this.draw();
  },opt);
  this.canvas.addEventListener('pointermove',e=>{
   if(work.sculpt?.complete||!this.drag||this.drag.id!==e.pointerId)return;
   const p=this.pos(e),dx=p[0]-this.drag.start[0],dy=p[1]-this.drag.start[1];
   if(this.distance(p,this.drag.start)>2){this.drag.moved=true;this.move(this.selected,[dx,dy],this.drag.points);}
  },opt);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])this.canvas.addEventListener(type,e=>{if(!this.drag||this.drag.id===e.pointerId)this.release();},opt);
  this.canvas.addEventListener('blur',()=>this.release(),opt);window.addEventListener('blur',()=>this.release(),opt);document.addEventListener('visibilitychange',()=>{if(document.hidden)this.release();},opt);
  this.canvas.addEventListener('keydown',e=>{
   if(this.historyKey(e))return;if(!this.guide.length||work.sculpt?.complete)return;
   if(['KeyQ','KeyE','BracketLeft','BracketRight'].includes(e.code)){e.preventDefault();this.selected=nextUnlockedSculptPoint(this.locked,this.selected,['KeyQ','BracketLeft'].includes(e.code)?-1:1);this.draw();return;}
   if(!['ArrowLeft','ArrowUp','ArrowRight','ArrowDown','Enter','Space'].includes(e.code))return;e.preventDefault();
   const r=this.canvas.getBoundingClientRect(),pixels=e.shiftKey?12:5;
   let delta=[e.code==='ArrowLeft'?-pixels/r.width:e.code==='ArrowRight'?pixels/r.width:0,e.code==='ArrowUp'?-pixels/r.height:e.code==='ArrowDown'?pixels/r.height:0];
   if(e.code==='Enter'||e.code==='Space'){if(e.repeat)return;this.towardGuide();return;}
   if(this.locked[this.selected])return;if(!this.keyboardMove){this.beginHistory();this.keyboardMove=true;}this.move(this.selected,delta,this.points.map(p=>[...p]));
  },opt);
  this.canvas.addEventListener('keyup',e=>{if(this.keyboardMove&&e.code.startsWith('Arrow')){this.keyboardMove=false;this.finishHistory();}},opt);
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(this.canvas);
  this.wait=()=>{if(!this.running)return;if(craft.el.dataset.status==='ready')this.resize();else this.frame=requestAnimationFrame(this.wait);};this.wait();
 }
 pos(e){const r=this.canvas.getBoundingClientRect();return [clamp((e.clientX-r.left)/r.width,.015,.985),clamp((e.clientY-r.top)/r.height,.015,.985)];}
 distance(a,b){const r=this.canvas.getBoundingClientRect();return Math.hypot((a[0]-b[0])*r.width,(a[1]-b[1])*r.height);}
 towardGuide(){if(this.locked[this.selected])this.selected=nextUnlockedSculptPoint(this.locked,this.selected);const p=this.points[this.selected],g=this.guide[this.selected];if(!p||!g||this.locked[this.selected])return;this.beginHistory();const amount=this.distance(p,g)<12?1:.35;this.move(this.selected,[(g[0]-p[0])*amount,(g[1]-p[1])*amount],this.points.map(q=>[...q]),true);this.finishHistory();}
 // "남은 부분 다듬기": every grip that is not green moves half way to its own spot (a way through for a stuck player,
 // offered after SCULPT_HELP_AFTER pulls). Each press can be undone like any other step.
 smoothRest(){
  if(!this.guide.length||this.work.sculpt?.complete)return;this.beginHistory();
  this.points=this.points.map((p,i)=>this.locked[i]?[...this.guide[i]]:p.map((v,j)=>clamp(v+(this.guide[i][j]-v)*.5,.015,.985)));
  const r=this.canvas.getBoundingClientRect(),settled=settleSculptLocks(this.points,this.guide,this.locked,r.width,r.height);this.points=settled.points;this.locked=settled.locked;
  this.helps=(this.helps||0)+1;this.canvas.dataset.helps=String(this.helps);this.publish(true);this.finishHistory();this.draw();
 }
 syncHelp(){const button=this.controls?.querySelector('[data-sculpt-assist="rest"]');if(button)button.hidden=!((this.pulls||0)>=SCULPT_HELP_AFTER&&!this.work.sculpt?.complete);if(this.canvas)this.canvas.dataset.pulls=String(this.pulls||0);}
 snapshot(){return {points:this.points.map(p=>localPoint(p,this.box)),locked:[...this.locked],selected:this.selected};}
 beginHistory(){if(!this.pendingHistory&&this.box&&this.points.length)this.pendingHistory=this.snapshot();}
 finishHistory(){const before=this.pendingHistory;this.pendingHistory=null;if(before&&(before.locked.some((value,i)=>value!==this.locked[i])||before.points.some((p,i)=>p.some((v,j)=>Math.abs(v-localPoint(this.points[i],this.box)[j])>1e-9)))){this.undoStack.push(before);if(this.undoStack.length>40)this.undoStack.shift();this.redoStack=[];}this.syncControls();}
 historyKey(e){if(!(e.ctrlKey||e.metaKey)||!['KeyZ','KeyY'].includes(e.code))return false;e.preventDefault();if(!e.repeat){this.release();this.history(e.code==='KeyY'||e.shiftKey?'redo':'undo');}return true;}
 history(action){const from=action==='undo'?this.undoStack:this.redoStack,to=action==='undo'?this.redoStack:this.undoStack;if(!from.length)return;to.push(this.snapshot());const saved=from.pop();this.selected=saved.selected;this.locked=[...saved.locked];this.points=saved.points.map(p=>worldPoint(p,this.box).map(v=>clamp(v,.015,.985)));const r=this.canvas.getBoundingClientRect();this.points=settleSculptLocks(this.points,this.guide,this.locked,r.width,r.height,false).points;this.publish(true);this.draw();}
 syncControls(){if(!this.controls)return;this.canvas.dataset.gripRange=this.range;this.canvas.dataset.locked=JSON.stringify(this.locked);this.canvas.dataset.undoCount=String(this.undoStack.length);this.canvas.dataset.redoCount=String(this.redoStack.length);for(const button of this.controls.querySelectorAll('[data-sculpt-range]')){button.setAttribute('aria-pressed',String(button.dataset.sculptRange===this.range));button.disabled=Boolean(this.work.sculpt?.complete);}this.controls.querySelector('[data-sculpt-assist]').disabled=Boolean(this.work.sculpt?.complete)||!this.guide.length;this.controls.querySelector('[data-sculpt-history="undo"]').disabled=!this.undoStack.length;this.controls.querySelector('[data-sculpt-history="redo"]').disabled=!this.redoStack.length;}
 influence(separation,assisted=false){const sigma=assisted ? .75 : SCULPT_SPREAD[this.range];return Math.exp(-separation*separation/(2*sigma*sigma));}
 resize(){
  if(this.drag)this.release();
  const r=this.canvas.getBoundingClientRect();this.canvas.width=Math.max(1,Math.round(r.width*devicePixelRatio));this.canvas.height=Math.max(1,Math.round(r.height*devicePixelRatio));if(this.craft.el.dataset.status!=='ready')return;
  const outline=this.craft.getSculptGuide();if(outline.length<3)return;const oldLocal=this.box&&this.points.length?this.points.map(p=>localPoint(p,this.box)):null;
  this.guide=sampleSculptOutline(outline,40,r.width,r.height);this.box=bounds(outline);const {left,top,width:W,height:H}=this.box,bottom=top+H,cx=left+W/2;
  const rx=Math.min(W*.42,H*r.height/r.width*.5),ry=Math.min(H*.23,W*r.width/r.height*.3),cy=bottom-ry;
  this.starts=this.guide.map((_,i)=>{const theta=-Math.PI/2-i/this.guide.length*Math.PI*2;return [cx+rx*Math.cos(theta),cy+ry*Math.sin(theta)];});
  if(oldLocal)this.points=oldLocal.map(p=>worldPoint(p,this.box));
  else{
   const old=this.work.sculpt;
   this.locked=old?.lockVersion===1&&Array.isArray(old.locked)&&old.locked.length===this.guide.length?old.locked.map(value=>value===true):[];
   if(old?.mode==='free'&&old.points?.length===this.guide.length&&old.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))){
    // Older saves used the screen-sampled guide's bounds. Convert their actual
    // clay once before storing against stable, unsampled target bounds.
    const savedBox=old.outlineVersion===2?this.box:bounds(sampleSculptOutline(outline));
    this.points=old.points.map(p=>worldPoint(p,savedBox));
   }
   else{const amounts=old?.mode==='stretch'&&old.amounts?.length===this.guide.length?old.amounts.map(n=>clamp(Number(n)||0)):this.guide.map(()=>Math.min(.85,old?.fraction||0));this.points=this.guide.map((goal,i)=>this.starts[i].map((v,j)=>v+(goal[j]-v)*amounts[i]));}
  }
  this.points=this.points.map(p=>p.map(v=>clamp(v,.015,.985)));
  const restored=settleSculptLocks(this.points,this.guide,this.locked,r.width,r.height,this.locked.length!==this.guide.length);this.points=restored.points;this.locked=restored.locked;
  this.canvas.dataset.guide=JSON.stringify(this.guide);this.canvas.dataset.starts=JSON.stringify(this.starts);this.publish(true);this.draw();
 }
 move(index,delta,before,assisted=false){
  if(this.work.sculpt?.complete||this.locked[index])return;const n=this.guide.length;
  this.points=before.map((p,i)=>{
   if(this.locked[i])return [...this.guide[i]];
   const separation=Math.min(Math.abs(i-index),n-Math.abs(i-index));
   // Previously green grips remain at their guide even while a broad pull
   // continues from an older drag snapshot.
   const settled=assisted&&i!==index&&this.distance(p,this.guide[i])<7;
   const weight=i===index?1:this.influence(separation,assisted)*(settled?.02:1);
   return [clamp(p[0]+delta[0]*weight,.015,.985),clamp(p[1]+delta[1]*weight,.015,.985)];
  });
  const r=this.canvas.getBoundingClientRect(),settled=settleSculptLocks(this.points,this.guide,this.locked,r.width,r.height);this.points=settled.points;this.locked=settled.locked;
  this.publish(true);if(this.drag&&this.locked[this.selected])this.release();this.draw();
 }
 publish(notify){
  const r=this.canvas.getBoundingClientRect(),match=sculptMatch(this.points,this.guide,r.width,r.height),fraction=match.fraction,complete=fraction>=SCULPT_PASS;
  this.matches=match.matches;this.work.sculpt={mode:'free',outlineVersion:2,lockVersion:1,locked:[...this.locked],gripRange:this.range,fraction,complete,points:this.points.map(p=>localPoint(p,this.box))};this.work.knead=complete?3:Math.min(2,Math.floor(fraction*3));
  this.canvas.dataset.current=JSON.stringify(this.points);this.canvas.dataset.coverage=String(fraction);this.canvas.dataset.selected=String(this.selected);this.canvas.dataset.matches=JSON.stringify(this.matches);
  this.craft.setSculptMesh(this.points,this.guide,fraction,this.locked);this.craft.setSculptProgress(complete?1:fraction);
  if(!complete&&this.success){this.success.remove();this.success=null;this.canvas.classList.remove('completed');this.hint.hidden=false;this.touchControls.hidden=false;}this.syncControls();
  if(notify)this.onProgress(this.work.sculpt);
  if(complete&&!this.success){this.release();this.success=document.createElement('div');this.success.className='sculpt-success';this.success.setAttribute('role','status');this.success.innerHTML=`<span class="success-sparkles" aria-hidden="true">✦ ✧ ✦</span><strong>통과!</strong><span>목표 모양 ${Math.round(SCULPT_PASS*100)}% 이상 완성</span><small>다음 작업대에서 장식 방법을 골라요.</small>`;this.craft.el.append(this.success);this.canvas.classList.add('completed');this.hint.hidden=true;this.touchControls.hidden=true;}
 }
 release(){const id=this.drag?.id,pulled=Boolean(this.drag&&this.drag.moved);
  // Let go a little short of its own spot, a grip lands on it (sculpt-locks.js).
  if(pulled&&this.guide.length&&!this.work.sculpt?.complete){const r=this.canvas.getBoundingClientRect(),snapped=snapSculptGrip(this.points,this.guide,this.locked,this.selected,r.width,r.height);if(snapped.points!==this.points){this.points=snapped.points;this.locked=snapped.locked;this.publish(true);}this.pulls=(this.pulls||0)+1;this.syncHelp();}
  this.drag=null;this.keyboardMove=false;this.finishHistory();if(id!==undefined&&this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);this.canvas.classList.remove('is-pulling');this.draw();}
 draw(){
  this.canvas.dataset.selected=String(this.selected);
  const c=this.ctx,w=this.canvas.width,h=this.canvas.height;c.clearRect(0,0,w,h);if(!this.guide.length||this.work.sculpt?.complete)return;c.save();c.lineWidth=2.5*devicePixelRatio;c.setLineDash([8*devicePixelRatio,6*devicePixelRatio]);c.strokeStyle='#fffdf0';c.shadowColor='#a7875d';c.shadowBlur=3*devicePixelRatio;c.beginPath();this.guide.forEach((p,i)=>c[i?'lineTo':'moveTo'](p[0]*w,p[1]*h));c.closePath();c.stroke();c.setLineDash([]);c.shadowBlur=0;
  this.guide.forEach((p,i)=>{const matched=this.locked[i];c.beginPath();c.fillStyle=matched?'#56b783':'#f4cc77';c.strokeStyle=matched?'#357958':'#95723e';c.lineWidth=devicePixelRatio;c.arc(p[0]*w,p[1]*h,(matched?4.5:3)*devicePixelRatio,0,Math.PI*2);c.fill();c.stroke();});
  const a=this.points[this.selected],b=this.guide[this.selected];if(a){
   // The soft highlighted arc shows which neighbouring clay follows the hand.
   const reach=Math.ceil(SCULPT_SPREAD[this.range]*2),count=this.points.length;c.strokeStyle='#9a672d60';c.lineWidth=(this.touch?8:6)*devicePixelRatio;c.lineCap='round';c.lineJoin='round';c.beginPath();for(let step=-reach;step<=reach;step++){const p=this.points[(this.selected+step+count)%count];c[step===-reach?'moveTo':'lineTo'](p[0]*w,p[1]*h);}c.stroke();
   if(!this.locked[this.selected]){c.strokeStyle='#8f714b80';c.lineWidth=1.5*devicePixelRatio;c.setLineDash([3*devicePixelRatio,6*devicePixelRatio]);c.beginPath();c.moveTo(a[0]*w,a[1]*h);c.lineTo(b[0]*w,b[1]*h);c.stroke();c.setLineDash([]);}
   c.fillStyle=this.locked[this.selected]?'#56b783':'#fff1b8';c.strokeStyle=this.locked[this.selected]?'#357958':'#967745';c.lineWidth=2*devicePixelRatio;c.beginPath();c.arc(a[0]*w,a[1]*h,(this.touch?12:8)*devicePixelRatio,0,Math.PI*2);c.fill();c.stroke();
  }
  c.restore();
 }
 dispose(){this.running=false;this.release();this.abort.abort();this.observer.disconnect();cancelAnimationFrame(this.frame);this.canvas.remove();this.hint.remove();this.touchControls.remove();this.controls.remove();this.success?.remove();this.craft.sculptMesh=null;}
}
