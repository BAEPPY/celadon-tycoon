import { motifPath, cutoutPath } from "./motif-paths.js";
import { normalizeStampSize } from './motif-size.js';
import {ROTATION_PIXELS_PER_FRAME, ROTATION_BLEND_MS, followRotation, releasedRotationTarget} from './rotation-motion.js';
import {
  ROTATION_IDS,
  FRAME_COUNT,
  wrapFrame,
  surfaceAngle,
} from "./rotation-rules.js";
import ROTATION_LAYOUTS from "./assets/vessels/rotations/layouts.json" with { type: "json" };
import {
  illustrationUV,
  alphaBounds,
  silhouetteRows,
  clamp,
} from "./illustration-rules.js";
import { surfaceAnchor, projectCurvedSurface, inlayCell } from './surface-warp.js';
const motifSamples = new Map();
function sampledPaths(data) {
  if (!motifSamples.has(data)) {
    const paths = (data.match(/[Mm][^Mm]*/g) || []).map(d => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      const length = path.getTotalLength(), count = Math.max(2, Math.ceil(length / 3));
      return { closed: /[Zz]\s*$/.test(d), points: Array.from({length: count + 1}, (_, i) => {
        const p = path.getPointAtLength(length * i / count); return [p.x,p.y];
      }) };
    });
    motifSamples.set(data, paths);
  }
  return motifSamples.get(data);
}
const makeCanvas = (w, h) =>
  Object.assign(document.createElement("canvas"), { width: w, height: h });
const cache = new Map();
async function loadIllustration(id, frame = null, {prefetch = false} = {}) {
  const modelId = id;
  const rotating = frame !== null;
  id = rotating ? id + ":" + wrapFrame(frame) : id;
  if (cache.has(id) && !prefetch) {
    const recent=cache.get(id);cache.delete(id);cache.set(id,recent);
  }
  if (cache.size >= 8 && !cache.has(id)) cache.delete(cache.keys().next().value);
  if (!cache.has(id))
    cache.set(
      id,
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          const c = makeCanvas(image.width, image.height),
            ctx = c.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(image, 0, 0);
          const bounds = rotating
            ? { x: 0, y: 0, width: c.width, height: c.height }
            : alphaBounds(
                ctx.getImageData(0, 0, c.width, c.height).data,
                c.width,
                c.height,
              );
          if (!bounds) return reject(new Error("Empty illustration"));
          const ratio = Math.min(
              1,
              800 / Math.max(bounds.width, bounds.height),
            ),
            base = makeCanvas(
              Math.round(bounds.width * ratio),
              Math.round(bounds.height * ratio),
            );
          base
            .getContext("2d")
            .drawImage(
              image,
              bounds.x,
              bounds.y,
              bounds.width,
              bounds.height,
              0,
              0,
              base.width,
              base.height,
            );
          const pixels = base
              .getContext("2d")
              .getImageData(0, 0, base.width, base.height),
            versions = { finished: base };
          // Neighbour preloads decode only the original. Derive the current
          // clay/biscuit appearance on demand, not two full pixel loops per fetch.
          for (const [name, color] of [["clay", [190, 145, 113]], ["biscuit", [224, 196, 159]]]) {
            Object.defineProperty(versions,name,{configurable:true,get(){
              const next=new ImageData(new Uint8ClampedArray(pixels.data),pixels.width,pixels.height);
              for(let i=0;i<next.data.length;i+=4){
                const lum=.2126*pixels.data[i]+.7152*pixels.data[i+1]+.0722*pixels.data[i+2],shade=clamp(lum/172,.36,1.2);
                for(let j=0;j<3;j++)next.data[i+j]=color[j]*shade;
              }
              const tinted=makeCanvas(base.width,base.height);tinted.getContext('2d').putImageData(next,0,0);
              Object.defineProperty(versions,name,{value:tinted,configurable:true});return tinted;
            }});
          }
          resolve({
            versions,
            pixels,
            rows: silhouetteRows(pixels.data, base.width, base.height, 56),
            artBounds: alphaBounds(pixels.data,base.width,base.height),
          });
        };
        image.onerror = () => reject(new Error("Illustration missing: " + id));
        image.src = rotating
          ? "./assets/vessels/rotations/" +
            modelId +
            "/" +
            String(wrapFrame(frame)).padStart(2, "0") +
            ".webp"
          : "./assets/vessels/" + modelId + ".webp";
      }),
    );
  const pending=cache.get(id);
  try{return await pending;}catch(error){if(cache.get(id)===pending)cache.delete(id);throw error;}
}

// Illustration-only deformation. No WebGL, 3D geometry, lighting, or Cubism SDK.
export class Craft2D {
  constructor(onMark, onStroke, onError, onView, {readOnly = false} = {}) {
    this.readOnly = readOnly;
    this.zoom = 1;
    this.onView = onView;
    this.interactive = true;
    this.onMark = onMark;
    this.onStroke = onStroke;
    this.onError = onError;
    this.el = document.createElement("div");
    this.el.className = "craft-viewport illustration-viewport";
    this.el.dataset.renderer = "illustration-2d";
    this.canvas = makeCanvas(1, 1);
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute(
      "aria-label",
      "손그림 도자기 작업대. 표면을 눌러 무늬를 찍거나 드래그해 그리세요.",
    );
    this.el.append(this.canvas);
    this.turns = document.createElement("div");
    this.turns.className = "vessel-turns";
    this.turns.innerHTML =
      '<button type="button" data-turn="-1" aria-label="왼쪽으로 15도 회전">↶</button><span class="turn-label">0°</span><button type="button" data-turn="1" aria-label="오른쪽으로 15도 회전">↷</button>';
    this.el.append(this.turns);
    this.turns.addEventListener("click", (e) => {
      const b = e.target.closest("[data-turn]");
      if (b) {
        e.stopPropagation();
        this.rotateBy(Number(b.dataset.turn));
      }
    });
    this.ctx = this.canvas.getContext("2d");
    this.abort = new AbortController();
    this.progress = 0;
    this.target = 0;
    this.tilt = 0;
    this.sway = 0;
    this.pulse = 0;
    this.loadId = 0;
    this.rotationMotion = null;
    this.rotationPending = null;
    this.rotationTransition = null;
    const opt = { signal: this.abort.signal };
    this.canvas.addEventListener("pointerdown", (e) => this.down(e), opt);
    this.canvas.addEventListener("pointermove", (e) => this.move(e), opt);
    this.canvas.addEventListener("pointerup", (e) => this.up(e), opt);
    this.canvas.addEventListener("pointerleave", () => {
      this.stampPreview = null;
      this.dirty = true;
    }, opt);
    for(const event of ['pointercancel','lostpointercapture'])this.canvas.addEventListener(event,e=>{if(this.drag?.id===e.pointerId)this.cancelPointer();},opt);
    this.canvas.addEventListener('blur',()=>{if(this.drag)this.cancelPointer();},opt);
    window.addEventListener('blur',()=>this.cancelPointer(),opt);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.cancelPointer();},opt);
    this.canvas.addEventListener(
      "keydown",
      (e) => {
        if (!this.interactive) return;
        if (e.code === "Space" && this.editable()) {
          e.preventDefault();
          if (!e.repeat) this.stamp();
        }
        if (["ArrowLeft", "ArrowRight"].includes(e.code)) {
          e.preventDefault();
          this.rotateBy(e.code === "ArrowLeft" ? -1 : 1);
        }
      },
      opt,
    );
    this.resize = new ResizeObserver(() => this.size());
    this.resize.observe(this.el);
    this.motion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.last = performance.now();
    this.tick = (now) => {
      this.frame = requestAnimationFrame(this.tick);
      if (!this.el.isConnected || document.hidden) return;
      const dt = Math.min(60, now - this.last);
      this.last = now;
      let animate = this.advanceRotation(now,dt);
      if(this.rotationTransition){
        if(now-this.rotationTransition.started>=ROTATION_BLEND_MS)this.rotationTransition=null;
        animate=true;
      }
      this.el.dataset.rotationSettled=String(!this.rotationMotion&&!this.rotationPending&&!this.rotationTransition);
      if (Math.abs(this.target - this.progress) > 0.001) {
        this.progress +=
          (this.target - this.progress) * (1 - Math.exp(-dt / 160));
        animate = true;
      }
      if (this.pulse > 0.001) {
        this.pulse *= Math.exp(-dt / 120);
        animate = true;
      }
      if (Math.abs(this.sway) > 0.0001) {
        this.sway *= Math.exp(-dt / 240);
        animate = true;
      }
      if (this.dirty || animate) {
        this.draw();
        this.dirty = false;
      }
    };
    this.frame = requestAnimationFrame(this.tick);
  }
  mount(container, work, stage) {
    container.replaceChildren(this.el);
    const ready = this.update(work, stage);
    this.size();
    return ready;
  }
  async update(work, stage) {
    this.cancelPointer();
    this.rotationTransition=null;
    this.glaze = 0;
    this.work = work;
    this.stage = stage;
    if (!this.editable() || (work.tool || 'stamp') !== 'stamp') this.stampPreview = null;
    // During firing the vessel is a display; only the mini-game controls take input.
    this.interactive = work.step !== 2;
    this.el.inert = !this.interactive;
    this.el.dataset.interactive = String(this.interactive);
    this.canvas.tabIndex = this.interactive ? 0 : -1;
    this.canvas.setAttribute("aria-label", this.readOnly
      ? "완성한 학생 작품. 좌우로 드래그하거나 방향키로 돌려보세요. 더하기와 빼기로 확대하거나 축소할 수 있어요."
      : this.interactive
      ? "손그림 도자기 작업대. 표면을 눌러 무늬를 찍거나 드래그해 그리세요."
      : "가마 작업 중인 도자기");
    if (!this.interactive) {
      if (document.activeElement === this.canvas) this.canvas.blur();
      this.drag = null;
      this.stroke = null;
      this.pulse = 0;
      this.sway = 0;
    }
    if (work.step !== 0 || !["stretch", "free"].includes(work.sculpt?.mode)) this.sculptMesh = null;
    this.target =
      work.step === 0
        ? work.sculpt?.complete
          ? 1
          : (work.sculpt?.fraction ?? (work.knead || 0) / 3)
        : 1;
    const id = work.modelId || work.shape,
      rotating = ROTATION_IDS.includes(id),
      frame = rotating ? wrapFrame(work.viewFrame || 0) : null,
      key = id + ":" + frame;
    this.rotating = rotating;
    this.turns.hidden =
      !this.interactive ||
      !rotating ||
      (work.step === 0 && work.knead < 3 && !work.sculpt?.complete);
    this.turns.querySelector(".turn-label").textContent =
      (frame || 0) * 15 + "°";
    if (this.shape !== key || this.el.dataset.status === "error") {
      this.shape = key;
      const token = ++this.loadId;
      this.el.dataset.status = "loading";
      try {
        const source = await loadIllustration(id, frame);
        if (token !== this.loadId) return;
        this.source = source;
        this.surface = makeCanvas(source.pixels.width, source.pixels.height);
        this.backWall = makeCanvas(source.pixels.width, source.pixels.height);
        this.mask = source.pixels;
        this.progress = this.target;
        this.el.dataset.status = "ready";
        this.el.dataset.readyOnce = "true";
        this.fitCamera();
        this.paint();
        if (rotating) {
          this.preloadRotation(id,frame);
        }
      } catch (error) {
        if (token === this.loadId) {
          this.el.dataset.status = "error";
          this.onError?.(error);
        }
      }
    } else {
      if (work.step > 0) this.progress = 1;
      this.paint();
    }
  }
  size() {
    if(this.drag)this.cancelPointer();
    const r = this.el.getBoundingClientRect(),
      scale = Math.min(devicePixelRatio, 1.75);
    this.canvas.width = Math.max(1, Math.round(r.width * scale));
    this.canvas.height = Math.max(1, Math.round(r.height * scale));
    this.fitCamera();
  }
  fitCamera() {
    if (!this.source) return;
    const layout = this.rotating
      ? ROTATION_LAYOUTS[this.work.modelId || this.work.shape]
      : null;
    if (layout) {
      const scale = Math.min(
        (this.canvas.height * (this.readOnly ? .84 : .74)) / layout.maxHeight,
        (this.canvas.width * 0.83) / (layout.maxWidth * (this.work.width || 1)),
      );
      const h = 640 * scale,
        w = h * (this.work.width || 1);
      this.box = {
        x: (this.canvas.width - w) / 2,
        y: this.canvas.height * (this.readOnly ? .92 : .86) - layout.baseline * scale,
        width: w,
        height: h,
      };
    } else {
      const aspect =
          (this.source.pixels.width / this.source.pixels.height) *
          (this.work.width || 1),
        h = Math.min(
          this.canvas.height * (this.readOnly ? .84 : .77),
          (this.canvas.width * 0.79) / aspect,
        ),
        w = h * aspect;
      this.box = {
        x: (this.canvas.width - w) / 2,
        y: this.canvas.height * (this.readOnly ? .92 : .86) - h,
        width: w,
        height: h,
      };
    }
    if (this.zoom !== 1) {
      const centerX=this.canvas.width/2, centerY=this.canvas.height/2;
      this.box.x=centerX+(this.box.x-centerX)*this.zoom;
      this.box.y=centerY+(this.box.y-centerY)*this.zoom;
      this.box.width*=this.zoom;
      this.box.height*=this.zoom;
    }
    this.el.dataset.zoom = String(this.zoom);
    this.el.dataset.objectBox = JSON.stringify([
      this.box.x / this.canvas.width,
      this.box.y / this.canvas.height,
      this.box.width / this.canvas.width,
      this.box.height / this.canvas.height,
    ]);
    this.dirty = true;
  }
  setZoom(value) {
    const zoom=Number(value);
    this.zoom=Number.isFinite(zoom)?clamp(zoom,.65,2.5):1;
    this.fitCamera();
    return this.zoom;
  }

  deform() {
    this.fitCamera();
    this.paint();
  }
  base() {
    if (this.glaze > 0) return this.source.versions.finished;
    return this.source.versions[
      ["finished", "glazed"].includes(this.stage)
        ? "finished"
        : this.stage === "biscuit"
          ? "biscuit"
          : "clay"
    ];
  }
  paint() {
    if (!this.source || !this.surface) return;
    const c = this.surface.getContext("2d"),
      w = this.surface.width,
      h = this.surface.height;
    c.clearRect(0, 0, w, h);
    c.drawImage(this.base(), 0, 0);
    if (this.glaze > 0 && this.glaze < 1) {
      c.globalAlpha = 1 - this.glaze;
      c.drawImage(this.source.versions.biscuit, 0, 0);
      c.globalAlpha = 1;
    }
    this.filledCells = new Set(this.work.inlay?.fill || []);
    this.wipedCells = new Set(this.work.inlay?.wipe || []);
    const open = this.work.technique === "openwork",
      strokes = [
        ...(this.work.strokes || []),
        ...(this.stroke ? [{ points: this.stroke }] : []),
      ];
    this.layer = "front";
    c.save();
    c.globalCompositeOperation = "source-atop";
    for (const p of this.work.placements || []) this.mark(c, p, open);
    for (const s of strokes) this.drawStroke(c, s, open);
    c.restore();
    if (open) {
      c.save();
      c.globalCompositeOperation = "destination-out";
      for (const p of this.work.placements || []) this.mark(c, p, true, true);
      for (const s of strokes) this.drawStroke(c, s, true, true);
      c.restore();
      const back = this.backWall.getContext("2d");
      back.clearRect(0, 0, w, h);
      back.drawImage(this.base(), 0, 0);
      back.globalCompositeOperation = "source-atop";
      back.fillStyle =
        this.stage === "finished" || this.stage === "glazed"
          ? "#3d5148"
          : "#6e4d3e";
      back.globalAlpha = 0.72;
      back.fillRect(0, 0, w, h);
      back.globalAlpha = 1;
      this.layer = "back";
      back.globalCompositeOperation = "destination-out";
      for (const p of this.work.placements || [])
        this.mark(back, p, true, true);
      for (const s of strokes) this.drawStroke(back, s, true, true);
      back.globalCompositeOperation = "source-over";
      c.save();
      c.globalCompositeOperation = "destination-over";
      c.drawImage(this.backWall, 0, 0);
      c.restore();
      this.layer = "front";
    }
    this.el.dataset.holes = String(
      open
        ? (this.work.placements?.length || 0) + (this.work.strokes?.length || 0)
        : 0,
    );
    this.el.dataset.viewFrame = String(wrapFrame(this.work.viewFrame || 0));
    this.dirty = true;
  }
  rowAt(v) {
    const rows = this.source?.rows;
    if (!rows) return [.22,.78];
    const at = clamp(v * rows.length - .5, 0, rows.length - 1), low = Math.floor(at), high = Math.ceil(at);
    const nearest = index => {
      if (rows[index]) return rows[index];
      for(let d = 1; d < rows.length; d++) if(rows[index-d] || rows[index+d]) return rows[index-d] || rows[index+d];
      return [.22,.78];
    };
    const a=nearest(low), b=nearest(high), t=at-low;
    return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
  }
  anchor(mark) {
    const uv = illustrationUV(mark), value = surfaceAnchor(uv, mark.surfaceAngle, this.rowAt(uv[1]), this.work.viewFrame || 0);
    // Store vessel-space coordinates once; changing rotation must not shift a motif's height or size.
    mark.surfaceAngle ??= value.angle;
    mark.surfaceV ??= value.level;
    mark.surfaceRadius ??= value.radius;
    return {angle: mark.surfaceAngle, level: mark.surfaceV, radius: mark.surfaceRadius};
  }
  surfacePoint(angle, level, back = this.layer === 'back') {
    if (!this.rotating && back) return null;
    return projectCurvedSurface(angle, level, this.rotating ? this.work.viewFrame || 0 : 0, v => this.rowAt(v), back);
  }
  project(mark) {
    const p=this.anchor(mark);
    return this.surfacePoint(p.angle,p.level);
  }
  motifSurfacePaths(mark, open = false) {
    const a=this.anchor(mark), w=this.surface.width,h=this.surface.height, size=Math.min(w,h)*.00103*normalizeStampSize(mark.stampSize);
    return sampledPaths(open ? cutoutPath(mark.pattern || this.work.pattern) : motifPath(mark.pattern || this.work.pattern)).map(path=>({closed:path.closed,points:path.points.map(([x,y])=>({angle:a.angle+x*size/w/a.radius,level:a.level+y*size/h}))}));
  }
  getInlayTargets() {
    if(!this.source)return [];
    const cells=new Map(), add=p=>{const q=this.surfacePoint(p.angle,p.level,false)||this.surfacePoint(p.angle,p.level,true);if(!this.sampleOnBody(q))return;const key=inlayCell(p.angle,p.level);if(!cells.has(key))cells.set(key,{key,angle:p.angle,level:p.level});};
    for(const mark of this.work.placements||[])for(const path of this.motifSurfacePaths(mark))for(const p of path.points)add(p);
    for(const stroke of this.work.strokes||[])for(const p of stroke.points||[]){const a=this.anchor(p);add({angle:a.angle,level:a.level});}
    return [...cells.values()];
  }
  inlayColor() { return (this.work.inlay?.slip || this.work.clay?.slip)==='dark' ? '#342d30' : '#fff0d3'; }
  inlayState(point) {
    const state=this.work.inlay;
    if(!state)return {filled:this.work.decorPhase>0,clean:this.work.decorPhase>=2};
    const key=inlayCell(point.angle,point.level);
    return {filled:state.fillDone || this.filledCells?.has(key),clean:state.wipeDone || this.wipedCells?.has(key)};
  }
  // Public projector used by the brush activity and its keyboard cursor.
  sampleOnBody(projection) {
    if(!projection||!this.mask)return false;const [u,v]=projection.uv;if(u<0||u>=1||v<0||v>=1)return false;const x=Math.floor(u*this.mask.width),y=Math.floor(v*this.mask.height);return this.mask.data[(y*this.mask.width+x)*4+3]>64;
  }
  projectInlayTarget(target) {const p=this.surfacePoint(target.angle,target.level,false);return this.sampleOnBody(p)?p:null;}
  canRotate() {
    return this.interactive&&this.rotating&&this.source&&this.el.dataset.status==='ready'&&!(this.work.step===0&&this.work.knead<3&&!this.work.sculpt?.complete);
  }
  rotateBy(delta){return this.setRotation((this.rotationPending?.frame??this.work?.viewFrame??0)+delta);}
  preloadRotation(id,frame){
    for(const direction of [1,-1,2,-2])loadIllustration(id,wrapFrame(frame+direction),{prefetch:true}).catch(()=>{});
  }
  stopRotationMotion(){
    this.rotationMotion=null;
    if(this.rotationPending){++this.loadId;this.rotationPending=null;}
  }
  advanceRotation(now,dt){
    const motion=this.rotationMotion;if(!motion||!this.canRotate())return false;
    motion.position=followRotation(motion.position,motion.target,dt,this.motion);
    const next=wrapFrame(motion.position);
    if(this.rotationPending&&this.rotationPending.frame!==next&&next===wrapFrame(this.work.viewFrame||0)){++this.loadId;this.rotationPending=null;}
    if(next!==wrapFrame(this.work.viewFrame||0)&&this.rotationPending?.frame!==next)void this.setRotation(next,{fromGesture:true});
    if(!this.drag&&Math.abs(motion.position-motion.target)<.015&&!this.rotationPending&&next===wrapFrame(this.work.viewFrame||0))this.rotationMotion=null;
    return true;
  }
  async setRotation(frame,{fromGesture=false}={}) {
    if(!this.canRotate())return;
    if(!fromGesture)this.rotationMotion=null;
    frame=wrapFrame(frame);
    if(this.rotationPending?.frame===frame)return this.rotationPending.promise;
    if(frame===wrapFrame(this.work.viewFrame||0)){
      if(this.rotationPending){++this.loadId;this.rotationPending=null;}
      return;
    }
    const work=this.work,stage=this.stage,id=work.modelId||work.shape,token=++this.loadId;
    this.stampPreview=null;this.el.dataset.rotationSettled='false';
    const pending={frame,promise:null};this.rotationPending=pending;
    pending.promise=(async()=>{
      try{
        const source=await loadIllustration(id,frame);
        if(token!==this.loadId||this.work!==work||this.stage!==stage)return;
        let previous=null;
        if(!this.motion&&this.surface){
          const surface=makeCanvas(this.surface.width,this.surface.height);surface.getContext('2d').drawImage(this.surface,0,0);
          previous={surface,rows:this.source.rows,bounds:this.source.artBounds};
        }
        work.viewFrame=frame;this.source=source;this.shape=id+':'+frame;
        this.surface=makeCanvas(source.pixels.width,source.pixels.height);this.backWall=makeCanvas(source.pixels.width,source.pixels.height);this.mask=source.pixels;
        this.fitCamera();this.paint();
        this.rotationTransition=previous?{...previous,started:performance.now()}:null;
        this.turns.querySelector('.turn-label').textContent=frame*15+'°';
        this.onView?.();this.preloadRotation(id,frame);
      }catch(error){if(token===this.loadId){this.rotationMotion=null;this.rotationTransition=null;this.onError?.(error);}}
      finally{if(this.rotationPending===pending){this.rotationPending=null;this.dirty=true;}}
    })();
    return pending.promise;
  }

  projectedPath(c, points, closed = false) {
    const path=new Path2D();let active=false,visible=0;
    for(const p of points){const q=this.surfacePoint(p.angle,p.level);if(!q){active=false;continue;}const [u,v]=q.uv;path[active?'lineTo':'moveTo'](u*c.canvas.width,v*c.canvas.height);active=true;visible++;}
    if(closed&&visible)path.closePath();
    return path;
  }
  drawInlaySegment(c, a, b, width) {
    const pa=this.surfacePoint(a.angle,a.level),pb=this.surfacePoint(b.angle,b.level);
    if(!pa||!pb)return;
    const state=this.inlayState(a),clean=state.clean,filled=state.filled;
    c.save();c.lineCap='round';c.lineJoin='round';
    const line=()=>{c.beginPath();c.moveTo(pa.uv[0]*c.canvas.width,pa.uv[1]*c.canvas.height);c.lineTo(pb.uv[0]*c.canvas.width,pb.uv[1]*c.canvas.height);c.stroke();};
    if(filled&&!clean){c.globalAlpha=.42;c.strokeStyle=this.inlayColor();c.lineWidth=width*3.4;line();c.globalAlpha=1;}
    c.strokeStyle=filled?this.inlayColor():'#89624f';c.lineWidth=width*Math.max(.5,(pa.squeeze+pb.squeeze)/2);line();c.restore();
  }
  mark(c, mark, open, erase = false) {
    const paths=this.motifSurfacePaths(mark,open),size=Math.min(c.canvas.width,c.canvas.height)*.00103*normalizeStampSize(mark.stampSize);
    c.save();c.lineJoin='round';c.lineCap='round';
    for(const path of paths){
      if(!open){for(let i=1;i<path.points.length;i++)this.drawInlaySegment(c,path.points[i-1],path.points[i],size*7);continue;}
      const shape=this.projectedPath(c,path.points,path.closed);
      if(erase){c.fillStyle='#000';c.fill(shape);}else{
        c.strokeStyle='#71554b';c.lineWidth=size*10;c.stroke(shape);
        c.save();c.translate(size*2.5,size*2.5);c.lineWidth=size*5;c.strokeStyle=['finished','glazed'].includes(this.stage)?'#c3d0ae':'#dfb78e';c.stroke(shape);c.restore();
      }
    }
    c.restore();
  }
  drawStroke(c, stroke, open, erase = false) {
    if(stroke.points.length<2)return;
    const points=[];
    for(let i=0;i<stroke.points.length;i++){
      const a=this.anchor(stroke.points[i]);
      if(i){const prev=this.anchor(stroke.points[i-1]), delta=Math.atan2(Math.sin(a.angle-prev.angle),Math.cos(a.angle-prev.angle)), n=Math.max(1,Math.ceil(Math.hypot(delta*.25,a.level-prev.level)*c.canvas.height/3));for(let j=1;j<=n;j++)points.push({angle:prev.angle+delta*j/n,level:prev.level+(a.level-prev.level)*j/n});}
      else points.push(a);
    }
    c.save();c.lineJoin='round';c.lineCap='round';
    if(open){c.strokeStyle=erase?'#000':'#71554b';c.lineWidth=Math.min(c.canvas.width,c.canvas.height)*(erase?.016:.027);c.stroke(this.projectedPath(c,points));}
    else for(let i=1;i<points.length;i++)this.drawInlaySegment(c,points[i-1],points[i],Math.min(c.canvas.width,c.canvas.height)*.01);
    c.restore();
  }

  drawStampPreview(c) {
    if (!this.stampPreview || !this.editable() || (this.work.tool || 'stamp') !== 'stamp') return;
    const mark = {...this.stampPreview, pattern: this.work.pattern, stampSize: normalizeStampSize(this.work.stampSize)}, b = this.box;
    c.save();c.globalCompositeOperation='source-atop';c.lineCap='round';c.lineJoin='round';
    c.strokeStyle='#fff7dd';c.lineWidth=Math.min(b.width,b.height)*.0072*mark.stampSize;
    for (const path of this.motifSurfacePaths(mark,this.work.technique==='openwork')) {
      c.beginPath();let active=false;
      for (const p of path.points) {
        const q=this.surfacePoint(p.angle,p.level);
        if(!q){active=false;continue;}
        c[active?'lineTo':'moveTo'](b.x+q.uv[0]*b.width,b.y+q.uv[1]*b.height);active=true;
      }
      if(path.closed&&active)c.closePath();
      c.globalAlpha=.8;c.stroke();
    }
    c.restore();
  }
  drawRotationTransition(c,b,transition,blend){
    const previous=transition.surface,current=this.surface,oldBounds=transition.bounds,newBounds=this.source.artBounds;
    if(!oldBounds||!newBounds){c.drawImage(current,b.x,b.y,b.width,b.height);return;}
    const rowAt=(rows,y)=>{
      const index=clamp(y*rows.length-.5,0,rows.length-1),lo=Math.floor(index),hi=Math.ceil(index);
      const closest=index=>{for(let d=0;d<rows.length;d++){if(rows[index-d])return rows[index-d];if(rows[index+d])return rows[index+d];}return [0,1];};
      const a=closest(lo),z=closest(hi);return a.map((v,i)=>v+(z[i]-v)*(index-lo));
    };
    // Match the outer silhouette before blending. Each complete warped layer
    // is blended once; blending strips separately would create bright seams.
    const w=current.width,h=current.height,count=240,mix=(a,z)=>a+(z-a)*blend;
    transition.fromWarp??=makeCanvas(w,h);transition.toWarp??=makeCanvas(w,h);
    const from=transition.fromWarp.getContext('2d'),to=transition.toWarp.getContext('2d');
    from.clearRect(0,0,w,h);to.clearRect(0,0,w,h);
    for(let i=0;i<count;i++){
      const f=i/count,next=(i+1)/count,middle=(i+.5)/count;
      const oldY=oldBounds.y+oldBounds.height*f,newY=newBounds.y+newBounds.height*f;
      const oldRow=rowAt(transition.rows,(oldBounds.y+oldBounds.height*middle)/previous.height),newRow=rowAt(this.source.rows,(newBounds.y+newBounds.height*middle)/current.height);
      const left=mix(oldRow[0],newRow[0]),right=mix(oldRow[1],newRow[1]);
      const destY=mix(oldY/previous.height,newY/current.height)*h,destBottom=mix((oldBounds.y+oldBounds.height*next)/previous.height,(newBounds.y+newBounds.height*next)/current.height)*h;
      const oldScale=(right-left)/(oldRow[1]-oldRow[0]),newScale=(right-left)/(newRow[1]-newRow[0]);
      from.drawImage(previous,0,oldY,previous.width,oldBounds.height/count,(left-oldRow[0]*oldScale)*w,destY,w*oldScale,destBottom-destY+.75);
      to.drawImage(current,0,newY,current.width,newBounds.height/count,(left-newRow[0]*newScale)*w,destY,w*newScale,destBottom-destY+.75);
    }
    c.globalAlpha=1-blend;c.drawImage(transition.fromWarp,b.x,b.y,b.width,b.height);
    c.globalAlpha=blend;c.globalCompositeOperation='lighter';c.drawImage(transition.toWarp,b.x,b.y,b.width,b.height);
    c.globalAlpha=1;c.globalCompositeOperation='source-over';
  }

  draw(showPreview = true) {
    const c = this.ctx,
      w = this.canvas.width,
      h = this.canvas.height;
    c.clearRect(0, 0, w, h);
    if (!this.source || !this.box) return;
    this.el.dataset.progress = this.progress.toFixed(3);
    const b = this.box,
      p = clamp(this.progress),
      anchor = [w / 2, h * 0.86],
      squash = this.motion ? 0 : this.pulse * 0.025;
    c.save();
    c.translate(...anchor);
    c.rotate(this.tilt + (this.motion ? 0 : this.sway));
    c.scale(1 + squash, 1 - squash);
    c.translate(-anchor[0], -anchor[1]);
    if (this.sculptMesh && this.work.step === 0 && !this.work.sculpt?.complete) {
      this.drawStretchClay(c, w, h);
      c.restore();
      return;
    }
    if (p >= 0.995) {
      const transition=showPreview?this.rotationTransition:null;
      if(transition){
        const linear=clamp((performance.now()-transition.started)/ROTATION_BLEND_MS),blend=linear*linear*(3-2*linear);
        this.drawRotationTransition(c,b,transition,blend);
      }else c.drawImage(this.surface, b.x, b.y, b.width, b.height);
      if (showPreview) this.drawStampPreview(c);
      c.restore();
      return;
    }
    const rows = this.source.rows
        .map((row, index) => (row ? { row, index } : null))
        .filter(Boolean),
      startH = h * 0.56,
      startW = Math.min(w * 0.65, startH * 1.22),
      points = rows.map(({ row, index }, j) => {
        const u = (j + 0.5) / rows.length,
          ellipse =
            Math.sqrt(Math.max(0, 1 - ((u - 0.5) / 0.51) ** 2)) *
            (1 + 0.035 * Math.sin(u * 41)),
          visited = this.work.sculpt?.visited,
          local =
            visited && !this.work.sculpt.complete
              ? visited[j] || visited[rows.length * 2 - j - 1]
                ? Math.min(1, p + 0.14)
                : p * 0.88
              : p,
          lerp = (a, b, t) => a + (b - a) * t;
        return {
          left: lerp(
            anchor[0] - startW * 0.5 * ellipse,
            b.x + row[0] * b.width,
            local,
          ),
          right: lerp(
            anchor[0] + startW * 0.5 * ellipse,
            b.x + row[1] * b.width,
            local,
          ),
          y: lerp(
            anchor[1] - startH + u * startH,
            b.y + ((index + 0.5) / this.source.rows.length) * b.height,
            p,
          ),
          row,
          index,
        };
      });
    c.beginPath();
    points.forEach((r, i) => c[i ? "lineTo" : "moveTo"](r.left, r.y));
    [...points].reverse().forEach((r) => c.lineTo(r.right, r.y));
    c.closePath();
    c.fillStyle = "#c19877";
    c.strokeStyle = "#806051";
    c.lineWidth = 2;
    c.fill();
    c.stroke();
    c.globalAlpha = clamp((p - 0.14) / 0.86);
    for (let j = 0; j < points.length; j++) {
      const r = points[j],
        dy =
          j < points.length - 1
            ? points[j + 1].y - r.y
            : j
              ? r.y - points[j - 1].y
              : 1,
        sy = (r.index / this.source.rows.length) * this.surface.height,
        sh = this.surface.height / this.source.rows.length;
      c.drawImage(
        this.surface,
        r.row[0] * this.surface.width,
        sy,
        (r.row[1] - r.row[0]) * this.surface.width,
        sh,
        r.left,
        r.y - dy / 2,
        r.right - r.left,
        Math.max(1, dy + 0.7),
      );
    }
    c.restore();
  }

  setSculptMesh(points, guide, fraction) {
    this.sculptMesh = { points, guide, fraction };
    this.dirty = true;
  }
  drawStretchClay(c, w, h) {
    const { points, fraction } = this.sculptMesh;
    if (!points.length) return;
    const px = points.map(p => [p[0] * w, p[1] * h]);
    const xs = px.map(p => p[0]), ys = px.map(p => p[1]);
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    c.save();
    c.fillStyle = '#846a5040';
    c.beginPath();c.ellipse((left + right) / 2, bottom, (right - left) * .43, Math.max(5, h * .018), 0, 0, Math.PI * 2);c.fill();
    c.beginPath();
    const last = px[px.length - 1], first = px[0];
    c.moveTo((last[0] + first[0]) / 2, (last[1] + first[1]) / 2);
    px.forEach((p, i) => {const next = px[(i + 1) % px.length];c.quadraticCurveTo(p[0], p[1], (p[0] + next[0]) / 2, (p[1] + next[1]) / 2);});
    c.closePath();c.fillStyle = '#c7a587';c.strokeStyle = '#8c6b54';c.lineWidth = Math.max(2, w / 270);c.fill();c.stroke();c.clip();
    // Small clay flecks and soft folds follow the deforming silhouette.
    c.fillStyle = '#e5c9a250';
    for (let i = 0; i < 48; i++) {const x = left + ((i * 73) % 101) / 101 * (right - left), y = top + ((i * 47) % 103) / 103 * (bottom - top);c.beginPath();c.ellipse(x, y, w * .004, h * .003, 0, 0, Math.PI * 2);c.fill();}
    c.globalAlpha = .32 * (1 - fraction);c.strokeStyle = '#8f6e56';c.lineWidth = Math.max(2, w / 250);c.lineCap = 'round';
    for (const f of [.38, .66]) {const y = top + (bottom - top) * f;c.beginPath();c.moveTo(left + (right-left)*.22, y);c.quadraticCurveTo((left+right)/2, y - (bottom-top)*.12, right - (right-left)*.2, y + (bottom-top)*.035);c.stroke();}
    c.restore();
  }

  getSculptGuide() {
    if (!this.source || !this.box) return [];
    const b = this.box,
      w = this.canvas.width,
      h = this.canvas.height,
      left = [],
      right = [];
    this.guideRowMap = this.source.rows.map(() => -1);
    this.source.rows.forEach((row, i) => {
      if (!row) return;
      this.guideRowMap[i] = left.length;
      const y = (i + 0.5) / this.source.rows.length;
      left.push([(b.x + row[0] * b.width) / w, (b.y + y * b.height) / h]);
      right.push([(b.x + row[1] * b.width) / w, (b.y + y * b.height) / h]);
    });
    this.guideRowCount = left.length;
    return [...left, ...right.reverse()];
  }
  setSculptGuide(guide) {
    this.guide = guide;
  }
  setSculptProgress(fraction) {
    if (fraction >= 1) this.turns.hidden = !this.interactive || !this.rotating;
    this.target = fraction;
    this.pulse = 1;
    this.dirty = true;
  }
  previewGlaze(fraction) {
    this.glaze = fraction;
    this.paint();
  }
  editable() {
    return (
      !this.readOnly && !this.rotationMotion && !this.rotationPending && !this.rotationTransition &&
      this.el.dataset.status === "ready" &&
      this.work?.step === 1 &&
      !this.work.inlayMode && !this.work.inlay &&
      this.work.decorPhase === 0 &&
      this.work.technique !== "plain"
    );
  }
  hit(e) {
    if (!this.box || !this.mask) return null;
    const r = this.canvas.getBoundingClientRect(),
      x = ((e.clientX - r.left) / r.width) * this.canvas.width,
      y = ((e.clientY - r.top) / r.height) * this.canvas.height,
      b = this.box,
      dx = x - b.x - b.width / 2,
      dy = y - b.y - b.height / 2,
      u = (dx * Math.cos(this.tilt) + dy * Math.sin(this.tilt)) / b.width + 0.5,
      v =
        (-dx * Math.sin(this.tilt) + dy * Math.cos(this.tilt)) / b.height + 0.5;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    const ix = Math.min(this.mask.width - 1, Math.floor(u * this.mask.width)),
      iy = Math.min(this.mask.height - 1, Math.floor(v * this.mask.height));
    return this.mask.data[(iy * this.mask.width + ix) * 4 + 3] > 64
      ? {
          uv: [u, v],
          surfaceAngle: surfaceAngle(
            u,
            this.rowAt(v),
            this.work.viewFrame || 0,
          ),
          screen: [e.clientX, e.clientY],
        }
      : null;
  }
  down(e) {
    if (e.button!==0||e.isPrimary===false||this.drag||!this.interactive || !this.source || this.el.dataset.status !== "ready") return;
    // A click immediately after turning starts from one exact authored pose.
    this.stopRotationMotion();this.rotationTransition=null;
    this.canvas.focus({ preventScroll: true });
    const hit = this.hit(e);
    if (!hit && !this.readOnly) return;
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    this.drag = {
      id:e.pointerId,
      x: e.clientX,
      y: e.clientY,
      tilt: this.tilt,
      viewFrame: this.work.viewFrame || 0,
    };
    if (this.editable() && this.work.tool !== "rotate") this.stroke = [hit];
    else if(this.canRotate()){
      this.rotationMotion={position:this.work.viewFrame||0,target:this.work.viewFrame||0,velocity:0,lastX:e.clientX,lastTime:performance.now()};
      this.el.dataset.rotationSettled='false';
    }
  }
  move(e) {
    if (!this.interactive||e.isPrimary===false||(this.drag&&this.drag.id!==e.pointerId)) return;
    if (!this.drag) {
      this.stampPreview = this.editable() && (this.work.tool || 'stamp') === 'stamp' ? this.hit(e) : null;
      this.dirty = true;
      return;
    }
    if (this.stroke && this.work.tool === "draw") {
      const hit = this.hit(e),
        last = this.stroke.at(-1);
      if (
        hit &&
        this.stroke.length < 512 &&
        Math.hypot(
          hit.screen[0] - last.screen[0],
          hit.screen[1] - last.screen[1],
        ) > 3
      ) {
        this.stroke.push(hit);
        this.paint();
      }
    } else if (!this.stroke&&this.rotationMotion) {
      const motion=this.rotationMotion,now=performance.now(),elapsed=Math.max(1,now-motion.lastTime);
      const velocity=(e.clientX-motion.lastX)/ROTATION_PIXELS_PER_FRAME/elapsed;
      motion.velocity=elapsed>90?velocity:motion.velocity*.55+velocity*.45;
      motion.target=this.drag.viewFrame+(e.clientX-this.drag.x)/ROTATION_PIXELS_PER_FRAME;
      motion.lastX=e.clientX;motion.lastTime=now;
      if(this.motion){motion.position=motion.target;void this.setRotation(wrapFrame(motion.target),{fromGesture:true});}
    }
  }
  up(e) {
    if (!this.interactive || !this.drag||this.drag.id!==e.pointerId) return;
    const drag = this.drag,
      points = this.stroke;
    this.drag = null;
    this.stroke = null;
    this.stampPreview = null;
    if(this.canvas.hasPointerCapture(drag.id))this.canvas.releasePointerCapture(drag.id);
    this.pulse = !points||this.readOnly ? 0 : 0.65;
    this.sway = !points||this.readOnly||this.motion ? 0 : 0.015;
    if(!points&&this.rotationMotion){
      const motion=this.rotationMotion;
      motion.target=releasedRotationTarget(motion.target,motion.velocity,performance.now()-motion.lastTime,this.motion);
      if(this.motion){motion.position=motion.target;void this.setRotation(wrapFrame(motion.target),{fromGesture:true});}
    }
    if (points) {
      if (this.work.tool === "draw") {
        if (points.length > 1)
          this.onStroke({ points, renderer: "illustration-2d" });
      } else if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 12)
        this.onMark({
          ...points[0],
          x: points[0].uv[0] * 360,
          y: points[0].uv[1] * 360,
          pattern: this.work.pattern,
          stampSize: normalizeStampSize(this.work.stampSize),
          renderer: "illustration-2d",
        });
    }
    this.paint();
  }
  cancelPointer() {
    const id=this.drag?.id;this.drag=null;this.stroke=null;this.stampPreview=null;
    this.stopRotationMotion();this.rotationTransition=null;
    if(id!==undefined&&this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);
    this.paint();
  }
  stamp() {
    if (!this.editable() || !this.source) return;
    const options = [
      [0.5, 0.55],
      [0.35, 0.5],
      [0.65, 0.5],
      [0.5, 0.72],
      [0.5, 0.35],
    ];
    for (const uv of [
      ...options.slice((this.work.placements?.length || 0) % options.length),
      ...options,
    ]) {
      const x = Math.floor(uv[0] * this.mask.width),
        y = Math.floor(uv[1] * this.mask.height);
      if (this.mask.data[(y * this.mask.width + x) * 4 + 3] > 64) {
        this.pulse = 1;
        this.onMark({
          uv,
          surfaceAngle: surfaceAngle(
            uv[0],
            this.rowAt(uv[1]),
            this.work.viewFrame || 0,
          ),
          x: uv[0] * 360,
          y: uv[1] * 360,
          pattern: this.work.pattern,
          stampSize: normalizeStampSize(this.work.stampSize),
          renderer: "illustration-2d",
        });
        return;
      }
    }
  }
  // Export the authored surface, not the screen-sized preview. The kiln keeps
  // the same proportions, decoration and openings throughout drying/glazing.
  exportWorkSurface() {
    if (!this.source || !this.surface || !this.work) return null;
    this.paint();
    const pixels=this.surface.getContext('2d').getImageData(0,0,this.surface.width,this.surface.height);
    const bounds=alphaBounds(pixels.data,pixels.width,pixels.height);
    if (!bounds) return null;
    const width=Math.max(1,Math.round(bounds.width*(this.work.width||1))), height=bounds.height;
    const crop=source=>{
      const out=makeCanvas(width,height),ctx=out.getContext('2d');
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
      ctx.drawImage(source,bounds.x,bounds.y,bounds.width,bounds.height,0,0,width,height);
      return out;
    };
    const image=crop(this.surface),front=makeCanvas(this.surface.width,this.surface.height),c=front.getContext('2d');
    c.drawImage(this.base(),0,0);
    if(this.work.technique==='openwork'){
      const layer=this.layer;this.layer='front';
      c.globalCompositeOperation='destination-out';
      for(const mark of this.work.placements||[])this.mark(c,mark,true,true);
      for(const stroke of this.work.strokes||[])this.drawStroke(c,stroke,true,true);
      this.layer=layer;
    }
    const mask=crop(front),glaze=this.glaze;
    this.glaze=1;this.paint();
    const glazedImage=crop(this.surface);
    this.glaze=glaze;this.paint();
    // Placement is live so the in-place tools stay aligned after resizing.
    const placement=()=>({
      x:(this.box.x+bounds.x/this.surface.width*this.box.width)/this.canvas.width,
      y:(this.box.y+bounds.y/this.surface.height*this.box.height)/this.canvas.height,
      width:bounds.width/this.surface.width*this.box.width/this.canvas.width,
      height:bounds.height/this.surface.height*this.box.height/this.canvas.height,
    });
    return {image,mask,glazedImage,placement};
  }
  snapshot() {
    this.draw(false);
    this.dirty = true;
    const out = makeCanvas(
      512,
      Math.round((512 * this.canvas.height) / this.canvas.width),
    );
    out.getContext("2d").drawImage(this.canvas, 0, 0, out.width, out.height);
    return out.toDataURL("image/webp", 0.92);
  }
  dispose() {
    this.cancelPointer();
    ++this.loadId;
    cancelAnimationFrame(this.frame);
    this.abort.abort();
    this.resize.disconnect();
    this.el.remove();
  }
}
