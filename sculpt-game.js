import {clamp} from './arcade-rules.js';

// A closed, evenly sampled outline includes the top and bottom edges, not only side rows.
function sampleOutline(points,count=40){
 const lengths=points.map((p,i)=>Math.hypot(p[0]-points[(i+1)%points.length][0],p[1]-points[(i+1)%points.length][1]));
 const total=lengths.reduce((a,b)=>a+b,0),out=[];let edge=0,offset=0;
 for(let i=0;i<count;i++){const d=i/count*total;while(edge<lengths.length-1&&offset+lengths[edge]<d){offset+=lengths[edge++];}const a=points[edge],b=points[(edge+1)%points.length],t=(d-offset)/(lengths[edge]||1);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
 return out;
}
function inside(p,points){let yes=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
export class SculptGame {
 constructor(craft,work,onProgress){
  this.craft=craft;this.work=work;this.onProgress=onProgress;this.abort=new AbortController();this.running=true;this.guide=[];this.starts=[];this.points=[];this.amounts=[];this.selected=0;this.drag=null;
  this.canvas=document.createElement('canvas');this.canvas.className='sculpt-canvas';this.canvas.tabIndex=0;this.canvas.setAttribute('aria-label','흙을 누르고 점선까지 끌어 늘려요. 방향키로 잡을 곳을 고른 뒤 스페이스바로 늘릴 수도 있어요. 목표 모양 90퍼센트 이상이면 통과해요.');
  craft.el.append(this.canvas);this.ctx=this.canvas.getContext('2d');const opt={signal:this.abort.signal};
  this.canvas.addEventListener('pointerdown',e=>{if(e.button!==0||!this.points.length||work.sculpt?.complete)return;e.preventDefault();this.canvas.focus({preventScroll:true});const p=this.pos(e);let at=0,d=Infinity;this.points.forEach((q,i)=>{const delta=this.distance(p,q);if(delta<d){at=i;d=delta;}});if(!inside(p,this.points)&&d>30)return;this.selected=at;this.drag={id:e.pointerId,start:p,amounts:[...this.amounts]};this.canvas.setPointerCapture(e.pointerId);this.canvas.classList.add('is-pulling');this.draw();},opt);
  this.canvas.addEventListener('pointermove',e=>{if(!this.drag||this.drag.id!==e.pointerId||work.sculpt?.complete)return;const p=this.pos(e),i=this.selected,a=this.starts[i],b=this.guide[i],dx=b[0]-a[0],dy=b[1]-a[1],r=this.canvas.getBoundingClientRect(),mx=(p[0]-this.drag.start[0])*r.width,my=(p[1]-this.drag.start[1])*r.height,vx=dx*r.width,vy=dy*r.height;const gain=(mx*vx+my*vy)/(vx*vx+vy*vy||1);if(Math.hypot(mx,my)>3)this.pull(i,Math.max(0,gain),this.drag.amounts);},opt);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])this.canvas.addEventListener(type,()=>this.release(),opt);
  this.canvas.addEventListener('blur',()=>this.release(),opt);window.addEventListener('blur',()=>this.release(),opt);
  this.canvas.addEventListener('keydown',e=>{if(!this.guide.length||work.sculpt?.complete)return;if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown','Space'].includes(e.code)){e.preventDefault();if(e.code==='Space'){if(!e.repeat)this.pull(this.selected,.28,[...this.amounts]);}else{this.selected=(this.selected+(['ArrowLeft','ArrowUp'].includes(e.code)?-1:1)+this.guide.length)%this.guide.length;}this.draw();}},opt);
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(this.canvas);
  this.wait=()=>{if(!this.running)return;if(craft.el.dataset.status==='ready'){this.resize();}else this.frame=requestAnimationFrame(this.wait);};this.wait();
 }
 pos(e){const r=this.canvas.getBoundingClientRect();return [clamp((e.clientX-r.left)/r.width),clamp((e.clientY-r.top)/r.height)];}
 distance(a,b){const r=this.canvas.getBoundingClientRect();return Math.hypot((a[0]-b[0])*r.width,(a[1]-b[1])*r.height);}
 resize(){
  const r=this.canvas.getBoundingClientRect();this.canvas.width=Math.max(1,Math.round(r.width*devicePixelRatio));this.canvas.height=Math.max(1,Math.round(r.height*devicePixelRatio));if(this.craft.el.dataset.status!=='ready')return;
  const outline=this.craft.getSculptGuide();if(outline.length<3)return;this.guide=sampleOutline(outline);const xs=this.guide.map(p=>p[0]),ys=this.guide.map(p=>p[1]),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys),cx=(left+right)/2,H=bottom-top,W=right-left;
  // Begin with a compact mound on the same baseline as the completed vessel.
  const rx=Math.min(W*.42,H*r.height/r.width*.5),ry=Math.min(H*.23,W*r.width/r.height*.3),cy=bottom-ry;
  this.starts=this.guide.map((_,i)=>{const theta=-Math.PI/2-i/this.guide.length*Math.PI*2;return [cx+rx*Math.cos(theta),cy+ry*Math.sin(theta)];});
  if(!this.amounts.length){const old=this.work.sculpt;this.amounts=old?.mode==='stretch'&&old.amounts?.length===this.guide.length?old.amounts.map(n=>clamp(Number(n)||0)):this.guide.map(()=>Math.min(.85,old?.fraction||0));}
  this.canvas.dataset.guide=JSON.stringify(this.guide);this.publish(false);this.draw();
 }
 pull(index,gain,before){
  if(this.work.sculpt?.complete)return;const n=this.guide.length;
  this.amounts=this.amounts.map((current,i)=>{const distance=Math.min(Math.abs(i-index),n-Math.abs(i-index)),weight=Math.exp(-distance*distance/12);return Math.max(current,clamp(before[i]+gain*weight));});
  this.publish(true);this.draw();
 }
 publish(notify){
  this.points=this.guide.map((p,i)=>this.starts[i].map((v,j)=>v+(p[j]-v)*this.amounts[i]));
  const fraction=this.amounts.reduce((a,b)=>a+b,0)/this.amounts.length,complete=fraction>=.9;
  this.work.sculpt={mode:'stretch',fraction,complete,amounts:[...this.amounts]};this.work.knead=complete?3:Math.min(2,Math.floor(fraction*3));
  this.canvas.dataset.current=JSON.stringify(this.points);this.canvas.dataset.coverage=String(fraction);this.canvas.dataset.selected=String(this.selected);
  this.craft.setSculptMesh(this.points,this.guide,fraction);this.craft.setSculptProgress(complete?1:fraction);
  if(notify)this.onProgress(this.work.sculpt);
  if(complete&&!this.success){this.release();this.success=document.createElement('div');this.success.className='sculpt-success';this.success.setAttribute('role','status');this.success.innerHTML='<span class="success-sparkles" aria-hidden="true">✦ ✧ ✦</span><strong>통과!</strong><span>목표 모양 90% 이상 완성</span><small>다음 작업대에서 무늬를 넣어 보아요.</small>';this.craft.el.append(this.success);this.canvas.classList.add('completed');}
 }
 release(){const id=this.drag?.id;this.drag=null;if(id!==undefined&&this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);this.canvas.classList.remove('is-pulling');this.draw();}
 draw(){
  const c=this.ctx,w=this.canvas.width,h=this.canvas.height;c.clearRect(0,0,w,h);if(!this.guide.length||this.work.sculpt?.complete)return;c.save();c.lineWidth=2.5*devicePixelRatio;c.setLineDash([8*devicePixelRatio,6*devicePixelRatio]);c.strokeStyle='#fffdf0';c.shadowColor='#a7875d';c.shadowBlur=3*devicePixelRatio;c.beginPath();this.guide.forEach((p,i)=>c[i?'lineTo':'moveTo'](p[0]*w,p[1]*h));c.closePath();c.stroke();c.setLineDash([]);c.shadowBlur=0;
  this.guide.forEach((p,i)=>{const matched=this.amounts[i]>=.9;c.beginPath();c.fillStyle=matched?'#56b783':'#f4cc77';c.strokeStyle=matched?'#357958':'#95723e';c.lineWidth=devicePixelRatio;c.arc(p[0]*w,p[1]*h,(matched?4.5:3)*devicePixelRatio,0,Math.PI*2);c.fill();c.stroke();});
  // The selected clay point and its destination make the pulling gesture explicit.
  const a=this.points[this.selected],b=this.guide[this.selected];if(a&&this.amounts[this.selected]<.95){c.strokeStyle='#8f714b';c.lineWidth=2*devicePixelRatio;c.setLineDash([4*devicePixelRatio,5*devicePixelRatio]);c.beginPath();c.moveTo(a[0]*w,a[1]*h);c.lineTo(b[0]*w,b[1]*h);c.stroke();c.setLineDash([]);c.fillStyle='#fff1b8';c.strokeStyle='#967745';c.beginPath();c.arc(a[0]*w,a[1]*h,9*devicePixelRatio,0,Math.PI*2);c.fill();c.stroke();}
  c.restore();
 }
 dispose(){this.running=false;this.abort.abort();this.observer.disconnect();cancelAnimationFrame(this.frame);this.canvas.remove();this.success?.remove();this.craft.sculptMesh=null;}
}
