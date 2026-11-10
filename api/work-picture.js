import {ClassroomError, ClassroomService} from '../classroom-domain.js';
import {classroomStore, StoreUnavailable} from '../classroom-store.js';
import {previewAsJpeg} from '../work-picture.js';

// One finished work's picture as JPEG, for the PowerPoint add-in's old-engine board (Internet Explorer 11 cannot
// draw the stored WebP). Same access rules as the classroom API's "artwork": the class's teacher, an observer or
// PPT link, or the student. Kept apart from api/classroom.js so the image library never loads with the lesson API.
const SAMPLE = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';

function send(res, status, value) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(value));
}
function bearer(req) { const value = req.headers?.authorization || ''; return typeof value === 'string' && /^Bearer [A-Za-z0-9_-]+$/.test(value) ? value.slice(7) : ''; }

export function createWorkPictureHandler({store, now, convert = previewAsJpeg} = {}) {
  return async function handler(req, res) {
    try {
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(res, 405, {error: '지원하지 않는 요청이에요.', code: 'method'}); }
      const raw = Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
      // ?check=1 converts a built-in one-pixel picture: tells whether conversion works on this server, with no class data.
      if (raw.check === '1') return send(res, 200, {conversion: Boolean(await convert(SAMPLE))});
      const service = new ClassroomService(store || classroomStore(), {now});
      const {preview} = await service.artwork(raw, bearer(req));
      const picture = await convert(preview);
      // If conversion is not possible the stored picture is returned as it is; the board then shows the text card.
      return send(res, 200, picture ? {preview: picture, converted: true} : {preview, converted: false});
    } catch (error) {
      if (error instanceof ClassroomError) return send(res, error.status, {error: error.message, code: error.code});
      // Never log participant names, answers, bearer tokens, provider responses, or bodies.
      console.warn('Work picture unavailable:', error instanceof StoreUnavailable ? 'storage-not-configured' : 'storage-error');
      return send(res, 503, {error: '작품 그림을 잠시 불러오지 못했어요.', code: 'storage-unavailable'});
    }
  };
}
export default createWorkPictureHandler();
