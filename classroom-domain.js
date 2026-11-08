import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import {ORDERS, SHAPES, TECHNIQUES, evaluateWork} from './domain.js';
import {assessmentInput, normalizeAssessment, rubricAssessment} from './assessment-rules.js';
import {classroomPrefix, StoreConflict} from './classroom-store.js';

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
const emptyAnswer = () => ({runId: '', clientRevision: 0, submitted: false, answers: {}});
export const DEFAULT_CLASSROOM_SETTINGS = Object.freeze({durations: {1: 90, 2: 240, 3: 300}, submitButton: false, autoPause: true});

function validateCode(value) { const code = clean(value, 100).toUpperCase(); if (!/^[A-Z2-9]{6}$/.test(code)) fail(400, 'invalid-code', '수업 코드 여섯 글자를 확인해 주세요.'); return code; }
function validateNumber(value) { const number = Number(value); if (!Number.isInteger(number) || number < 1 || number > 99) fail(400, 'invalid-number', '번호는 1부터 99 사이의 숫자로 적어 주세요.'); return String(number); }
function validateWorkId(value) { const id = clean(value, 101); if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) fail(400, 'invalid-work', '작품 정보를 다시 확인해 주세요.'); return id; }
function authorized(value, storedHash) {
  if (typeof value !== 'string' || value.length < 30 || value.length > 100 || typeof storedHash !== 'string') return false;
  const actual = Buffer.from(hash(value)), expected = Buffer.from(storedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function settingsFrom(raw = {}, previous = DEFAULT_CLASSROOM_SETTINGS) {
  const settings = {durations: {...previous.durations}, submitButton: previous.submitButton, autoPause: previous.autoPause};
  if (raw.durations && typeof raw.durations === 'object') for (const activity of [1, 2, 3]) {
    if (raw.durations[activity] === undefined) continue;
    const value = Number(raw.durations[activity]);
    if (!Number.isInteger(value) || value < 5 || value > 1800) fail(400, 'invalid-duration', '활동 시간은 5초부터 30분 사이로 정해 주세요.');
    settings.durations[activity] = value;
  }
  for (const key of ['submitButton', 'autoPause']) if (typeof raw[key] === 'boolean') settings[key] = raw[key];
  return settings;
}
export function classroomState(room, now = Date.now()) {
  const timedOut = room.status === 'active' && now >= room.endsAt && (room.activity === 3 || room.settings.autoPause);
  return {code: room.code, activity: room.activity, status: timedOut ? 'paused' : room.status,
    runId: room.runId, runs: {...room.runs}, startedAt: room.startedAt, endsAt: room.endsAt,
    serverNow: now, settings: structuredClone(room.settings), revealed: {...room.revealed}, revision: room.revision};
}
// The game stops at the deadline, but a work finished in the last seconds may still be uploading its picture.
// Accept it for a short while after the scheduled end of that same run, unless the teacher stopped the activity or started another one.
export const WORK_UPLOAD_GRACE_MS = 20000;
function workRoom(room, runId, now) {
  if (room.status === 'active' && room.activity === 3 && room.runId === runId && now >= room.endsAt && now < room.endsAt + WORK_UPLOAD_GRACE_MS) return;
  activeRoom(room, 3, runId, now);
}
function activeRoom(room, activity, runId, now) {
  const state = classroomState(room, now);
  if (state.status !== 'active' || now >= room.endsAt || state.activity !== activity || state.runId !== runId) fail(409, 'activity-closed', '지금 활동이 마무리되었어요. 선생님을 봐 주세요.');
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
function words(texts) {
  const counts = new Map();
  for (const value of texts) {
    const text = clean(value, 80).replace(/[.,!?。！？]+$/g, '').trim().toLocaleLowerCase('ko');
    if (text) counts.set(text, (counts.get(text) || 0) + 1);
  }
  return [...counts].map(([text, count]) => ({text, count})).sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, 'ko'));
}
function currentAnswer(student, room, activity) { const answer = student.answers[activity]; return answer?.runId === room.runs[activity] ? answer : emptyAnswer(); }
export function classroomSummary(room, students) {
  const total = students.length;
  const participants = students.map(student => ({...publicStudent(student),
    activity1Complete: completeAnswers(1, currentAnswer(student, room, 1).answers),
    activity2Complete: completeAnswers(2, currentAnswer(student, room, 2).answers),
    activity1Submitted: currentAnswer(student, room, 1).submitted,
    activity2Submitted: currentAnswer(student, room, 2).submitted,
    completedWorkCount: student.works.filter(work => work.runId === room.runs[3]).length,
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
  return {participants, comparison, observations, works};
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

const TEACHER_ROOM_GONE = '이미 삭제했거나 찾을 수 없는 수업이에요. 새 수업을 열어 주세요.';
export class ClassroomService {
  constructor(store, {now = () => Date.now(), makeToken = token, makeCode} = {}) {
    this.store = store; this.now = now; this.makeToken = makeToken;
    this.makeCode = makeCode || (() => [...randomBytes(6)].map(value => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[value % 32]).join(''));
  }
  async room(code, options, message = '수업 코드를 찾지 못했어요. 선생님께 확인해 주세요.') {
    const result = await this.store.read(roomKey(validateCode(code)), options);
    if (!result || result.data.deletedAt !== undefined) fail(404, 'room-not-found', message);
    return result;
  }
  async student(code, id, bearer, options) {
    const result = await this.store.read(studentKey(code, validateNumber(id)), options);
    if (!result || !authorized(bearer, result.data.tokenHash)) fail(403, 'student-auth', '입장 정보를 확인하지 못했어요. 같은 기기에서 다시 입장해 주세요.');
    return result;
  }
  teacher(room, bearer) { if (!authorized(bearer, room.teacherHash)) fail(403, 'teacher-auth', '이 수업을 만든 선생님 화면에서 열어 주세요.'); }
  async create(raw = {}) {
    const teacherToken = this.makeToken(), now = this.now();
    for (let tries = 0; tries < 8; tries++) {
      const code = this.makeCode(), room = {code, teacherHash: hash(teacherToken), createdAt: now, activity: 0, status: 'waiting',
        runId: '', runs: {}, startedAt: null, endsAt: null, settings: settingsFrom(raw.settings), revealed: {}, revision: 1};
      try { await this.store.create(roomKey(code), room); return {code, teacherToken, state: classroomState(room, now)}; }
      catch (error) { if (!(error instanceof StoreConflict)) throw error; }
    }
    fail(503, 'create-retry', '수업 코드를 준비하지 못했어요. 다시 눌러 주세요.');
  }
  async join(raw) {
    const code = validateCode(raw.code), {data: room} = await this.room(code), id = validateNumber(raw.number), name = clean(raw.name, 30);
    if (room.status === 'ended') fail(409, 'room-ended', '이 수업은 모두 마무리되었어요.');
    if (!name || name.length > 20) fail(400, 'invalid-name', '이름을 20자 이내로 적어 주세요.');
    const existing = await this.store.read(studentKey(code, id));
    if (existing) {
      if (!authorized(raw.participantToken, existing.data.tokenHash)) fail(409, 'number-in-use', '이미 입장한 번호예요. 처음 입장한 기기에서 이어서 참여하거나 선생님께 알려 주세요.');
      return {code, participantId: id, participantToken: raw.participantToken, state: classroomState(room, this.now()), student: publicStudent(existing.data), answers: answersFor(existing.data)};
    }
    const participantToken = this.makeToken(), student = {id, number: Number(id), name, tokenHash: hash(participantToken), joinedAt: this.now(), answers: {1: emptyAnswer(), 2: emptyAnswer()}, works: []};
    try { await this.store.create(studentKey(code, id), student); }
    catch (error) { if (error instanceof StoreConflict) fail(409, 'number-in-use', '이미 입장한 번호예요. 번호를 확인해 주세요.'); throw error; }
    // A teacher may delete/end the class while a new participant file is being created.
    // Do not leave an unreachable named record after that deletion has finished.
    let latestRoom;
    try {
      latestRoom = (await this.room(code)).data;
      if (latestRoom.status === 'ended') fail(409, 'room-ended', '이 수업은 모두 마무리되었어요.');
    } catch (error) { await this.store.delete(studentKey(code, id)); throw error; }
    return {code, participantId: id, participantToken, state: classroomState(latestRoom, this.now()), student: publicStudent(student), answers: answersFor(student)};
  }
  async state(raw, bearer) {
    // Only polling may reuse short-lived reads. Every mutation re-reads durable state.
    const code = validateCode(raw.code), {data: room} = await this.room(code, {maxAge: 500}), {data: student} = await this.student(code, raw.participantId, bearer, {maxAge: 5000});
    return {state: classroomState(room, this.now()), student: publicStudent(student), answers: answersFor(student), completedWorks: student.works.filter(work => work.runId === room.runs[3])};
  }
  async overview(raw, bearer) {
    const code = validateCode(raw.code), {data: room} = await this.room(code, {maxAge: 500}, TEACHER_ROOM_GONE); this.teacher(room, bearer);
    const keys = await this.store.list(`${ROOM_ROOT(code)}participants/`);
    const students = (await Promise.all(keys.map(key => this.store.read(key, {maxAge: 5000})))).filter(Boolean).map(result => result.data);
    const reveal = {};
    if (room.revealed[1] || room.revealed[2]) {
      const answers = await import('./lesson-answer-key.js');
      if (room.revealed[1]) reveal.comparison = answers.COMPARISON_ANSWERS;
      if (room.revealed[2]) reveal.observations = answers.OBSERVATION_ANSWERS;
    }
    return {state: classroomState(room, this.now()), ...classroomSummary(room, students), reveal};
  }
  async control(raw, bearer) {
    const code = validateCode(raw.code);
    if (raw.command === 'delete') return this.removeRoom(code, bearer);
    for (let retry = 0; retry < 6; retry++) {
      const current = await this.room(code, undefined, TEACHER_ROOM_GONE), room = structuredClone(current.data); this.teacher(room, bearer);
      const state = classroomState(room, this.now());
      if (raw.command === 'start') {
        const activity = Number(raw.activity);
        if (![1, 2, 3].includes(activity)) fail(400, 'invalid-activity', '활동을 골라 주세요.');
        if (state.status === 'active') fail(409, 'already-active', '진행 중인 활동을 먼저 마무리해 주세요.');
        if (room.status === 'ended') fail(409, 'room-ended', '새 수업을 만들어 주세요.');
        room.activity = activity; room.status = 'active'; room.runId = this.makeToken(); room.runs[activity] = room.runId;
        room.startedAt = this.now(); room.endsAt = room.startedAt + room.settings.durations[activity] * 1000; room.revealed[activity] = false;
      } else if (raw.command === 'pause') room.status = 'paused';
      else if (raw.command === 'end') room.status = 'ended';
      else if (raw.command === 'settings') {
        if (state.status === 'active') fail(409, 'already-active', '진행 중인 활동을 마친 뒤 설정해 주세요.');
        room.settings = settingsFrom(raw.settings, room.settings);
      } else if (raw.command === 'reveal') {
        const activity = Number(raw.activity || room.activity);
        // Only after this activity has actually run; revealing before the start would spoil the answers on the projected teacher screen.
        if (![1, 2].includes(activity) || !room.runs?.[activity] || state.status === 'active') fail(409, 'reveal-after-activity', '활동을 마무리한 뒤 정답을 공개해 주세요.');
        room.revealed[activity] = true;
      } else fail(400, 'invalid-control', '진행 버튼을 다시 확인해 주세요.');
      room.revision++;
      try { await this.store.update(roomKey(code), room, current.etag); return {state: classroomState(room, this.now())}; }
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
      const {data: room} = await this.room(code); activeRoom(room, activity, raw.runId, this.now());
      const current = await this.student(code, id, bearer), student = structuredClone(current.data), before = currentAnswer(student, room, activity);
      if (revision <= before.clientRevision) return {state: classroomState(room, this.now()), answers: answersFor(student), ignored: true};
      if (before.submitted && room.settings.submitButton) fail(409, 'answer-submitted', '이미 제출한 답이에요. 다음 활동을 기다려 주세요.');
      if (raw.final && room.settings.submitButton && !completeAnswers(activity, answers)) fail(400, 'incomplete-answer', '모든 작품에 답을 적은 뒤 제출해 주세요.');
      student.answers[activity] = {runId: room.runId, clientRevision: revision, submitted: Boolean(raw.final && room.settings.submitButton), answers, updatedAt: this.now()};
      // Recheck the teacher's phase just before writing; late requests do not open a closed activity.
      const {data: latestRoom} = await this.room(code); activeRoom(latestRoom, activity, raw.runId, this.now());
      try { await this.store.update(studentKey(code, id), student, current.etag); return {state: classroomState(latestRoom, this.now()), answers: answersFor(student)}; }
      catch (error) { if (!(error instanceof StoreConflict)) throw error; }
    }
    fail(409, 'save-retry', '답을 저장하는 중이에요. 잠시 뒤 다시 저장해 주세요.');
  }
  async submitWork(raw, bearer) {
    const code = validateCode(raw.code), id = validateNumber(raw.participantId), {data: room} = await this.room(code);
    workRoom(room, raw.runId, this.now()); const {data: initialStudent} = await this.student(code, id, bearer);
    const {work, score} = finishedWork(raw.work), preview = previewImage(raw.preview || raw.work.preview);
    const existingWork = initialStudent.works.find(item => item.id === work.id && item.runId === room.runId);
    if (existingWork) return {state: classroomState(room, this.now()), work: existingWork, duplicate: true};
    if (initialStudent.works.filter(item => item.runId === room.runId).length >= 10) fail(409, 'work-limit', '이번 활동에는 작품을 10점까지 보낼 수 있어요.');
    const key = artworkKey(code, id, work.id), summary = {id: work.id, runId: room.runId, title: work.title, shape: work.shape, score: score.total,
      objectiveScore: score.objective, explanationScore: score.explanation, explanationUse: work.explanationUse, explanationBeauty: work.explanationBeauty, submittedAt: this.now()};
    const priorArt = await this.store.read(key);
    if (!priorArt) { try { await this.store.create(key, {preview}); } catch (error) { if (!(error instanceof StoreConflict)) throw error; } }
    // In particular, clean an image created after the delete-room sweep.
    try { await this.room(code); }
    catch (error) { if (error.code === 'room-not-found') await this.store.delete(key); throw error; }
    for (let retry = 0; retry < 6; retry++) {
      const current = await this.student(code, id, bearer), student = structuredClone(current.data);
      if (student.works.some(item => item.id === work.id && item.runId === room.runId)) return {state: classroomState(room, this.now()), work: student.works.find(item => item.id === work.id && item.runId === room.runId), duplicate: true};
      if (student.works.filter(item => item.runId === room.runId).length >= 10) fail(409, 'work-limit', '이번 활동에는 작품을 10점까지 보낼 수 있어요.');
      const {data: latestRoom} = await this.room(code); workRoom(latestRoom, raw.runId, this.now());
      student.works.push(summary);
      try { await this.store.update(studentKey(code, id), student, current.etag); return {state: classroomState(latestRoom, this.now()), work: summary}; }
      catch (error) { if (!(error instanceof StoreConflict)) throw error; }
    }
    fail(409, 'save-retry', '작품을 저장하는 중이에요. 잠시 뒤 다시 보내 주세요.');
  }
  async artwork(raw, bearer) {
    const code = validateCode(raw.code), id = validateNumber(raw.participantId), workId = validateWorkId(raw.workId), {data: room} = await this.room(code);
    if (!authorized(bearer, room.teacherHash)) await this.student(code, id, bearer);
    const student = await this.store.read(studentKey(code, id));
    if (!student?.data.works.some(work => work.id === workId)) fail(404, 'work-not-found', '완성작을 찾지 못했어요.');
    const result = await this.store.read(artworkKey(code, id, workId));
    if (!result) fail(404, 'work-not-found', '작품 사진을 찾지 못했어요.');
    return {preview: result.data.preview};
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
    const keys = (await this.store.list(ROOM_ROOT(code))).filter(key => key !== roomKey(code));
    if (this.store.deleteMany) await this.store.deleteMany(keys);
    else for (const key of keys) await this.store.delete(key);
    // Keep only a tombstone so a stale client cannot recreate data under a recycled code.
    const tombstone = await this.store.read(roomKey(code));
    if (tombstone) await this.store.update(roomKey(code), {code, deletedAt: this.now()}, tombstone.etag);
    return {deleted: true};
  }
}
