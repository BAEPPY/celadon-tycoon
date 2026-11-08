import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ClassroomService, WORK_UPLOAD_GRACE_MS, finishedWork} from './classroom-domain.js';
import {BlobClassroomStore, FileClassroomStore, StoreConflict, classroomPrefix, classroomStorageStatus} from './classroom-store.js';
import {createClassroomHandler} from './api/classroom.js';
import {assessmentFingerprint} from './assessment-rules.js';
import {evaluateWork} from './domain.js';

// This adapter is test-only. Real requests always use durable files or private Blob.
class MemoryStore {
  records = new Map();
  sequence = 0;
  async read(key) { return this.records.has(key) ? structuredClone(this.records.get(key)) : null; }
  async create(key, data) {
    if (this.records.has(key)) throw new StoreConflict();
    const etag = String(++this.sequence); this.records.set(key, {data: structuredClone(data), etag}); return {etag};
  }
  async update(key, data, etag) {
    if (this.records.get(key)?.etag !== etag) throw new StoreConflict();
    const next = String(++this.sequence); this.records.set(key, {data: structuredClone(data), etag: next}); return {etag: next};
  }
  async list(prefix) { return [...this.records.keys()].filter(key => key.startsWith(prefix)); }
  async delete(key) { this.records.delete(key); }
}
async function fixture(settings) {
  const store = new MemoryStore(); let clock = 1700000000000;
  const service = new ClassroomService(store, {now: () => clock});
  const room = await service.create({settings});
  const join = (number, name = `학생${number}`) => service.join({code: room.code, number, name});
  const control = (command, activity, extra = {}) => service.control({code: room.code, command, activity, ...extra}, room.teacherToken);
  return {store, service, room, join, control, advance: ms => { clock += ms; }};
}
const rawWork = (overrides = {}) => {
  const work = {id: 'finished-1', step: 4, orderId: 'royal-rest', shape: 'pillow', technique: 'inlay', pattern: 'crane',
    modelId: '', drawingLabel: '', clay: {slip: 'white'}, title: '쉬어 가는 베개',
    placements: [{x: 0.4, y: 0.5, pattern: 'crane'}], strokes: [], decorDone: true,
    firing: ['dry', 'biscuit', 'glaze', 'fire'], explanationUse: '머리를 받치는 베개예요.\n편하게 누워서 쉬기 좋아요.',
    explanationBeauty: '학 무늬를 파고 흰 흙을 채워 넣었어요.\n여러 번 다듬어 또렷하게 만들었어요.', ...overrides};
  work.assessment = {version: 1, source: 'ai', fingerprint: assessmentFingerprint(work), accepted: true,
    use: {score: 8, feedback: '모양과 쓰임을 설명했어요.'}, beauty: {score: 9, feedback: '만든 과정을 설명했어요.'}};
  return work;
};
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=';
function request(handler, {method = 'GET', query = {}, payload, auth, headers = {}} = {}) {
  const req = {method, url: `/api/classroom?${new URLSearchParams(query)}`, headers: {host: 'class.test', ...(auth ? {authorization: `Bearer ${auth}`} : {}), ...headers}, body: payload};
  const res = {headers: {}, statusCode: 0, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = JSON.parse(value); }};
  return handler(req, res).then(() => res);
}
const rejectsCode = (promise, code) => assert.rejects(promise, error => error.code === code);

test('room and student tokens are 256-bit capabilities; storage and public state contain no raw tokens', async () => {
  const f = await fixture(), child = await f.join(7, '홍길동');
  assert.equal(Buffer.from(f.room.teacherToken, 'base64url').length, 32);
  assert.equal(Buffer.from(child.participantToken, 'base64url').length, 32);
  const storage = JSON.stringify([...f.store.records.values()]);
  assert.ok(!storage.includes(f.room.teacherToken)); assert.ok(!storage.includes(child.participantToken));
  const state = await f.service.state({code: f.room.code, participantId: child.participantId}, child.participantToken);
  assert.equal(state.student.name, '홍길동'); assert.ok(!JSON.stringify(state).includes('Hash'));
  await rejectsCode(f.service.overview({code: f.room.code}, child.participantToken), 'teacher-auth');
  await rejectsCode(f.service.control({code: f.room.code, command: 'start', activity: 1}, child.participantToken), 'teacher-auth');
});

test('refresh resumes a participant with the original token; concurrent duplicate numbers cannot replace names', async () => {
  const f = await fixture();
  const results = await Promise.allSettled([f.join(1, '첫 학생'), f.join(1, '다른 학생')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const joined = results.find(result => result.status === 'fulfilled').value;
  const resumed = await f.service.join({code: f.room.code, number: 1, name: '바뀐 이름', participantToken: joined.participantToken});
  assert.equal(resumed.student.name, joined.student.name);
  assert.equal(resumed.participantId, joined.participantId);
  await rejectsCode(f.join(1), 'number-in-use');
  await rejectsCode(f.service.join({code: `${f.room.code}EXTRA`, number: 2, name: '학생'}), 'invalid-code');
});

test('room creation retries a code collision without overwriting the first class', async () => {
  const store = new MemoryStore(), codes = ['AAAAAA', 'AAAAAA', 'BBBBBB'];
  const service = new ClassroomService(store, {makeCode: () => codes.shift()});
  const first = await service.create(), second = await service.create();
  assert.equal(first.code, 'AAAAAA'); assert.equal(second.code, 'BBBBBB');
  assert.equal((await service.overview({code: first.code}, first.teacherToken)).state.code, first.code);
  await rejectsCode(service.overview({code: first.code}, second.teacherToken), 'teacher-auth');
});

test('thirty students join concurrently and individual answer writes preserve every participant', async () => {
  const f = await fixture(), students = await Promise.all(Array.from({length: 30}, (_, i) => f.join(i + 1)));
  const {state} = await f.control('start', 1);
  await Promise.all(students.map(student => f.service.answer({code: f.room.code, participantId: student.participantId,
    activity: 1, runId: state.runId, clientRevision: 1, answers: {'1': 'yuan'}}, student.participantToken)));
  const result = await f.service.overview({code: f.room.code}, f.room.teacherToken);
  assert.equal(result.participants.length, 30); assert.equal(result.comparison[0].respondents, 30);
  assert.equal(result.comparison[0].choices[0].percent, 100);
});

test('stale and concurrently arriving revisions cannot overwrite the newest student answer', async () => {
  const f = await fixture(), student = await f.join(1), {state} = await f.control('start', 1);
  const save = (clientRevision, country) => f.service.answer({code: f.room.code, participantId: student.participantId,
    activity: 1, runId: state.runId, clientRevision, answers: {'1': country}}, student.participantToken);
  await Promise.all([save(1, 'japan'), save(3, 'goryeo'), save(2, 'yuan')]);
  const delayed = await save(1, 'japan');
  assert.equal(delayed.ignored, true); assert.equal(delayed.answers[1].clientRevision, 3); assert.equal(delayed.answers[1].answers[1], 'goryeo');
});

test('server deadlines and teacher pause close writes; a restart has a new run identifier', async () => {
  const f = await fixture({durations: {1: 5, 3: 5}}), student = await f.join(1), {state} = await f.control('start', 1);
  const payload = {code: f.room.code, participantId: student.participantId, activity: 1, runId: state.runId, clientRevision: 1, answers: {'1': 'yuan'}};
  f.advance(5000);
  assert.equal((await f.service.state(payload, student.participantToken)).state.status, 'paused');
  await rejectsCode(f.service.answer(payload, student.participantToken), 'activity-closed');
  const restarted = await f.control('start', 1); assert.notEqual(restarted.state.runId, state.runId);
  await rejectsCode(f.service.answer(payload, student.participantToken), 'activity-closed');
  await f.service.answer({...payload, runId: restarted.state.runId}, student.participantToken);
  await f.control('pause');
  await rejectsCode(f.service.answer({...payload, runId: restarted.state.runId, clientRevision: 2}, student.participantToken), 'activity-closed');
  assert.equal((await f.service.overview({code: f.room.code}, f.room.teacherToken)).comparison[0].respondents, 1);
  const game = await f.control('start', 3); f.advance(5000);
  assert.equal((await f.service.state(payload, student.participantToken)).state.status, 'paused');
  // A work finished before the bell may still be uploading: accepted shortly after the scheduled end, rejected later.
  f.advance(WORK_UPLOAD_GRACE_MS - 1000);
  assert.equal((await f.service.submitWork({...payload, runId: game.state.runId, work: rawWork(), preview: png}, student.participantToken)).work.id, 'finished-1');
  f.advance(1000);
  await rejectsCode(f.service.submitWork({...payload, runId: game.state.runId, work: rawWork({id: 'finished-2'}), preview: png}, student.participantToken), 'activity-closed');
  // A teacher who stops the activity closes uploads at once.
  const stopped = await f.control('start', 3); f.advance(1000); await f.control('pause');
  await rejectsCode(f.service.submitWork({...payload, runId: stopped.state.runId, work: rawWork({id: 'finished-3'}), preview: png}, student.participantToken), 'activity-closed');
});

test('manual transition mode never admits late answers, and game expiry always pauses', async () => {
  const f = await fixture({autoPause: false, durations: {1: 5, 3: 5}}), student = await f.join(1);
  const first = await f.control('start', 1); f.advance(5000);
  const payload = {code: f.room.code, participantId: student.participantId};
  assert.equal((await f.service.state(payload, student.participantToken)).state.status, 'active');
  await rejectsCode(f.service.answer({...payload, activity: 1, runId: first.state.runId, clientRevision: 1, answers: {}}, student.participantToken), 'activity-closed');
  await f.control('pause'); await f.control('start', 3); f.advance(5000);
  assert.equal((await f.service.state(payload, student.participantToken)).state.status, 'paused');
});

test('optional submit button locks only complete final answers; autosaves remain editable', async () => {
  const f = await fixture({submitButton: true}), student = await f.join(1), {state} = await f.control('start', 1);
  const payload = {code: f.room.code, participantId: student.participantId, activity: 1, runId: state.runId, clientRevision: 1, answers: {'1': 'japan'}};
  const auto = await f.service.answer(payload, student.participantToken); assert.equal(auto.answers[1].submitted, false);
  await rejectsCode(f.service.answer({...payload, clientRevision: 2, final: true}, student.participantToken), 'incomplete-answer');
  const saved = await f.service.answer({...payload, clientRevision: 2, final: true, answers: {'1': 'japan', '2': 'yuan', '3': 'goryeo'}}, student.participantToken);
  assert.equal(saved.answers[1].submitted, true);
  await rejectsCode(f.service.answer({...payload, clientRevision: 3}, student.participantToken), 'answer-submitted');
  assert.equal((await f.service.overview({code: f.room.code}, f.room.teacherToken)).participants[0].activity1Submitted, true);
});

test('comparison percentages use each pot’s respondents; observation responses are anonymous and frequency counted', async () => {
  const f = await fixture(), students = await Promise.all([f.join(1, '실명하나'), f.join(2, '실명둘'), f.join(3, '실명셋')]);
  // Answers must not be revealable before an activity has run (the teacher screen is usually projected).
  await rejectsCode(f.control('reveal', 1), 'reveal-after-activity');
  await rejectsCode(f.control('reveal', 2), 'reveal-after-activity');
  const first = await f.control('start', 1);
  for (const [index, answers] of [{'1': 'yuan', '2': 'japan'}, {'1': 'goryeo'}].entries()) await f.service.answer({code: f.room.code,
    participantId: students[index].participantId, activity: 1, runId: first.state.runId, clientRevision: 1, answers}, students[index].participantToken);
  let result = await f.service.overview({code: f.room.code}, f.room.teacherToken);
  assert.equal(result.comparison[0].respondents, 2); assert.equal(result.comparison[0].unanswered, 1);
  assert.equal(result.comparison[0].choices.find(choice => choice.country === 'yuan').percent, 50);
  assert.equal(result.comparison[1].choices.find(choice => choice.country === 'japan').percent, 100);
  assert.deepEqual(result.reveal, {});
  await rejectsCode(f.control('reveal', 1), 'reveal-after-activity');
  await f.control('pause'); await f.control('reveal', 1);
  result = await f.service.overview({code: f.room.code}, f.room.teacherToken);
  assert.equal(result.reveal.comparison[1].country, 'japan');
  const second = await f.control('start', 2);
  for (const student of students.slice(0, 2)) await f.service.answer({code: f.room.code, participantId: student.participantId,
    activity: 2, runId: second.state.runId, clientRevision: 1, answers: {'1': {name: '베개', use: '머리를 받칩니다.'}}}, student.participantToken);
  result = await f.service.overview({code: f.room.code}, f.room.teacherToken);
  assert.deepEqual(result.observations[0].nameWords, [{text: '베개', count: 2}]);
  assert.equal(result.observations[0].responses.length, 2);
  for (const student of students) assert.ok(!JSON.stringify(result.observations).includes(student.student.name));
  const own = await f.service.state({code: f.room.code, participantId: students[0].participantId}, students[0].participantToken);
  assert.ok(!('reveal' in own)); assert.ok(!('participants' in own));
});

test('finished work preserves multiline AI evaluation and recomputes score instead of trusting claimed points', async () => {
  const f = await fixture(), student = await f.join(1, '작품 학생'), other = await f.join(2), {state} = await f.control('start', 3);
  const work = rawWork({score: 999, total: 999}), expected = evaluateWork(work);
  assert.equal(finishedWork(work).score.total, expected.total);
  assert.equal(finishedWork(work).score.assessmentSource, 'ai');
  const payload = {code: f.room.code, participantId: student.participantId, runId: state.runId, work, preview: png};
  const result = await f.service.submitWork(payload, student.participantToken);
  assert.equal(result.work.score, expected.total); assert.equal(result.work.explanationScore, 17);
  const duplicate = await f.service.submitWork(payload, student.participantToken); assert.equal(duplicate.duplicate, true);
  const teacher = await f.service.overview({code: f.room.code}, f.room.teacherToken);
  assert.equal(teacher.works.length, 1); assert.equal(teacher.works[0].name, '작품 학생'); assert.equal(teacher.works[0].preview, undefined);
  const imageQuery = {code: f.room.code, participantId: student.participantId, workId: work.id};
  assert.equal((await f.service.artwork(imageQuery, f.room.teacherToken)).preview, png);
  assert.equal((await f.service.artwork(imageQuery, student.participantToken)).preview, png);
  await rejectsCode(f.service.artwork(imageQuery, other.participantToken), 'student-auth');
  await rejectsCode(f.service.state({code: f.room.code, participantId: student.participantId}, other.participantToken), 'student-auth');
});

test('unfinished works, invalid images, oversized images, and writes under a different student are rejected', async () => {
  const f = await fixture(), student = await f.join(1), other = await f.join(2), {state} = await f.control('start', 3);
  const payload = {code: f.room.code, participantId: student.participantId, runId: state.runId, work: rawWork(), preview: png};
  for (const work of [rawWork({step: 3}), rawWork({explanationUse: ''}), rawWork({firing: ['dry']}), rawWork({firing: ['dry', 'biscuit', 'glaze', 'fire', 'fire']})]) await rejectsCode(f.service.submitWork({...payload, work}, student.participantToken), 'unfinished-work');
  for (const preview of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,AAAA', `data:image/png;base64,${'A'.repeat(410004)}`]) await rejectsCode(f.service.submitWork({...payload, preview}, student.participantToken), 'invalid-preview');
  await rejectsCode(f.service.submitWork(payload, other.participantToken), 'student-auth');
  assert.equal((await f.service.overview({code: f.room.code}, f.room.teacherToken)).works.length, 0);
});

test('explicit teacher deletion removes student answers and private images, retaining only a code tombstone', async () => {
  const f = await fixture(), student = await f.join(1), {state} = await f.control('start', 3);
  await f.service.submitWork({code: f.room.code, participantId: student.participantId, runId: state.runId, work: rawWork(), preview: png}, student.participantToken);
  await rejectsCode(f.service.control({code: f.room.code, command: 'delete'}, student.participantToken), 'teacher-auth');
  assert.deepEqual(await f.control('delete'), {deleted: true});
  assert.equal(f.store.records.size, 1); const remaining = [...f.store.records.values()][0].data;
  assert.deepEqual(Object.keys(remaining).sort(), ['code', 'deletedAt']);
  await rejectsCode(f.service.state({code: f.room.code, participantId: student.participantId}, student.participantToken), 'room-not-found');
});

test('a teacher deletion interrupted part-way can be run again and still removes every student record', async () => {
  const f = await fixture(), students = await Promise.all([f.join(1), f.join(2), f.join(3)]), originalDelete = f.store.delete.bind(f.store);
  let deletes = 0;
  f.store.delete = async key => { if (++deletes === 2) throw new Error('network'); return originalDelete(key); };
  await assert.rejects(f.control('delete'), /network/);
  assert.ok(f.store.records.size > 1, 'the interrupted sweep left records behind');
  await rejectsCode(f.service.state({code: f.room.code, participantId: students[0].participantId}, students[0].participantToken), 'room-not-found');
  await rejectsCode(f.service.control({code: f.room.code, command: 'delete'}, students[0].participantToken), 'teacher-auth');
  assert.deepEqual(await f.control('delete'), {deleted: true});
  assert.equal(f.store.records.size, 1);
  assert.deepEqual(Object.keys([...f.store.records.values()][0].data).sort(), ['code', 'deletedAt']);
  await rejectsCode(f.control('delete'), 'room-not-found');
});

test('a join created after the teacher deletion sweep is rejected and removes the late personal record', async () => {
  const f = await fixture(), originalCreate = f.store.create.bind(f.store);
  let release, started;
  const blocked = new Promise(resolve => { release = resolve; }), reached = new Promise(resolve => { started = resolve; });
  f.store.create = async (key, data) => { if (key.includes('/participants/')) { started(); await blocked; } return originalCreate(key, data); };
  const joining = f.join(1, '늦은 학생'); await reached;
  await f.control('delete'); release();
  await rejectsCode(joining, 'room-not-found');
  assert.equal(f.store.records.size, 1); assert.ok(!JSON.stringify([...f.store.records]).includes('늦은 학생'));
});

test('an artwork created after the teacher deletion sweep is rejected and removes the late image', async () => {
  const f = await fixture(), student = await f.join(1), {state} = await f.control('start', 3), originalCreate = f.store.create.bind(f.store);
  let release, started;
  const blocked = new Promise(resolve => { release = resolve; }), reached = new Promise(resolve => { started = resolve; });
  f.store.create = async (key, data) => { if (key.includes('/artworks/')) { started(); await blocked; } return originalCreate(key, data); };
  const submitting = f.service.submitWork({code: f.room.code, participantId: student.participantId, runId: state.runId, work: rawWork(), preview: png}, student.participantToken);
  await reached; await f.control('delete'); release();
  await rejectsCode(submitting, 'room-not-found');
  assert.equal(f.store.records.size, 1); assert.ok(!JSON.stringify([...f.store.records]).includes('data:image'));
});

test('filesystem adapter persists across instances and atomically rejects create/update collisions', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'celadon-class-'));
  try {
    const one = new FileClassroomStore(directory), two = new FileClassroomStore(directory), key = `${classroomPrefix()}/ABC234/room.json`;
    const created = await Promise.allSettled([one.create(key, {revision: 1}), two.create(key, {revision: 1})]);
    assert.equal(created.filter(result => result.status === 'fulfilled').length, 1);
    const initial = await two.read(key); assert.deepEqual(initial.data, {revision: 1});
    const changed = await Promise.allSettled([one.update(key, {revision: 2}, initial.etag), two.update(key, {revision: 3}, initial.etag)]);
    assert.equal(changed.filter(result => result.status === 'fulfilled').length, 1);
    assert.ok([2, 3].includes((await new FileClassroomStore(directory).read(key)).data.revision));
    assert.deepEqual(await one.list(`${classroomPrefix()}/ABC234/`), [key]);
    await assert.rejects(one.read('../../escape.json'));
  } finally { await rm(directory, {recursive: true, force: true}); }
});

test('Blob adapter bypasses cached reads, uses private conditional writes, and maps actual SDK conflict errors', async () => {
  const adapter = new BlobClassroomStore(), calls = [], {BlobPreconditionFailedError} = await import('@vercel/blob');
  adapter.sdk = async () => ({BlobPreconditionFailedError,
    get: async (key, options) => { calls.push({operation: 'get', key, options}); return {statusCode: 200, stream: new Response('{"ok":true}').body, blob: {etag: 'read-etag'}}; },
    put: async (key, body, options) => { calls.push({operation: 'put', key, options}); if (options.ifMatch === 'stale') throw new BlobPreconditionFailedError(); return {etag: 'written-etag'}; },
  });
  const key = `${classroomPrefix()}/ABC234/room.json`;
  assert.deepEqual(await adapter.read(key), {data: {ok: true}, etag: 'read-etag'});
  await adapter.create(key, {}); await adapter.update(key, {}, 'read-etag');
  await assert.rejects(adapter.update(key, {}, 'stale'), StoreConflict);
  assert.equal(calls[0].options.useCache, false); assert.equal(calls[0].options.access, 'private');
  assert.equal(calls[1].options.allowOverwrite, false); assert.equal(calls[1].options.addRandomSuffix, false);
  assert.equal(calls[2].options.ifMatch, 'read-etag'); assert.equal(calls[2].options.allowOverwrite, true);
});

test('API enforces bearer authorization on every student write and teacher read/control; malformed payloads stay friendly', async () => {
  const f = await fixture(), student = await f.join(1), other = await f.join(2), {state} = await f.control('start', 1);
  const handler = createClassroomHandler({store: f.store});
  const answer = {action: 'answer', code: f.room.code, participantId: student.participantId, activity: 1, runId: state.runId, clientRevision: 1, answers: {'1': 'yuan'}};
  // Use the injected classroom clock, otherwise an intentionally old fixture is expired.
  const timedHandler = createClassroomHandler({store: f.store, now: () => state.serverNow});
  for (const auth of [undefined, other.participantToken, f.room.teacherToken]) assert.equal((await request(timedHandler, {method: 'POST', payload: answer, auth})).statusCode, 403);
  assert.equal((await request(timedHandler, {method: 'POST', payload: answer, auth: student.participantToken})).statusCode, 200);
  assert.equal((await request(handler, {query: {action: 'teacher', code: f.room.code}, auth: student.participantToken})).statusCode, 403);
  assert.equal((await request(handler, {method: 'POST', payload: {action: 'control', code: f.room.code, command: 'pause'}, auth: student.participantToken})).statusCode, 403);
  assert.equal((await request(handler, {query: {action: 'teacher', code: f.room.code, teacherToken: f.room.teacherToken}})).statusCode, 403);
  assert.equal((await request(handler, {method: 'POST', payload: '{bad'})).statusCode, 400);
  assert.equal((await request(handler, {method: 'POST', payload: {action: 'create', extra: 'x'.repeat(800001)}})).statusCode, 413);
  assert.equal((await request(handler, {method: 'POST', payload: {action: 'create'}, headers: {origin: 'https://evil.test'}})).statusCode, 403);
  assert.equal((await request(handler, {method: 'DELETE'})).statusCode, 405);
  const read = await request(handler, {query: {action: 'state', code: f.room.code, participantId: student.participantId}, auth: student.participantToken});
  assert.equal(read.headers['Cache-Control'], 'private, no-store');
});

test('poll cache coalesces concurrent reads, returns isolated data, and is refreshed by writes while mutation reads stay fresh', async () => {
  const adapter = new BlobClassroomStore(); let reads = 0, version = 1;
  adapter.sdk = async () => ({
    get: async () => { reads++; await new Promise(resolve => setTimeout(resolve, 3)); return {statusCode: 200,
      stream: new Response(JSON.stringify({version})).body, blob: {etag: String(version)}}; },
    put: async (_key, body) => { version = JSON.parse(body).version; return {etag: String(version)}; },
    del: async () => {},
  });
  const key = `${classroomPrefix()}/ABC234/room.json`;
  const first = await Promise.all(Array.from({length: 30}, () => adapter.read(key, {maxAge: 500})));
  assert.equal(reads, 1); first[0].data.version = 99;
  assert.equal((await adapter.read(key, {maxAge: 500})).data.version, 1);
  await adapter.read(key); assert.equal(reads, 2);
  await adapter.update(key, {version: 2}, '1');
  assert.equal((await adapter.read(key, {maxAge: 500})).data.version, 2); assert.equal(reads, 2);
  await adapter.delete(key); await adapter.read(key, {maxAge: 500}); assert.equal(reads, 3);
});

test('production without private storage reports health accurately and refuses volatile fallback', async () => {
  const keys = ['VERCEL', 'VERCEL_ENV', 'NODE_ENV', 'BLOB_STORE_ID', 'BLOB_READ_WRITE_TOKEN'];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    process.env.VERCEL = '1'; process.env.VERCEL_ENV = 'production'; process.env.NODE_ENV = 'production';
    delete process.env.BLOB_STORE_ID; delete process.env.BLOB_READ_WRITE_TOKEN;
    assert.equal(classroomPrefix(), 'classroom-v1/production');
    assert.deepEqual(classroomStorageStatus(), {configured: false, storage: 'unconfigured'});
    const handler = createClassroomHandler();
    const health = await request(handler, {query: {action: 'health'}});
    assert.equal(health.statusCode, 200); assert.equal(health.body.configured, false);
    const create = await request(handler, {method: 'POST', payload: {action: 'create'}});
    assert.equal(create.statusCode, 503); assert.equal(create.body.code, 'storage-unavailable');
    assert.ok(!JSON.stringify(health.body).includes('BLOB'));
  } finally { for (const key of keys) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; } }
});
