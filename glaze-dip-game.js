import {evaluateGlazeDip, GLAZE_DIP_RULES} from './glaze-dip-rules.js';

const LOWER_MS = 360;
const LIFT_MS = 520;
// Back/front images share one registered crop (1497 × 779). The liquid's
// center sits above the near rim, leaving the authored pot behind that rim.
const VAT_RATIO = 779 / 1497;
const VAT_SURFACE_Y = .31;
const ACTIVE_STATES = new Set(['lowering', 'immersed', 'lifting']);
const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const ease = value => value * value * (3 - 2 * value);
const outcomeLabels = {thin: '유약이 얇게 입혀졌어요', balanced: '유약이 알맞게 입혀졌어요!', thick: '유약이 두껍게 입혀졌어요'};

/** Dip the actual authored work into a glaze bath on its existing workbench. */
export class GlazeDipGame {
  constructor(container, {workSurface, workbench, controlsHost, onComplete, onCancel, onAttempt} = {}) {
    this.callbacks = {onComplete, onCancel, onAttempt};
    this.workSurface = workSurface;
    this.workbench = workbench;
    this.controlsHost = controlsHost;
    this.abort = new AbortController();
    this.state = 'ready';
    this.paused = false;
    this.disposed = false;
    this.stateStarted = performance.now();
    this.stateAccumulated = 0;
    this.result = null;
    this.previousFocus = document.activeElement;

    this.element = document.createElement('section');
    this.element.className = 'glaze-dip-game';
    this.element.setAttribute('aria-label', '내 청자 유약 담그기');
    this.element.innerHTML = `
      <div class="glaze-dip-copy">
      <h2>내 청자 유약 담그기</h2>
      <p class="glaze-dip-instruction">시작을 누르면 내 도자기가 유약에 들어가요.<br><strong>도자기가 잠기면 마음속으로 5초</strong>를 세고 <strong>스탑!</strong>을 눌러 꺼내세요.</p>
      <p class="glaze-dip-target">4.5~5.5초 안에 꺼내면 성공!</p>
      <div class="glaze-dip-feedback" role="status" aria-live="polite" aria-atomic="true">
        <strong class="glaze-dip-status">준비되면 시작해요.</strong>
        <p class="glaze-dip-detail">너무 빨리 꺼내면 얇게, 너무 늦게 꺼내면 두껍게 입혀져요.</p>
        <output class="glaze-dip-result-time" hidden></output>
      </div>
      </div>
      <button type="button" class="glaze-dip-primary" data-glaze-action="start">시작 · 유약에 담그기</button>
      <div class="glaze-dip-secondary">
        <button type="button" class="small-button" data-glaze-action="pause" disabled>잠깐 쉬기</button>
        <button type="button" class="small-button" data-glaze-action="cancel">작업대로</button>
      </div>
      <p class="glaze-dip-context">5초는 이 게임의 목표 시간이에요.</p>`;
    this.primary = this.element.querySelector('.glaze-dip-primary');
    this.pauseButton = this.element.querySelector('[data-glaze-action="pause"]');
    this.status = this.element.querySelector('.glaze-dip-status');
    this.detail = this.element.querySelector('.glaze-dip-detail');
    this.resultTime = this.element.querySelector('.glaze-dip-result-time');

    if (controlsHost) {
      this.controlsHostHadClass = controlsHost.classList.contains('glaze-dip-controls');
      controlsHost.classList.add('glaze-dip-controls');
      controlsHost.append(this.element);
    } else container.append(this.element);
    this.scene = workbench?.closest('.station-scene');
    this.sceneHadClass = this.scene?.classList.contains('glaze-dip-active');
    this.scene?.classList.add('glaze-dip-active');

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'glaze-dip-canvas';
    this.canvas.width = 960;
    this.canvas.height = 640;
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', '내가 만든 도자기를 유약 통에 담갔다 꺼내는 모습');
    this.ctx = this.canvas.getContext('2d');
    this.originalCanvas = workbench?.querySelector('canvas');
    if (workbench && this.originalCanvas) {
      this.originalVisibility = this.originalCanvas.style.visibility;
      this.workbenchWasInert = workbench.inert;
      this.workbenchHadClass = workbench.classList.contains('glaze-dip-workbench');
      workbench.classList.add('glaze-dip-workbench');
      workbench.inert = false;
      workbench.append(this.canvas);
      this.originalCanvas.style.visibility = 'hidden';
      this.resizeObserver = new ResizeObserver(() => this.alignCanvas());
      this.resizeObserver.observe(workbench);
      this.resizeObserver.observe(this.originalCanvas);
      this.alignCanvas();
    } else {
      this.element.prepend(this.canvas);
    }
    this.validSurface = Boolean(workSurface?.image?.width > 0 && workSurface?.image?.height > 0 && workSurface?.mask?.width === workSurface.image.width && workSurface?.mask?.height === workSurface.image.height);
    this.canvas.dataset.workSurface = this.validSurface ? 'authored' : 'unavailable';
    if (!this.validSurface) {
      this.primary.disabled = true;
      this.status.textContent = '작품을 불러오지 못했어요.';
      this.detail.textContent = '작업대로 돌아간 뒤 다시 시작해 주세요.';
    } else this.makeCoatings();

    const options = {signal: this.abort.signal};
    this.element.addEventListener('click', event => {
      const button = event.target.closest('[data-glaze-action]');
      if (!button || button.disabled || this.disposed) return;
      switch (button.dataset.glazeAction) {
        case 'start': this.start(); break;
        case 'stop': this.stop(); break;
        case 'pause': this.pause(!this.paused); break;
        case 'cancel': this.cancel(); break;
        case 'complete': this.complete(); break;
      }
    }, options);
    // Keep native button semantics, but a held Enter must not activate a new
    // action after the same focused button changes from Start to Stop.
    this.element.addEventListener('keydown', event => {
      if (event.repeat && (event.code === 'Space' || event.code === 'Enter')) event.preventDefault();
    }, options);
    window.addEventListener('blur', () => this.pause(true), options);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause(true);
    }, options);
    this.art = {};
    for (const name of ['vat-back', 'vat-front', 'ripples']) {
      const image = new Image();
      image.onload = () => { if (!this.disposed) this.draw(); };
      image.src = `/assets/glaze-dip/${name}.webp`;
      this.art[name] = image;
    }
    this.syncData();
    this.tick = now => {
      if (this.disposed) return;
      if (!this.paused) {
        if (this.state === 'lowering' && this.phaseElapsed(now) >= LOWER_MS) this.immerse(now);
        if (this.state === 'immersed' && this.phaseElapsed(now) >= GLAZE_DIP_RULES.maxDurationMs) this.stop(now, true);
        if (this.state === 'lifting' && this.phaseElapsed(now) >= LIFT_MS) this.showResult(now);
      }
      if (this.disposed) return;
      this.syncData(now);
      this.draw(now);
      this.frame = requestAnimationFrame(this.tick);
    };
    this.draw();
    this.frame = requestAnimationFrame(this.tick);
    this.primary.focus({preventScroll: true});
  }

  phaseElapsed(now = performance.now()) {
    return this.stateAccumulated + (this.paused ? 0 : Math.max(0, now - this.stateStarted));
  }

  changeState(state, now = performance.now()) {
    this.state = state;
    this.stateStarted = now;
    this.stateAccumulated = 0;
    this.syncData(now);
  }

  syncData(now = performance.now()) {
    this.element.dataset.state = this.state;
    this.element.dataset.paused = String(this.paused);
    this.element.dataset.elapsedMs = String(this.result?.elapsedMs ?? (this.state === 'immersed' ? Math.round(this.phaseElapsed(now)) : 0));
    if (this.result) {
      this.element.dataset.outcome = this.result.outcome;
      this.element.dataset.score = String(this.result.score);
      this.element.dataset.result = JSON.stringify(this.result);
    }
  }

  start() {
    if (this.disposed || this.state !== 'ready' || !this.validSurface) return;
    this.changeState('lowering');
    this.primary.dataset.glazeAction = 'stop';
    this.primary.textContent = '유약에 담그는 중…';
    this.primary.disabled = true;
    this.pauseButton.disabled = false;
    this.status.textContent = '도자기가 잠기면 5초를 세어요.';
    this.detail.textContent = '스탑 버튼이 켜지면 마음속으로 세기 시작해요.';
  }

  immerse(now) {
    if (this.state !== 'lowering' || this.disposed) return;
    this.changeState('immersed', now);
    this.primary.textContent = '스탑! · 꺼내기';
    this.primary.disabled = false;
    this.status.textContent = '지금부터 마음속으로 5초!';
    this.detail.textContent = '5초가 되었다고 생각하면 스탑을 눌러요.';
    this.primary.focus({preventScroll: true});
  }

  stop(now = performance.now(), timedOut = false) {
    if (this.disposed || this.state !== 'immersed' || this.paused || this.result) return;
    const elapsedMs = Math.round(clamp(this.phaseElapsed(now), 0, GLAZE_DIP_RULES.maxDurationMs));
    const evaluated = evaluateGlazeDip(elapsedMs);
    if (!evaluated) return;
    this.result = {...evaluated, timedOut};
    this.changeState('lifting', now);
    this.primary.disabled = true;
    this.primary.textContent = '도자기를 꺼내는 중…';
    this.status.textContent = timedOut ? '오래 담겨 있어 도자기를 꺼냈어요.' : '유약이 입혀진 모습을 살펴봐요.';
    this.detail.textContent = '꺼낸 뒤 재벌구이를 하면 청자의 빛깔이 나타나요.';
    this.callbacks.onAttempt?.({...this.result});
  }

  showResult(now) {
    if (this.disposed || this.state !== 'lifting') return;
    this.changeState('result', now);
    this.primary.dataset.glazeAction = 'complete';
    this.primary.textContent = '결과 확인하고 계속';
    this.primary.disabled = false;
    this.pauseButton.disabled = true;
    this.status.textContent = outcomeLabels[this.result.outcome];
    this.detail.textContent = this.result.timedOut
      ? '60초 동안 담겨 있어 자동으로 꺼냈어요. 유약이 두꺼우면 구울 때 흘러내리거나 벗겨질 수 있어요.'
      : this.result.feedback;
    this.resultTime.hidden = false;
    this.resultTime.textContent = `${(this.result.elapsedMs / 1000).toFixed(2)}초 · 유약 점수 ${this.result.score}/${this.result.max}점`;
    this.primary.focus({preventScroll: true});
  }

  pause(paused) {
    if (this.disposed || !ACTIVE_STATES.has(this.state) || this.paused === paused) return;
    const now = performance.now();
    if (paused) {
      this.stateAccumulated = this.phaseElapsed(now);
      this.paused = true;
      this.statusBeforePause = this.status.textContent;
      this.detailBeforePause = this.detail.textContent;
      this.status.textContent = '잠깐 쉬는 중이에요.';
      this.detail.textContent = '쉬는 시간은 세지 않아요. 계속하기를 누르면 이어서 셀 수 있어요.';
      this.primary.disabled = true;
      this.pauseButton.textContent = '계속하기';
    } else {
      this.paused = false;
      this.stateStarted = now;
      this.status.textContent = this.statusBeforePause;
      this.detail.textContent = this.detailBeforePause;
      this.primary.disabled = this.state !== 'immersed';
      this.pauseButton.textContent = '잠깐 쉬기';
      if (this.state === 'immersed') this.primary.focus({preventScroll: true});
    }
    this.syncData(now);
    this.draw(now);
  }

  complete() {
    if (this.disposed || this.state !== 'result' || !this.result) return;
    const result = {...this.result};
    this.dispose();
    this.callbacks.onComplete?.(result);
  }

  cancel() {
    if (this.disposed) return;
    this.dispose();
    this.callbacks.onCancel?.();
  }

  alignCanvas() {
    if (!this.originalCanvas || this.disposed) return;
    const rect = this.originalCanvas.getBoundingClientRect();
    const parent = this.workbench.getBoundingClientRect();
    Object.assign(this.canvas.style, {
      position: 'absolute', left: `${rect.left - parent.left}px`, top: `${rect.top - parent.top}px`,
      width: `${rect.width}px`, height: `${rect.height}px`, maxWidth: 'none'
    });
    // A proportional backing store keeps both wide pillows and tall vases true
    // to the student's artwork, even when the workbench changes on a phone.
    if (rect.width > 0 && rect.height > 0) {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(rect.width * ratio);
      this.canvas.height = Math.round(rect.height * ratio);
    }
    if (this.ctx) this.draw();
  }

  makeCoatings() {
    const {image, mask} = this.workSurface;
    this.coatings = {};
    for (const outcome of ['thin', 'balanced', 'thick']) {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      // The transparent source-local mask preserves handles, cutouts, and all
      // of the student's contour edits. The unfired glaze is a pale slurry.
      const film = document.createElement('canvas');
      film.width = canvas.width;
      film.height = canvas.height;
      const f = film.getContext('2d');
      f.drawImage(mask, 0, 0);
      f.globalCompositeOperation = 'source-in';
      f.fillStyle = outcome === 'thin' ? '#f1f2ef66' : outcome === 'balanced' ? '#f1f2efc4' : '#f2f3f0ed';
      f.fillRect(0, 0, film.width, film.height);
      if (outcome === 'thin') {
        f.globalCompositeOperation = 'source-atop';
        f.fillStyle = '#9e9b9027';
        // Broad soft, sparse patches avoid unpleasant dotted textures.
        for (const [x, y, rx, ry] of [[.22, .34, .16, .17], [.72, .62, .2, .13]]) {
          f.beginPath();
          f.ellipse(x * film.width, y * film.height, rx * film.width, ry * film.height, -.2, 0, Math.PI * 2);
          f.fill();
        }
      } else if (outcome === 'thick') {
        f.globalCompositeOperation = 'source-atop';
        f.strokeStyle = '#fffffbb0';
        f.lineCap = 'round';
        f.lineWidth = Math.max(3, film.width * .035);
        for (const [x, end] of [[.3, .56], [.56, .73], [.75, .51]]) {
          f.beginPath();
          f.moveTo(x * film.width, .22 * film.height);
          f.bezierCurveTo((x - .02) * film.width, .4 * film.height, (x + .025) * film.width, .44 * film.height, x * film.width, end * film.height);
          f.stroke();
        }
      }
      ctx.drawImage(film, 0, 0);
      this.coatings[outcome] = canvas;
    }
  }

  draw(now = performance.now()) {
    if (!this.ctx || this.disposed) return;
    const c = this.ctx, w = this.canvas.width, h = this.canvas.height;
    c.clearRect(0, 0, w, h);
    if (!this.validSurface) return;
    const source = this.workSurface.image;
    const placement = typeof this.workSurface.placement === 'function' ? this.workSurface.placement() : this.workSurface.placement;
    // Keep the source's actual ratio; the bath is sized around this workpiece.
    const maxWidth = Math.min(w * .58, h * .71, placement?.width > 0 ? placement.width * w : w * .58);
    const maxHeight = h * .53;
    const scale = Math.min(maxWidth / source.width, maxHeight / source.height);
    const potW = source.width * scale, potH = source.height * scale;
    const vatW = Math.min(Math.max(w * .57, potW * 1.26), h * .47 / VAT_RATIO, w * .88);
    const vatH = vatW * VAT_RATIO;
    const vatX = (w - vatW) / 2, surfaceY = h * .66;
    const vatY = surfaceY - vatH * VAT_SURFACE_Y;
    const startY = surfaceY - potH - h * .045;
    const endY = surfaceY + vatH * .07;
    const elapsed = this.phaseElapsed(now);
    let immersion = this.state === 'immersed' ? 1 : 0;
    if (this.state === 'lowering') immersion = ease(clamp(elapsed / LOWER_MS));
    if (this.state === 'lifting') immersion = 1 - ease(clamp(elapsed / LIFT_MS));
    const potY = startY + (endY - startY) * immersion, potX = (w - potW) / 2;
    this.canvas.dataset.surfaceBounds = JSON.stringify({x: potX / w, y: potY / h, width: potW / w, height: potH / h});
    this.canvas.dataset.immersion = immersion.toFixed(3);

    c.fillStyle = '#58463616';
    c.beginPath();
    c.ellipse(w / 2, vatY + vatH * .98, vatW * .49, vatH * .1, 0, 0, Math.PI * 2);
    c.fill();
    this.drawVatBack(c, vatX, vatY, vatW, vatH, surfaceY);
    const coated = this.result && (this.state === 'lifting' || this.state === 'result');
    // The vat's surface clips the submerged part even if its illustration has
    // a transparent rim. No duplicate student pot remains behind this layer.
    c.save();
    c.beginPath();
    c.rect(0, 0, w, surfaceY + vatH * .08);
    c.clip();
    const tilt = this.state === 'lowering'
      ? Math.sin(clamp(elapsed / LOWER_MS) * Math.PI) * .10
      : this.state === 'lifting' ? -Math.sin(clamp(elapsed / LIFT_MS) * Math.PI) * .08 : 0;
    c.translate(potX + potW / 2, potY + potH * .52);
    c.rotate(tilt);
    c.drawImage(coated ? this.coatings[this.result.outcome] : source, -potW / 2, -potH * .52, potW, potH);
    c.restore();
    if (this.state === 'lifting' && immersion < .62 && this.result.outcome !== 'thin') {
      const drift = clamp((.62 - immersion) / .62);
      c.save();
      c.strokeStyle = '#f9f9f5';
      c.lineWidth = Math.max(2, w * .004);
      c.lineCap = 'round';
      c.globalAlpha = 1 - drift;
      for (const offset of [-.19, .17]) {
        const dripX = w / 2 + potW * offset;
        const dripY = Math.min(surfaceY, potY + potH + drift * h * .06);
        c.beginPath(); c.moveTo(dripX, dripY); c.lineTo(dripX, Math.min(surfaceY, dripY + h * .022)); c.stroke();
      }
      c.restore();
    }
    if (immersion > .04) this.drawRipples(c, w / 2, surfaceY, vatW * .36, vatH * .14, now);
    this.drawVatFront(c, vatX, vatY, vatW, vatH, surfaceY);
    if (this.paused) {
      c.fillStyle = '#fff7e85c';
      c.fillRect(0, 0, w, h);
    }
  }

  drawVatBack(c, x, y, width, height, surfaceY) {
    const art = this.art?.['vat-back'];
    if (art?.complete && art.naturalWidth) {
      c.drawImage(art, x, y, width, height);
      return;
    }
    c.lineWidth = Math.max(2, width * .007);
    c.fillStyle = '#ad8d6f';
    c.strokeStyle = '#795f50';
    c.beginPath();
    c.ellipse(x + width / 2, surfaceY, width / 2, height * .23, 0, 0, Math.PI * 2);
    c.fill(); c.stroke();
    c.fillStyle = '#f3f3f0';
    c.beginPath();
    c.ellipse(x + width / 2, surfaceY, width * .455, height * .18, 0, 0, Math.PI * 2);
    c.fill();
  }

  drawVatFront(c, x, y, width, height, surfaceY) {
    const art = this.art?.['vat-front'];
    if (art?.complete && art.naturalWidth) {
      c.drawImage(art, x, y, width, height);
      return;
    }
    c.fillStyle = '#bca185';
    c.strokeStyle = '#795f50';
    c.lineWidth = Math.max(2, width * .007);
    c.beginPath();
    c.moveTo(x, surfaceY);
    c.bezierCurveTo(x + width * .13, surfaceY + height * .29, x + width * .87, surfaceY + height * .29, x + width, surfaceY);
    c.lineTo(x + width * .91, y + height * .82);
    c.bezierCurveTo(x + width * .8, y + height * 1.03, x + width * .2, y + height * 1.03, x + width * .09, y + height * .82);
    c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = '#e0cfaf';
    c.lineWidth = Math.max(2, height * .045);
    c.beginPath();
    c.ellipse(x + width / 2, surfaceY, width * .49, height * .22, 0, 0, Math.PI);
    c.stroke();
  }

  drawRipples(c, x, y, rx, ry, now) {
    const art = this.art?.ripples;
    c.save();
    c.globalAlpha = .45;
    if (art?.complete && art.naturalWidth) c.drawImage(art, x - rx, y - ry, rx * 2, ry * 2);
    else {
      c.strokeStyle = '#ffffff';
      c.lineWidth = Math.max(1.5, rx * .012);
      for (const n of [.63, .88]) {
        c.beginPath();
        c.ellipse(x, y, rx * n, ry * n, 0, 0, Math.PI * 2);
        c.stroke();
      }
    }
    c.restore();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.abort.abort();
    this.resizeObserver?.disconnect();
    if (this.originalCanvas) this.originalCanvas.style.visibility = this.originalVisibility;
    if (this.workbench) {
      if (this.workbenchWasInert !== undefined) this.workbench.inert = this.workbenchWasInert;
      if (!this.workbenchHadClass) this.workbench.classList.remove('glaze-dip-workbench');
    }
    if (!this.controlsHostHadClass) this.controlsHost?.classList.remove('glaze-dip-controls');
    if (!this.sceneHadClass) this.scene?.classList.remove('glaze-dip-active');
    this.canvas.remove();
    this.element.remove();
    if (this.previousFocus?.isConnected && !this.previousFocus.closest('[inert]')) this.previousFocus.focus?.({preventScroll: true});
  }
}
