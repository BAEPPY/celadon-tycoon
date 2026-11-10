const BASE_KEY = 'celadon-tycoon-v2';
const MAX_PREVIEW_BYTES = 300 * 1024;

export function classroomContext(href = globalThis.location?.href) {
  if (!href) return null;
  const url = new URL(href, 'https://classroom.invalid');
  if (url.searchParams.get('classroom') !== '1') return null;
  const room = (url.searchParams.get('room') || '').toUpperCase();
  const student = url.searchParams.get('student') || '';
  const run = url.searchParams.get('run');
  if (!/^[A-Z0-9]{6,10}$/.test(room) || !/^[A-Za-z0-9_-]{1,80}$/.test(student)) return null;
  if (run !== null && !/^[A-Za-z0-9_-]{1,100}$/.test(run)) return null;
  return {room, student, ...(run ? {run} : {})};
}

export function classroomStorageKey(href) {
  const context = classroomContext(href);
  return context ? `${BASE_KEY}:classroom:${context.room}:${context.student}${context.run ? `:run:${context.run}` : ''}` : BASE_KEY;
}

// Transfer only the fields needed for the completed work, its rendering and rubric. Names,
// lesson credentials, drafts and unrelated browser data never enter this packet.
export function classroomWorkPayload(work) {
  if (!work || work.step !== 4 || typeof work.id !== 'string' || !work.id) return null;
  const normalized = assessmentInput(work), result = {id: work.id.slice(0, 100)};
  for (const key of ['orderId','shape','modelId','technique','pattern','drawingLabel','title','explanationUse','explanationBeauty']) result[key] = normalized[key];
  result.step = 4;
  result.decorDone = work.decorDone === true;
  result.decorPhase = Number.isInteger(work.decorPhase) ? work.decorPhase : 0;
  result.knead = Number.isFinite(work.knead) ? work.knead : 0;
  result.width = Number.isFinite(work.width) ? work.width : 1;
  result.firing = Array.isArray(work.firing) ? work.firing.filter(value => typeof value === 'string').slice(0, 4) : [];
  // The current game allows 24 stamps. Preserve the backend's larger legacy
  // limit too: a motif near the end must not change a finished work's score.
  result.placements = (Array.isArray(work.placements) ? work.placements : []).slice(0, 1200).map(mark => ({
    x: Number(mark?.x) || 0, y: Number(mark?.y) || 0,
    ...(typeof mark?.pattern === 'string' ? {pattern: mark.pattern.slice(0, 30)} : {}),
  }));
  result.strokes = (Array.isArray(work.strokes) ? work.strokes : []).slice(0, 600).map(stroke => ({
    points: (Array.isArray(stroke?.points) ? stroke.points : []).slice(0, 2).map(point => ({x: Number(point?.x) || 0, y: Number(point?.y) || 0})),
  }));
  result.clay = {body: work.clay?.body === true, prepared: work.clay?.prepared === true,
    kneads: Number(work.clay?.kneads) || 0, slip: ['dark', 'mixed'].includes(work.clay?.slip) ? work.clay.slip : 'white'};
  result.inspection = {done: work.inspection?.done === true};
  if (work.assessment && typeof work.assessment === 'object') {
    const assessment = work.assessment;
    result.assessment = {version: assessment.version, source: assessment.source,
      fingerprint: assessment.fingerprint, accepted: assessment.accepted === true,
      model: String(assessment.model || '').slice(0, 100), notice: String(assessment.notice || '').slice(0, 180)};
    for (const key of ['use','beauty']) result.assessment[key] = {
      score: assessment[key]?.score, feedback: String(assessment[key]?.feedback || '').slice(0, 240),
    };
  }
  result.selfUse = work.selfUse === true;
  result.selfBeauty = work.selfBeauty === true;
  const design = sanitizeWorkDesign(work);
  if (design) result.design = design;
  return result;
}

export async function classroomPreview(source, documentRef = document) {
  if (typeof source !== 'string' || !/^data:image\/(?:png|webp|svg\+xml)[;,]/.test(source) || source.length > 4 * 1024 * 1024) return null;
  const image = new Image();
  image.src = source;
  await image.decode();
  if (!image.naturalWidth || !image.naturalHeight) return null;
  const scale = Math.min(480 / image.naturalWidth, 360 / image.naturalHeight, 1);
  const canvas = documentRef.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  for (const quality of [.78, .55, .35]) {
    const preview = canvas.toDataURL('image/webp', quality);
    if (/^data:image\/(?:png|webp);base64,/.test(preview) && preview.length * .75 <= MAX_PREVIEW_BYTES) return preview;
  }
  return null;
}

export function createClassroomGameBridge({onPause = () => {}, onResume = () => {}, getCompleted = () => [], previewSource = work => work.preview, isCurrent = () => true, getExpiresAt = () => null} = {}) {
  const context = classroomContext();
  if (!context) return null;
  let active = false, runId = null, leaseUntil = 0, deadline = 0, disposed = false;
  const pending = new Set(), abort = new AbortController();
  const overlay = document.createElement('div');
  overlay.id = 'classroom-game-pause';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;text-align:center;background:#f7f2e7;color:#315e50;padding:32px;font-family:inherit;';
  const message = document.createElement('p');
  message.style.cssText = 'font-size:clamp(24px,4vw,40px);line-height:1.6;margin:0;';
  message.textContent = '선생님의 시작을 기다리고 있어요.';
  overlay.append(message);
  document.body.append(overlay);

  function post(value) {
    if (!disposed && window.parent !== window) window.parent.postMessage({...value, ...context}, window.location.origin);
  }
  function setActive(value, reason) {
    if (disposed) return;
    const changed = active !== value;
    active = value;
    overlay.hidden = value;
    overlay.style.display = value ? 'none' : 'grid';
    if (!value) message.textContent = reason === 'connection'
      ? '수업 연결을 확인하고 있어요.\n잠시 기다려 주세요.'
      : '크롬북을 닫고 선생님을 보세요.';
    if (changed) {
      if (value) onResume();
      else {onPause(); overlay.focus?.({preventScroll: true});}
    }
  }
  async function completed(work) {
    const payload = classroomWorkPayload(work), currentRun = runId, expiresAt = getExpiresAt(work);
    if (!active || !payload || pending.has(payload.id) || !isCurrent(work) || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return;
    pending.add(payload.id);
    try {
      const preview = await classroomPreview(previewSource(work));
      if (!disposed && active && currentRun === runId && preview && isCurrent(work) && expiresAt > Date.now()) post({type: 'celadon:completed', work: payload, preview, runId, expiresAt});
    } catch {post({type: 'celadon:preview-error', workId: payload.id});}
    finally {pending.delete(payload.id);}
  }
  function resend() {
    if (active) for (const work of getCompleted().slice(0, 60)) void completed(work);
  }
  window.addEventListener('message', event => {
    if (disposed || event.origin !== window.location.origin || event.source !== window.parent || window.parent === window) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'celadon:classroom-state') {
      // A restarted activity owns a new game save. A stale iframe cannot tag
      // its old gallery with the teacher's replacement run.
      if (context.run && data.runId !== context.run) {setActive(false, 'teacher');return;}
      leaseUntil = Date.now() + 15000;
      if (typeof data.runId === 'string') runId = data.runId;
      deadline = Number.isFinite(data.endsAt) && Number.isFinite(data.serverNow)
        ? Date.now() + Math.max(0, data.endsAt - data.serverNow) : 0;
      const wasActive = active;
      setActive(data.active === true && (!deadline || deadline > Date.now()), 'teacher');
      if (!wasActive && active) resend();
    } else if (data.type === 'celadon:request-completed') resend();
  }, {signal: abort.signal});
  const block = event => {if (!active) {event.preventDefault(); event.stopImmediatePropagation();}};
  for (const name of ['pointerdown','pointermove','pointerup','click','keydown','keyup','input','change','wheel']) {
    window.addEventListener(name, block, {capture: true, passive: false, signal: abort.signal});
  }
  const clock = setInterval(() => {
    if (active && deadline && Date.now() >= deadline) setActive(false, 'teacher');
    else if (active && Date.now() >= leaseUntil) setActive(false, 'connection');
  }, 500);
  onPause();
  post({type: 'celadon:ready'});
  return {context, completed, get active() {return active;}, get runId() {return runId;},
    dispose() {disposed = true;clearInterval(clock);abort.abort();overlay.remove();pending.clear();}};
}
import {assessmentInput} from './assessment-rules.js';
import {sanitizeWorkDesign} from './work-design.js';
