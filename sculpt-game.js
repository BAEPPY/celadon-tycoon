import {clamp} from './arcade-rules.js';
import {sculptMatch, sampleSculptOutline} from './sculpt-rules.js';
function inside(p,points){let yes=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
function bounds(points){const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);return {left:Math.min(...xs),top:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};}
function localPoint(p,b){return [(p[0]-b.left)/(b.width||1),(p[1]-b.top)/(b.height||1)];}
function worldPoint(p,b){return [b.left+p[0]*b.width,b.top+p[1]*b.height];}
export class SculptGame {
 constructor(craft,work,onProgress){
  this.craft=craft;this.work=work;this.onProgress=onProgress;this.abort=new AbortController();this.running=true;this.guide=[];this.starts=[];this.points=[];this.matches=[];this.selected=0;this.drag=null;
  this.canvas=document.createElement('canvas');this.canvas.className='sculpt-canvas';this.canvas.tabIndex=0;this.canvas.setAttribute('aria-label','흙을 잡아 상하좌우로 자유롭게 움직여요. Q와 E로 잡을 곳을 바꾸고 방향키로 움직여요. Enter로 목표선 쪽으로 조금씩 옮길 수도 있어요. 모양이 90퍼센트 이상 맞으면 통과해요.');
  this.hint=document.createElement('span');this.hint.className='sculpt-key-hint';this.hint.textContent='Q / E 잡을 곳 · 방향키 움직이기 · Enter 점선 쪽으로';this.hint.id=`sculpt-keys-${Math.random().toString(36).slice(2)}`;this.canvas.setAttribute('aria-describedby',this.hint.id);
  craft.el.append(this.canvas,this.hint);this.ctx=this.canvas.getContext('2d');const opt={signal:this.abort.signal};
  this.canvas.addEventListener('pointerdown',e=>{
   if(e.button!==0||!this.points.length||work.sculpt?.complete||this.drag)return;e.preventDefault();this.canvas.focus({preventScroll:true});const p=this.pos(e);let at=0,d=Infinity;
   this.points.forEach((q,i)=>{const delta=this.distance(p,q);if(delta<d){at=i;d=delta;}});if(!inside(p,this.points)&&d>30)return;
   this.selected=at;this.drag={id:e.pointerId,start:p,points:this.points.map(q=>[...q])};this.canvas.setPointerCapture(e.pointerId);this.canvas.classList.add('is-pulling');this.draw();
  },opt);
  this.canvas.addEventListener('pointermove',e=>{
   if(!this.drag||this.drag.id!==e.pointerId||work.sculpt?.complete)return;
   const p=this.pos(e),dx=p[0]-this.drag.start[0],dy=p[1]-this.drag.start[1];
   if(this.distance(p,this.drag.start)>2)this.move(this.selected,[dx,dy],this.drag.points);
  },opt);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])this.canvas.addEventListener(type,e=>{if(!this.drag||this.drag.id===e.pointerId)this.release();},opt);
  this.canvas.addEventListener('blur',()=>this.release(),opt);window.addEventListener('blur',()=>this.release(),opt);document.addEventListener('visibilitychange',()=>{if(document.hidden)this.release();},opt);
  this.canvas.addEventListener('keydown',e=>{
   if(!this.guide.length||work.sculpt?.complete)return;
   if(['KeyQ','KeyE','BracketLeft','BracketRight'].includes(e.code)){e.preventDefault();this.selected=(this.selected+(['KeyQ','BracketLeft'].includes(e.code)?-1:1)+this.guide.length)%this.guide.length;this.draw();return;}
   if(!['ArrowLeft','ArrowUp','ArrowRight','ArrowDown','Enter','Space'].includes(e.code))return;e.preventDefault();
   const r=this.canvas.getBoundingClientRect(),pixels=e.shiftKey?12:5;
   let delta=[e.code==='ArrowLeft'?-pixels/r.width:e.code==='ArrowRight'?pixels/r.width:0,e.code==='ArrowUp'?-pixels/r.height:e.code==='ArrowDown'?pixels/r.height:0];
   if(e.code==='Enter'||e.code==='Space'){if(e.repeat)return;const p=this.points[this.selected],g=this.guide[this.selected];delta=[(g[0]-p[0])*.35,(g[1]-p[1])*.35];if(this.distance(p,g)<12)delta=[g[0]-p[0],g[1]-p[1]];}
   this.move(this.selected,delta,this.points.map(p=>[...p]));
  },opt);
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(this.canvas);
  this.wait=()=>{if(!this.running)return;if(craft.el.dataset.status==='ready')this.resize();else this.frame=requestAnimationFrame(this.wait);};this.wait();
 }
 pos(e){const r=this.canvas.getBoundingClientRect();return [clamp((e.clientX-r.left)/r.width,.015,.985),clamp((e.clientY-r.top)/r.height,.015,.985)];}
 distance(a,b){const r=this.canvas.getBoundingClientRect();return Math.hypot((a[0]-b[0])*r.width,(a[1]-b[1])*r.height);}
 resize(){
  const r=this.canvas.getBoundingClientRect();this.canvas.width=Math.max(1,Math.round(r.width*devicePixelRatio));this.canvas.height=Math.max(1,Math.round(r.height*devicePixelRatio));if(this.craft.el.dataset.status!=='ready')return;
  const outline=this.craft.getSculptGuide();if(outline.length<3)return;const oldLocal=this.box&&this.points.length?this.points.map(p=>localPoint(p,this.box)):null;
  this.guide=sampleSculptOutline(outline,40,r.width,r.height);this.box=bounds(outline);const {left,top,width:W,height:H}=this.box,bottom=top+H,cx=left+W/2;
  const rx=Math.min(W*.42,H*r.height/r.width*.5),ry=Math.min(H*.23,W*r.width/r.height*.3),cy=bottom-ry;
  this.starts=this.guide.map((_,i)=>{const theta=-Math.PI/2-i/this.guide.length*Math.PI*2;return [cx+rx*Math.cos(theta),cy+ry*Math.sin(theta)];});
  if(oldLocal)this.points=oldLocal.map(p=>worldPoint(p,this.box));
  else{
   const old=this.work.sculpt;
   if(old?.mode==='free'&&old.points?.length===this.guide.length&&old.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))){
    // Older saves used the screen-sampled guide's bounds. Convert their actual
    // clay once before storing against stable, unsampled target bounds.
    const savedBox=old.outlineVersion===2?this.box:bounds(sampleSculptOutline(outline));
    this.points=old.points.map(p=>worldPoint(p,savedBox));
   }
   else{const amounts=old?.mode==='stretch'&&old.amounts?.length===this.guide.length?old.amounts.map(n=>clamp(Number(n)||0)):this.guide.map(()=>Math.min(.85,old?.fraction||0));this.points=this.guide.map((goal,i)=>this.starts[i].map((v,j)=>v+(goal[j]-v)*amounts[i]));}
  }
  this.points=this.points.map(p=>p.map(v=>clamp(v,.015,.985)));
  this.canvas.dataset.guide=JSON.stringify(this.guide);this.canvas.dataset.starts=JSON.stringify(this.starts);this.publish(true);this.draw();
 }
 move(index,delta,before){
  if(this.work.sculpt?.complete)return;const n=this.guide.length;
  this.points=before.map((p,i)=>{
   const separation=Math.min(Math.abs(i-index),n-Math.abs(i-index));
   // Already matched neighbours are gently anchored; the grip itself is never constrained.
   const settled=i!==index&&this.distance(p,this.guide[i])<7;
   const weight=i===index?1:Math.exp(-separation*separation/8)*(settled?.02:1);
   return [clamp(p[0]+delta[0]*weight,.015,.985),clamp(p[1]+delta[1]*weight,.015,.985)];
  });
  this.publish(true);this.draw();
 }
 publish(notify){
  const r=this.canvas.getBoundingClientRect(),match=sculptMatch(this.points,this.guide,r.width,r.height),fraction=match.fraction,complete=fraction>=.9;
  this.matches=match.matches;this.work.sculpt={mode:'free',outlineVersion:2,fraction,complete,points:this.points.map(p=>localPoint(p,this.box))};this.work.knead=complete?3:Math.min(2,Math.floor(fraction*3));
  this.canvas.dataset.current=JSON.stringify(this.points);this.canvas.dataset.coverage=String(fraction);this.canvas.dataset.selected=String(this.selected);this.canvas.dataset.matches=JSON.stringify(this.matches);
  this.craft.setSculptMesh(this.points,this.guide,fraction);this.craft.setSculptProgress(complete?1:fraction);
  if(notify)this.onProgress(this.work.sculpt);
  if(complete&&!this.success){this.release();this.success=document.createElement('div');this.success.className='sculpt-success';this.success.setAttribute('role','status');this.success.innerHTML='<span class="success-sparkles" aria-hidden="true">✦ ✧ ✦</span><strong>통과!</strong><span>목표 모양 90% 이상 완성</span><small>다음 작업대에서 장식 방법을 골라요.</small>';this.craft.el.append(this.success);this.canvas.classList.add('completed');this.hint.hidden=true;}
 }
 release(){const id=this.drag?.id;this.drag=null;if(id!==undefined&&this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);this.canvas.classList.remove('is-pulling');this.draw();}
 draw(){
  this.canvas.dataset.selected=String(this.selected);
  const c=this.ctx,w=this.canvas.width,h=this.canvas.height;c.clearRect(0,0,w,h);if(!this.guide.length||this.work.sculpt?.complete)return;c.save();c.lineWidth=2.5*devicePixelRatio;c.setLineDash([8*devicePixelRatio,6*devicePixelRatio]);c.strokeStyle='#fffdf0';c.shadowColor='#a7875d';c.shadowBlur=3*devicePixelRatio;c.beginPath();this.guide.forEach((p,i)=>c[i?'lineTo':'moveTo'](p[0]*w,p[1]*h));c.closePath();c.stroke();c.setLineDash([]);c.shadowBlur=0;
  this.guide.forEach((p,i)=>{const matched=this.matches[i]>=.9;c.beginPath();c.fillStyle=matched?'#56b783':'#f4cc77';c.strokeStyle=matched?'#357958':'#95723e';c.lineWidth=devicePixelRatio;c.arc(p[0]*w,p[1]*h,(matched?4.5:3)*devicePixelRatio,0,Math.PI*2);c.fill();c.stroke();});
  const a=this.points[this.selected],b=this.guide[this.selected];if(a){
   if(this.matches[this.selected]<.95){c.strokeStyle='#8f714b80';c.lineWidth=1.5*devicePixelRatio;c.setLineDash([3*devicePixelRatio,6*devicePixelRatio]);c.beginPath();c.moveTo(a[0]*w,a[1]*h);c.lineTo(b[0]*w,b[1]*h);c.stroke();c.setLineDash([]);}
   c.fillStyle='#fff1b8';c.strokeStyle='#967745';c.lineWidth=2*devicePixelRatio;c.beginPath();c.arc(a[0]*w,a[1]*h,8*devicePixelRatio,0,Math.PI*2);c.fill();c.stroke();
  }
  c.restore();
 }
 dispose(){this.running=false;this.abort.abort();this.observer.disconnect();cancelAnimationFrame(this.frame);this.canvas.remove();this.hint.remove();this.success?.remove();this.craft.sculptMesh=null;}
}
