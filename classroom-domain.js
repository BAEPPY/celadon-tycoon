import {createHash, createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {ORDERS, SHAPES, TECHNIQUES, evaluateWork} from './domain.js';
import {assessmentInput, normalizeAssessment, rubricAssessment} from './assessment-rules.js';
import {classroomPrefix, StoreConflict} from './classroom-store.js';
import {sanitizeWorkDesign} from './work-design.js';

export class ClassroomError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (status, code, message) => { throw new ClassroomError(status, code, message); };
const clean = (value, length = 300) => typeof value === 'string' ? value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, length) : '';
const hash = value => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const countries = ['yuan', 'goryeo', 'japan'];
const comparisonIds = ['1', '2', '3'];
const observationIds = ['1', '2', '3', '4', '5'];
const ROOM_ROOT = code => `${classroomPrefix()}/${code}/`;
const roomKey = code => `${ROOM_ROOT(code)}room.json`;
const studentKey = (code, id) => `${ROOM_ROOT(code)}participants/${id}.json`;
const artworkKey = (code, id, workId) => `${ROOM_ROOT(code)}artworks/${id}/${workId}.json`;
export const CLASSROOM_JOIN_CODE = '탑텐반';
const joinAliasKey = () => `${classroomPrefix()}/aliases/tapten.json`;
const ALIAS_IN_USE = '탑텐반 수업이 이미 열려 있어요. 이 수업을 만든 선생님의 브라우저에서 새 수업을 열어 주세요.';
const emptyAnswer = () => ({runId: '', clientRevision: 0, submitted: false, answers: {}});
const emptyBeautyAnswer = () => ({runId: '', clientRevision: 0, submitted: false, text: ''});
export const DEFAULT_CLASSROOM_SETTINGS = Object.freeze({durations: {1: 90, 2: 240, 3: 300}, beautyDuration: 90, submitButton: false, autoPause: true});

function validateCode(value) { const code = clean(value, 100).toUpperCase(); if (!/^[A-Z2-9]{6}$/.test(code)) fail(400, 'invalid-code', '탑텐반 또는 선생님이 알려 준 수업 코드를 확인해 주세요.'); return code; }
const publicJoinCode = value => typeof value === 'string' ? value.normalize('NFKC').trim() : '';
function validateJoinCode(value) { if (publicJoinCode(value) !== CLASSROOM_JOIN_CODE) fail(400, 'invalid-join-code', '수업 코드는 탑텐반으로 적어 주세요.'); return CLASSROOM_JOIN_CODE; }
function validateCreateToken(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value) || Buffer.from(value, 'base64url').toString('base64url') !== value) fail(400, 'invalid-create-token', '수업을 여는 정보를 다시 준비해 주세요.');
  return value;
}
function validateNumber(value) { const number = Number(value); if (!Number.isInteger(number) || number < 1 || number > 99) fail(400, 'invalid-number', '번호는 1부터 99 사이의 숫자로 적어 주세요.'); return String(number); }
function validateWorkId(value) { const id = clean(value, 101); if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) fail(400, 'invalid-work', '작품 정보를 다시 확인해 주세요.'); return id; }
function authorized(value, storedHash) {
  if (typeof value !== 'string' || value.length < 30 || value.length > 100 || typeof storedHash !== 'string') return false;
  const actual = Buffer.from(hash(value)), expected = Buffer.from(storedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
// Keep published QR links stable across teacher tabs and server instances. The
// room's teacher hash is private; observers cannot derive it from their token.
const observerDigest = (room, purpose) => createHmac('sha256', room.teacherHash).update(`${room.code}:${purpose}`).digest('base64url');
const observerLinkToken = room => observerDigest(room, 'observer-link-v1');
const observerWorkReference = (room, participantId, workId) => `obs_${observerDigest(room, `observer-work-v1:${participantId}:${workId}`)}`;
function observerWorkParticipant(room, reference, workId) {
  if (typeof reference !== 'string' || !/^obs_[A-Za-z0-9_-]{43}$/.test(reference)) fail(403, 'observer-artwork', '참관 화면에서 작품을 다시 열어 주세요.');
  const candidate = Buffer.from(reference); let found;
  // Only 99 class numbers are valid. Resolve without exposing a number in a
  // URL, storing a second lookup table, or stopping at the matching number.
  for (let number = 1; number <= 99; number++) if (timingSafeEqual(candidate, Buffer.from(observerWorkReference(room, String(number), workId)))) found = String(number);
  if (!found) fail(403, 'observer-artwork', '참관 화면에서 작품을 다시 열어 주세요.');
  return found;
}
function settingsFrom(raw = {}, previous = DEFAULT_CLASSROOM_SETTINGS) {
  const settings = {durations: {...previous.durations}, beautyDuration: previous.beautyDuration ?? DEFAULT_CLASSROOM_SETTINGS.beautyDuration, submitButton: previous.submitButton, autoPause: previous.autoPause};
  if (raw.durations && typeof raw.durations === 'object') for (const activity of [1, 2, 3]) {
    if (raw.durations[activity] === undefined) continue;
    const value = Number(raw.durations[activity]);
    if (!Number.isInteger(value) || value < 5 || value > 1800) fail(400, 'invalid-duration', '활동 시간은 5초부터 30분 사이로 정해 주세요.');
    settings.durations[activity] = value;
  }
  if (raw.beautyDuration !== undefined) {
    const value = Number(raw.beautyDuration);
    if (!Number.isInteger(value) || value < 5 || value > 1800) fail(400, 'invalid-duration', '활동 시간은 5초부터 30분 사이로 정해 주세요.');
    settings.beautyDuration = value;
  }
  for (const key of ['submitButton', 'autoPause']) if (typeof raw[key] === 'boolean') settings[key] = raw[key];
  return settings;
}
export function classroomState(room, now = Date.now()) {
  // endsAt is null for activity 3, which runs until the teacher ends it.
  const timedOut = room.status === 'active' && Number.isFinite(room.endsAt) && now >= room.endsAt && (room.activity === 3 || room.settings.autoPause);
  return {code: room.code, ...(room.joinCode === CLASSROOM_JOIN_CODE ? {joinCode: CLASSROOM_JOIN_CODE} : {}), activity: room.activity, activity1Stage: room.activity1Stage === 'beauty' ? 'beauty' : 'comparison', status: timedOut ? 'paused' : room.status,
    runId: room.runId, runs: {...room.runs}, startedAt: room.startedAt, endsAt: room.endsAt ?? null, pausedAt: room.pausedAt ?? null,
    serverNow: now, settings: {...structuredClone(room.settings), beautyDuration: room.settings.beautyDuration ?? DEFAULT_CLASSROOM_SETTINGS.beautyDuration}, revealed: {...room.revealed}, locked: room.locked === true, revision: room.revision};
}
// The game stops as soon as the activity closes, but a work finished just before may still be uploading its picture.
// Accept it for a short while after the close of that same run (the teacher's "활동 마치기", or a deadline left over
// from an older room), unless another activity has started or the class has ended.
export const WORK_UPLOAD_GRACE_MS = 20000;
export const WORK_RETENTION_MS = 24 * 60 * 60 * 1000;
const workExpiresAt = work => Math.min(work.submittedAt + WORK_RETENTION_MS, Number.isFinite(work.expiresAt) ? work.expiresAt : Infinity);
const expiredWork = (work, now) => !Number.isFinite(work.submittedAt) || now >= workExpiresAt(work);
// Optional original browser deadline is in the pathname so metadata-only cleanup also removes interrupted uploads.
function imageExpiresAt(entry) {
  const encoded = entry.key.match(/\/[a-f0-9]{32}-x([0-9a-z]{8,11})\.json$/)?.[1], deadline = encoded ? parseInt(encoded, 36) : Infinity;
  return Math.min(entry.uploadedAt + WORK_RETENTION_MS, Number.isSafeInteger(deadline) ? deadline : Infinity);
}
const visibleWorks = (student, now) => student.works.filter(work => !expiredWork(work, now));
const imageKey = (code, id, work) => artworkKey(code, id, work.imageId || work.id);
const retiredWorkIds = (student, runId) => runId && student.retiredWorks?.runId === runId && Array.isArray(student.retiredWorks.ids) ? student.retiredWorks.ids : [];
const workExpired = () => fail(410, 'work-expired', '완성작은 24시간이 지나 삭제되었어요. 새 작품을 만들어 주세요.');
function workRoom(room, runId, now) {
  const closedAt = room.status === 'paused' ? room.pausedAt : room.endsAt;
  if (room.activity === 3 && room.runId === runId && room.status !== 'ended' && Number.isFinite(closedAt) && now >= closedAt && now < closedAt + WORK_UPLOAD_GRACE_MS) return;
  activeRoom(room, 3, runId, now);
}
function activeRoom(room, activity, runId, now) {
  const state = classroomState(room, now);
  if (state.status !== 'active' || (Number.isFinite(room.endsAt) && now >= room.endsAt) || state.activity !== activity || state.runId !== runId) fail(409, 'activity-closed', '지금 활동이 마무리되었어요. 선생님을 봐 주세요.');
}
function publicStudent(student) { return {id: student.id, number: student.number, name: student.name, joinedAt: student.joinedAt}; }
function answersFor(student) { return structuredClone(student.answers); }
function normalizeAnswers(activity, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(400, 'invalid-answer', '답을 다시 확인해 주세요.');
  const answers = {};
  if (activity === 1) for (const id of comparisonIds) {
    if (raw[id] === undefined || raw[id] === '') continue;
    if (!countries.includes(raw[id])) fail(400, 'invalid-country', '원·고려·일본 가운데 골라 주세요.');
    answers[id] = raw[id];
  }
  else for (const id of observationIds) {
    if (raw[id] === undefined) continue;
    if (!raw[id] || typeof raw[id] !== 'object') fail(400, 'invalid-answer', '예상한 이름과 쓰임을 확인해 주세요.');
    answers[id] = {name: clean(raw[id].name, 80), use: clean(raw[id].use, 300)};
  }
  return answers;
}
function completeAnswers(activity, answers) {
  return activity === 1 ? comparisonIds.every(id => countries.includes(answers[id])) : observationIds.every(id => answers[id]?.name && answers[id]?.use);
}
function words(texts, limit = 80) {
  const counts = new Map();
  for (const value of texts) {
    const text = clean(value, limit).replace(/[.,!?。！？]+$/g, '').trim().toLocaleLowerCase('ko');
    if (text) counts.set(text, (counts.get(text) || 0) + 1);
  }
  return [...counts].map(([text, count]) => ({text, count})).sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, 'ko'));
}
function currentBeautyAnswer(student, room) { return student.beautyAnswer?.runId && student.beautyAnswer.runId === room.runs.beauty ? structuredClone(student.beautyAnswer) : emptyBeautyAnswer(); }
function activeBeautyRoom(room, runId, now) {
  activeRoom(room, 1, runId, now);
  if (room.activity1Stage !== 'beauty' || room.runs.beauty !== runId) fail(409, 'activity-closed', '지금은 아름다움을 적는 시간이 아니에요. 선생님을 봐 주세요.');
}
function activeAnswerRoom(room, activity, runId, now) {
  activeRoom(room, activity, runId, now);
  if (activity === 1 && room.activity1Stage === 'beauty') fail(409, 'activity-closed', '나라 비교가 마무리되었어요. 발견한 아름다움을 적어 주세요.');
}
function currentAnswer(student, room, activity) { const answer = student.answers[activity]; return answer?.runId === room.runs[activity] ? answer : emptyAnswer(); }
export function classroomSummary(room, students, now = Date.now()) {
  students = students.map(student => ({...student, works: visibleWorks(student, now)}));
  const total = students.length;
  const participants = students.map(student => ({...publicStudent(student),
    activity1Complete: completeAnswers(1, currentAnswer(student, room, 1).answers),
    activity2Complete: completeAnswers(2, currentAnswer(student, room, 2).answers),
    activity1Submitted: currentAnswer(student, room, 1).submitted,
    activity2Submitted: currentAnswer(student, room, 2).submitted,
    beautyComplete: Boolean(currentBeautyAnswer(student, room).text),
    beautySubmitted: currentBeautyAnswer(student, room).submitted,
    completedWorkCount: student.works.filter(work => work.runId === room.runs[3]).length, released: !student.tokenHash,
  })).sort((a, b) => a.number - b.number);
  const comparison = comparisonIds.map(id => {
    const answers = students.map(student => currentAnswer(student, room, 1).answers[id]).filter(value => countries.includes(value));
    return {id, respondents: answers.length, total, unanswered: total - answers.length,
      choices: countries.map(country => { const count = answers.filter(value => value === country).length; return {country, count, percent: answers.length ? Math.round(count / answers.length * 1000) / 10 : 0}; })};
  });
  const observations = observationIds.map(id => {
    const responses = students.map(student => currentAnswer(student, room, 2).answers[id]).filter(value => value?.name || value?.use)
      .map(value => ({name: value.name, use: value.use})).sort((a, b) => a.name.localeCompare(b.name, 'ko') || a.use.localeCompare(b.use, 'ko'));
    return {id, responses, nameWords: words(responses.map(value => value.name)), useWords: words(responses.map(value => value.use))};
  });
  const works = students.flatMap(student => student.works.filter(work => work.runId === room.runs[3]).map(work => ({...work, participantId: student.id, number: student.number, name: student.name})))
    .sort((a, b) => b.submittedAt - a.submittedAt);
  const beautyResponses = students.map(student => currentBeautyAnswer(student, room)).filter(answer => answer.text);
  const responses = beautyResponses.map(answer => answer.text).sort((a, b) => a.localeCompare(b, 'ko'));
  const beauty = {responses, words: words(responses, 300), respondents: responses.length, total, submitted: beautyResponses.filter(answer => answer.submitted).length};
  return {participants, comparison, observations, beauty, works};
}
function previewImage(raw) {
  if (typeof raw !== 'string') fail(400, 'missing-preview', '완성한 작품의 사진을 다시 준비해 주세요.');
  const match = raw.match(/^data:image\/(png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || match[2].length > 410000) fail(400, 'invalid-preview', '작품 사진은 300KB 이하의 PNG 또는 WebP로 보내 주세요.');
  const bytes = Buffer.from(match[2], 'base64');
  const valid = match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  if (!valid || bytes.length > 307200) fail(400, 'invalid-preview', '작품 사진을 다시 준비해 주세요.');
  return raw;
}
export function finishedWork(raw) {
  if (!raw || raw.step !== 4 || !ORDERS.some(order => order.id === raw.orderId) || !SHAPES.some(shape => shape.id === raw.shape) || !TECHNIQUES.some(technique => technique.id === raw.technique)) fail(400, 'unfinished-work', '완성한 작품만 선생님께 보낼 수 있어요.');
  const input = assessmentInput(raw);
  const work = {id: validateWorkId(raw.id), step: 4, orderId: raw.orderId, shape: raw.shape, modelId: input.modelId,
    technique: raw.technique, pattern: input.pattern, drawingLabel: input.drawingLabel, title: input.title,
    explanationUse: input.explanationUse, explanationBeauty: input.explanationBeauty,
    clay: {slip: raw.clay?.slip === 'dark' ? 'dark' : 'white'}, decorDone: raw.decorDone === true,
    firing: Array.isArray(raw.firing) ? raw.firing.slice(0, 4).map(value => clean(value, 20)) : [],
    placements: (Array.isArray(raw.placements) ? raw.placements : []).slice(0, 1200).filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y)).map(point => ({x: point.x, y: point.y, pattern: clean(point.pattern || raw.pattern, 30)})),
    strokes: (Array.isArray(raw.strokes) ? raw.strokes : []).slice(0, 600).map(stroke => ({points: Array.isArray(stroke?.points) ? stroke.points.slice(0, 2).map(() => [0, 0]) : []})),
  };
  if (!work.decorDone || raw.firing?.length !== 4 || work.firing.join(',') !== 'dry,biscuit,glaze,fire' || !work.explanationUse || !work.explanationBeauty) fail(400, 'unfinished-work', '제작과 작품 설명을 마친 뒤 보내 주세요.');
  work.assessment = normalizeAssessment(raw.assessment, work) || rubricAssessment(work);
  if (!work.assessment.accepted) fail(400, 'unfinished-work', '작품 설명을 마무리한 뒤 보내 주세요.');
  return {work, score: evaluateWork(work)};
}

function submittedDesign(raw, work) {
  if (raw === undefined || raw === null) return null;
  const design = sanitizeWorkDesign(raw);
  if (!design || design.shape !== work.shape || design.modelId !== (work.modelId || work.shape) || design.technique !== work.technique) {
    fail(400, 'invalid-design', '완성작의 모양 정보를 다시 확인해 주세요.');
  }
  return design;
}

const TEACHER_ROOM_GONE = '이미 삭제했거나 찾을 수 없는 수업이에요. 새 수업을 열어 주세요.';
export class ClassroomService {
  constructor(store, {now = () => Date.now(), makeToken = token, makeCode} = {}) {
    this.store = store; this.now = now; this.makeToken = makeToken;
    this.makeCode = makeCode || (() => [...randomBytes(6)].map(value => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[value % 32]).join(''));
  }
  async room(code, options, message = '수업 코드를 찾지 못했어요. 선생님께 확인해 주세요.') {
    const result = await this.store.read(roomKey(validateCode(code)), options);
    if (!result || result.data.deletedAt !== undefined) fail(404, 'room-not-found', message);
    // The pointer is authoritative: a teacher's old tab must not keep sharing an alias moved to a newer class.
    const alias = await this.store.read(joinAliasKey(), options), data = {...result.data};
    delete data.joinCode;
    if (alias?.data.code === data.code) data.joinCode = CLASSROOM_JOIN_CODE;
    return {...result, data};
  }
  async student(code, id, bearer, options) {
    const result = await this.store.read(studentKey(code, validateNumber(id)), options);
    if (!result || !authorized(bearer, result.data.tokenHash)) fail(403, 'student-auth', '입장 정보를 확인하지 못했어요. 같은 기기에서 다시 입장해 주세요.');
    const current = await this.expireStudentWorks(code, id, result);
    if (!current || !authorized(bearer, current.data.tokenHash)) fail(403, 'student-auth', '입장 정보를 확인하지 못했어요. 같은 기기에서 다시 입장해 주세요.');
    return current;
  }
  async expireStudentWorks(code, id, known) {
    let current = known || await this.store.read(studentKey(code, id));
    if (!current?.data.works.some(work => expiredWork(work, this.now()))) return current;
    // A cached poll may discover expiry, but conditional writes always use fresh durable state.
    for (let retry = 0; retry < 6; retry++) {
      current = await this.store.read(studentKey(code, id));
      if (!current) return null;
      const cutoff = this.now(), expired = current.data.works.filter(work => expiredWork(work, cutoff));
      if (!expired.length) return current;
      // Delete first: if storage fails, the references remain available for a retry.
      const keys = expired.map(work => imageKey(code, id, work));
      if (this.store.deleteMany) await this.store.deleteMany(keys); else for (const key of keys) await this.store.delete(key);
      const room = await this.store.read(roomKey(code)), runId = room?.data.runs?.[3];
      const ids = [...new Set([...retiredWorkIds(current.data, runId), ...expired.filter(work => work.runId === runId).map(work => hash(work.id))])];
      const data = {...current.data, works: current.data.works.filter(work => !expiredWork(work, cutoff))};
      // At most ten receipts for the current run. No title, explanation, score, or image survives.
      if (runId && ids.length) data.retiredWorks = {runId, ids: ids.slice(-10)};
      else delete data.retiredWorks;
      try { const result = await this.store.update(studentKey(code, id), data, current.etag); return {data, etag: result.etag}; }
      catch (error) { if (!(error instanceof StoreConflict)) throw error; }
    }
    fail(409, 'try-again', '오래된 작품을 정리하는 중이에요. 잠시 뒤 다시 시도해 주세요.');
  }
  async cleanupExpiredWorks() {
    let rooms = 0, orphanImages = 0;
    const prefix = `${classroomPrefix()}/`;
    for await (const entries of this.store.cleanupPages()) {
      for (const entry of entries) {
        if (!entry.key.startsWith(prefix)) continue;
        const relative = entry.key.slice(prefix.length);
        if (/^[A-Z2-9]{6}\/room\.json$/.test(relative)) {
          const code = relative.slice(0, 6);
          const keys = await this.store.list(`${ROOM_ROOT(code)}participants/`);
          for (const key of keys) {
            const id = key.slice(`${ROOM_ROOT(code)}participants/`.length).match(/^([1-9][0-9]?)\.json$/)?.[1];
            if (id) await this.expireStudentWorks(code, id);
          }
          rooms++;
        } else if (/^[A-Z2-9]{6}\/artworks\/[1-9][0-9]?\/[a-zA-Z0-9_-]+\.json$/.test(relative)
          && Number.isFinite(entry.uploadedAt) && this.now() >= imageExpiresAt(entry)) {
          // Includes old interrupted uploads that never acquired a participant reference.
          try { await this.store.delete(entry.key, entry.etag); orphanImages++; }
          catch (error) { if (!(error instanceof StoreConflict)) throw error; }
        }
      }
    }
    return {cleaned: true, rooms, images: orphanImages};
  }
  teacher(room, bearer) { if (!authorized(bearer, room.teacherHash)) fail(403, 'teacher-auth', '이 수업을 만든 선생님 화면에서 열어 주세요.'); }
  async writeJoinAlias(code, previous) {
    const data = {code, updatedAt: this.now()};
    if (previous) await this.store.update(joinAliasKey(), data, previous.etag);
    else await this.store.create(joinAliasKey(), data);
  }
  async releaseJoinAlias(code) {
    for (let retry = 0; retry < 6; retry++) {
      const current = await this.store.read(joinAliasKey());
      if (current?.data.code !== code) return;
      // A conditional tombstone prevents an old delete from erasing a newly assigned class.
      try { await this.store.update(joinAliasKey(), {code: null, updatedAt: this.now()}, current.etag); return; }
      catch (error) { if (!(error instanceof StoreConflict)) throw error; }
    }
    fail(409, 'try-again', '수업 연결을 정리하는 중이에요. 다시 눌러 주세요.');
  }
  async claimJoinCode(code, bearer) {
    const {data: room} = await this.room(code, undefined, TEACHER_ROOM_GONE); this.teacher(room, bearer);
    const current = await this.store.read(joinAliasKey());
    if (current?.data.code && current.data.code !== code) fail(409, 'join-code-in-use', ALIAS_IN_USE);
    if (current?.data.code !== code) {
      try { await this.writeJoinAlias(code, current); }
      catch (error) { if (error instanceof StoreConflict) fail(409, 'join-code-in-use', ALIAS_IN_USE); throw error; }
    }
    try { return {state: classroomState((await this.room(code)).data, this.now())}; }
    catch (error) { if (error.code === 'room-not-found') await this.releaseJoinAlias(code); throw error; }
  }
  async recoverCreatedAlias(createToken, alias) {
    if (!createToken || !alias?.data.code) return null;
    let room;
    try { room = (await this.room(alias.data.code)).data; }
    catch (error) { if (error.code === 'room-not-found') return null; throw error; }
    if (room.joinCode !== CLASSROOM_JOIN_CODE || !authorized(createToken, room.teacherHash)) return null;
    return {code: room.code, teacherToken: createToken, state: classroomState(room, this.now())};
  }
  async create(raw = {}, bearer) {
    const joinCode = raw.joinCode === undefined ? null : validateJoinCode(raw.joinCode);
    // The browser persists this random capability before sending, so a lost response cannot strand the fixed alias.
    const createToken = joinCode && raw.createToken !== undefined ? validateCreateToken(raw.createToken) : null;
    let alias;
    if (joinCode) {
      alias = await this.store.read(joinAliasKey());
      const recovered = await this.recoverCreatedAlias(createToken, alias);
      if (recovered) return recovered;
      const previousCode = raw.previousCode === undefined ? null : validateCode(raw.previousCode);
      if (alias?.data.code && alias.data.code !== previousCode) fail(409, 'join-code-in-use', ALIAS_IN_USE);
      if (previousCode) this.teacher((await this.room(previousCode, undefined, TEACHER_ROOM_GONE)).data, bearer);
    }
    const teacherToken = createToken || this.makeToken(), now = this.now();
    for (let tries = 0; tries < 8; tries++) {
      const code = this.makeCode(), room = {code, teacherHash: hash(teacherToken), createdAt: now, activity: 0, activity1Stage: 'comparison', status: 'waiting',
        runId: '', runs: {}, startedAt: null, endsAt: null, settings: settingsFrom(raw.settings), revealed: {}, revision: 1};
      try { await this.store.create(roomKey(code), room); }
      catch (error) { if (error instanceof StoreConflict) continue; throw error; }
      if (joinCode) {
        try { await this.writeJoinAlias(code, alias); }
        catch (error) {
          // A provider response can fail after the pointer has committed. Verify ownership before returning the room.
          let current, recovered;
          try { current = await this.store.read(joinAliasKey()); recovered = await this.recoverCreatedAlias(teacherToken, current); }
          catch { throw error; }
          if (error instanceof StoreConflict && current?.data.code !== code) await this.store.delete(roomKey(code));
          if (recovered) return recovered;
          if (error instanceof StoreConflict) fail(409, 'join-code-in-use', ALIAS_IN_USE);
          // An uncertain write may still complete; do not delete its possible target. Retrying can recover via createToken.
          throw error;
        }
      }
      return {code, teacherToken, state: classroomState({...room, ...(joinCode ? {joinCode} : {})}, now)};
    }
    fail(503, 'create-retry', '수업 코드를 준비하지 못했어요. 다시 눌러 주세요.');
  }
  async join(raw) {
    let code;
    if (publicJoinCode(raw.code) === CLASSROOM_JOIN_CODE) {
      const alias = await this.store.read(joinAliasKey());
      if (!alias?.data.code) fail(404, 'room-not-found', '아직 탑텐반 수업이 열리지 않았어요. 선생님이 수업을 열면 다시 입장해 주세요.');
      code = validateCode(alias.data.code);
    } else code = validateCode(raw.code);
    const {data: room} = await this.room(code), id = validateNumber(raw.number), name = clean(raw.name, 30);
    if (room.status === 'ended') fail(409, 'room-ended', '이 수업은 모두 마무리되었어요.');
    if (!name || name.length > 20) fail(400, 'invalid-name', '이름을 20자 이내로 적어 주세요.');
    const existing = await this.store.read(studentKey(code, id));
    if (existing && !existing.data.tokenHash) return this.rejoinReleased(code, id, name, existing, room);
    if (existing) {
      if (!authorized(raw.participantToken, existing.data.tokenHash)) fail(409, 'number-in-use', '이미 입장한 번호예요. 처음 입장한 기기에서 이어서 참여하거나 선생님께 알려 주세요.');
      return {code, participantId: id, participantToken: raw.participantToken, state: classroomState(room, this.now()), student: publicStudent(existing.data), answers: answersFor(existing.data), beautyAnswer: currentBeautyAnswer(existing.data, room)};
    }
    if (room.locked) fail(403, 'room-locked', '지금은 새로 입장할 수 없어요. 선생님께 알려 주세요.');
    const participantToken = this.makeToken(), student = {id, number: Number(id), name, tokenHash: hash(participantToken), joinedAt: this.now(), answers: {1: emptyAnswer(), 2: emptyAnswer()}, beautyAnswer: emptyBeautyAnswer(), works: []};
    try { await this.store.create(studentKey(code, id), student); }
    catch (error) { if (error instanceof StoreConflict) fail(409, 'number-in-use', '이미 입장한 번호예요. 번호를 확인해 주세요.'); throw error; }
    // A teacher may delete/end the class while a new participant file is being created.
    // Do not leave an unreachable named record after that deletion has finished.
    let latestRoom;
    try {
      latestRoom = (await this.room(code)).data;
      if (latestRoom.status === 'ended') fail(409, 'room-ended', '이 수업은 모두 마무리되었어요.');
    } catch (error) { await this.store.delete(studentKey(code, id)); throw error; }
    return {code, participantId: id, participantToken, state: classroomState(latestRoom, this.now()), student: publicStudent(student), answers: answersFor(student), beautyAnswer: currentBeautyAnswer(student, room)};
  }
  // A number the teacher released (e.g. the student's browser data was cleared) can be taken again on any device;
  // the student keeps the answers and works saved under that number.
  async rejoinReleased(code, id, name, existing, room) {
    const participantToken = this.makeToken(), {releasedAt, ...kept} = existing.data, student = {...kept, name, tokenHash: hash(participantToken)};
    try { await this.store.update(studentKey(code, id), student, existing.etag); }
    catch (error) { if (error instanceof StoreConflict) fail(409, 'number-in-use', '이미 입장한 번호예요. 번호를 확인해 주세요.'); throw error; }
    return {code, participantId: id, participantToken, state: classroomState(room, this.now()), student: publicStudent(student), answers: answersFor(student), beautyAnswer: currentBeautyAnswer(student, room)};
  }
  async manageStudent(code, raw, bearer) {
    const {data: room} = await this.room(code, undefined, TEACHER_ROOM_GONE); this.teacher(room, bearer);
    const id = validateNumber(raw.participantId), key = studentKey(code, id);
    if (raw.command === 'remove-student') {
      const artworks = (await this.store.list(`${ROOM_ROOT(code)}artworks/`)).filter(item => item.startsWith(`${ROOM_ROOT(code)}artworks/${id}/`)), keys = [...artworks, key];
      if (this.store.deleteMany) await this.store.deleteMany(keys); else for (const item of keys) await this.store.delete(item);
      return {removed: true};
    }
    for (let retry = 0; retry < 6; retry++) {
      const current = await this.store.read(key);
      if (!current) fail(404, 'student-not-found', '이미 내보낸 학생이에요.');
      if (!current.data.tokenHash) return {released: true};
      try { await this.store.update(key, {...current.data, tokenHash: null, releasedAt: this.now()}, current.etag); return {released: true}; }
      catch (error) { if (!(error instanceof StoreConflict)) throw error; }
    }
    fail(409, 'try-again', '다른 화면에서 학생 정보가 바뀌었어요. 다시 눌러 주세요.');
  }
  async students(code) {
    const keys = await this.store.list(`${ROOM_ROOT(code)}participants/`);
    return (await Promise.all(keys.map(async key => {
      const result = await this.store.read(key, {maxAge: 5000});
      return result && this.expireStudentWorks(code, result.data.id, result);
    }))).filter(Boolean).map(result => result.data);
  }
  async revealedAnswers(room) {
    const reveal = {};
    if (room.revealed[1] || room.revealed[2]) {
      const answers = await import('./lesson-answer-key.js');
      if (room.revealed[1]) reveal.comparison = answers.COMPARISON_ANSWERS;
      if (room.revealed[2]) reveal.observations = answers.OBSERVATION_ANSWERS;
    }
    return reveal;
  }
  // Read-only view for visitors at an open class: results and works without student names or numbers.
  async observe(raw, bearer) {
    const code = validateCode(raw.code), {data: room} = await this.room(code, {maxAge: 500}, '참관할 수업을 찾지 못했어요. 선생님께 확인해 주세요.');
    if (!authorized(bearer, room.observerHash)) fail(403, 'observer-auth', '참관 주소가 바뀌었어요. 선생님께 새 참관 주소를 받아 주세요.');
    const [students, reveal] = await Promise.all([this.students(code), this.revealedAnswers(room)]);
    const summary = classroomSummary(room, students, this.now());
    return {state: classroomState(room, this.now()), comparison: summary.comparison, observations: summary.observations, beauty: summary.beauty,
      participantCount: summary.participants.length,
      completionCounts: {1: summary.participants.filter(student => student.activity1Complete).length, 2: summary.participants.filter(student => student.activity2Complete).length},
      works: summary.works.map(({name, number, participantId, ...work}) => ({...work, participantId: observerWorkReference(room, participantId, work.id)})), reveal};
  }
  async state(raw, bearer) {
    // Only polling may reuse short-lived reads. Every mutation re-reads durable state.
    const code = validateCode(raw.code), {data: room} = await this.room(code, {maxAge: 500}), {data: student} = await this.student(code, raw.participantId, bearer, {maxAge: 5000});
    return {state: classroomState(room, this.now()), student: publicStudent(student), answers: answersFor(student), beautyAnswer: currentBeautyAnswer(student, room), completedWorks: visibleWorks(student, this.now()).filter(work => work.runId === room.runs[3])};
  }
  async overview(raw, bearer) {
    const code = validateCode(raw.code), {data: room} = await this.room(code, {maxAge: 500}, TEACHER_ROOM_GONE); this.teacher(room, bearer);
    const [students, reveal] = await Promise.all([this.students(code), this.revealedAnswers(room)]);
    return {state: classroomState(room, this.now()), ...classroomSummary(room, students, this.now()), reveal};
  }
  async control(raw, bearer) {
    const code = validateCode(raw.code);
    if (raw.command === 'delete') return this.removeRoom(code, bearer);
    if (raw.command === 'claim-join-code') return this.claimJoinCode(code, bearer);
    if (raw.command === 'release-student' || raw.command === 'remove-student') return this.manageStudent(code, raw, bearer);
    let observerToken;
    for (let retry = 0; retry < 6; retry++) {
      const current = await this.room(code, undefined, TEACHER_ROOM_GONE), room = structuredClone(current.data); this.teacher(room, bearer);
      const state = classroomState(room, this.now());
      if (raw.command === 'start') {
        const activity = Number(raw.activity);
        if (![1, 2, 3].includes(activity)) fail(400, 'invalid-activity', '활동을 골라 주세요.');
        if (state.status === 'active') fail(409, 'already-active', '진행 중인 활동을 먼저 마무리해 주세요.');
        if (room.status === 'ended') fail(409, 'room-ended', '새 수업을 만들어 주세요.');
        if (activity === 1) { room.activity1Stage = 'comparison'; delete room.runs.beauty; }
        room.activity = activity; room.status = 'active'; room.runId = this.makeToken(); room.runs[activity] = room.runId;
        room.startedAt = this.now(); room.endsAt = activity === 3 ? null : room.startedAt + room.settings.durations[activity] * 1000; room.pausedAt = null; room.revealed[activity] = false;
      } else if (raw.command === 'start-beauty') {
        if (state.status === 'active') fail(409, 'already-active', '진행 중인 활동을 먼저 마무리해 주세요.');
        if (room.status === 'ended') fail(409, 'room-ended', '새 수업을 만들어 주세요.');
        if (!room.runs[1]) fail(409, 'beauty-after-comparison', '세 나라 청자를 먼저 비교한 뒤 시작해 주세요.');
        room.activity = 1; room.activity1Stage = 'beauty'; room.status = 'active'; room.runId = this.makeToken(); room.runs.beauty = room.runId;
        room.startedAt = this.now(); room.endsAt = room.startedAt + (room.settings.beautyDuration ?? DEFAULT_CLASSROOM_SETTINGS.beautyDuration) * 1000; room.pausedAt = null;
      } else if (raw.command === 'pause') { if (room.status === 'active') room.pausedAt = this.now(); room.status = 'paused'; }
      else if (raw.command === 'end') room.status = 'ended';
      else if (raw.command === 'settings') {
        if (state.status === 'active') fail(409, 'already-active', '진행 중인 활동을 마친 뒤 설정해 주세요.');
        room.settings = settingsFrom(raw.settings, room.settings);
      } else if (raw.command === 'reveal') {
        const activity = Number(raw.activity || room.activity);
        // Only after this activity has actually run; revealing before the start would spoil the answers on the projected teacher screen.
        if (![1, 2].includes(activity) || !room.runs?.[activity] || state.status === 'active') fail(409, 'reveal-after-activity', '활동을 마무리한 뒤 정답을 공개해 주세요.');
        room.revealed[activity] = true;
      } else if (raw.command === 'lock-room') room.locked = raw.locked === true;
      else if (raw.command === 'observer-link') {
        observerToken = observerLinkToken(room);
        if (authorized(observerToken, room.observerHash)) return {state: classroomState(room, this.now()), observerToken};
        // Older random links migrate once when the teacher requests a new QR.
        room.observerHash = hash(observerToken);
      } else fail(400, 'invalid-control', '진행 버튼을 다시 확인해 주세요.');
      room.revision++;
      try { await this.store.update(roomKey(code), room, current.etag); return {state: classroomState(room, this.now()), ...(observerToken ? {observerToken} : {})}; }
      catch (error) { if (!(error instanceof StoreConflict)) throw error; }
    }
    fail(409, 'try-again', '다른 화면에서 수업이 바뀌었어요. 다시 눌러 주세요.');
  }
  async answer(raw, bearer) {
    const code = validateCode(raw.code), id = validateNumber(raw.participantId), activity = Number(raw.activity);
    if (![1, 2].includes(activity)) fail(400, 'invalid-activity', '활동을 다시 확인해 주세요.');
    const revision = Number(raw.clientRevision);
    if (!Number.isSafeInteger(revision) || revision < 1) fail(400, 'invalid-revision', '답을 다시 저장해 주세요.');
    const answers = normalizeAnswers(activity, raw.answers);
    for (let retry = 0; retry < 6; retry++) {
      const {data: room} = await this.room(code); activeAnswerRoom(room, activity, raw.runId, this.now());
      const current = await this.student(code, id, bearer), student = structuredClone(current.data), before = currentAnswer(student, room, activity);
      if (revision <= before.clientRevision) return {state: classroomState(room, this.now()), answers: answersFor(student), ignored: true};
      // Both written activities finish with the student's done button, including legacy rooms.
      if (before.submitted) fail(409, 'answer-submitted', '이미 제출한 답이에요. 다음 활동을 기다려 주세요.');
      if (raw.final && !completeAnswers(activity, answers)) fail(400, 'incomplete-answer', '모든 작품에 답을 적은 뒤 제출해 주세요.');
      student.answers[activity] = {runId: room.runId, clientRevision: revision, submitted: Boolean(raw.final), answers, updatedAt: this.now()};
      // Recheck the teacher's phase just before writing; late requests do not open a closed activity.
      const {data: latestRoom} = await this.room(code); activeAnswerRoom(latestRoom, activity, raw.runId, this.now());
      try { await this.store.update(studentKey(code, id), student, current.etag); return {state: classroomState(latestRoom, this.now()), answers: answersFor(student), beautyAnswer: currentBeautyAnswer(student, room)}; }
      catch (error) { if (!(error instanceof StoreConflict)) throw error; }
    }
    fail(409, 'save-retry', '답을 저장하는 중이에요. 잠시 뒤 다시 저장해 주세요.');
  }
  async beautyAnswer(raw, bearer) {
    const code = validateCode(raw.code), id = validateNumber(raw.participantId), revision = Number(raw.clientRevision);
    if (!Number.isSafeInteger(revision) || revision < 1) fail(400, 'invalid-revision', '답을 다시 저장해 주세요.');
    if (typeof raw.text !== 'string') fail(400, 'invalid-answer', '찾은 아름다움을 글로 적어 주세요.');
    const text = clean(raw.text, 300);
    if (raw.final && !text) fail(400, 'incomplete-answer', '발견한 아름다움을 적은 뒤 다했어요를 눌러 주세요.');
    for (let retry = 0; retry < 6; retry++) {
      const {data: room} = await this.room(code); activeBeautyRoom(room, raw.runId, this.now());
      const current = await this.student(code, id, bearer), student = structuredClone(current.data), before = currentBeautyAnswer(student, room);
      if (revision <= before.clientRevision) return {state: classroomState(room, this.now()), beautyAnswer: before, ignored: true};
      if (before.submitted) fail(409, 'answer-submitted', '이미 제출한 답이에요. 다음 활동을 기다려 주세요.');
      student.beautyAnswer = {runId: room.runId, clientRevision: revision, submitted: Boolean(raw.final), text, updatedAt: this.now()};
      const {data: latestRoom} = await this.room(code); activeBeautyRoom(latestRoom, raw.runId, this.now());
      try { await this.store.update(studentKey(code, id), student, current.etag); return {state: classroomState(latestRoom, this.now()), beautyAnswer: currentBeautyAnswer(student, latestRoom)}; }
      catch (error) { if (!(error instanceof StoreConflict)) throw error; }
    }
    fail(409, 'save-retry', '답을 저장하는 중이에요. 잠시 뒤 다시 저장해 주세요.');
  }
  async submitWork(raw, bearer) {
    const code = validateCode(raw.code), id = validateNumber(raw.participantId), {data: room} = await this.room(code);
    workRoom(room, raw.runId, this.now()); const {data: initialStudent} = await this.student(code, id, bearer);
    if (raw.expiresAt !== undefined && (!Number.isSafeInteger(raw.expiresAt) || raw.expiresAt <= 0)) fail(400, 'invalid-expiration', '게임 저장 기한을 다시 확인해 주세요.');
    if (raw.expiresAt !== undefined && this.now() >= raw.expiresAt) workExpired();
    const {work, score} = finishedWork(raw.work), preview = previewImage(raw.preview || raw.work.preview), design = submittedDesign(raw.work.design, work);
    if (retiredWorkIds(initialStudent, room.runId).includes(hash(work.id))) workExpired();
    const existingWork = initialStudent.works.find(item => item.id === work.id && item.runId === room.runId);
    if (existingWork) {
      if (expiredWork(existingWork, this.now())) { await this.expireStudentWorks(code, id); workExpired(); }
      const result = await this.backfillWorkDesign(code, id, bearer, room.runId, work, score, design, existingWork);
      return {state: classroomState(room, this.now()), work: result, duplicate: true};
    }
    if (initialStudent.works.filter(item => item.runId === room.runId).length + retiredWorkIds(initialStudent, room.runId).length >= 10) fail(409, 'work-limit', '이번 활동에는 작품을 10점까지 보낼 수 있어요.');
    // A new run can reuse a client ID without an older cleanup touching the new image.
    const imageId = hash(`${room.runId}\0${initialStudent.tokenHash}\0${work.id}`).slice(0, 32) + (raw.expiresAt === undefined ? '' : `-x${raw.expiresAt.toString(36)}`), key = artworkKey(code, id, imageId);
    const summary = {id: work.id, imageId, runId: room.runId, title: work.title, shape: work.shape, score: score.total,
      objectiveScore: score.objective, explanationScore: score.explanation, explanationUse: work.explanationUse, explanationBeauty: work.explanationBeauty, submittedAt: this.now()};
    summary.expiresAt = Math.min(summary.submittedAt + WORK_RETENTION_MS, raw.expiresAt ?? Infinity);
    const priorArt = await this.store.read(key);
    if (!priorArt) { try { await this.store.create(key, {preview, ...(design ? {design} : {}), submittedAt: summary.submittedAt, expiresAt: summary.expiresAt}); } catch (error) { if (!(error instanceof StoreConflict)) throw error; } }
    const savedArt = priorArt || await this.store.read(key);
    if (Number.isFinite(savedArt?.data.submittedAt)) summary.submittedAt = savedArt.data.submittedAt;
    summary.expiresAt = Math.min(summary.expiresAt, summary.submittedAt + WORK_RETENTION_MS, Number.isFinite(savedArt?.data.expiresAt) ? savedArt.data.expiresAt : Infinity);
    if (sanitizeWorkDesign(savedArt?.data.design)) summary.designVersion = 1;
    // In particular, clean an image created after the delete-room sweep.
    try { await this.room(code); }
    catch (error) { if (error.code === 'room-not-found') await this.store.delete(key); throw error; }
    for (let retry = 0; retry < 6; retry++) {
      const current = await this.student(code, id, bearer), student = structuredClone(current.data);
      if (retiredWorkIds(student, room.runId).includes(hash(work.id)) || expiredWork(summary, this.now())) {
        await this.store.delete(key); await this.expireStudentWorks(code, id); workExpired();
      }
      const duplicate = student.works.find(item => item.id === work.id && item.runId === room.runId);
      if (duplicate) {
        const result = await this.backfillWorkDesign(code, id, bearer, room.runId, work, score, design, duplicate);
        return {state: classroomState(room, this.now()), work: result, duplicate: true};
      }
      if (student.works.filter(item => item.runId === room.runId).length + retiredWorkIds(student, room.runId).length >= 10) fail(409, 'work-limit', '이번 활동에는 작품을 10점까지 보낼 수 있어요.');
      const {data: latestRoom} = await this.room(code); workRoom(latestRoom, raw.runId, this.now());
      student.works.push(summary);
      try {
        await this.store.update(studentKey(code, id), student, current.etag);
        if (expiredWork(summary, this.now())) { await this.expireStudentWorks(code, id); workExpired(); }
        const result = await this.backfillWorkDesign(code, id, bearer, room.runId, work, score, design, summary);
        return {state: classroomState(latestRoom, this.now()), work: result};
      }
      catch (error) { if (!(error instanceof StoreConflict)) throw error; }
    }
    fail(409, 'save-retry', '작품을 저장하는 중이에요. 잠시 뒤 다시 보내 주세요.');
  }
  async backfillWorkDesign(code, id, bearer, runId, submitted, score, design, known) {
    if (!design || known.designVersion === 1) return known;
    for (let retry = 0; retry < 6; retry++) {
      const {data: room} = await this.room(code); workRoom(room, runId, this.now());
      const current = await this.student(code, id, bearer), student = structuredClone(current.data);
      const work = student.works.find(item => item.id === submitted.id && item.runId === runId);
      if (!work || expiredWork(work, this.now())) { await this.expireStudentWorks(code, id); workExpired(); }
      if (work.designVersion === 1) return work;
      // Only supplement an original resend. Scores, explanations and the preview remain immutable.
      if (['title', 'shape', 'explanationUse', 'explanationBeauty'].some(key => work[key] !== submitted[key])
        || work.score !== score.total || work.objectiveScore !== score.objective || work.explanationScore !== score.explanation) return work;
      const key = imageKey(code, id, work), artifact = await this.store.read(key);
      if (!artifact) return work; // Never recreate an image removed by expiry or teacher deletion.
      if (!sanitizeWorkDesign(artifact.data.design)) {
        try {
          await this.store.update(key, {...artifact.data, design, submittedAt: work.submittedAt, expiresAt: workExpiresAt(work)}, artifact.etag);
        } catch (error) { if (error instanceof StoreConflict) continue; throw error; }
      }
      if (expiredWork(work, this.now())) { await this.expireStudentWorks(code, id); workExpired(); }
      const updated = {...work, designVersion: 1};
      student.works = student.works.map(item => item === work ? updated : item);
      try {
        await this.store.update(studentKey(code, id), student, current.etag);
        if (expiredWork(work, this.now())) { await this.expireStudentWorks(code, id); workExpired(); }
        return updated;
      } catch (error) { if (!(error instanceof StoreConflict)) throw error; }
    }
    fail(409, 'save-retry', '작품의 모양을 저장하는 중이에요. 잠시 뒤 다시 보내 주세요.');
  }
  async artwork(raw, bearer) {
    const code = validateCode(raw.code), workId = validateWorkId(raw.workId), {data: room} = await this.room(code);
    const teacher = authorized(bearer, room.teacherHash), observer = !teacher && authorized(bearer, room.observerHash);
    const id = observer ? observerWorkParticipant(room, raw.participantId, workId) : validateNumber(raw.participantId);
    if (!teacher && !observer) await this.student(code, id, bearer);
    const student = await this.expireStudentWorks(code, id);
    const work = student && visibleWorks(student.data, this.now()).filter(work => work.id === workId).sort((a, b) => b.submittedAt - a.submittedAt)[0];
    if (!work) fail(404, 'work-not-found', '완성작을 찾지 못했어요.');
    const result = await this.store.read(imageKey(code, id, work));
    if (expiredWork(work, this.now())) { await this.expireStudentWorks(code, id); fail(404, 'work-not-found', '완성작을 찾지 못했어요.'); }
    if (!result) fail(404, 'work-not-found', '작품 사진을 찾지 못했어요.');
    return {preview: result.data.preview, design: sanitizeWorkDesign(result.data.design)};
  }
  async removeRoom(code, bearer) {
    // Marking the room deleted first stops new joins and answers. The teacher hash stays until the sweep has
    // finished, so a deletion interrupted by a timeout or network error can be run again by the same teacher.
    const current = await this.store.read(roomKey(code));
    if (!current || !current.data.teacherHash) fail(404, 'room-not-found', TEACHER_ROOM_GONE);
    this.teacher(current.data, bearer);
    if (current.data.deletedAt === undefined) {
      await this.store.update(roomKey(code), {...current.data, deletedAt: this.now(), status: 'ended'}, current.etag);
    }
    await this.releaseJoinAlias(code);
    const keys = (await this.store.list(ROOM_ROOT(code))).filter(key => key !== roomKey(code));
    if (this.store.deleteMany) await this.store.deleteMany(keys);
    else for (const key of keys) await this.store.delete(key);
    // Keep only a tombstone so a stale client cannot recreate data under a recycled code.
    const tombstone = await this.store.read(roomKey(code));
    if (tombstone) await this.store.update(roomKey(code), {code, deletedAt: this.now()}, tombstone.etag);
    return {deleted: true};
  }
}
