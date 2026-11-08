import {timingSafeEqual} from 'node:crypto';
import {ClassroomService} from '../classroom-domain.js';
import {classroomStore} from '../classroom-store.js';

function send(res, status, value) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(value));
}

export function createCleanupHandler({store, now, secret = () => process.env.CRON_SECRET} = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(res, 405, {code: 'method'}); }
    const configured = secret(), header = req.headers?.authorization;
    const expected = typeof configured === 'string' && configured.length >= 32 ? Buffer.from(`Bearer ${configured}`) : null;
    const actual = typeof header === 'string' ? Buffer.from(header) : null;
    if (!expected || !actual || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return send(res, 401, {code: 'unauthorized'});
    try { return send(res, 200, await new ClassroomService(store || classroomStore(), {now}).cleanupExpiredWorks()); }
    catch {
      // Cleanup logs only a fixed code, never classroom content or credentials.
      console.warn('Classroom cleanup unavailable: storage-error');
      return send(res, 503, {code: 'cleanup-unavailable'});
    }
  };
}

export default createCleanupHandler();
