import {ClassroomError, ClassroomService, configuredTeacherPasscode} from '../classroom-domain.js';
import {classroomStorageStatus, classroomStore, StoreUnavailable} from '../classroom-store.js';

// Includes a bounded full drawing plus its preview, below Vercel's 4.5 MB request limit.
export const MAX_CLASSROOM_BODY_BYTES = 4_000_000;

function send(res, status, value) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(value));
}
async function body(req) {
  let text;
  if (req.body && typeof req.body === 'object') text = JSON.stringify(req.body);
  else if (typeof req.body === 'string') text = req.body;
  else { text = ''; for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > MAX_CLASSROOM_BODY_BYTES) throw new ClassroomError(413, 'body-too-large', '보내는 작품 자료가 너무 커요.'); } }
  if (Buffer.byteLength(text) > MAX_CLASSROOM_BODY_BYTES) throw new ClassroomError(413, 'body-too-large', '보내는 작품 자료가 너무 커요.');
  try { const value = JSON.parse(text || '{}'); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
  catch { throw new ClassroomError(400, 'invalid-json', '보내는 내용을 다시 확인해 주세요.'); }
}
function bearer(req) { const value = req.headers?.authorization || ''; return typeof value === 'string' && /^Bearer [A-Za-z0-9_-]+$/.test(value) ? value.slice(7) : ''; }

export function createClassroomHandler({store, now, makeCode, makeToken} = {}) {
  return async function handler(req, res) {
    try {
      if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return send(res, 405, {error: '지원하지 않는 요청이에요.', code: 'method'}); }
      // Same-origin browser writes only; no permissive CORS credentials.
      if (req.method === 'POST' && req.headers?.origin) {
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        let originHost;
        try { originHost = new URL(req.headers.origin).host; } catch { originHost = ''; }
        if (host && originHost !== host) return send(res, 403, {error: '수업 화면에서 다시 시도해 주세요.', code: 'origin'});
      }
      const raw = req.method === 'POST' ? await body(req) : Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
      if (req.method === 'GET' && raw.action === 'health') return send(res, 200, {...classroomStorageStatus(), teacherPasscode: Boolean(configuredTeacherPasscode()), serverNow: now ? now() : Date.now()});
      const service = new ClassroomService(store || classroomStore(), {now, makeCode, makeToken});
      const auth = bearer(req);
      let result;
      if (req.method === 'GET' && raw.action === 'teacher') result = await service.overview(raw, auth);
      else if (req.method === 'GET' && raw.action === 'artwork') result = await service.artwork(raw, auth);
      else if (req.method === 'GET' && raw.action === 'state') result = await service.state(raw, auth);
      else if (req.method === 'GET' && raw.action === 'observe') result = await service.observe(raw, auth);
      else if (req.method === 'POST' && raw.action === 'create') result = await service.create(raw, auth);
      else if (req.method === 'POST' && raw.action === 'join') result = await service.join(raw);
      else if (req.method === 'POST' && raw.action === 'control') result = await service.control(raw, auth);
      else if (req.method === 'POST' && raw.action === 'answer') result = await service.answer(raw, auth);
      else if (req.method === 'POST' && raw.action === 'beauty-answer') result = await service.beautyAnswer(raw, auth);
      else if (req.method === 'POST' && raw.action === 'work') result = await service.submitWork(raw, auth);
      else throw new ClassroomError(400, 'unknown-action', '수업 화면을 새로고침해 주세요.');
      return send(res, 200, result);
    } catch (error) {
      if (error instanceof ClassroomError) return send(res, error.status, {error: error.message, code: error.code});
      // Never log participant names, answers, bearer tokens, provider responses, or bodies.
      console.warn('Classroom request unavailable:', error instanceof StoreUnavailable ? 'storage-not-configured' : 'storage-error');
      return send(res, 503, {error: '수업 연결을 잠시 확인하고 있어요. 입력한 내용은 그대로 두고 다시 시도해 주세요.', code: 'storage-unavailable'});
    }
  };
}

export default createClassroomHandler();
