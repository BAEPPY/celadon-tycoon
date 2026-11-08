const clamp=v=>Math.max(0,Math.min(1,v));
export function beginInlay(work) {
  work.clay??={body:true,slip:'white',kneads:6,prepared:true};
  if(!work.inlay || !Array.isArray(work.inlay.targets))work.inlay={fill:[],wipe:[],targets:[],fillDone:false,wipeDone:false,slip:work.clay.slip||'white'};
  work.inlay.fill??=[];work.inlay.wipe??=[];
  return work.inlay;
}
export function setInlaySlip(work,slip) {
  if(!['white','dark'].includes(slip))return;
  work.clay??={body:true,kneads:6,prepared:true};work.clay.slip=slip;
  beginInlay(work).slip=slip;
}
export function inlayProgress(work) {
  const s=work.inlay,n=s?.targets?.length||0;
  return {fill:s?.fillDone?1:n?clamp(new Set(s.fill||[]).size/n):0,wipe:s?.wipeDone?1:n?clamp(new Set(s.wipe||[]).size/n):0,fillDone:!!s?.fillDone,wipeDone:!!s?.wipeDone};
}
export class InlayGame {
  constructor(craft,work,{mode='fill',onProgress=()=>{},onComplete=()=>{}}={}){
    this.craft=craft;this.work=work;this.mode=mode;this.onProgress=onProgress;this.onComplete=onComplete;this.state=beginInlay(work);this.abort=new AbortController();this.running=true;this.selected=0;this.pointer=null;this.cursor=null;
    work.inlayMode=mode;if(!work.decorDone)work.decorPhase=1;
    this.canvas=document.createElement('canvas');this.canvas.className=`inlay-canvas inlay-${mode}`;this.canvas.tabIndex=0;
    this.canvas.setAttribute('aria-label',mode==='fill'?'무늬 위를 색흙 붓으로 문질러 채우세요. 방향키로 무늬를 고르고 엔터로 칠할 수도 있어요.':'도자기의 색흙을 스펀지로 문질러 닦으세요. 방향키로 무늬를 고르고 엔터로 닦을 수도 있어요.');
    craft.el.append(this.canvas);this.ctx=this.canvas.getContext('2d');const opt={signal:this.abort.signal};
    this.canvas.addEventListener('pointerdown',e=>{if(e.button!==0||this.done)return;e.preventDefault();this.canvas.focus({preventScroll:true});this.canvas.setPointerCapture(e.pointerId);this.pointer={id:e.pointerId,last:this.position(e)};this.cursor=this.pointer.last;this.brush(this.cursor);this.draw();},opt);
    this.canvas.addEventListener('pointermove',e=>{this.cursor=this.position(e);if(this.pointer?.id===e.pointerId&&!this.done){const a=this.pointer.last,b=this.cursor,n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/10));for(let i=1;i<=n;i++)this.brush([a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n],false);this.pointer.last=b;this.emit();}this.draw();},opt);
    for(const event of ['pointerup','pointercancel','lostpointercapture'])this.canvas.addEventListener(event,()=>this.release(),opt);
    this.canvas.addEventListener('pointerleave',()=>{if(!this.pointer){this.cursor=null;this.draw();}},{signal:this.abort.signal});
    window.addEventListener('blur',()=>this.release(),opt);document.addEventListener('visibilitychange',()=>{if(document.hidden)this.release();},opt);
    this.canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter'].includes(e.code)||this.done)return;e.preventDefault();const visible=this.visibleTargets();if(!visible.length)return;if(e.code==='Enter'){if(e.repeat)return;const target=visible[this.selected%visible.length];this.cursor=target.screen;this.brush(target.screen);}else this.selected=(this.selected+(['ArrowLeft','ArrowUp'].includes(e.code)?-1:1)+visible.length)%visible.length;this.cursor=visible[this.selected%visible.length].screen;this.draw();},opt);
    this.resize=new ResizeObserver(()=>this.size());this.resize.observe(craft.el);
    this.ready=()=>{if(!this.running)return;if(craft.el.dataset.status==='ready'){if(!this.state.targets.length)this.state.targets=craft.getInlayTargets();this.size();this.emit(false);this.watch();}else this.readyFrame=requestAnimationFrame(this.ready);};this.ready();
  }
  size(){const r=this.canvas.getBoundingClientRect();this.canvas.width=Math.max(1,Math.round(r.width*devicePixelRatio));this.canvas.height=Math.max(1,Math.round(r.height*devicePixelRatio));this.draw();}
  position(e){const r=this.canvas.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];}
  visibleTargets(){
    const b=this.craft.box;if(!b)return [];const r=this.canvas.getBoundingClientRect(),w=this.craft.canvas.width,h=this.craft.canvas.height;
    return this.state.targets.flatMap(t=>{const p=this.craft.projectInlayTarget(t);if(!p)return [];const [u,v]=p.uv;return [{...t,screen:[(b.x+u*b.width)/w*r.width,(b.y+v*b.height)/h*r.height]}];});
  }
  brush(pos,emit=true){
    if(this.done)return;const hits=new Set(this.state[this.mode]),radius=Math.max(22,Math.min(38,this.canvas.clientWidth*.052));let changed=false;
    for(const p of this.visibleTargets())if(Math.hypot(p.screen[0]-pos[0],p.screen[1]-pos[1])<=radius){if(!hits.has(p.key))changed=true;hits.add(p.key);}
    if(changed){this.state[this.mode]=[...hits];this.needsPaint=true;if(emit)this.emit();}
  }
  emit(notifyComplete=true){
    if(this.needsPaint){this.craft.paint();this.needsPaint=false;}
    const progress=inlayProgress(this.work);let fraction=progress[this.mode];
    if(this.state.targets.length&&fraction>=.9){this.state[this.mode]=this.state.targets.map(t=>t.key);this.state[this.mode+'Done']=true;fraction=1;if(this.mode==='wipe'){this.work.decorPhase=2;this.work.decorDone=true;}this.craft.paint();}
    const complete=!!this.state[this.mode+'Done'];this.done=complete;
    this.canvas.dataset.mode=this.mode;this.canvas.dataset.coverage=String(fraction);this.canvas.dataset.complete=String(complete);
    const value={mode:this.mode,fraction,complete,fillDone:!!this.state.fillDone,wipeDone:!!this.state.wipeDone};this.onProgress(value);
    if(complete&&!this.notified&&notifyComplete){this.notified=true;this.onComplete(value);}
    this.draw();
  }
  watch(){
    if(!this.running)return;const frame=this.craft.el.dataset.viewFrame,ready=this.craft.el.dataset.status;
    if(frame!==this.viewFrame||ready!==this.status){this.viewFrame=frame;this.status=ready;this.draw();}
    this.frame=requestAnimationFrame(()=>this.watch());
  }
  draw(){
    const c=this.ctx;if(!c)return;const d=devicePixelRatio;c.clearRect(0,0,this.canvas.width,this.canvas.height);c.save();c.scale(d,d);
    // Keep the ornament clean: the brush and progress meter guide the activity.
    // Target markers looked like dark punctures in the white inlay.
    if(this.cursor&&!this.done){const [x,y]=this.cursor;c.save();c.translate(x,y);c.rotate(-.3);c.fillStyle=this.mode==='wipe'?'#efd18e':this.state.slip==='dark'?'#4d4144':'#fff1d3';c.strokeStyle='#936c50';c.lineWidth=2;c.beginPath();c.roundRect(-20,-11,40,23,7);c.fill();c.stroke();if(this.mode==='wipe'){c.fillStyle='#fff8e6bb';for(const [a,b] of [[-9,-2],[3,4],[12,-4]]){c.beginPath();c.arc(a,b,3,0,Math.PI*2);c.fill();}}else{c.fillStyle='#ab8662';c.fillRect(12,-3,25,7);}c.restore();}
    c.restore();
  }
  release(){const id=this.pointer?.id;this.pointer=null;if(id!==undefined&&this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);this.draw();}
  dispose(){this.running=false;this.abort.abort();this.resize.disconnect();cancelAnimationFrame(this.frame);cancelAnimationFrame(this.readyFrame);this.canvas.remove();}
}
