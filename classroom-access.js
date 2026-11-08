// These helpers keep sharing and UI roles unambiguous. The server remains the
// authority for teacher capabilities and the currently open activity.
const CODE = /^[A-Z2-9]{6}$/;

export function extractClassroomCode(value, {origin = globalThis.location?.origin} = {}) {
  if (typeof value !== 'string') return '';
  const text = value.normalize('NFKC').trim();
  const rawCode = text.toUpperCase();
  if (CODE.test(rawCode)) return rawCode;
  if (!origin || !text) return '';
  try {
    const base = new URL(origin);
    const url = new URL(text, base.origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== base.origin || !/^\/lesson\/?$/.test(url.pathname)) return '';
    const codes = url.searchParams.getAll('code');
    if (codes.length !== 1) return '';
    const code = codes[0].normalize('NFKC').trim().toUpperCase();
    return CODE.test(code) ? code : '';
  } catch { return ''; }
}

export const TEACHER_ONLY_ACTIONS = Object.freeze([
  'create', 'settings', 'teacher-activity', 'teacher-object', 'copy-code',
  'copy-invite', 'cloud-kind', 'start', 'pause', 'reveal', 'end', 'new-room', 'delete-room',
]);
const teacherActions = new Set(TEACHER_ONLY_ACTIONS);
const studentActions = new Set(['join', 'submit-answers', 'next-object', 'previous-object', 'select-object']);
const commonActions = new Set(['retry-connection', 'fullscreen']);

export function isTeacherAction(action) { return teacherActions.has(action); }

export function canUseClassroomAction(action, {teacherMode = false, teacherToken} = {}) {
  if (teacherActions.has(action)) {
    // A teacher may create a room before a room-specific capability exists.
    return teacherMode === true && (action === 'create' ||
      (typeof teacherToken === 'string' && /^[A-Za-z0-9_-]{30,100}$/.test(teacherToken)));
  }
  if (studentActions.has(action)) return teacherMode === false;
  return commonActions.has(action);
}
