import { motifPath, cutoutPath } from "./motif-paths.js";
import {
  ROTATION_IDS,
  FRAME_COUNT,
  wrapFrame,
  surfaceAngle,
  projectSurface,
} from "./rotation-rules.js";
import ROTATION_LAYOUTS from "./assets/vessels/rotations/layouts.json" with { type: "json" };
import {
  illustrationUV,
  alphaBounds,
  silhouetteRows,
  clamp,
} from "./illustration-rules.js";
const makeCanvas = (w, h) =>
  Object.assign(document.createElement("canvas"), { width: w, height: h });
const cache = new Map();
async function loadIllustration(id, frame = null) {
  const modelId = id;
  const rotating = frame !== null;
  id = rotating ? id + ":" + wrapFrame(frame) : id;
  if (cache.size >= 6 && !cache.has(id))
    cache.delete(cache.keys().next().value);
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
          for (const [name, color] of [
            ["clay", [190, 145, 113]],
            ["biscuit", [224, 196, 159]],
          ]) {
            const next = new ImageData(
              new Uint8ClampedArray(pixels.data),
              pixels.width,
              pixels.height,
            );
            for (let i = 0; i < next.data.length; i += 4) {
              const lum =
                  0.2126 * pixels.data[i] +
                  0.7152 * pixels.data[i + 1] +
                  0.0722 * pixels.data[i + 2],
                shade = clamp(lum / 172, 0.36, 1.2);
              for (let j = 0; j < 3; j++) next.data[i + j] = color[j] * shade;
            }
            const tinted = makeCanvas(base.width, base.height);
            tinted.getContext("2d").putImageData(next, 0, 0);
            versions[name] = tinted;
          }
          resolve({
            versions,
            pixels,
            rows: silhouetteRows(pixels.data, base.width, base.height, 56),
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
  return cache.get(id);
}

// Illustration-only deformation. No WebGL, 3D geometry, lighting, or Cubism SDK.
export class Craft2D {
  constructor(onMark, onStroke, onError, onView) {
    this.onView = onView;
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
      '<button type="button" data-turn="-1" aria-label="왼쪽으로 15도 회전">↶</button><span class="turn-label">0° · 1/24</span><button type="button" data-turn="1" aria-label="오른쪽으로 15도 회전">↷</button>';
    this.el.append(this.turns);
    this.turns.addEventListener("click", (e) => {
      const b = e.target.closest("[data-turn]");
      if (b) {
        e.stopPropagation();
        this.setRotation((this.work.viewFrame || 0) + Number(b.dataset.turn));
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
    const opt = { signal: this.abort.signal };
    this.canvas.addEventListener("pointerdown", (e) => this.down(e), opt);
    this.canvas.addEventListener("pointermove", (e) => this.move(e), opt);
    this.canvas.addEventListener("pointerup", (e) => this.up(e), opt);
    this.canvas.addEventListener(
      "pointercancel",
      () => {
        this.drag = null;
        this.stroke = null;
        this.paint();
      },
      opt,
    );
    this.canvas.addEventListener(
      "keydown",
      (e) => {
        if (e.code === "Space" && this.editable()) {
          e.preventDefault();
          if (!e.repeat) this.stamp();
        }
        if (["ArrowLeft", "ArrowRight"].includes(e.code)) {
          e.preventDefault();
          this.setRotation(
            (this.work.viewFrame || 0) + (e.code === "ArrowLeft" ? -1 : 1),
          );
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
      let animate = false;
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
    this.update(work, stage);
    this.size();
  }
  async update(work, stage) {
    this.glaze = 0;
    this.work = work;
    this.stage = stage;
    if (work.step !== 0 || work.sculpt?.mode !== "stretch") this.sculptMesh = null;
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
      !rotating ||
      (work.step === 0 && work.knead < 3 && !work.sculpt?.complete);
    this.turns.querySelector(".turn-label").textContent =
      (frame || 0) * 15 + "° · " + ((frame || 0) + 1) + "/24";
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
          loadIllustration(id, wrapFrame(frame + 1)).catch(() => {});
          loadIllustration(id, wrapFrame(frame - 1)).catch(() => {});
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
        (this.canvas.height * 0.74) / layout.maxHeight,
        (this.canvas.width * 0.83) / (layout.maxWidth * (this.work.width || 1)),
      );
      const h = 640 * scale,
        w = h * (this.work.width || 1);
      this.box = {
        x: (this.canvas.width - w) / 2,
        y: this.canvas.height * 0.86 - layout.baseline * scale,
        width: w,
        height: h,
      };
    } else {
      const aspect =
          (this.source.pixels.width / this.source.pixels.height) *
          (this.work.width || 1),
        h = Math.min(
          this.canvas.height * 0.77,
          (this.canvas.width * 0.79) / aspect,
        ),
        w = h * aspect;
      this.box = {
        x: (this.canvas.width - w) / 2,
        y: this.canvas.height * 0.86 - h,
        width: w,
        height: h,
      };
    }
    this.el.dataset.objectBox = JSON.stringify([
      this.box.x / this.canvas.width,
      this.box.y / this.canvas.height,
      this.box.width / this.canvas.width,
      this.box.height / this.canvas.height,
    ]);
    this.dirty = true;
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
    const row =
      this.source?.rows[Math.max(0, Math.min(55, Math.floor(v * 56)))];
    return row || [0.22, 0.78];
  }
  project(mark) {
    const uv = illustrationUV(mark),
      angle = mark.surfaceAngle ?? surfaceAngle(uv[0], this.rowAt(uv[1]), 0);
    if (!this.rotating) {
      if (this.layer === "back") return null;
      return { uv, squeeze: 1 };
    }
    const projection = projectSurface(
      angle,
      this.rowAt(uv[1]),
      this.work.viewFrame || 0,
      this.layer === "back",
    );
    return projection
      ? { uv: [projection.u, uv[1]], squeeze: projection.squeeze }
      : null;
  }
  async setRotation(frame) {
    if (
      !this.rotating ||
      (this.work.step === 0 &&
        this.work.knead < 3 &&
        !this.work.sculpt?.complete)
    )
      return;
    this.work.viewFrame = wrapFrame(frame);
    this.sway = this.motion ? 0 : 0.012;
    this.onView?.();
    await this.update(this.work, this.stage);
  }

  mark(c, mark, open, erase = false) {
    const projection = this.project(mark);
    if (!projection) return;
    const [u, v] = projection.uv,
      size = Math.min(c.canvas.width, c.canvas.height) * 0.00103,
      path = new Path2D(
        open
          ? cutoutPath(mark.pattern || this.work.pattern)
          : motifPath(mark.pattern || this.work.pattern),
      );
    c.save();
    c.translate(u * c.canvas.width, v * c.canvas.height);
    c.scale(size * projection.squeeze, size);
    c.lineJoin = "round";
    c.lineCap = "round";
    c.strokeStyle = open
      ? "#71554b"
      : this.work.decorPhase === 0
        ? "#89624f"
        : this.work.clay?.slip === "dark"
          ? "#51434a"
          : "#fff0d3";
    c.fillStyle = c.strokeStyle;
    c.lineWidth = open ? 10 : this.work.decorPhase === 1 ? 18 : 7;
    if (open) {
      if (erase) c.fill(path);
      else {
        c.stroke(path);
        c.translate(3, 3);
        c.lineWidth = 6;
        c.strokeStyle = ["finished", "glazed"].includes(this.stage)
          ? "#c3d0ae"
          : "#dfb78e";
        c.stroke(path);
      }
    } else c.stroke(path);
    c.restore();
  }
  drawStroke(c, stroke, open, erase = false) {
    if (stroke.points.length < 2) return;
    c.save();
    c.strokeStyle = open
      ? "#71554b"
      : this.work.decorPhase === 0
        ? "#89624f"
        : this.work.clay?.slip === "dark"
          ? "#51434a"
          : "#fff0d3";
    c.lineWidth =
      Math.min(c.canvas.width, c.canvas.height) *
      (open
        ? erase
          ? 0.016
          : 0.027
        : this.work.decorPhase === 1
          ? 0.019
          : 0.01);
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    let active = false;
    for (const point of stroke.points) {
      const projection = this.project(point);
      if (!projection) {
        active = false;
        continue;
      }
      const [u, v] = projection.uv;
      c[active ? "lineTo" : "moveTo"](u * c.canvas.width, v * c.canvas.height);
      active = true;
    }
    c.stroke();
    c.restore();
  }

  draw() {
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
      c.drawImage(this.surface, b.x, b.y, b.width, b.height);
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
    if (fraction >= 1) this.turns.hidden = !this.rotating;
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
      this.el.dataset.status === "ready" &&
      this.work?.step === 1 &&
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
    if (!this.source || this.el.dataset.status !== "ready") return;
    this.canvas.focus({ preventScroll: true });
    const hit = this.hit(e);
    if (!hit) return;
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    this.drag = {
      x: e.clientX,
      y: e.clientY,
      tilt: this.tilt,
      viewFrame: this.work.viewFrame || 0,
    };
    if (this.editable() && this.work.tool !== "rotate") this.stroke = [hit];
  }
  move(e) {
    if (!this.drag) return;
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
    } else if (!this.stroke) {
      const next = wrapFrame(
        this.drag.viewFrame + Math.round((e.clientX - this.drag.x) / 22),
      );
      if (next !== wrapFrame(this.work.viewFrame || 0)) this.setRotation(next);
    }
  }
  up(e) {
    if (!this.drag) return;
    const drag = this.drag,
      points = this.stroke;
    this.drag = null;
    this.stroke = null;
    this.pulse = 0.65;
    this.sway = this.motion ? 0 : 0.015;
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
          renderer: "illustration-2d",
        });
    }
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
          renderer: "illustration-2d",
        });
        return;
      }
    }
  }
  snapshot() {
    this.draw();
    const out = makeCanvas(
      512,
      Math.round((512 * this.canvas.height) / this.canvas.width),
    );
    out.getContext("2d").drawImage(this.canvas, 0, 0, out.width, out.height);
    return out.toDataURL("image/webp", 0.92);
  }
  dispose() {
    ++this.loadId;
    cancelAnimationFrame(this.frame);
    this.abort.abort();
    this.resize.disconnect();
    this.el.remove();
  }
}
