import {clamp,newKiln,stepKiln,fanKiln,KILN_HEAT_RULES,distanceToSegment,dryingFanGeometry,dryingFanGrabOffset,dryWithFan} from './arcade-rules.js';
const names={dry:'내 청자 말리기',biscuit:'초벌 가마의 불 지키기',glaze:'내 청자 유약 바르기',fire:'재벌 가마의 불 지키기'};
const fallbackVesselPath=new Path2D('M146 26 Q180 16 214 26 L211 47 C211 65 245 73 250 106 C261 155 237 196 218 207 Q180 218 142 207 C123 196 99 155 110 106 C115 73 149 65 149 47 Z');
const zoneNames=['위쪽','가운데','아래쪽'];
// Twenty poses share one rigid fan/hand drawing. Interpolate between them so
// the child and stool never change size and repeated taps cannot restart a swing.
const fanPoses=Array.from({length:21},(_,i)=>-38*(1-Math.cos(i/20*Math.PI*2))/2);
const fanStrokeSeconds=.56;
export class KilnGame {
 constructor(container,kind,{onComplete,onCancel,onGlaze,workSurface,workbench,controlsHost}={}){
  this.workbench=workbench;this.controlsHost=controlsHost;this.inplace=Boolean(workbench&&workSurface?.placement);this.dryFanActive=0;this.dryFanPhase=0;this.workSurface=workSurface;this.fanPhase=1;this.fanQueued=false;this.fanTaps=0;this.kind=kind;this.gesture=kind==='dry'||kind==='glaze';this.callbacks={onComplete,onCancel,onGlaze};this.abort=new AbortController();this.held=false;this.time=0;this.glaze=0;this.paused=false;this.finished=false;this.disposed=false;this.kiln=newKiln(kind);this.dryZones=[0,0,0];this.cursor=[.5,.5];this.pointer=null;this.painted=new Set();this.cells=[];
  this.element=document.createElement('section');this.element.className='minigame-overlay kiln-minigame '+kind+(this.gesture?' gesture-game':'')+(this.gesture&&this.inplace?' kiln-gesture-dock':'');this.element.setAttribute('aria-label',names[kind]);
  this.element.innerHTML=`<div class="minigame-card"><h2>${names[kind]}</h2><p class="mini-instruction">${kind==='dry'?'부채를 잡고 좌우로 흔들어요.<br>위·가운데·아래를 말려요.':kind==='glaze'?'붓을 누른 채 쓱쓱 칠해요.<br>빈 곳까지 고르게 채워요.':matchMedia('(pointer: coarse)').matches?'부채질 버튼을 톡톡 눌러요.':'스페이스바를 톡톡 눌러 부채질해요.'}</p>${this.gesture?`${this.inplace?'':`<div class="gesture-stage"><canvas class="kiln-gesture-canvas" width="720" height="460" tabindex="0" role="application" aria-label="${kind==='dry'?'부채질 작업대. 누른 채 부채를 움직이거나 방향키와 Enter로 바람을 보내세요.':'유약 작업대. 붓을 드래그하거나 방향키와 Enter로 칠하세요.'}"></canvas></div>`}<p class="gesture-keyboard">방향키 이동 · Enter ${kind==='dry'?'부채질':'칠하기'}</p>`:`<div class="kiln-firing-work"><div class="kiln-fanning-scene" aria-hidden="true"><img class="kiln-static-scene" src="/assets/kiln/kiln-static.webp" alt="" width="512" height="384"><img class="kiln-fanning-body" src="/assets/kiln/fanning-01.webp" alt="" width="512" height="384"><img class="kiln-fanning-hand" src="/assets/kiln/fanning-01.webp" alt="" width="512" height="384"></div><div class="kiln-heat-controls"><div class="heat-meter" role="meter" aria-label="가마 온도" aria-valuemin="0" aria-valuemax="100"><i class="safe-zone"></i><b class="heat-needle"></b></div>`}<div class="mini-progress-track" role="progressbar" aria-label="${kind==='dry'?'고르게 말린 정도':kind==='glaze'?'유약을 칠한 정도':'굽기 진행'}" aria-valuemin="0" aria-valuemax="100"><i></i></div><p class="mini-status" role="status">준비됐나요?</p>${this.gesture?'':`<button class="bellows-button" type="button">부채질${matchMedia('(pointer: coarse)').matches?'':' · 스페이스바'}</button></div></div>`}<div class="mini-controls"><button class="small-button" data-mini="pause">잠깐 쉬기</button><button class="small-button" data-mini="cancel">작업대로</button></div></div>`;
  if(this.gesture&&this.inplace&&controlsHost){this.controlsHostHadClass=controlsHost.classList.contains('kiln-gesture-controls');controlsHost.classList.add('kiln-gesture-controls');controlsHost.append(this.element);}else container.append(this.element);this.button=this.element.querySelector('.bellows-button');this.status=this.element.querySelector('.mini-status');this.meter=this.element.querySelector('.heat-meter');this.needle=this.element.querySelector('.heat-needle');this.progress=this.element.querySelector('.mini-progress-track i');this.progressTrack=this.element.querySelector('.mini-progress-track');const options={signal:this.abort.signal};
  if(this.gesture)this.setupGesture(options);else{
   const safe=this.element.querySelector('.safe-zone');safe.style.left=`${KILN_HEAT_RULES.safeMin*100}%`;safe.style.width=`${(KILN_HEAT_RULES.safeMax-KILN_HEAT_RULES.safeMin)*100}%`;this.fanHand=this.element.querySelector('.kiln-fanning-hand');this.element.dataset.safeMin=String(KILN_HEAT_RULES.safeMin);this.element.dataset.safeMax=String(KILN_HEAT_RULES.safeMax);
   this.button.addEventListener('click',e=>{if(e.detail===0){this.release();this.press();this.release();}},options);
   this.button.addEventListener('pointerdown',e=>{if(e.button!==0||e.isPrimary===false||this.firingPointer!==undefined||this.paused||this.finished)return;e.preventDefault();this.button.focus({preventScroll:true});this.firingPointer=e.pointerId;this.button.setPointerCapture(e.pointerId);this.press();},options);
   for(const event of ['pointerup','pointercancel','lostpointercapture'])this.button.addEventListener(event,e=>{if(this.firingPointer===e.pointerId)this.release();},options);
   document.addEventListener('keydown',e=>{if(e.code==='Space'&&this.element.contains(e.target)&&(!e.target.closest('button,input,select,textarea')||e.target===this.button)){e.preventDefault();if(!e.repeat)this.press();}},options);document.addEventListener('keyup',e=>{if(e.code==='Space'){if(e.target===this.button)e.preventDefault();this.release();}},options);
  }
  window.addEventListener('blur',()=>this.pause(true),options);document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause(true);},options);
  this.element.querySelector('[data-mini=cancel]').addEventListener('click',()=>{this.dispose();onCancel?.();},options);this.element.querySelector('[data-mini=pause]').addEventListener('click',()=>this.pause(!this.paused),options);
  this.last=performance.now();this.tick=now=>{if(this.finished)return;const dt=Math.min(.1,(now-this.last)/1000);this.last=now;if(!this.paused)this.update(dt);this.frame=requestAnimationFrame(this.tick);};this.frame=requestAnimationFrame(this.tick);
  (this.canvas||this.button).focus({preventScroll:true});this.update(0);
 }
 setupGesture(options){
  if(this.inplace){
   this.originalCanvas=this.workbench.querySelector('canvas');this.workbenchWasInert=this.workbench.inert;this.workbench.inert=false;
   this.canvas=document.createElement('canvas');this.canvas.className='kiln-gesture-canvas kiln-inplace-canvas';this.canvas.width=720;this.canvas.height=460;this.canvas.tabIndex=0;this.canvas.setAttribute('role','application');this.canvas.setAttribute('aria-label',this.kind==='dry'?'내 청자에 부채질하기':'내 청자에 유약 칠하기');this.workbench.append(this.canvas);
   this.gestureResize=new ResizeObserver(()=>{this.alignGestureCanvas();this.drawGesture();});this.gestureResize.observe(this.workbench);this.gestureResize.observe(this.originalCanvas);this.alignGestureCanvas();
  }else this.canvas=this.element.querySelector('canvas');
  this.ctx=this.canvas.getContext('2d');this.ctx.scale(2,2);this.prepareSurface();
  if(this.kind==='dry'&&this.inplace){this.zoneProgress=document.createElement('div');this.zoneProgress.className='dry-zone-progress';this.zoneProgress.setAttribute('role','group');this.zoneProgress.setAttribute('aria-label','청자 말린 정도');this.zoneProgress.innerHTML=['위','가운데','아래'].map((label,i)=>`<span data-dry-zone="${i}"><span>${label}</span><output>0%</output><i class="dry-zone-fill"></i></span>`).join('');this.workbench.append(this.zoneProgress);}
  if(this.kind==='dry'&&this.inplace){this.dryControls=document.createElement('div');this.dryControls.className='dry-tool-controls';this.dryControls.innerHTML='<button type="button" class="small-button" data-dry-control="pause">잠깐 쉬기</button><button type="button" class="small-button" data-dry-control="cancel">작업대로</button>';this.workbench.append(this.dryControls);this.dryControls.addEventListener('click',e=>{const action=e.target.closest('[data-dry-control]')?.dataset.dryControl;if(action==='pause')this.pause(!this.paused);if(action==='cancel'){this.dispose();this.callbacks.onCancel?.();}},options);}
  if(this.kind==='dry')this.dryFanFrames=Array.from({length:8},(_,i)=>{const image=new Image();image.onload=()=>{if(!this.disposed)this.drawGesture();};image.src=`/assets/kiln/drying-fan-${String(i+1).padStart(2,'0')}.webp`;return image;});
  this.canvas.dataset.paintCells=JSON.stringify(this.cells.map(({x,y})=>[x,y]));
  this.canvas.addEventListener('pointerdown',e=>{if(e.button!==0||e.isPrimary===false||this.pointer||this.paused||this.finished)return;e.preventDefault();this.canvas.focus({preventScroll:true});this.canvas.setPointerCapture(e.pointerId);const point=this.pos(e),offset=this.kind==='dry'?dryingFanGrabOffset(point,this.cursor,this.canvas.getBoundingClientRect()):[0,0];this.pointer={id:e.pointerId,offset,last:point.map((v,i)=>v+offset[i])};this.cursor=this.pointer.last;this.held=true;this.canvas.classList.add('held');if(this.kind==='glaze')this.paintStroke(this.cursor,this.cursor);this.drawGesture();},options);
  this.canvas.addEventListener('pointermove',e=>{if(e.isPrimary===false||(this.pointer&&this.pointer.id!==e.pointerId)||(this.kind==='dry'&&!this.pointer))return;this.cursor=this.pos(e).map((v,i)=>v+(this.pointer?.offset?.[i]||0));if(this.pointer?.id===e.pointerId&&!this.paused&&!this.finished){const last=this.pointer.last;this.pointer.last=this.cursor;if(this.kind==='dry')this.fanStroke(last,this.cursor);else this.paintStroke(last,this.cursor);}this.drawGesture();},options);
  for(const event of ['pointerup','pointercancel','lostpointercapture'])this.canvas.addEventListener(event,e=>{if(this.pointer?.id===e.pointerId)this.release();},options);
  this.canvas.addEventListener('blur',()=>this.release(),options);
  this.canvas.addEventListener('keydown',e=>{
   if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter'].includes(e.code))return;e.preventDefault();if(this.paused||this.finished)return;
   if(e.code==='ArrowLeft')this.cursor[0]=clamp(this.cursor[0]-.075,.03,.97);if(e.code==='ArrowRight')this.cursor[0]=clamp(this.cursor[0]+.075,.03,.97);if(e.code==='ArrowUp')this.cursor[1]=clamp(this.cursor[1]-.075,.08,.92);if(e.code==='ArrowDown')this.cursor[1]=clamp(this.cursor[1]+.075,.08,.92);
   if(e.code==='Enter'&&!e.repeat){if(this.kind==='dry')this.fanStroke(this.cursor,this.cursor,true);else this.paintStroke(this.cursor,this.cursor);}
   this.drawGesture();
  },options);
 }
 alignGestureCanvas(){if(!this.inplace||!this.originalCanvas)return;const r=this.originalCanvas.getBoundingClientRect(),parent=this.workbench.getBoundingClientRect();if(this.pointer&&this.gestureSize&&(this.gestureSize.width!==r.width||this.gestureSize.height!==r.height))this.release();this.gestureSize={width:r.width,height:r.height};Object.assign(this.canvas.style,{position:'absolute',left:`${r.left-parent.left}px`,top:`${r.top-parent.top}px`,width:`${r.width}px`,height:`${r.height}px`,maxWidth:'none',zIndex:'8',pointerEvents:'auto'});}
 prepareSurface(){
  const make=()=>{const canvas=document.createElement('canvas');canvas.width=720;canvas.height=460;return canvas;};
  this.surfaceImage=make();this.surfaceMask=make();this.surfaceFinish=make();this.paintMask=make();this.surfaceOverlay=make();
  const image=this.workSurface?.image,mask=this.workSurface?.mask,valid=image?.width>0&&image?.height>0&&mask?.width===image.width&&mask?.height===image.height;
  if(valid){this.sourceImage=image;this.sourceMask=mask;this.sourceFinish=this.workSurface.glazedImage||image;this.canvas.dataset.workSurface='authored';}
  else{
   this.sourceImage=make();this.sourceMask=make();this.sourceFinish=make();
   for(const [target,color] of [[this.sourceImage,'#c5b09a'],[this.sourceMask,'#fff'],[this.sourceFinish,'#9dbda5']]){const c=target.getContext('2d');c.scale(2,2);c.fillStyle=color;c.fill(fallbackVesselPath);if(target!==this.sourceMask){c.strokeStyle='#8d6d5a';c.lineWidth=2.5;c.stroke(fallbackVesselPath);}}
   this.canvas.dataset.workSurface='fallback';
  }
  const width=this.sourceMask.width,height=this.sourceMask.height,pixels=this.sourceMask.getContext('2d').getImageData(0,0,width,height).data;let left=width,top=height,right=0,bottom=0;this.sourceCells=[];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>24){left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);}
  this.sourceBounds=right>left?{x:left/width,y:top/height,width:(right-left)/width,height:(bottom-top)/height}:{x:0,y:0,width:1,height:1};
  // Stable source-local targets preserve progress when the workbench is resized.
  for(let row=0;row<24;row++)for(let col=0;col<36;col++){const x=(col+.5)/36,y=(row+.5)/24;if(pixels[(Math.floor(y*height)*width+Math.floor(x*width))*4+3]>24)this.sourceCells.push({id:`${col}:${row}`,x,y});}
  if(this.kind==='dry'){
   this.dryAvailableZones=[false,false,false];
   for(const p of this.sourceCells)this.dryAvailableZones[clamp(Math.floor((p.y-this.sourceBounds.y)/this.sourceBounds.height*3),0,2)]=true;
   this.noDrySurface=!this.dryAvailableZones.some(Boolean);
   // A cutout has no clay to dry. Occupied bands still require fan contact;
   // an entirely empty mask is an unavailable task, never an automatic win.
   this.dryZones=this.noDrySurface?[0,0,0]:this.dryAvailableZones.map(available=>available?0:1);
   this.canvas.dataset.availableZones=JSON.stringify(this.dryAvailableZones);
  }
  this.refreshSurfacePlacement();
 }
 refreshSurfacePlacement(){
  let p=this.inplace?(typeof this.workSurface.placement==='function'?this.workSurface.placement():this.workSurface.placement):null;
  if(!p){const scale=Math.min(576/this.sourceImage.width,368/this.sourceImage.height),width=this.sourceImage.width*scale/720,height=this.sourceImage.height*scale/460;p={x:(1-width)/2,y:(1-height)/2,width,height};}
  if(this.placement&&['x','y','width','height'].every(key=>Math.abs(this.placement[key]-p[key])<.0001))return;
  if(this.placement){const old=this.placement,copy=document.createElement('canvas');copy.width=720;copy.height=460;copy.getContext('2d').drawImage(this.paintMask,0,0);const c=this.paintMask.getContext('2d');c.clearRect(0,0,720,460);c.drawImage(copy,old.x*720,old.y*460,old.width*720,old.height*460,p.x*720,p.y*460,p.width*720,p.height*460);}
  this.placement={...p};
  for(const [target,source] of [[this.surfaceImage,this.sourceImage],[this.surfaceMask,this.sourceMask],[this.surfaceFinish,this.sourceFinish]]){const c=target.getContext('2d');c.clearRect(0,0,720,460);c.drawImage(source,p.x*720,p.y*460,p.width*720,p.height*460);}
  if(this.workSurface?.image&&!this.workSurface.glazedImage){const c=this.surfaceFinish.getContext('2d');c.globalCompositeOperation='source-atop';c.fillStyle='#8fbfa744';c.fillRect(0,0,720,460);c.globalCompositeOperation='source-over';}
  const b=this.sourceBounds;this.bounds={x:p.x+b.x*p.width,y:p.y+b.y*p.height,width:b.width*p.width,height:b.height*p.height};
  this.cells=this.sourceCells.map(cell=>({...cell,x:p.x+cell.x*p.width,y:p.y+cell.y*p.height}));
  this.canvas.dataset.paintCells=JSON.stringify(this.cells.map(({x,y})=>[x,y]));this.canvas.dataset.surfaceBounds=JSON.stringify(this.bounds);
 }
 pos(e){const r=this.canvas.getBoundingClientRect();return [clamp((e.clientX-r.left)/r.width),clamp((e.clientY-r.top)/r.height)];}
 zone(y){return clamp(Math.floor((y-this.bounds.y)/this.bounds.height*3),0,2);}
 fanStroke(a,b,keyboard=false){
  const viewport=this.canvas.getBoundingClientRect();this.refreshSurfacePlacement();
  this.dryZones=dryWithFan(this.dryZones,a,b,viewport,this.cells,this.bounds,{keyboard});
  this.dryFanActive=.32;this.refreshGesture();
 }
 paintStroke(a,b){
  for(const cell of this.cells){const p=[cell.x,cell.y*460/720],start=[a[0],a[1]*460/720],end=[b[0],b[1]*460/720];if(distanceToSegment(p,start,end)<=.09)this.painted.add(cell.id);}
  const c=this.paintMask.getContext('2d');c.strokeStyle='#fff';c.fillStyle='#fff';c.lineWidth=.18*720;c.lineCap='round';c.beginPath();c.moveTo(a[0]*720,a[1]*460);c.lineTo(b[0]*720,b[1]*460);c.stroke();c.beginPath();c.arc(b[0]*720,b[1]*460,.09*720,0,Math.PI*2);c.fill();
  this.glaze=this.painted.size/Math.max(1,this.cells.length);this.callbacks.onGlaze?.(this.glaze);this.refreshGesture();
 }
 refreshGesture(){
  const value=this.kind==='dry'?this.dryZones.reduce((a,b)=>a+b,0)/3:this.glaze;this.display(value,value);this.canvas.dataset.zoneProgress=JSON.stringify(this.dryZones);this.canvas.dataset.coverage=String(value);
  this.zoneProgress?.querySelectorAll('[data-dry-zone]').forEach((el,i)=>{const percent=Math.floor(this.dryZones[i]*100),available=this.dryAvailableZones[i];el.querySelector('output').value=available?percent+'%':'없음';el.title=available?`${zoneNames[i]} ${percent}% 말림`:`${zoneNames[i]}에 말릴 흙이 없어요.`;el.dataset.available=String(available);el.style.setProperty('--dry-progress',percent+'%');});
  if(this.noDrySurface){this.finished=true;this.element.dataset.emptySurface='true';this.status.textContent='말릴 흙이 남아 있지 않아요. 작업대로 돌아가 무늬를 고쳐 주세요.';this.element.querySelector('[data-mini=pause]').disabled=true;if(this.dryControls)this.dryControls.querySelector('[data-dry-control=pause]').disabled=true;this.drawGesture();return;}
  this.status.textContent=this.kind==='dry'?this.dryZones.every(v=>v>=1)?'세 곳 모두 고르게 말랐어요.':zoneNames.map((name,i)=>`${name} ${this.dryAvailableZones[i]?Math.floor(this.dryZones[i]*100)+'%':'흙 없음'}`).join(' · '):`유약 ${Math.floor(value*100)}% · 빈 곳까지 쓱쓱 칠해요.`;
  this.drawGesture();if(this.kind==='dry'?this.dryZones.every(v=>v>=1):value>=.9){if(this.kind==='glaze')this.callbacks.onGlaze?.(1);this.win();}
 }
 drawGesture(){
  if(!this.ctx)return;this.refreshSurfacePlacement();const c=this.ctx;c.clearRect(0,0,360,230);if(!this.inplace){c.fillStyle='#fff8e8';c.fillRect(0,0,360,230);c.fillStyle='#ad907a25';c.beginPath();c.ellipse(180,Math.min(224,(this.bounds.y+this.bounds.height)*230+5),this.bounds.width*165,6,0,0,Math.PI*2);c.fill();c.drawImage(this.surfaceImage,0,0,360,230);}
  const overlay=this.surfaceOverlay.getContext('2d');overlay.setTransform(1,0,0,1,0,0);overlay.clearRect(0,0,720,460);overlay.globalCompositeOperation='source-over';
  if(this.kind==='dry'){
   for(let i=0;i<3;i++){const y=(this.bounds.y+this.bounds.height*i/3)*460,h=this.bounds.height/3*460;overlay.fillStyle=`rgba(112,153,164,${.34*(1-this.dryZones[i])})`;overlay.fillRect(0,y,720,h);overlay.strokeStyle=`rgba(65,115,137,${.5*(1-this.dryZones[i])})`;overlay.lineWidth=3;for(let j=0;j<5;j++){const x=(this.bounds.x+this.bounds.width*(j+.5)/5)*720,dy=y+h*.4;overlay.beginPath();overlay.moveTo(x,dy);overlay.quadraticCurveTo(x-7,dy+13,x,dy+17);overlay.quadraticCurveTo(x+7,dy+13,x,dy);overlay.stroke();}}
  }else{overlay.drawImage(this.surfaceFinish,0,0);overlay.globalCompositeOperation='destination-in';overlay.drawImage(this.paintMask,0,0);}
  overlay.globalCompositeOperation='destination-in';overlay.drawImage(this.surfaceMask,0,0);overlay.globalCompositeOperation='source-over';c.drawImage(this.surfaceOverlay,0,0,360,230);
  // Drying contact follows the same visible fan; the brush keeps its own tip.
  c.save();const r=this.canvas.getBoundingClientRect();
  if(this.kind==='dry'){
   const index=this.dryFanActive>0?Math.floor(this.dryFanPhase/.045)%8:2,frame=this.dryFanFrames?.[index];this.element.dataset.dryFanFrame=String(index+1);
   if(r.width&&r.height){
    const fan=dryingFanGeometry(this.cursor,r),{x,y,width:size}=fan;if(this.zoneProgress)this.zoneProgress.dataset.position=this.bounds.y*r.height<48?'bottom':'top';
    if(frame?.complete&&frame.naturalWidth)c.drawImage(frame,x/r.width*360,y/r.height*230,size/r.width*360,size/r.height*230);this.canvas.dataset.toolBounds=JSON.stringify({x,y,width:size,height:size});
   }
  }else{
   const marginX=8/r.width*360,marginY=8/r.height*230,x=clamp(this.cursor[0]*360,29+marginX,360-23-marginX),y=clamp(this.cursor[1]*230,37+marginY,230-27-marginY);
   c.translate(x,y);c.rotate(-.55);this.canvas.dataset.toolBounds=JSON.stringify({x:(x-29)/360*r.width,y:(y-37)/230*r.height,width:52/360*r.width,height:64/230*r.height});
   c.strokeStyle='#9a7555';c.lineWidth=8;c.lineCap='round';c.beginPath();c.moveTo(0,0);c.lineTo(0,-32);c.stroke();c.fillStyle='#8bad96';c.strokeStyle='#6c826a';c.lineWidth=1.5;c.beginPath();c.moveTo(-8,-2);c.lineTo(8,-2);c.lineTo(10,15);c.quadraticCurveTo(0,23,-10,15);c.closePath();c.fill();c.stroke();
  }c.restore();
 }
 updateFanning(dt=0){
  if(!this.fanHand)return;
  if(this.fanPhase<1){
   this.fanPhase+=dt/fanStrokeSeconds;
   if(this.fanPhase>=1){if(this.fanQueued){this.fanPhase-=1;this.fanQueued=false;}else this.fanPhase=1;}
  }
  const pose=Math.min(20,this.fanPhase*20),index=Math.min(19,Math.floor(pose)),angle=fanPoses[index]+(fanPoses[index+1]-fanPoses[index])*(pose-index);
  this.fanHand.style.transform=`rotate(${angle.toFixed(3)}deg)`;
  this.element.dataset.fanPhase=String(this.fanPhase);
 }
 press(){if(this.paused||this.finished||this.held)return;if(this.kiln.failed)this.kiln=newKiln(this.kind);this.held=true;this.button?.classList.add('held');this.kiln=fanKiln(this.kiln);if(this.fanPhase>=1)this.fanPhase=0;else this.fanQueued=true;this.fanTaps++;this.element.dataset.fanTaps=String(this.fanTaps);this.update(0);}
 release(){const pointer=this.pointer,firingPointer=this.firingPointer;this.pointer=null;this.firingPointer=undefined;this.held=false;this.button?.classList.remove('held');this.canvas?.classList.remove('held');if(pointer&&this.canvas.hasPointerCapture(pointer.id))this.canvas.releasePointerCapture(pointer.id);if(firingPointer!==undefined&&this.button?.hasPointerCapture(firingPointer))this.button.releasePointerCapture(firingPointer);this.drawGesture();}
 pause(value){if(this.finished)return;this.paused=value;this.release();this.dryFanActive=0;this.updateFanning();this.drawGesture();this.element.classList.toggle('paused',value);this.element.querySelector('[data-mini=pause]').textContent=value?'계속하기':'잠깐 쉬기';if(this.dryControls)this.dryControls.querySelector('[data-dry-control=pause]').textContent=value?'계속하기':'잠깐 쉬기';this.status.textContent=value?'잠깐 쉬는 중 · 계속하기를 눌러요.':'천천히 다시 해봐요.';if(!value){this.last=performance.now();(this.canvas||this.button)?.focus({preventScroll:true});}}
 update(dt){if(this.gesture){if(!this.initialized){this.initialized=true;this.refreshGesture();}if(this.kind==='dry'&&this.dryFanActive>0){this.dryFanActive=Math.max(0,this.dryFanActive-dt);this.dryFanPhase+=dt;this.drawGesture();}return;}this.time+=dt;this.kiln=stepKiln(this.kiln,dt);this.updateFanning(dt);this.display(this.kiln.heat,this.kiln.steady/KILN_HEAT_RULES.steadySeconds);this.element.style.setProperty('--heat',this.kiln.heat);this.status.textContent=this.kiln.failed?'불이 너무 세거나 약했어요. 눌러서 다시 도전해요.':this.kiln.heat>=KILN_HEAT_RULES.safeMin&&this.kiln.heat<=KILN_HEAT_RULES.safeMax?'알맞은 불이에요.':this.kiln.heat<KILN_HEAT_RULES.safeMin?'불이 약해요. 부채질해 주세요.':'불이 세요. 잠깐 쉬어 주세요.';if(this.kiln.complete)this.win();}
 display(position,progress){if(this.needle)this.needle.style.left=`${position*100}%`;this.progress.style.width=`${clamp(progress)*100}%`;this.meter?.setAttribute('aria-valuenow',String(Math.round(position*100)));this.progressTrack.setAttribute('aria-valuenow',String(Math.floor(clamp(progress)*100)));this.element.dataset.value=String(position);this.element.dataset.progress=String(progress);}
 win(){if(this.finished)return;this.finished=true;this.release();this.status.textContent='성공! 도공의 손길로 완성했어요.';this.element.classList.add('mini-won');this.timer=setTimeout(()=>{this.dispose();this.callbacks.onComplete?.();},650);}
 dispose(){this.finished=true;this.disposed=true;this.release();this.abort.abort();this.gestureResize?.disconnect();cancelAnimationFrame(this.frame);clearTimeout(this.timer);this.zoneProgress?.remove();this.dryControls?.remove();if(this.inplace&&this.gesture){this.canvas?.remove();this.workbench.inert=this.workbenchWasInert;if(this.controlsHost&&!this.controlsHostHadClass)this.controlsHost.classList.remove('kiln-gesture-controls');}this.element.remove();}
}
