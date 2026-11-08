// A tab may resume an explicit refresh. Opening the site again always starts at
// the entry form; saved device credentials are used only after manual re-entry.
export const ACTIVE_STUDENT_SESSION_KEY = 'celadon-classroom-student-v1';
export const ACTIVE_STUDENT_KEY = ACTIVE_STUDENT_SESSION_KEY;
export const STUDENT_REJOIN_KEY = 'celadon-classroom-rejoin-v1';
export const LEGACY_STUDENT_KEY = 'celadon-classroom-student-v1';
const DEFAULT_JOIN_CODE = '탑텐반';

function browserStorage(name) {try {return globalThis[name] || null;} catch {return null;}}
function storage(options, name) {return Object.hasOwn(options, name) ? options[name] : browserStorage(name);}
function read(target, key) {try {return JSON.parse(target?.getItem(key) || 'null');} catch {return null;}}
function write(target, key, value) {
  try {if (!target) return false; target.setItem(key, JSON.stringify(value)); return true;} catch {return false;}
}
function remove(target, key) {try {target?.removeItem(key);} catch {}}
const normalized = value => typeof value === 'string' ? value.normalize('NFKC').trim() : '';

function sessionValue(value, fallbackJoinCode = '') {
  if (!value || typeof value !== 'object') return null;
  const code = normalized(value.code).toUpperCase(), number = Number(value.student?.number ?? value.participantId);
  if (!/^[A-Z2-9]{6}$/.test(code) || !Number.isInteger(number) || number < 1 || number > 99 ||
    String(value.participantId) !== String(number) || !/^[A-Za-z0-9_-]{30,100}$/.test(value.participantToken || '')) return null;
  const joinCode = normalized(value.joinCode || fallbackJoinCode);
  return {code, participantId: String(number), participantToken: value.participantToken,
    ...(joinCode ? {joinCode} : {}), student: {number, name: typeof value.student?.name === 'string' ? value.student.name : ''}};
}

function savedSessions(target) {
  const saved = read(target, STUDENT_REJOIN_KEY);
  return saved?.version === 1 && Array.isArray(saved.sessions) ? saved.sessions.map(value => sessionValue(value)).filter(Boolean) : [];
}
function saveCredential(target, value) {
  const sessions = savedSessions(target).filter(previous => previous.code !== value.code || previous.participantId !== value.participantId);
  sessions.push(value);
  return write(target, STUDENT_REJOIN_KEY, {version: 1, sessions});
}

export function migrateLegacyStudentSession(options = {}) {
  const local = storage(options, 'localStorage');
  const legacy = sessionValue(read(local, LEGACY_STUDENT_KEY), options.legacyJoinCode ?? DEFAULT_JOIN_CODE);
  // Do not discard the only re-entry credential if storage is temporarily full.
  if (legacy && saveCredential(local, legacy)) remove(local, LEGACY_STUDENT_KEY);
  else if (!legacy) remove(local, LEGACY_STUDENT_KEY);
  return legacy;
}

export function clearActiveStudentSession(options = {}) {remove(storage(options, 'sessionStorage'), ACTIVE_STUDENT_KEY);}

export function readActiveStudentSession(options = {}) {
  let navigationType = options.navigationType;
  if (navigationType === undefined) {
    try {navigationType = globalThis.performance?.getEntriesByType('navigation')?.[0]?.type;} catch {}
  }
  const session = sessionValue(read(storage(options, 'sessionStorage'), ACTIVE_STUDENT_KEY));
  // Chrome may restore or copy sessionStorage when reopening a window/tab. A
  // fresh navigation must still ask for the class code and number in that case.
  if (navigationType !== 'reload' || !session) {clearActiveStudentSession(options); return null;}
  return session;
}

export function loadStudentEntryState(options = {}) {
  migrateLegacyStudentSession(options);
  return readActiveStudentSession(options);
}

export function rememberStudentEntry(value, options = {}) {
  const session = sessionValue(value);
  if (!session) return false;
  const saved = saveCredential(storage(options, 'localStorage'), session);
  const active = write(storage(options, 'sessionStorage'), ACTIVE_STUDENT_KEY, session);
  return saved && active;
}

export function findStudentRejoin({code, number}, options = {}) {
  const wantedCode = normalized(code), wantedNumber = Number(number);
  if (!wantedCode || !Number.isInteger(wantedNumber) || wantedNumber < 1 || wantedNumber > 99) return null;
  const legacy = migrateLegacyStudentSession(options), records = savedSessions(storage(options, 'localStorage'));
  // A valid legacy value remains available even if migrating it hit quota limits.
  if (legacy && !records.some(value => value.code === legacy.code && value.participantId === legacy.participantId)) records.push(legacy);
  const candidates = records.filter(value => value.student.number === wantedNumber).reverse();
  return candidates.find(value => value.code === wantedCode.toUpperCase()) || candidates.find(value => value.joinCode === wantedCode) || null;
}
