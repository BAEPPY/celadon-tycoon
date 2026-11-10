import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ClassroomService, WORK_UPLOAD_GRACE_MS, WORK_RETENTION_MS, configuredTeacherPasscode, finishedWork, orderDigest, madeDigest} from './classroom-domain.js';
import {BlobClassroomStore, FileClassroomStore, StoreConflict, classroomPrefix, classroomStorageStatus} from './classroom-store.js';
import {createClassroomHandler, MAX_CLASSROOM_BODY_BYTES} from './api/classroom.js';
import {createCleanupHandler} from './api/cleanup-classroom.js';
import {assessmentFingerprint} from './assessment-rules.js';
import {evaluateWork} from './domain.js';
import {classroomWorkPayload} from './classroom-game-bridge.js';
import {sanitizeWorkDesign} from './work-design.js';

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
  async *cleanupPages() {
    yield [...this.records].filter(([key]) => key.startsWith(`${classroomPrefix()}/`))
      .map(([key, record]) => ({key, uploadedAt: record.data.submittedAt ?? record.data.createdAt, etag: record.etag}));
  }
  async delete(key, etag) {
    if (etag !== undefined && this.records.has(key) && this.records.get(key).etag !== etag) throw new StoreConflict();
    this.records.delete(key);
  }
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

test('fixed Korean join code resolves to a separate canonical room and does not expose teacher capabilities', async () => {
  const store = new MemoryStore(), service = new ClassroomService(store);
  await rejectsCode(service.join({code: '탑텐반', number: 1, name: '학생'}), 'room-not-found');
  await rejectsCode(service.create({joinCode: '다른반'}), 'invalid-join-code');
  const room = await service.create({joinCode: '  탑텐반  '});
  assert.match(room.code, /^[A-Z2-9]{6}$/); assert.equal(room.state.joinCode, '탑텐반');
  const joined = await service.join({code: ' 탑텐반 ', number: 1, name: '첫 학생'});
  assert.equal(joined.code, room.code); assert.equal(joined.state.joinCode, '탑텐반');
  assert.equal((await service.state({code: room.code, participantId: joined.participantId}, joined.participantToken)).student.name, '첫 학생');
  assert.ok(!JSON.stringify(joined).includes(room.teacherToken));
  const alias = store.records.get(`${classroomPrefix()}/aliases/tapten.json`);
  assert.equal(alias.data.code, room.code); assert.ok(!JSON.stringify(alias).includes(room.teacherToken));
  const legacy = await service.create();
  assert.equal(legacy.state.joinCode, undefined); assert.notEqual(legacy.code, room.code);
});

test('a persisted create token recovers fixed-code creation and replacement after a lost HTTP response', async () => {
  const store = new MemoryStore(), service = new ClassroomService(store);
  for (const createToken of ['short', 'x'.repeat(43), 'a'.repeat(44), ' '.repeat(43)]) await rejectsCode(service.create({joinCode: '탑텐반', createToken}), 'invalid-create-token');
  const firstRequest = {joinCode: '탑텐반', createToken: randomBytes(32).toString('base64url')};
  const first = await service.create(firstRequest);
  const recovered = await service.create(firstRequest);
  assert.equal(recovered.code, first.code); assert.equal(recovered.teacherToken, firstRequest.createToken);
  assert.equal([...store.records.keys()].filter(key => key.endsWith('/room.json')).length, 1);
  await rejectsCode(service.create({joinCode: '탑텐반', createToken: randomBytes(32).toString('base64url')}), 'join-code-in-use');
  const nextRequest = {joinCode: '탑텐반', previousCode: first.code, createToken: randomBytes(32).toString('base64url')};
  const next = await service.create(nextRequest, first.teacherToken);
  // After a lost replacement response, the browser still has the previous canonical ID and bearer.
  const nextRetry = await service.create(nextRequest, first.teacherToken);
  assert.equal(nextRetry.code, next.code); assert.equal(nextRetry.teacherToken, nextRequest.createToken);
  assert.equal([...store.records.keys()].filter(key => key.endsWith('/room.json')).length, 2);
  assert.ok(!JSON.stringify([...store.records.values()]).includes(firstRequest.createToken));
  assert.ok(!JSON.stringify([...store.records.values()]).includes(nextRequest.createToken));
  const legacy = await service.create({createToken: randomBytes(32).toString('base64url')});
  assert.equal(legacy.state.joinCode, undefined, 'legacy random creation keeps its existing behavior');
});

test('simultaneous retries with the same create token return the same fixed-code class', async () => {
  const store = new MemoryStore(), service = new ClassroomService(store), payload = {joinCode: '탑텐반', createToken: randomBytes(32).toString('base64url')};
  const [one, two] = await Promise.all([service.create(payload), service.create(payload)]);
  assert.equal(one.code, two.code); assert.equal(one.teacherToken, two.teacherToken);
  assert.equal([...store.records.keys()].filter(key => key.endsWith('/room.json')).length, 1);
});

test('fixed-code creation recovers a committed alias write even when its acknowledgement fails', async () => {
  for (const failReadAfterCommit of [false, true]) {
    const store = new MemoryStore(), service = new ClassroomService(store), create = store.create.bind(store), read = store.read.bind(store);
    let failed = false, interruptRead = false;
    store.create = async (key, data) => {
      const result = await create(key, data);
      if (!failed && key.endsWith('/aliases/tapten.json')) {failed = true; interruptRead = failReadAfterCommit; throw new Error('write acknowledgement lost');}
      return result;
    };
    store.read = async key => {if (interruptRead && key.endsWith('/aliases/tapten.json')) {interruptRead = false; throw new Error('temporary read failure');} return read(key);};
    const payload = {joinCode: '탑텐반', createToken: randomBytes(32).toString('base64url')};
    if (failReadAfterCommit) await assert.rejects(service.create(payload), /write acknowledgement lost/);
    else assert.equal((await service.create(payload)).teacherToken, payload.createToken);
    const recovered = await service.create(payload);
    assert.equal(recovered.teacherToken, payload.createToken);
    assert.equal([...store.records.keys()].filter(key => key.endsWith('/room.json')).length, 1, 'the committed alias target is never deleted');
    assert.equal((await service.join({code: '탑텐반', number: 1, name: '학생'})).code, recovered.code);
  }
});

test('a failed pre-commit alias write leaves the public code available for a retry', async () => {
  const store = new MemoryStore(), service = new ClassroomService(store), create = store.create.bind(store); let failOnce = true;
  store.create = async (key, data) => {
    if (failOnce && key.endsWith('/aliases/tapten.json')) {failOnce = false; throw new Error('temporary write failure');}
    return create(key, data);
  };
  const payload = {joinCode: '탑텐반', createToken: randomBytes(32).toString('base64url')};
  await assert.rejects(service.create(payload), /temporary write failure/);
  await rejectsCode(service.join({code: '탑텐반', number: 1, name: '학생'}), 'room-not-found');
  const retried = await service.create(payload);
  assert.equal(retried.teacherToken, payload.createToken);
  assert.equal((await service.join({code: '탑텐반', number: 1, name: '학생'})).code, retried.code);
});

test('fixed join code replacement requires the current teacher, deletes the replaced class, and clears stale public aliases', async () => {
  const store = new MemoryStore(), service = new ClassroomService(store), room = await service.create({joinCode: '탑텐반'});
  const oldStudent = await service.join({code: '탑텐반', number: 1, name: '이전 학생'});
  const stranger = await service.create();
  await rejectsCode(service.create({joinCode: '탑텐반'}), 'join-code-in-use');
  await rejectsCode(service.create({joinCode: '탑텐반', previousCode: stranger.code}, stranger.teacherToken), 'join-code-in-use');
  await rejectsCode(service.create({joinCode: '탑텐반', previousCode: room.code}, oldStudent.participantToken), 'teacher-auth');
  await rejectsCode(service.create({joinCode: '탑텐반', previousCode: room.code}, stranger.teacherToken), 'teacher-auth');
  const next = await service.create({joinCode: '탑텐반', previousCode: room.code}, room.teacherToken);
  assert.notEqual(next.code, room.code); assert.equal(next.state.joinCode, '탑텐반');
  // 새 수업 deletes the replaced class: only its tombstone remains and its students are sent back to the entry screen.
  await rejectsCode(service.overview({code: room.code}, room.teacherToken), 'room-not-found');
  await assert.rejects(service.state({code: room.code, participantId: oldStudent.participantId}, oldStudent.participantToken), error => error.code === 'room-not-found' && /새 수업이 열리면 탑텐반으로/.test(error.message));
  assert.ok(![...store.records.keys()].some(key => key.startsWith(`${classroomPrefix()}/${room.code}/`) && !key.endsWith('/room.json')));
  assert.ok(!JSON.stringify([...store.records.values()]).includes('이전 학생'));
  const nextStudent = await service.join({code: '탑텐반', number: 1, name: '새 학생'});
  assert.equal(nextStudent.code, next.code);
  // Deleting the old class cannot clear a pointer which has already moved to its successor.
  await service.control({code: room.code, command: 'delete'}, room.teacherToken);
  assert.equal((await service.join({code: '탑텐반', number: 2, name: '새 학생 둘'})).code, next.code);
  await service.control({code: next.code, command: 'delete'}, next.teacherToken);
  await rejectsCode(service.join({code: '탑텐반', number: 3, name: '학생'}), 'room-not-found');
  const replacement = await service.create({joinCode: '탑텐반'});
  assert.equal((await service.join({code: '탑텐반', number: 1, name: '다음 학생'})).code, replacement.code);
});

test('each country name tag can be on one ceramic only', async () => {
  const f = await fixture(), student = await f.join(4), run = await f.control('start', 1);
  const send = (answers, clientRevision) => f.service.answer({code: f.room.code, participantId: student.participantId, activity: 1, runId: run.state.runId, clientRevision, answers}, student.participantToken);
  // Two or three of the same country are refused and nothing is kept from them.
  for (const answers of [{1: 'goryeo', 2: 'goryeo'}, {1: 'yuan', 2: 'japan', 3: 'yuan'}, {1: 'japan', 2: 'japan', 3: 'japan'}]) await rejectsCode(send(answers, 1), 'duplicate-country');
  assert.deepEqual((await f.service.state({code: f.room.code, participantId: student.participantId}, student.participantToken)).answers[1]?.answers ?? {}, {});
  // One, two or three different countries are fine, and so is taking a tag off again.
  await send({2: 'goryeo'}, 1); await send({1: 'yuan', 2: 'goryeo'}, 2); await send({1: 'goryeo', 3: 'japan'}, 3);
  const kept = await send({1: 'japan', 2: 'yuan', 3: 'goryeo'}, 4);
  assert.deepEqual(kept.answers[1].answers, {1: 'japan', 2: 'yuan', 3: 'goryeo'});
  const summary = await f.service.overview({code: f.room.code}, f.room.teacherToken);
  assert.deepEqual(summary.comparison.map(item => item.choices.find(choice => choice.count === 1).country), ['japan', 'yuan', 'goryeo']);
});

test('a Korean teacher passcode matches however it was composed, and short or missing ones are ignored', async () => {
  // The settings page and a keyboard can deliver the same word precomposed (NFC) or as separate jamo (NFD).
  const word = '청자교실', composed = word.normalize('NFC'), decomposed = word.normalize('NFD');
  assert.notEqual(composed, decomposed);
  for (const [configured, typed] of [[composed, decomposed], [decomposed, composed], [` ${composed} `, composed], ['청자１２３４', '청자1234']]) {
    const service = new ClassroomService(new MemoryStore(), {teacherPasscode: configured});
    await rejectsCode(service.create({joinCode: '탑텐반', passcode: '청자교시'}), 'teacher-passcode');
    assert.ok((await service.create({joinCode: '탑텐반', passcode: typed})).code);
  }
  assert.equal(configuredTeacherPasscode(decomposed), composed);
  assert.equal(configuredTeacherPasscode('청자'), '', 'fewer than four letters is not a passcode');
  assert.equal(configuredTeacherPasscode(undefined), '');
});

test('with a teacher passcode set, only the teacher can open or take back 탑텐반, and replacing a class deletes it', async () => {
  const store = new MemoryStore(), service = new ClassroomService(store, {teacherPasscode: '청자-1234'});
  await rejectsCode(service.create({joinCode: '탑텐반'}), 'teacher-passcode');
  await rejectsCode(service.create({joinCode: '탑텐반', passcode: '틀린 번호'}), 'teacher-passcode');
  await rejectsCode(service.create(), 'teacher-passcode');
  const first = await service.create({joinCode: '탑텐반', passcode: '청자-1234'});
  const student = await service.join({code: '탑텐반', number: 1, name: '봄샘'});
  // The same browser replaces its own class without the passcode; the replaced class is deleted.
  const second = await service.create({joinCode: '탑텐반', previousCode: first.code}, first.teacherToken);
  await rejectsCode(service.overview({code: first.code}, first.teacherToken), 'room-not-found');
  await rejectsCode(service.state({code: first.code, participantId: student.participantId}, student.participantToken), 'room-not-found');
  // A teacher whose browser data was wiped takes the code back with the passcode; strangers cannot.
  await service.join({code: '탑텐반', number: 5, name: '두 번째 반'});
  await rejectsCode(service.create({joinCode: '탑텐반'}), 'teacher-passcode');
  const third = await service.create({joinCode: '탑텐반', passcode: ' 청자-1234 '});
  await rejectsCode(service.overview({code: second.code}, second.teacherToken), 'room-not-found');
  assert.ok(!JSON.stringify([...store.records.values()]).includes('두 번째 반'), 'the taken-back class is deleted too');
  assert.equal((await service.join({code: '탑텐반', number: 2, name: '하늘'})).code, third.code);
  // Without a configured passcode the earlier behaviour stays: a held code cannot be taken over.
  const open = new ClassroomService(new MemoryStore()), held = await open.create({joinCode: '탑텐반'});
  await rejectsCode(open.create({joinCode: '탑텐반', passcode: '청자-1234'}), 'join-code-in-use');
  assert.equal((await open.join({code: '탑텐반', number: 1, name: '학생'})).code, held.code);
});

test('a 새 수업 interrupted while deleting the previous class can be pressed again and finishes both', async () => {
  const store = new MemoryStore(), service = new ClassroomService(store), room = await service.create({joinCode: '탑텐반'});
  await Promise.all([1, 2, 3].map(number => service.join({code: '탑텐반', number, name: `학생${number}`})));
  const originalDelete = store.delete.bind(store); let deletes = 0;
  store.delete = async key => { if (++deletes === 2) throw new Error('network'); return originalDelete(key); };
  const request = {joinCode: '탑텐반', previousCode: room.code, createToken: 'A'.repeat(43)};
  await assert.rejects(service.create(request, room.teacherToken), /network/);
  // The code still points at the old class (now closed), so nobody else could take it in between.
  await rejectsCode(service.join({code: '탑텐반', number: 9, name: '늦은 학생'}), 'room-not-found');
  const next = await service.create(request, room.teacherToken);
  assert.equal((await service.join({code: '탑텐반', number: 1, name: '새 학생'})).code, next.code);
  assert.ok(!JSON.stringify([...store.records.values()]).includes('학생2'), 'every record of the previous class is gone');
  assert.deepEqual(await service.create(request, room.teacherToken).then(result => result.code), next.code, 'a lost response is recovered, not repeated');
});

test('a student joining 탑텐반 after its class ended is told to wait for a new class', async () => {
  const store = new MemoryStore(), service = new ClassroomService(store), room = await service.create({joinCode: '탑텐반'});
  await service.control({code: room.code, command: 'end'}, room.teacherToken);
  await assert.rejects(service.join({code: '탑텐반', number: 1, name: '학생'}), error => error.code === 'room-ended' && /선생님이 새 수업을 열면/.test(error.message));
});

test('an existing teacher can claim an unused fixed code, but other rooms and students cannot reassign it', async () => {
  const f = await fixture(), student = await f.join(1), stranger = await f.service.create();
  await rejectsCode(f.service.control({code: f.room.code, command: 'claim-join-code'}, student.participantToken), 'teacher-auth');
  const claimed = await f.control('claim-join-code'); assert.equal(claimed.state.joinCode, '탑텐반');
  assert.equal((await f.control('claim-join-code')).state.joinCode, '탑텐반');
  await rejectsCode(f.service.control({code: stranger.code, command: 'claim-join-code'}, stranger.teacherToken), 'join-code-in-use');
  assert.equal((await f.service.join({code: '탑텐반', number: 2, name: '둘째 학생'})).code, f.room.code);
  assert.equal((await f.service.overview({code: f.room.code}, f.room.teacherToken)).participants.length, 2);
});

test('concurrent alias creation and replacement have one winner and remove only the losing empty room', async () => {
  const store = new MemoryStore(), service = new ClassroomService(store);
  const claims = await Promise.allSettled([service.create({joinCode: '탑텐반'}), service.create({joinCode: '탑텐반'})]);
  assert.equal(claims.filter(result => result.status === 'fulfilled').length, 1);
  const first = claims.find(result => result.status === 'fulfilled').value;
  assert.equal(claims.find(result => result.status === 'rejected').reason.code, 'join-code-in-use');
  assert.equal([...store.records.keys()].filter(key => key.endsWith('/room.json')).length, 1);
  const replacements = await Promise.allSettled([1, 2].map(() => service.create({joinCode: '탑텐반', previousCode: first.code}, first.teacherToken)));
  assert.equal(replacements.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal([...store.records.keys()].filter(key => key.endsWith('/room.json')).length, 2, 'the old class tombstone and only the winning new class remain');
  const winner = replacements.find(result => result.status === 'fulfilled').value;
  assert.equal((await service.join({code: '탑텐반', number: 1, name: '학생'})).code, winner.code);
  await rejectsCode(service.overview({code: first.code}, first.teacherToken), 'room-not-found');
});

test('a delayed old-room deletion cannot erase a newly assigned alias', async () => {
  const store = new MemoryStore(), service = new ClassroomService(store), room = await service.create({joinCode: '탑텐반'});
  const other = await service.create(), update = store.update.bind(store); let release, arrived, hold = true;
  const held = new Promise(resolve => {release = resolve;}), ready = new Promise(resolve => {arrived = resolve;});
  store.update = async (key, data, etag) => {
    if (hold && key.endsWith('/aliases/tapten.json') && data.code === null) {hold = false; arrived(); await held;}
    return update(key, data, etag);
  };
  const deleting = service.control({code: room.code, command: 'delete'}, room.teacherToken); await ready;
  // Another completed release and claim may run while this older delete is still waiting.
  await service.releaseJoinAlias(room.code);
  await service.control({code: other.code, command: 'claim-join-code'}, other.teacherToken);
  release(); await deleting;
  assert.equal((await service.join({code: '탑텐반', number: 1, name: '학생'})).code, other.code);
});

test('API forwards teacher authorization when replacing the fixed-code classroom', async () => {
  const store = new MemoryStore(), handler = createClassroomHandler({store});
  const opened = await request(handler, {method: 'POST', payload: {action: 'create', joinCode: '탑텐반'}});
  assert.equal(opened.statusCode, 200);
  const payload = {action: 'create', joinCode: '탑텐반', previousCode: opened.body.code};
  assert.equal((await request(handler, {method: 'POST', payload})).statusCode, 403);
  const replaced = await request(handler, {method: 'POST', payload, auth: opened.body.teacherToken});
  assert.equal(replaced.statusCode, 200); assert.equal(replaced.body.state.joinCode, '탑텐반');
  assert.notEqual(replaced.body.code, opened.body.code);
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
  // Activity 3 has no time limit: it stays open until the teacher ends it.
  const game = await f.control('start', 3); assert.equal(game.state.endsAt, null); f.advance(60 * 60 * 1000);
  assert.equal((await f.service.state(payload, student.participantToken)).state.status, 'active');
  // Once the teacher ends it, a work finished just before may still be uploading: accepted for a short while, rejected later.
  await f.control('pause'); f.advance(WORK_UPLOAD_GRACE_MS - 1000);
  assert.equal((await f.service.submitWork({...payload, runId: game.state.runId, work: rawWork(), preview: png}, student.participantToken)).work.id, 'finished-1');
  f.advance(1000);
  await rejectsCode(f.service.submitWork({...payload, runId: game.state.runId, work: rawWork({id: 'finished-2'}), preview: png}, student.participantToken), 'activity-closed');
  // Starting another activity closes uploads for the earlier run at once.
  const stopped = await f.control('start', 3); f.advance(1000); await f.control('pause'); await f.control('start', 1);
  await rejectsCode(f.service.submitWork({...payload, runId: stopped.state.runId, work: rawWork({id: 'finished-3'}), preview: png}, student.participantToken), 'activity-closed');
});

test('manual transition mode never admits late answers, and the game runs until the teacher ends it', async () => {
  const f = await fixture({autoPause: false, durations: {1: 5, 3: 5}}), student = await f.join(1);
  const first = await f.control('start', 1); f.advance(5000);
  const payload = {code: f.room.code, participantId: student.participantId};
  assert.equal((await f.service.state(payload, student.participantToken)).state.status, 'active');
  await rejectsCode(f.service.answer({...payload, activity: 1, runId: first.state.runId, clientRevision: 1, answers: {}}, student.participantToken), 'activity-closed');
  await f.control('pause'); await f.control('start', 3); f.advance(5000);
  assert.equal((await f.service.state(payload, student.participantToken)).state.status, 'active');
  await f.control('pause');
  assert.equal((await f.service.state(payload, student.participantToken)).state.status, 'paused');
});

test('the teacher can announce an end time for activity 3: it counts down, can be extended or cancelled, and then closes the game', async () => {
  const f = await fixture(), student = await f.join(1), code = f.room.code, query = {code, participantId: student.participantId};
  // Only while activity 3 is running.
  await rejectsCode(f.control('game-timer', undefined, {seconds: 300}), 'timer-needs-game');
  await f.control('start', 1); await rejectsCode(f.control('game-timer', undefined, {seconds: 300}), 'timer-needs-game'); await f.control('pause');
  const game = await f.control('start', 3); assert.equal(game.state.endsAt, null);
  for (const seconds of [0, 29, 3601, 90.5, 'five', undefined]) await rejectsCode(f.control('game-timer', undefined, {seconds}), 'invalid-timer');
  await rejectsCode(f.control('game-timer', undefined, {add: 60}), 'timer-not-set');
  await rejectsCode(f.service.control({code, command: 'game-timer', seconds: 300}, student.participantToken), 'teacher-auth');
  f.advance(60000);
  const set = await f.control('game-timer', undefined, {seconds: 300});
  assert.equal(set.state.endsAt - set.state.serverNow, 300000); assert.equal(set.state.status, 'active');
  assert.equal(set.state.runId, game.state.runId, 'setting the timer keeps the same game run');
  assert.equal((await f.service.state(query, student.participantToken)).state.endsAt, set.state.endsAt, 'students receive the end time');
  const longer = await f.control('game-timer', undefined, {add: 60}); assert.equal(longer.state.endsAt, set.state.endsAt + 60000);
  for (const add of [0, 29, 601, 'x']) await rejectsCode(f.control('game-timer', undefined, {add}), 'invalid-timer');
  assert.equal((await f.control('game-timer', undefined, {cancel: true})).state.endsAt, null);
  f.advance(10 * 60000); assert.equal((await f.service.state(query, student.participantToken)).state.status, 'active', 'cancelled: no limit again');
  const again = await f.control('game-timer', undefined, {seconds: 120});
  const payload = {...query, runId: game.state.runId, work: rawWork(), preview: png};
  f.advance(120000 - 1);
  assert.equal((await f.service.state(query, student.participantToken)).state.status, 'active');
  f.advance(1);
  const closed = (await f.service.state(query, student.participantToken)).state;
  assert.equal(closed.status, 'paused', 'at 0 the game closes for everyone'); assert.equal(closed.pausedAt, again.state.endsAt);
  await rejectsCode(f.control('game-timer', undefined, {add: 60}), 'timer-needs-game');
  // A work finished just before the end still arrives during the short upload window, and not after it.
  f.advance(WORK_UPLOAD_GRACE_MS - 1);
  assert.equal((await f.service.submitWork(payload, student.participantToken)).work.id, 'finished-1');
  // Pressing 활동 마치기 later does not reopen that window.
  f.advance(60000); await f.control('pause');
  await rejectsCode(f.service.submitWork({...payload, work: rawWork({id: 'finished-2'})}, student.participantToken), 'activity-closed');
  const next = await f.control('start', 3); assert.equal(next.state.endsAt, null, 'a new game run starts without a timer');
});

test('the teacher can make every live board reload, and only the teacher can', async () => {
  const f = await fixture(), student = await f.join(1), code = f.room.code;
  assert.equal(f.room.state.boardRefresh, 0);
  const {observerToken} = await f.control('observer-link');
  await rejectsCode(f.service.control({code, command: 'refresh-boards'}, student.participantToken), 'teacher-auth');
  await rejectsCode(f.service.control({code, command: 'refresh-boards'}, observerToken), 'teacher-auth');
  f.advance(1000);
  const first = await f.control('refresh-boards');
  assert.ok(first.state.boardRefresh > 0);
  assert.equal((await f.service.observe({code}, observerToken)).state.boardRefresh, first.state.boardRefresh, 'boards see the signal');
  f.advance(1000);
  assert.ok((await f.control('refresh-boards')).state.boardRefresh > first.state.boardRefresh, 'each press is a new signal');
});

test('a PPT link shows the board like the observer link and may only reveal answers', async () => {
  const store = new MemoryStore(), service = new ClassroomService(store), first = await service.create({joinCode: '탑텐반'});
  const teacher = (command, extra = {}, room = first) => service.control({code: room.code, command, ...extra}, room.teacherToken);
  const observer = await teacher('observer-link'), ppt = await teacher('observer-link', {role: 'presenter'});
  assert.equal(ppt.observerCode, '탑텐반'); assert.notEqual(ppt.observerToken, observer.observerToken);
  assert.equal((await teacher('observer-link', {role: 'presenter'})).observerToken, ppt.observerToken, 'stable like the QR');
  const student = await service.join({code: '탑텐반', number: 1, name: '실명하나'});
  const view = await service.observe({code: '탑텐반'}, ppt.observerToken);
  assert.equal(view.presenter, true); assert.equal((await service.observe({code: '탑텐반'}, observer.observerToken)).presenter, undefined);
  assert.ok(!JSON.stringify(view).includes('실명하나'));
  const run = await teacher('start', {activity: 1});
  await service.answer({code: first.code, participantId: student.participantId, activity: 1, runId: run.state.runId, clientRevision: 1, final: true, answers: {1: 'japan', 2: 'yuan', 3: 'goryeo'}}, student.participantToken);
  await rejectsCode(service.control({code: '탑텐반', command: 'reveal', activity: 1}, ppt.observerToken), 'reveal-after-activity');
  await teacher('pause');
  // Only revealing: no class control, settings, students, links or data.
  for (const command of ['start', 'pause', 'end', 'settings', 'lock-room', 'observer-link', 'refresh-boards', 'game-timer', 'delete']) {
    await rejectsCode(service.control({code: first.code, command, activity: 2}, ppt.observerToken), 'teacher-auth');
  }
  await rejectsCode(service.overview({code: first.code}, ppt.observerToken), 'teacher-auth');
  await rejectsCode(service.control({code: '탑텐반', command: 'reveal', activity: 1}, observer.observerToken), 'invalid-code', 'the observer QR cannot reveal');
  await rejectsCode(service.control({code: '탑텐반', command: 'reveal', activity: 1}, student.participantToken), 'invalid-code');
  const revealed = await service.control({code: '탑텐반', command: 'reveal', activity: 1}, ppt.observerToken);
  assert.equal(revealed.state.revealed[1], true);
  assert.equal((await service.observe({code: '탑텐반'}, observer.observerToken)).reveal.comparison['3'].name, '청자 상감 모란 국화무늬 참외모양 병', 'everyone sees the revealed explanations');
  // The PPT link follows 탑텐반 to the next class and changes with "QR 새로 만들기".
  const second = await service.create({joinCode: '탑텐반', previousCode: first.code}, first.teacherToken);
  assert.equal((await service.observe({code: '탑텐반'}, ppt.observerToken)).state.code, second.code);
  const rotated = await teacher('observer-link', {rotate: true}, second);
  assert.notEqual(rotated.observerToken, observer.observerToken);
  await rejectsCode(service.observe({code: '탑텐반'}, ppt.observerToken), 'observer-auth');
  assert.notEqual((await teacher('observer-link', {role: 'presenter'}, second)).observerToken, ppt.observerToken);
  // A class without 탑텐반 has its own PPT link.
  const other = await service.create({}), own = await teacher('observer-link', {role: 'presenter'}, other);
  assert.equal(own.observerCode, undefined);
  assert.equal((await service.observe({code: other.code}, own.observerToken)).presenter, true);
  await rejectsCode(service.control({code: other.code, command: 'pause'}, own.observerToken), 'teacher-auth');
});

test('polling screens share one participant listing briefly; creating or deleting a file refreshes it', async () => {
  const adapter = new BlobClassroomStore(), prefix = `${classroomPrefix()}/ABCDEF/participants/`, files = new Set([`${prefix}1.json`]);
  let lists = 0;
  adapter.sdk = async () => ({
    list: async options => { lists++; return {blobs: [...files].filter(key => key.startsWith(options.prefix)).map(pathname => ({pathname})), hasMore: false}; },
    put: async key => { files.add(key); return {etag: 'e1'}; }, del: async keys => { for (const key of [].concat(keys)) files.delete(key); },
  });
  const [a, b] = await Promise.all([adapter.list(prefix, {maxAge: 2000}), adapter.list(prefix, {maxAge: 2000})]);
  a.push('changed by the caller');
  assert.deepEqual(await adapter.list(prefix, {maxAge: 2000}), [`${prefix}1.json`], 'callers get their own copy');
  assert.deepEqual(b, [`${prefix}1.json`]); assert.equal(lists, 1, 'three polls, one listing');
  await adapter.list(prefix); assert.equal(lists, 2, 'a mutation path that passes no maxAge always lists afresh');
  await adapter.create(`${prefix}2.json`, {id: '2'});
  assert.deepEqual((await adapter.list(prefix, {maxAge: 2000})).sort(), [`${prefix}1.json`, `${prefix}2.json`], 'a new student appears at once');
  await adapter.update(`${prefix}2.json`, {id: '2', answers: {}}, 'e1'); await adapter.list(prefix, {maxAge: 2000});
  assert.equal(lists, 3, 'saving answers does not drop the shared listing');
  await adapter.delete(`${prefix}2.json`);
  assert.deepEqual(await adapter.list(prefix, {maxAge: 2000}), [`${prefix}1.json`], 'a removed student disappears at once');
  const failing = new BlobClassroomStore();
  failing.sdk = async () => ({list: async () => { throw new Error('storage down'); }});
  await assert.rejects(failing.list(prefix, {maxAge: 2000}));
  failing.sdk = async () => ({list: async () => ({blobs: [], hasMore: false})});
  assert.deepEqual(await failing.list(prefix, {maxAge: 2000}), [], 'a failed listing is not kept');
});

test('static files are cached only where a stale copy cannot hurt', async () => {
  const config = JSON.parse(await readFile(new URL('./vercel.json', import.meta.url), 'utf8'));
  const rules = config.headers.filter(rule => rule.headers.some(header => header.key === 'Cache-Control'));
  const cacheFor = path => rules.filter(rule => new RegExp(`^${rule.source}$`).test(path)).map(rule => rule.headers.find(header => header.key === 'Cache-Control').value);
  // Content-hashed chunks never change under the same name.
  for (const path of ['/chunk-PXKYDS5L.js', '/three.module-ZDWJSGPE.js', '/observer-invite-PDWSA4OU.js']) assert.deepEqual(cacheFor(path), ['public, max-age=31536000, immutable']);
  // Entry points, pages and the add-in must pick up a deployment at once.
  for (const path of ['/app.js', '/classroom-app.js', '/classroom.css', '/lesson/index.html', '/ppt-addin/index.html', '/ppt-addin/manifest.xml', '/api/classroom']) assert.deepEqual(cacheFor(path), [], path);
  // Models and pictures keep their names when they are replaced, so they are trusted for an hour at most.
  for (const path of ['/assets/lesson/observation-5.glb', '/assets/vessels/pillow.webp']) {
    const [value] = cacheFor(path); assert.match(value, /^public, max-age=(\d+)$/); assert.ok(Number(value.match(/\d+/)[0]) <= 3600);
  }
});

test('수업 전 점검 proves the class can save, read and delete, for its teacher only, and leaves nothing behind', async () => {
  const f = await fixture(), student = await f.join(1), code = f.room.code, before = [...f.store.records.keys()].sort();
  const result = await f.service.preflight({code}, f.room.teacherToken);
  assert.deepEqual({storage: result.storage, joinCode: result.joinCode, teacherPasscode: result.teacherPasscode}, {storage: true, joinCode: false, teacherPasscode: false});
  assert.deepEqual([...f.store.records.keys()].sort(), before, 'the check file is removed');
  await f.control('claim-join-code');
  assert.equal((await f.service.preflight({code}, f.room.teacherToken)).joinCode, true);
  assert.equal((await new ClassroomService(f.store, {teacherPasscode: '청자1234'}).preflight({code}, f.room.teacherToken)).teacherPasscode, true);
  await rejectsCode(f.service.preflight({code}, student.participantToken), 'teacher-auth');
  await rejectsCode(f.service.preflight({code}, undefined), 'teacher-auth');
  // A storage problem is reported as a failed check, not as a crash, and still leaves no file.
  for (const method of ['create', 'read', 'delete']) {
    const original = f.store[method].bind(f.store);
    f.store[method] = async (key, ...rest) => { if (key.includes('/checks/')) { if (method === 'delete') await original(key, ...rest); throw new Error('storage down'); } return original(key, ...rest); };
    assert.equal((await f.service.preflight({code}, f.room.teacherToken)).storage, false, `${method} failure`);
    f.store[method] = original;
    assert.ok(![...f.store.records.keys()].some(key => key.includes('/checks/')));
  }
  // Through the API the cleanup check is a yes/no; the secret itself never leaves the server.
  const handler = createClassroomHandler({store: f.store}), secret = process.env.CRON_SECRET;
  try {
    process.env.CRON_SECRET = 'c'.repeat(40);
    const ok = await request(handler, {method: 'POST', payload: {action: 'preflight', code}, auth: f.room.teacherToken});
    assert.equal(ok.statusCode, 200); assert.equal(ok.body.cleanup, true); assert.ok(!JSON.stringify(ok.body).includes('cccc'));
    process.env.CRON_SECRET = 'too-short';
    assert.equal((await request(handler, {method: 'POST', payload: {action: 'preflight', code}, auth: f.room.teacherToken})).body.cleanup, false);
    assert.equal((await request(handler, {method: 'POST', payload: {action: 'preflight', code}, auth: student.participantToken})).statusCode, 403);
  } finally { if (secret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = secret; }
});

test('수업 결과 내려받기 gives the teacher one row per student with their own answers, and nobody else', async () => {
  const f = await fixture(), code = f.room.code, first = await f.join(2, '둘째'), second = await f.join(1, '첫째');
  const say = (student, extra) => ({code, participantId: student.participantId, clientRevision: 1, ...extra});
  const a1 = await f.control('start', 1);
  await f.service.answer(say(first, {activity: 1, runId: a1.state.runId, final: true, answers: {1: 'japan', 2: 'yuan', 3: 'goryeo'}}), first.participantToken);
  await f.service.answer(say(second, {activity: 1, runId: a1.state.runId, answers: {1: 'goryeo'}}), second.participantToken);
  await f.control('pause'); const beauty = await f.control('start-beauty');
  await f.service.beautyAnswer(say(first, {runId: beauty.state.runId, text: '맑고 은은한 푸른빛', final: true}), first.participantToken);
  await f.control('pause'); const a2 = await f.control('start', 2);
  await f.service.answer(say(first, {activity: 2, runId: a2.state.runId, answers: {1: {name: '베개', use: '머리를 받쳐요'}, 3: {name: '=오리', use: '물을 담아요'}}}), first.participantToken);
  await f.control('pause'); const a3 = await f.control('start', 3);
  await f.service.submitWork({code, participantId: first.participantId, runId: a3.state.runId, work: rawWork(), preview: png}, first.participantToken);
  const {observerToken} = await f.control('observer-link'), ppt = await f.control('observer-link', undefined, {role: 'presenter'});
  for (const bearer of [first.participantToken, observerToken, ppt.observerToken, undefined]) await rejectsCode(f.service.results({code}, bearer), 'teacher-auth');
  const result = await f.service.results({code}, f.room.teacherToken);
  assert.deepEqual(result.rows.map(row => [row.number, row.name]), [[1, '첫째'], [2, '둘째']], 'sorted by class number');
  const [late, full] = result.rows;
  assert.deepEqual(full.comparison, {1: 'japan', 2: 'yuan', 3: 'goryeo'}); assert.equal(full.comparisonCorrect, 3);
  assert.equal(full.beauty, '맑고 은은한 푸른빛');
  assert.deepEqual(full.observations[1], {name: '베개', use: '머리를 받쳐요'}); assert.deepEqual(full.observations[2], {name: '', use: ''});
  assert.equal(full.observations[3].name, '=오리', 'kept as written; the spreadsheet file escapes it');
  assert.equal(full.workCount, 1); assert.equal(full.work.title, '쉬어 가는 베개'); assert.ok(full.work.score > 0);
  assert.equal(full.work.explanationUse, rawWork().explanationUse);
  assert.deepEqual(late.comparison, {1: 'goryeo', 2: '', 3: ''}); assert.equal(late.comparisonCorrect, 0);
  assert.equal(late.beauty, ''); assert.equal(late.workCount, 0); assert.equal(late.work, null);
  assert.deepEqual(result.answers.comparison, {1: 'japan', 2: 'yuan', 3: 'goryeo'});
  assert.equal(result.answers.observations[2].name, '청자 투각 의자');
  const handler = createClassroomHandler({store: f.store});
  assert.equal((await request(handler, {query: {action: 'results', code}, auth: f.room.teacherToken})).body.rows.length, 2);
  assert.equal((await request(handler, {query: {action: 'results', code}, auth: observerToken})).statusCode, 403);
});

test('a work that mixed white and dark slip keeps that fact and its accepted AI check when it is sent', () => {
  const mixed = finishedWork(rawWork({clay: {slip: 'mixed'}}));
  assert.equal(mixed.work.clay.slip, 'mixed'); assert.equal(mixed.work.assessment.source, 'ai', 'the check was made for the same work on both sides');
  assert.equal(finishedWork(rawWork({clay: {slip: 'dark'}})).work.clay.slip, 'dark');
  assert.equal(finishedWork(rawWork({clay: {slip: 'rainbow'}})).work.clay.slip, 'white');
});

test('activity 1 done works with the default settings and persists until a new run', async () => {
  const f = await fixture(), student = await f.join(1), {state} = await f.control('start', 1);
  assert.equal(state.settings.submitButton, false);
  const payload = {code: f.room.code, participantId: student.participantId, activity: 1, runId: state.runId, clientRevision: 1, answers: {'1': 'japan'}};
  const auto = await f.service.answer(payload, student.participantToken); assert.equal(auto.answers[1].submitted, false);
  await rejectsCode(f.service.answer({...payload, clientRevision: 2, final: true}, student.participantToken), 'incomplete-answer');
  const complete = {'1': 'japan', '2': 'yuan', '3': 'goryeo'};
  const saved = await f.service.answer({...payload, clientRevision: 2, final: true, answers: complete}, student.participantToken);
  assert.equal(saved.answers[1].submitted, true);
  const stale = await f.service.answer(payload, student.participantToken);
  assert.equal(stale.ignored, true); assert.equal(stale.answers[1].submitted, true);
  await rejectsCode(f.service.answer({...payload, clientRevision: 3}, student.participantToken), 'answer-submitted');
  const refreshed = await f.service.state(payload, student.participantToken);
  assert.equal(refreshed.answers[1].submitted, true); assert.deepEqual(refreshed.answers[1].answers, complete);
  assert.equal((await f.service.overview({code: f.room.code}, f.room.teacherToken)).participants[0].activity1Submitted, true);
  await f.control('pause'); const restarted = await f.control('start', 1);
  const editable = await f.service.answer({...payload, runId: restarted.state.runId}, student.participantToken);
  assert.equal(editable.answers[1].submitted, false); assert.equal(editable.answers[1].clientRevision, 1);
  assert.equal((await f.service.overview({code: f.room.code}, f.room.teacherToken)).participants[0].activity1Submitted, false);
});

test('an activity 1 autosave already in flight cannot overwrite a confirmed done submission', async () => {
  const f = await fixture(), student = await f.join(1), {state} = await f.control('start', 1);
  const payload = {code: f.room.code, participantId: student.participantId, activity: 1, runId: state.runId};
  const update = f.store.update.bind(f.store); let release, arrived, hold = true;
  const held = new Promise(resolve => {release = resolve;}), ready = new Promise(resolve => {arrived = resolve;});
  f.store.update = async (key, data, etag) => {
    if (hold && data.answers?.[1]?.clientRevision === 1) {hold = false; arrived(); await held;}
    return update(key, data, etag);
  };
  const autosave = f.service.answer({...payload, clientRevision: 1, answers: {'1': 'yuan'}}, student.participantToken);
  await ready;
  const complete = {'1': 'japan', '2': 'yuan', '3': 'goryeo'};
  await f.service.answer({...payload, clientRevision: 2, final: true, answers: complete}, student.participantToken);
  release(); const delayed = await autosave;
  assert.equal(delayed.ignored, true); assert.equal(delayed.answers[1].submitted, true);
  assert.deepEqual(delayed.answers[1].answers, complete);
});

test('activity 2 done requires all five names and uses and locks the run regardless of the legacy submit setting', async () => {
  for (const submitButton of [false, true]) {
    const f = await fixture({submitButton}), student = await f.join(1), {state} = await f.control('start', 2);
    const payload = {code: f.room.code, participantId: student.participantId, activity: 2, runId: state.runId, clientRevision: 1, answers: {'1': {name: '베개', use: '머리를 받칩니다.'}}};
    const auto = await f.service.answer(payload, student.participantToken); assert.equal(auto.answers[2].submitted, false);
    assert.equal(state.settings.submitButton, submitButton, 'legacy settings remain readable');
    await rejectsCode(f.service.answer({...payload, clientRevision: 2, final: true}, student.participantToken), 'incomplete-answer');
    const complete = Object.fromEntries([1, 2, 3, 4, 5].map(id => [id, {name: `청자 ${id}`, use: '생활에 사용합니다.'}]));
    for (const incomplete of [
      {...complete, 5: {use: '물을 담아요.'}},
      {...complete, 5: {name: '물그릇', use: ' \n\t　 '}}
    ]) await rejectsCode(f.service.answer({...payload, clientRevision: 2, final: true, answers: incomplete}, student.participantToken), 'incomplete-answer');
    const draft = await f.service.answer({...payload, clientRevision: 2, answers: complete}, student.participantToken);
    assert.equal(draft.answers[2].submitted, false, 'completing every field still permits review before done');
    const saved = await f.service.answer({...payload, clientRevision: 3, final: true, answers: complete}, student.participantToken);
    assert.equal(saved.answers[2].submitted, true);
    const stale = await f.service.answer(payload, student.participantToken);
    assert.equal(stale.ignored, true); assert.equal(stale.answers[2].submitted, true);
    assert.deepEqual(stale.answers[2].answers, complete);
    await rejectsCode(f.service.answer({...payload, clientRevision: 4}, student.participantToken), 'answer-submitted');
    const refreshed = await f.service.state(payload, student.participantToken);
    assert.equal(refreshed.answers[2].submitted, true); assert.deepEqual(refreshed.answers[2].answers, complete);
    assert.equal((await f.service.overview({code: f.room.code}, f.room.teacherToken)).participants[0].activity2Submitted, true);
    await f.control('pause'); const restarted = await f.control('start', 2);
    const editable = await f.service.answer({...payload, runId: restarted.state.runId}, student.participantToken);
    assert.equal(editable.answers[2].submitted, false); assert.equal(editable.answers[2].clientRevision, 1);
    assert.equal((await f.service.overview({code: f.room.code}, f.room.teacherToken)).participants[0].activity2Submitted, false);
  }
});

test('an activity 2 autosave already in flight cannot overwrite confirmed done answers', async () => {
  const f = await fixture(), student = await f.join(1), {state} = await f.control('start', 2);
  const payload = {code: f.room.code, participantId: student.participantId, activity: 2, runId: state.runId};
  const update = f.store.update.bind(f.store); let release, arrived, hold = true;
  const held = new Promise(resolve => {release = resolve;}), ready = new Promise(resolve => {arrived = resolve;});
  f.store.update = async (key, data, etag) => {
    if (hold && data.answers?.[2]?.clientRevision === 1) {hold = false; arrived(); await held;}
    return update(key, data, etag);
  };
  const autosave = f.service.answer({...payload, clientRevision: 1, answers: {'1': {name: '베개', use: '머리를 받칩니다.'}}}, student.participantToken);
  await ready;
  const complete = Object.fromEntries([1, 2, 3, 4, 5].map(id => [id, {name: `청자 ${id}`, use: '생활에 사용합니다.'}]));
  await f.service.answer({...payload, clientRevision: 2, final: true, answers: complete}, student.participantToken);
  release(); const delayed = await autosave;
  assert.equal(delayed.ignored, true); assert.equal(delayed.answers[2].submitted, true);
  assert.deepEqual(delayed.answers[2].answers, complete);
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

test('a finished work keeps what was ordered and what was made in words, so boards can compare similar orders', async () => {
  // The order: which vessel (its use), who asked, and the pattern and technique asked for ('' and [] when left free).
  assert.deepEqual(orderDigest({orderId: 'royal-rest'}), {id: 'royal-rest', shape: 'pillow', shapeName: '청자 베개', use: '누워서 쉴 때 머리를 받칩니다.', customer: '왕실의 주문',
    title: orderDigest({orderId: 'royal-rest'}).title, quote: orderDigest({orderId: 'royal-rest'}).quote, techniqueId: 'inlay', technique: '상감', patterns: ['학']});
  const free = orderDigest({orderId: 'royal-simple-vessel'});
  assert.deepEqual([free.shape, free.shapeName, free.techniqueId, free.technique, free.patterns], ['maebyeong', '청자 매병', 'any', '', []]);
  assert.deepEqual(orderDigest({orderId: 'example-maebyeong'}).patterns, ['학', '구름'], 'every pattern an order requires');
  assert.equal(orderDigest({orderId: 'no-such-order'}), null);
  // What was made: the patterns really placed (each once), none for a plain work.
  assert.deepEqual(madeDigest({shape: 'maebyeong', technique: 'inlay', drawingLabel: '', placements: [{pattern: 'crane'}, {pattern: 'cloud'}, {pattern: 'crane'}]}),
    {shape: 'maebyeong', shapeName: '청자 매병', techniqueId: 'inlay', technique: '상감', patterns: ['학', '구름']});
  assert.deepEqual(madeDigest({shape: 'pitcher', technique: 'plain', drawingLabel: '', placements: [{pattern: 'crane'}]}).patterns, []);
  // Teachers and visitors both get the two digests with a work; visitors still get no name or number.
  const f = await fixture(), student = await f.join(1, '비교 학생'), {state} = await f.control('start', 3);
  await f.service.submitWork({code: f.room.code, participantId: student.participantId, runId: state.runId, work: rawWork(), preview: png}, student.participantToken);
  const [teacherWork] = (await f.service.overview({code: f.room.code}, f.room.teacherToken)).works;
  assert.deepEqual([teacherWork.order.shape, teacherWork.order.customer, teacherWork.made.shape, teacherWork.made.technique, teacherWork.made.patterns], ['pillow', '왕실의 주문', 'pillow', '상감', ['학']]);
  const {observerToken} = await f.control('observer-link');
  const [seen] = (await f.service.observe({code: f.room.code}, observerToken)).works;
  assert.deepEqual(seen.order, teacherWork.order); assert.deepEqual(seen.made, teacherWork.made);
  assert.equal(seen.name, undefined); assert.equal(seen.number, undefined); assert.ok(!JSON.stringify(seen).includes('비교 학생'));
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
  assert.deepEqual(Object.keys(remaining).sort(), ['code', 'deletedAt', 'teacherHash']);
  await rejectsCode(f.service.state({code: f.room.code, participantId: student.participantId}, student.participantToken), 'room-not-found');
});

test('the teacher can release a number, remove a student and lock new entries', async () => {
  const f = await fixture(), a = await f.join(1, '봄샘'), b = await f.join(2, '하늘'), code = f.room.code;
  const first = await f.control('start', 1);
  await f.service.answer({code, participantId: a.participantId, activity: 1, runId: first.state.runId, clientRevision: 1, answers: {'1': 'yuan'}}, a.participantToken);
  await rejectsCode(f.service.control({code, command: 'release-student', participantId: a.participantId}, a.participantToken), 'teacher-auth');
  // Released: the old key stops working and the same number can be taken again on another device, keeping its answers.
  assert.deepEqual(await f.control('release-student', undefined, {participantId: a.participantId}), {released: true});
  await rejectsCode(f.service.state({code, participantId: a.participantId}, a.participantToken), 'student-auth');
  assert.equal((await f.service.overview({code}, f.room.teacherToken)).participants.find(p => p.id === '1').released, true);
  const again = await f.join(1, '봄샘');
  assert.notEqual(again.participantToken, a.participantToken); assert.equal(again.answers[1].answers['1'], 'yuan');
  await rejectsCode(f.join(1, '다른 사람'), 'number-in-use');
  // Removed: the student's record and artworks are deleted.
  await f.control('pause'); const game = await f.control('start', 3);
  await f.service.submitWork({code, participantId: b.participantId, runId: game.state.runId, work: rawWork(), preview: png}, b.participantToken);
  assert.deepEqual(await f.control('remove-student', undefined, {participantId: b.participantId}), {removed: true});
  assert.ok(![...f.store.records.keys()].some(key => key.includes('/participants/2.json') || key.includes('/artworks/2/')));
  const overview = await f.service.overview({code}, f.room.teacherToken);
  assert.deepEqual(overview.participants.map(p => p.id), ['1']); assert.equal(overview.works.length, 0);
  await rejectsCode(f.control('remove-student', undefined, {participantId: b.participantId}).then(() => f.control('release-student', undefined, {participantId: b.participantId})), 'student-not-found');
  // Locked: new numbers are refused, but a released student can still come back.
  assert.equal((await f.control('lock-room', undefined, {locked: true})).state.locked, true);
  await rejectsCode(f.join(3, '모르는 사람'), 'room-locked');
  await f.control('release-student', undefined, {participantId: again.participantId});
  assert.equal((await f.join(1, '봄샘')).participantId, '1');
  assert.equal((await f.control('lock-room', undefined, {locked: false})).state.locked, false);
  assert.equal((await f.join(3, '새 학생')).participantId, '3');
});

test('an observer link shows class results without student names and cannot control the class', async () => {
  const f = await fixture(), a = await f.join(1, '실명하나'), code = f.room.code;
  const link = await f.control('observer-link'); assert.match(link.observerToken, /^[A-Za-z0-9_-]{30,}$/);
  const game = await f.control('start', 3);
  await f.service.submitWork({code, participantId: a.participantId, runId: game.state.runId, work: rawWork(), preview: png}, a.participantToken);
  const view = await f.service.observe({code}, link.observerToken);
  assert.equal(view.state.activity, 3); assert.equal(view.works.length, 1); assert.equal(view.participantCount, 1);
  assert.ok(!JSON.stringify(view).includes('실명하나'));
  assert.ok(!('name' in view.works[0]) && !('number' in view.works[0]));
  assert.equal(view.participants, undefined); assert.deepEqual(view.completionCounts, {1: 0, 2: 0});
  const participantId = view.works[0].participantId;
  assert.match(participantId, /^obs_[A-Za-z0-9_-]{43}$/); assert.notEqual(participantId, a.participantId);
  assert.equal((await f.service.artwork({code, participantId, workId: 'finished-1'}, link.observerToken)).preview, png);
  await rejectsCode(f.service.artwork({code, participantId: a.participantId, workId: 'finished-1'}, link.observerToken), 'observer-artwork');
  await rejectsCode(f.service.control({code, command: 'pause'}, link.observerToken), 'teacher-auth');
  await rejectsCode(f.service.overview({code}, link.observerToken), 'teacher-auth');
  await rejectsCode(f.service.observe({code}, a.participantToken), 'observer-auth');
  await rejectsCode(f.service.observe({code}, f.room.teacherToken), 'observer-auth');
  const repeated = await f.control('observer-link'); assert.equal(repeated.observerToken, link.observerToken);
  assert.equal((await f.service.observe({code}, link.observerToken)).works.length, 1);
  await f.control('delete');
  await rejectsCode(f.service.observe({code}, link.observerToken), 'room-not-found');
  await rejectsCode(f.service.artwork({code, participantId, workId: 'finished-1'}, link.observerToken), 'room-not-found');
});

test('observer QR retrieval is stable across parallel teacher tabs and fresh service instances', async () => {
  const f = await fixture(), code = f.room.code;
  const links = await Promise.all(Array.from({length: 8}, () => new ClassroomService(f.store).control({code, command: 'observer-link'}, f.room.teacherToken)));
  assert.equal(new Set(links.map(link => link.observerToken)).size, 1);
  const key = links[0].observerToken, roomPath = `${classroomPrefix()}/${code}/room.json`, before = await f.store.read(roomPath);
  const repeated = await f.control('observer-link'); assert.equal(repeated.observerToken, key);
  assert.deepEqual(await f.store.read(roomPath), before, 'sharing an existing QR does not revise or rewrite the class');
  assert.equal(Buffer.from(key, 'base64url').length, 32); assert.notEqual(key, f.room.teacherToken);
  assert.ok(!JSON.stringify([...f.store.records.values()]).includes(key), 'only the observer hash is persisted');
  await f.control('end'); assert.equal((await f.control('observer-link')).observerToken, key);
  assert.equal((await f.service.observe({code}, key)).state.status, 'ended');
  await rejectsCode(f.service.control({code, command: 'observer-link'}, key), 'teacher-auth');
});

test('observer artwork references are private, per work and per student, and cannot address another work', async () => {
  const f = await fixture(), first = await f.join(7, '첫 실명'), second = await f.join(12, '둘째 실명'), code = f.room.code;
  const {observerToken} = await f.control('observer-link'), run = await f.control('start', 3);
  for (const [student, id] of [[first, 'first-work'], [first, 'second-work'], [second, 'first-work']]) {
    await f.service.submitWork({code, participantId: student.participantId, runId: run.state.runId, work: rawWork({id}), preview: png}, student.participantToken);
  }
  const view = await f.service.observe({code}, observerToken);
  assert.equal(view.participantCount, 2); assert.equal(view.participants, undefined);
  assert.equal(new Set(view.works.map(work => work.participantId)).size, 3, 'references cannot correlate two works to one student');
  for (const work of view.works) {
    assert.match(work.participantId, /^obs_[A-Za-z0-9_-]{43}$/);
    assert.ok(!('name' in work) && !('number' in work));
    assert.equal((await f.service.artwork({code, participantId: work.participantId, workId: work.id}, observerToken)).preview, png);
    await rejectsCode(f.service.artwork({code, participantId: work.participantId, workId: work.id === 'first-work' ? 'second-work' : 'first-work'}, observerToken), 'observer-artwork');
  }
  for (const participantId of ['7', '12', `obs_${'A'.repeat(43)}`]) await rejectsCode(f.service.artwork({code, participantId, workId: 'first-work'}, observerToken), 'observer-artwork');
  assert.ok(!JSON.stringify(view).includes('첫 실명') && !JSON.stringify(view).includes('둘째 실명'));
  const teacher = await f.service.overview({code}, f.room.teacherToken);
  assert.deepEqual([...new Set(teacher.works.map(work => work.participantId))].sort(), ['12', '7']);
});

test('one 탑텐반 observer QR keeps working across 새 수업 and deletion and always shows the class 탑텐반 points to', async () => {
  const store = new MemoryStore(), service = new ClassroomService(store), first = await service.create({joinCode: '탑텐반'});
  const links = await Promise.all(Array.from({length: 6}, () => new ClassroomService(store).control({code: first.code, command: 'observer-link'}, first.teacherToken)));
  assert.equal(new Set(links.map(link => link.observerToken)).size, 1, 'parallel teacher tabs agree on one QR');
  const key = links[0].observerToken; assert.equal(links[0].observerCode, '탑텐반'); assert.equal(Buffer.from(key, 'base64url').length, 32);
  assert.ok(!JSON.stringify([...store.records.values()]).includes(key), 'only a seed is stored, never the QR key');
  const a = await service.join({code: '탑텐반', number: 1, name: '실명하나'}), game = await service.control({code: first.code, command: 'start', activity: 3}, first.teacherToken);
  await service.submitWork({code: first.code, participantId: a.participantId, runId: game.state.runId, work: rawWork(), preview: png}, a.participantToken);
  const view = await service.observe({code: '탑텐반'}, key);
  assert.equal(view.state.code, first.code); assert.equal(view.works.length, 1); assert.equal(view.participants, undefined);
  assert.ok(!JSON.stringify(view).includes('실명하나')); assert.match(view.works[0].participantId, /^obs_/);
  const oldWork = {code: '탑텐반', participantId: view.works[0].participantId, workId: 'finished-1'};
  assert.equal((await service.artwork(oldWork, key)).preview, png);
  await rejectsCode(service.artwork({...oldWork, participantId: a.participantId}, key), 'observer-artwork');
  for (const bearer of [first.teacherToken, a.participantToken, undefined, 'x'.repeat(43)]) await rejectsCode(service.observe({code: '탑텐반'}, bearer), 'observer-auth');
  await rejectsCode(service.control({code: first.code, command: 'pause'}, key), 'teacher-auth');
  await rejectsCode(service.overview({code: first.code}, key), 'teacher-auth');
  await rejectsCode(service.observe({code: first.code}, key), 'observer-auth', 'the 탑텐반 QR is not a key to the class code itself');

  // 새 수업 deletes the old class; the same QR now shows the new, empty class.
  const second = await service.create({joinCode: '탑텐반', previousCode: first.code}, first.teacherToken);
  assert.equal((await service.control({code: second.code, command: 'observer-link'}, second.teacherToken)).observerToken, key);
  const next = await service.observe({code: '탑텐반'}, key);
  assert.equal(next.state.code, second.code); assert.equal(next.state.status, 'waiting'); assert.equal(next.participantCount, 0); assert.deepEqual(next.works, []);
  await rejectsCode(service.artwork(oldWork, key), 'observer-artwork');

  // While no class is open the QR waits instead of failing, and the next class appears with the same QR.
  await service.control({code: second.code, command: 'delete'}, second.teacherToken);
  await rejectsCode(service.observe({code: '탑텐반'}, key), 'observer-waiting');
  await rejectsCode(service.artwork(oldWork, key), 'observer-waiting');
  const third = await service.create({joinCode: '탑텐반'});
  assert.equal((await service.observe({code: '탑텐반'}, key)).state.code, third.code);
  assert.equal((await service.control({code: third.code, command: 'observer-link'}, third.teacherToken)).observerToken, key);

  // "QR 새로 만들기" replaces the QR: the old one stops opening, and only the class's teacher can do it.
  await rejectsCode(service.control({code: third.code, command: 'observer-link', rotate: true}, key), 'teacher-auth');
  const rotated = await service.control({code: third.code, command: 'observer-link', rotate: true}, third.teacherToken);
  assert.notEqual(rotated.observerToken, key); assert.equal(rotated.observerCode, '탑텐반');
  await rejectsCode(service.observe({code: '탑텐반'}, key), 'observer-auth');
  assert.equal((await service.observe({code: '탑텐반'}, rotated.observerToken)).state.code, third.code);
  assert.equal((await service.control({code: third.code, command: 'observer-link'}, third.teacherToken)).observerToken, rotated.observerToken);

  // A class not connected to 탑텐반 keeps its own per-class QR, which cannot open 탑텐반.
  const other = await service.create({}), own = await service.control({code: other.code, command: 'observer-link'}, other.teacherToken);
  assert.equal(own.observerCode, undefined); assert.notEqual(own.observerToken, rotated.observerToken);
  assert.equal((await service.observe({code: other.code}, own.observerToken)).state.code, other.code);
  await rejectsCode(service.observe({code: '탑텐반'}, own.observerToken), 'observer-auth');
});

test('a rejected upload does not leave its picture behind', async () => {
  const f = await fixture(), student = await f.join(1), {state} = await f.control('start', 3), create = f.store.create.bind(f.store);
  // The teacher releases the student's number while the picture is being stored.
  f.store.create = async (key, data) => { const result = await create(key, data); if (key.includes('/artworks/')) await f.control('release-student', undefined, {participantId: student.participantId}); return result; };
  await rejectsCode(f.service.submitWork({code: f.room.code, participantId: student.participantId, runId: state.runId, work: rawWork(), preview: png}, student.participantToken), 'student-auth');
  assert.ok(![...f.store.records.keys()].some(key => key.includes('/artworks/')), 'no orphaned picture');
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
  assert.deepEqual(Object.keys([...f.store.records.values()][0].data).sort(), ['code', 'deletedAt', 'teacherHash']);
  assert.deepEqual(await f.control('delete'), {deleted: true}, 'deleting again is harmless');
  assert.equal(f.store.records.size, 1);
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
    const aliasKey = `${classroomPrefix()}/aliases/tapten.json`;
    const alias = await one.create(aliasKey, {code: 'ABC234'});
    assert.equal((await two.read(aliasKey)).data.code, 'ABC234');
    await two.update(aliasKey, {code: null}, alias.etag);
    assert.equal((await one.read(aliasKey)).data.code, null);
    for (const invalid of [`${classroomPrefix()}/aliases/other.json`, `${classroomPrefix()}/aliases/탑텐반.json`, `${classroomPrefix()}/aliases/../tapten.json`]) await assert.rejects(one.read(invalid), /invalid-store-key/);
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
  assert.equal((await request(handler, {method: 'POST', payload: {action: 'create', extra: 'x'.repeat(MAX_CLASSROOM_BODY_BYTES + 1)}})).statusCode, 413);
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

async function completedFixture() {
  const f = await fixture(), student = await f.join(1), {state} = await f.control('start', 3);
  const payload = {code: f.room.code, participantId: student.participantId, runId: state.runId, work: rawWork(), preview: png};
  return {...f, student, game: state, payload};
}
function barrier() {
  let release, reached;
  const ready = new Promise(resolve => { reached = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  return {ready, blocked, release, reached};
}

test('completed works expire exactly at 24 hours for owner, teacher and observer while lesson answers and class access remain', async () => {
  const f = await fixture(), student = await f.join(1, '계속 참여하는 학생'), code = f.room.code;
  await f.control('claim-join-code');
  const first = await f.control('start', 1);
  await f.service.answer({code, participantId: student.participantId, activity: 1, runId: first.state.runId, clientRevision: 1,
    answers: {'1': 'yuan', '2': 'goryeo', '3': 'japan'}, final: true}, student.participantToken);
  await f.control('pause');
  const second = await f.control('start', 2);
  const observations = Object.fromEntries(['1', '2', '3', '4', '5'].map(id => [id, {name: `이름 ${id}`, use: `쓰임 ${id}`} ]));
  await f.service.answer({code, participantId: student.participantId, activity: 2, runId: second.state.runId, clientRevision: 1,
    answers: observations, final: true}, student.participantToken);
  await f.control('pause');
  const game = await f.control('start', 3), observer = await f.control('observer-link');
  const payload = {code, participantId: student.participantId, runId: game.state.runId, work: rawWork(), preview: png};
  await f.service.submitWork(payload, student.participantToken);
  const studentPath = `${classroomPrefix()}/${code}/participants/1.json`, roomPath = `${classroomPrefix()}/${code}/room.json`;
  const before = await f.store.read(studentPath), roomBefore = await f.store.read(roomPath), aliasBefore = await f.store.read(`${classroomPrefix()}/aliases/tapten.json`);
  const query = {code, participantId: student.participantId, workId: payload.work.id};
  // 탑텐반 is connected, so the observer uses the fixed 탑텐반 QR rather than this class's own code.
  assert.equal(observer.observerCode, '탑텐반');
  const observerQuery = {...query, code: observer.observerCode, participantId: (await f.service.observe({code: observer.observerCode}, observer.observerToken)).works[0].participantId};
  f.advance(WORK_RETENTION_MS - 1);
  for (const [bearer, artworkQuery] of [[student.participantToken, query], [f.room.teacherToken, query], [observer.observerToken, observerQuery]]) {
    assert.equal((await f.service.artwork(artworkQuery, bearer)).preview, png);
  }
  assert.equal((await f.service.state(query, student.participantToken)).completedWorks.length, 1);
  f.advance(1);
  const [owner, teacher, visitor] = await Promise.all([
    f.service.state(query, student.participantToken), f.service.overview({code}, f.room.teacherToken), f.service.observe({code: observer.observerCode}, observer.observerToken),
  ]);
  assert.deepEqual(owner.completedWorks, []); assert.deepEqual(teacher.works, []); assert.deepEqual(visitor.works, []);
  assert.equal(teacher.participants[0].completedWorkCount, 0); assert.equal(visitor.participantCount, 1);
  assert.deepEqual(visitor.completionCounts, {1: 1, 2: 1});
  for (const [bearer, artworkQuery] of [[student.participantToken, query], [f.room.teacherToken, query], [observer.observerToken, observerQuery]]) await rejectsCode(f.service.artwork(artworkQuery, bearer), 'work-not-found');
  assert.deepEqual(owner.answers, before.data.answers);
  const after = (await f.store.read(studentPath)).data;
  for (const key of ['id', 'number', 'name', 'tokenHash', 'joinedAt', 'answers']) assert.deepEqual(after[key], before.data[key]);
  assert.deepEqual(await f.store.read(roomPath), roomBefore);
  assert.deepEqual(await f.store.read(`${classroomPrefix()}/aliases/tapten.json`), aliasBefore);
  assert.equal(after.retiredWorks.ids.length, 1); assert.match(after.retiredWorks.ids[0], /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify([...f.store.records]).includes(payload.work.title));
  assert.ok(!JSON.stringify([...f.store.records]).includes(payload.work.explanationUse));
  assert.ok(!JSON.stringify([...f.store.records]).includes('data:image'));
  assert.equal((await f.service.join({code: '탑텐반', number: 1, name: student.student.name, participantToken: student.participantToken})).participantId, '1');
  await rejectsCode(f.service.submitWork(payload, student.participantToken), 'work-expired');
});

test('a cached participant snapshot never revives expired work and an image read crossing expiry returns no preview', async () => {
  const f = await completedFixture(); await f.service.submitWork(f.payload, f.student.participantToken);
  const key = `${classroomPrefix()}/${f.room.code}/participants/1.json`, cached = await f.store.read(key), originalRead = f.store.read.bind(f.store);
  f.store.read = async (path, options) => path === key && options?.maxAge ? structuredClone(cached) : originalRead(path);
  f.advance(WORK_RETENTION_MS - 1);
  const gate = barrier(); let held = false;
  f.store.read = async (path, options) => {
    const value = path === key && options?.maxAge ? structuredClone(cached) : await originalRead(path);
    if (!held && path.includes('/artworks/')) { held = true; gate.reached(); await gate.blocked; }
    return value;
  };
  const reading = f.service.artwork({code: f.room.code, participantId: '1', workId: f.payload.work.id}, f.room.teacherToken);
  await gate.ready; f.advance(1); gate.release(); await rejectsCode(reading, 'work-not-found');
  for (let repeat = 0; repeat < 2; repeat++) {
    assert.deepEqual((await f.service.state({code: f.room.code, participantId: '1'}, f.student.participantToken)).completedWorks, []);
    assert.deepEqual((await f.service.overview({code: f.room.code}, f.room.teacherToken)).works, []);
  }
  assert.deepEqual((await originalRead(key)).data.works, []);
});

test('a delayed duplicate upload cannot recreate artwork or its summary after expiration', async () => {
  const f = await completedFixture(), originalCreate = f.store.create.bind(f.store), gate = barrier(); let held = false;
  f.store.create = async (key, data) => {
    if (!held && key.includes('/artworks/')) { held = true; gate.reached(); await gate.blocked; }
    return originalCreate(key, data);
  };
  const delayed = f.service.submitWork(f.payload, f.student.participantToken); await gate.ready;
  await f.service.submitWork(f.payload, f.student.participantToken);
  f.advance(WORK_RETENTION_MS);
  await f.service.state({code: f.room.code, participantId: '1'}, f.student.participantToken);
  gate.release(); await rejectsCode(delayed, 'work-expired');
  assert.ok(![...f.store.records.keys()].some(key => key.includes('/artworks/')));
  assert.deepEqual((await f.service.state({code: f.room.code, participantId: '1'}, f.student.participantToken)).completedWorks, []);
});

test('expiration retries preserve a concurrent new lesson answer and do not recreate a removed participant', async () => {
  for (const action of ['answer', 'remove']) {
    const f = await completedFixture(); await f.service.submitWork(f.payload, f.student.participantToken); f.advance(WORK_RETENTION_MS);
    await f.control('pause'); const activity = await f.control('start', 1);
    const originalUpdate = f.store.update.bind(f.store), gate = barrier(); let held = false;
    f.store.update = async (key, data, etag) => {
      if (!held && key.endsWith('/participants/1.json') && data.works.length === 0) { held = true; gate.reached(); await gate.blocked; }
      return originalUpdate(key, data, etag);
    };
    const cleaning = f.service.expireStudentWorks(f.room.code, '1'); await gate.ready;
    if (action === 'answer') await f.service.answer({code: f.room.code, participantId: '1', activity: 1, runId: activity.state.runId,
      clientRevision: 1, answers: {'1': 'goryeo'}}, f.student.participantToken);
    else await f.control('remove-student', undefined, {participantId: '1'});
    gate.release(); await cleaning;
    const record = await f.store.read(`${classroomPrefix()}/${f.room.code}/participants/1.json`);
    if (action === 'answer') { assert.equal(record.data.answers[1].answers['1'], 'goryeo'); assert.deepEqual(record.data.works, []); }
    else assert.equal(record, null);
    assert.ok(![...f.store.records.keys()].some(key => key.includes('/artworks/')));
  }
});

test('an interrupted image deletion leaves a retryable reference and subsequent cleanup removes the full work', async () => {
  const f = await completedFixture(); await f.service.submitWork(f.payload, f.student.participantToken); f.advance(WORK_RETENTION_MS);
  const originalDelete = f.store.delete.bind(f.store); let failOnce = true;
  f.store.delete = async (key, etag) => { if (failOnce && key.includes('/artworks/')) { failOnce = false; throw new Error('temporary deletion failure'); } return originalDelete(key, etag); };
  await assert.rejects(f.service.expireStudentWorks(f.room.code, '1'), /temporary deletion failure/);
  assert.equal((await f.store.read(`${classroomPrefix()}/${f.room.code}/participants/1.json`)).data.works.length, 1);
  await f.service.cleanupExpiredWorks();
  assert.deepEqual((await f.store.read(`${classroomPrefix()}/${f.room.code}/participants/1.json`)).data.works, []);
  assert.ok(![...f.store.records.keys()].some(key => key.includes('/artworks/')));
});

test('an older cleanup cannot delete a new run image that reuses the client work ID', async () => {
  const f = await completedFixture(); const old = await f.service.submitWork(f.payload, f.student.participantToken); f.advance(WORK_RETENTION_MS);
  const originalDelete = f.store.delete.bind(f.store), gate = barrier(); let held = false;
  f.store.delete = async (key, etag) => {
    if (!held && key.endsWith(`/${old.work.imageId}.json`)) { held = true; gate.reached(); await gate.blocked; }
    return originalDelete(key, etag);
  };
  const cleaning = f.service.expireStudentWorks(f.room.code, '1'); await gate.ready;
  await f.control('pause'); const next = await f.control('start', 3);
  const fresh = await f.service.submitWork({...f.payload, runId: next.state.runId}, f.student.participantToken);
  assert.notEqual(fresh.work.imageId, old.work.imageId);
  gate.release(); await cleaning;
  assert.equal((await f.service.artwork({code: f.room.code, participantId: '1', workId: f.payload.work.id}, f.room.teacherToken)).preview, png);
  assert.equal((await f.service.state({code: f.room.code, participantId: '1'}, f.student.participantToken)).completedWorks[0].runId, next.state.runId);
});

test('cleanup requires its server secret and never accepts classroom capabilities or query authorization', async () => {
  const f = await completedFixture(); await f.service.submitWork(f.payload, f.student.participantToken); f.advance(WORK_RETENTION_MS);
  const secret = randomBytes(32).toString('base64url'), handler = createCleanupHandler({store: f.store, now: f.service.now, secret: () => secret});
  for (const options of [{}, {auth: f.room.teacherToken}, {auth: f.student.participantToken}, {query: {secret}}, {headers: {authorization: `bearer ${secret}`}}]) {
    assert.equal((await request(handler, options)).statusCode, 401);
  }
  assert.equal((await request(handler, {method: 'POST', auth: secret})).statusCode, 405);
  for (const configured of [undefined, '', 'too-short']) {
    const unavailable = createCleanupHandler({store: f.store, now: f.service.now, secret: () => configured});
    assert.equal((await request(unavailable, {headers: {authorization: `Bearer ${configured}`}})).statusCode, 401);
  }
  const cleaned = await request(handler, {auth: secret});
  assert.equal(cleaned.statusCode, 200); assert.equal(cleaned.body.cleaned, true); assert.equal(cleaned.headers['Cache-Control'], 'private, no-store');
  assert.ok(![...f.store.records.keys()].some(key => key.includes('/artworks/')));
  assert.ok(!JSON.stringify(cleaned.body).includes(secret)); assert.ok(!JSON.stringify(cleaned.body).includes(f.student.student.name));
});

test('paginated Blob cleanup removes overdue orphan images only in its own environment and respects changed image versions', async () => {
  const beforeEnvironment = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = 'production';
    const f = await completedFixture(); await f.service.submitWork(f.payload, f.student.participantToken); f.advance(WORK_RETENTION_MS);
    const root = `${classroomPrefix()}/${f.room.code}/`, oldPath = `${root}artworks/1/orphan.json`, youngPath = `${root}artworks/1/young.json`, replacedPath = `${root}artworks/1/replaced.json`;
    const foreignPath = `classroom-v1/preview/${f.room.code}/artworks/1/foreign.json`, aliasPath = `${classroomPrefix()}/aliases/tapten.json`;
    const oldTime = f.service.now() - WORK_RETENTION_MS;
    await f.store.create(oldPath, {preview: png, submittedAt: oldTime});
    await f.store.create(youngPath, {preview: png, submittedAt: f.service.now()});
    const replaced = await f.store.create(replacedPath, {preview: png, submittedAt: oldTime});
    await f.store.update(replacedPath, {preview: png, submittedAt: f.service.now()}, replaced.etag);
    await f.store.create(foreignPath, {preview: png, submittedAt: oldTime});
    await f.store.create(aliasPath, {code: f.room.code, updatedAt: oldTime});
    const metadata = async key => ({pathname: key, uploadedAt: new Date((await f.store.read(key)).data.submittedAt ?? oldTime), etag: (await f.store.read(key)).etag});
    const pages = [
      {blobs: [await metadata(foreignPath), await metadata(`${root}room.json`), await metadata(aliasPath)], hasMore: true, cursor: 'next-page'},
      {blobs: [await metadata(oldPath), await metadata(youngPath), {...await metadata(replacedPath), uploadedAt: new Date(oldTime), etag: replaced.etag}], hasMore: false},
    ];
    const adapter = new BlobClassroomStore(), calls = [];
    adapter.sdk = async () => ({list: async options => { calls.push(options); return pages.shift(); }});
    adapter.read = f.store.read.bind(f.store); adapter.list = f.store.list.bind(f.store); adapter.delete = f.store.delete.bind(f.store);
    adapter.update = f.store.update.bind(f.store); adapter.deleteMany = keys => Promise.all(keys.map(key => f.store.delete(key)));
    const cleanup = await new ClassroomService(adapter, {now: f.service.now}).cleanupExpiredWorks();
    assert.equal(cleanup.cleaned, true); assert.equal(calls.length, 2); assert.equal(calls[1].cursor, 'next-page');
    for (const call of calls) assert.equal(call.prefix, 'classroom-v1/production/');
    assert.equal(await f.store.read(oldPath), null);
    assert.deepEqual((await f.store.read(`${root}participants/1.json`)).data.works, []);
    for (const key of [youngPath, replacedPath, foreignPath, aliasPath, `${root}room.json`]) assert.ok(await f.store.read(key), `${key} must survive`);
  } finally { if (beforeEnvironment === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = beforeEnvironment; }
});

test('legacy image paths expire and retired receipts preserve the ten-work limit only for the current run', async () => {
  const f = await completedFixture();
  const first = await f.service.submitWork(f.payload, f.student.participantToken);
  const root = `${classroomPrefix()}/${f.room.code}/`, studentPath = `${root}participants/1.json`, current = await f.store.read(studentPath);
  const modernImage = `${root}artworks/1/${first.work.imageId}.json`, legacyImage = `${root}artworks/1/${first.work.id}.json`;
  await f.store.create(legacyImage, {preview: png}); await f.store.delete(modernImage);
  delete current.data.works[0].imageId; await f.store.update(studentPath, current.data, current.etag);
  for (let index = 2; index <= 10; index++) await f.service.submitWork({...f.payload, work: rawWork({id: `finished-${index}`})}, f.student.participantToken);
  f.advance(WORK_RETENTION_MS);
  await f.service.state({code: f.room.code, participantId: '1'}, f.student.participantToken);
  assert.equal(await f.store.read(legacyImage), null);
  assert.equal((await f.store.read(studentPath)).data.retiredWorks.ids.length, 10);
  await rejectsCode(f.service.submitWork({...f.payload, work: rawWork({id: 'extra-work'})}, f.student.participantToken), 'work-limit');
  await f.control('pause'); const next = await f.control('start', 3);
  await f.service.submitWork({...f.payload, runId: next.state.runId}, f.student.participantToken);
  f.advance(WORK_RETENTION_MS);
  await f.service.state({code: f.room.code, participantId: '1'}, f.student.participantToken);
  const receipts = (await f.store.read(studentPath)).data.retiredWorks;
  assert.equal(receipts.runId, next.state.runId); assert.equal(receipts.ids.length, 1);
});

test('filesystem deletion serializes with an in-flight update and rejects deletion of a changed image version', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'celadon-expiration-'));
  try {
    const store = new FileClassroomStore(directory), key = `${classroomPrefix()}/ABC234/participants/1.json`;
    const created = await store.create(key, {works: [], answers: {1: 'original'}});
    const originalRead = store.read.bind(store), gate = barrier(); let held = false;
    store.read = async path => {
      const value = await originalRead(path);
      if (!held && path === key) { held = true; gate.reached(); await gate.blocked; }
      return value;
    };
    const updating = store.update(key, {works: [], answers: {1: 'changed'}}, created.etag); await gate.ready;
    const deleting = store.delete(key); gate.release(); await Promise.all([updating, deleting]);
    assert.equal(await store.read(key), null, 'a late update must not recreate a deleted participant');
    const image = `${classroomPrefix()}/ABC234/artworks/1/image.json`, previous = await store.create(image, {preview: 'old'});
    await store.update(image, {preview: 'new'}, previous.etag);
    await assert.rejects(store.delete(image, previous.etag), StoreConflict);
    assert.equal((await store.read(image)).data.preview, 'new');
  } finally { await rm(directory, {recursive: true, force: true}); }
});

test('Blob deletion sends the listed image version and converts a provider precondition failure into a safe conflict', async () => {
  const adapter = new BlobClassroomStore(), calls = [], {BlobPreconditionFailedError} = await import('@vercel/blob');
  adapter.sdk = async () => ({BlobPreconditionFailedError, del: async (key, options) => {
    calls.push({key, options}); if (options.ifMatch === 'outdated') throw new BlobPreconditionFailedError();
  }});
  const key = `${classroomPrefix()}/ABC234/artworks/1/image.json`;
  await adapter.delete(key, 'listed-version');
  assert.equal(calls[0].options.ifMatch, 'listed-version');
  await assert.rejects(adapter.delete(key, 'outdated'), StoreConflict);
});

test('beauty observation is teacher-started after comparison and preserves the three country answers', async () => {
  const f = await fixture(), child = await f.join(1), code = f.room.code;
  await rejectsCode(f.control('start-beauty'), 'beauty-after-comparison');
  await rejectsCode(f.service.control({code, command: 'start-beauty'}, child.participantToken), 'teacher-auth');
  const comparison = await f.control('start', 1);
  await rejectsCode(f.control('start-beauty'), 'already-active');
  const answers = {'1': 'japan', '2': 'yuan', '3': 'goryeo'};
  await f.service.answer({code, participantId: '1', runId: comparison.state.runId, activity: 1, clientRevision: 1, answers, final: true}, child.participantToken);
  await f.control('pause'); const beauty = await f.control('start-beauty');
  assert.equal(beauty.state.activity, 1); assert.equal(beauty.state.activity1Stage, 'beauty');
  assert.equal(beauty.state.runs[1], comparison.state.runId); assert.equal(beauty.state.runs.beauty, beauty.state.runId);
  assert.notEqual(beauty.state.runId, comparison.state.runId); assert.equal(beauty.state.endsAt - beauty.state.startedAt, 90000);
  const before = await f.service.state({code, participantId: '1'}, child.participantToken);
  assert.deepEqual(before.answers[1].answers, answers); assert.equal(before.answers[1].submitted, true);
  assert.equal(before.beautyAnswer.text, '');
  await rejectsCode(f.service.answer({code, participantId: '1', runId: beauty.state.runId, activity: 1, clientRevision: 2, answers}, child.participantToken), 'activity-closed');
  await rejectsCode(f.service.beautyAnswer({code, participantId: '1', runId: comparison.state.runId, clientRevision: 1, text: '맑은 빛깔'}, child.participantToken), 'activity-closed');
});

test('beauty responses form an anonymous phrase cloud with actual frequency and independent completion', async () => {
  const f = await fixture(), code = f.room.code, students = await Promise.all([f.join(1, '첫째'), f.join(2, '둘째'), f.join(3, '셋째')]);
  await f.control('start', 1); await f.control('pause'); const beauty = await f.control('start-beauty');
  const texts = ['은은한 푸른빛', '은은한 푸른빛.', '학 무늬가 섬세해요'];
  for (let i = 0; i < students.length; i++) await f.service.beautyAnswer({code, participantId: students[i].participantId, runId: beauty.state.runId, clientRevision: 1, text: texts[i], final: i < 2}, students[i].participantToken);
  const teacher = await f.service.overview({code}, f.room.teacherToken), link = await f.control('observer-link'), observer = await f.service.observe({code}, link.observerToken);
  assert.deepEqual(teacher.beauty.words, [{text: '은은한 푸른빛', count: 2}, {text: '학 무늬가 섬세해요', count: 1}]);
  assert.equal(teacher.beauty.respondents, 3); assert.equal(teacher.beauty.total, 3); assert.equal(teacher.beauty.submitted, 2);
  assert.deepEqual(observer.beauty, teacher.beauty); assert.equal(teacher.participants[0].beautySubmitted, true); assert.equal(teacher.participants[2].beautyComplete, true);
  for (const name of ['첫째', '둘째', '셋째']) assert.ok(!JSON.stringify(observer).includes(name));
  assert.ok(!JSON.stringify(observer).includes('participantToken'));
  const own = await f.service.state({code, participantId: '1'}, students[0].participantToken);
  assert.equal(own.beautyAnswer.text, texts[0]); assert.ok(!JSON.stringify(own).includes(texts[2])); assert.ok(!('beauty' in own));
});

test('beauty done validates input, survives reentry, rejects later edits and resets only its own run', async () => {
  const f = await fixture(), child = await f.join(1), code = f.room.code;
  const comparison = await f.control('start', 1); await f.control('pause'); const beauty = await f.control('start-beauty');
  const payload = {code, participantId: '1', runId: beauty.state.runId, clientRevision: 1, text: ''};
  await rejectsCode(f.service.beautyAnswer({...payload, final: true}, child.participantToken), 'incomplete-answer');
  await rejectsCode(f.service.beautyAnswer({...payload, text: {}}, child.participantToken), 'invalid-answer');
  await rejectsCode(f.service.beautyAnswer({...payload, clientRevision: 0}, child.participantToken), 'invalid-revision');
  const saved = await f.service.beautyAnswer({...payload, text: '  학과 구름이 어우러져요\n  ', final: true}, child.participantToken);
  assert.equal(saved.beautyAnswer.text, '학과 구름이 어우러져요'); assert.equal(saved.beautyAnswer.submitted, true);
  const stale = await f.service.beautyAnswer({...payload, text: '늦은 자동 저장'}, child.participantToken); assert.equal(stale.ignored, true); assert.equal(stale.beautyAnswer.submitted, true);
  await rejectsCode(f.service.beautyAnswer({...payload, clientRevision: 2, text: '바꾼 답'}, child.participantToken), 'answer-submitted');
  const rejoined = await f.service.join({code, number: 1, name: '학생', participantToken: child.participantToken}); assert.deepEqual(rejoined.beautyAnswer, saved.beautyAnswer);
  await f.control('pause'); const repeated = await f.control('start-beauty');
  assert.notEqual(repeated.state.runId, beauty.state.runId); assert.equal(repeated.state.runs[1], comparison.state.runId);
  assert.equal((await f.service.state({code, participantId: '1'}, child.participantToken)).beautyAnswer.text, '');
  assert.equal((await f.service.overview({code}, f.room.teacherToken)).beauty.respondents, 0);
  await rejectsCode(f.service.beautyAnswer({...payload, clientRevision: 3, text: '이전 활동 답'}, child.participantToken), 'activity-closed');
  await f.control('pause'); const restarted = await f.control('start', 1);
  assert.equal(restarted.state.activity1Stage, 'comparison'); assert.equal(restarted.state.runs.beauty, undefined);
});

test('beauty has its own configurable deadline and late writes stay closed in manual transition mode', async () => {
  for (const autoPause of [true, false]) {
    const f = await fixture({beautyDuration: 5, autoPause}), child = await f.join(1), code = f.room.code;
    await f.control('start', 1); await f.control('pause'); const beauty = await f.control('start-beauty');
    const payload = {code, participantId: '1', runId: beauty.state.runId, clientRevision: 1, text: '둥근 어깨가 아름다워요'};
    f.advance(4999); await f.service.beautyAnswer(payload, child.participantToken); f.advance(1);
    await rejectsCode(f.service.beautyAnswer({...payload, clientRevision: 2, final: true}, child.participantToken), 'activity-closed');
    const state = await f.service.state({code, participantId: '1'}, child.participantToken);
    assert.equal(state.state.status, autoPause ? 'paused' : 'active'); assert.equal(state.beautyAnswer.submitted, false);
    await f.control('pause'); await f.control('start', 2);
    await rejectsCode(f.service.beautyAnswer({...payload, clientRevision: 3}, child.participantToken), 'activity-closed');
  }
  for (const beautyDuration of [0, 4, 1801, 'invalid']) await rejectsCode(fixture({beautyDuration}), 'invalid-duration');
});

test('a delayed beauty autosave cannot undo a confirmed done response', async () => {
  const f = await fixture(), child = await f.join(1), code = f.room.code;
  await f.control('start', 1); await f.control('pause'); const beauty = await f.control('start-beauty');
  const payload = {code, participantId: '1', runId: beauty.state.runId, text: '학이 날아가는 것 같아요'}, gate = barrier(), update = f.store.update.bind(f.store); let held = false;
  f.store.update = async (key, data, etag) => {
    if (!held && key.endsWith('/participants/1.json') && data.beautyAnswer?.clientRevision === 1) { held = true; gate.reached(); await gate.blocked; }
    return update(key, data, etag);
  };
  const delayed = f.service.beautyAnswer({...payload, clientRevision: 1}, child.participantToken); await gate.ready;
  const done = await f.service.beautyAnswer({...payload, clientRevision: 2, final: true}, child.participantToken);
  gate.release(); const result = await delayed; assert.equal(result.ignored, true); assert.deepEqual(result.beautyAnswer, done.beautyAnswer);
});

test('beauty API enforces student capabilities, bounds written text, and protects teacher controls', async () => {
  const f = await fixture(), child = await f.join(1), other = await f.join(2), code = f.room.code;
  await f.control('start', 1); await f.control('pause'); const beauty = await f.control('start-beauty');
  const handler = createClassroomHandler({store: f.store, now: f.service.now});
  const payload = {action: 'beauty-answer', code, participantId: '1', runId: beauty.state.runId, clientRevision: 1, text: '가'.repeat(350)};
  for (const auth of [undefined, other.participantToken, f.room.teacherToken]) assert.equal((await request(handler, {method: 'POST', payload, auth})).statusCode, 403);
  const saved = await request(handler, {method: 'POST', payload, auth: child.participantToken});
  assert.equal(saved.statusCode, 200); assert.equal(saved.body.beautyAnswer.text.length, 300);
  assert.equal((await request(handler, {method: 'POST', payload: {action: 'control', code, command: 'start-beauty'}, auth: child.participantToken})).statusCode, 403);
});

test('work uploads retain the original game deadline and cannot extend it with a duplicate', async () => {
  const f = await completedFixture(), expiresAt = f.service.now() + 1000, payload = {...f.payload, expiresAt};
  const first = await f.service.submitWork(payload, f.student.participantToken);
  assert.equal(first.work.expiresAt, expiresAt); assert.match(first.work.imageId, /-x[0-9a-z]+$/);
  const duplicate = await f.service.submitWork({...payload, expiresAt: expiresAt + WORK_RETENTION_MS}, f.student.participantToken);
  assert.equal(duplicate.work.expiresAt, expiresAt);
  f.advance(999); assert.equal((await f.service.overview({code: f.room.code}, f.room.teacherToken)).works.length, 1);
  f.advance(1); assert.equal((await f.service.overview({code: f.room.code}, f.room.teacherToken)).works.length, 0);
  await rejectsCode(f.service.submitWork(payload, f.student.participantToken), 'work-expired');
  assert.ok(![...f.store.records.keys()].some(key => key.includes('/artworks/')));
  const late = await completedFixture();
  const capped = await late.service.submitWork({...late.payload, expiresAt: late.service.now() + 2 * WORK_RETENTION_MS}, late.student.participantToken);
  assert.equal(capped.work.expiresAt, capped.work.submittedAt + WORK_RETENTION_MS);
});

test('a game upload that crosses its original expiry during persistence is removed before returning success', async () => {
  for (const kind of ['image', 'summary']) {
    const f = await completedFixture(), expiresAt = f.service.now() + 1000, gate = barrier(); let held = false;
    const method = kind === 'image' ? 'create' : 'update', original = f.store[method].bind(f.store);
    f.store[method] = async (key, data, ...args) => {
      if (!held && (kind === 'image' ? key.includes('/artworks/') : key.endsWith('/participants/1.json') && data.works.length === 1)) { held = true; gate.reached(); await gate.blocked; }
      return original(key, data, ...args);
    };
    const pending = f.service.submitWork({...f.payload, expiresAt}, f.student.participantToken); await gate.ready;
    f.advance(1000); gate.release(); await rejectsCode(pending, 'work-expired');
    assert.ok(![...f.store.records.keys()].some(key => key.includes('/artworks/')));
    assert.deepEqual((await f.service.state({code: f.room.code, participantId: '1'}, f.student.participantToken)).completedWorks, []);
  }
});

test('metadata cleanup honors an orphan upload original deadline before its 24-hour upload age', async () => {
  const f = await fixture(), expiresAt = f.service.now() + 1000, prefix = `${classroomPrefix()}/${f.room.code}/artworks/1/`;
  const expired = `${prefix}${'a'.repeat(32)}-x${expiresAt.toString(36)}.json`, young = `${prefix}${'b'.repeat(32)}-x${(expiresAt + 1000).toString(36)}.json`;
  for (const key of [expired, young]) await f.store.create(key, {preview: png, submittedAt: f.service.now(), expiresAt});
  f.advance(1000); await f.service.cleanupExpiredWorks();
  assert.equal(await f.store.read(expired), null); assert.ok(await f.store.read(young));
});

function detailedWork() {
  return rawWork({modelId: 'pillow', width: 1.1, viewFrame: 13, decorPhase: 2, clay: {slip: 'dark'},
    placements: [{x: 180, y: 190, uv: [.4, .6], pattern: 'crane', stampSize: 1.6, surfaceAngle: Math.PI + .3, surfaceV: .53, surfaceRadius: .2}],
    strokes: [{points: Array.from({length: 512}, (_, index) => ({uv: [.4 + index / 10000, .6], surfaceAngle: Math.PI + index / 1000, surfaceV: .53, surfaceRadius: .2}))}],
    inlay: {slip: 'dark', fillDone: true, wipeDone: true, fill: ['48:25', '49:25'], wipe: ['48:25']}});
}

test('private artwork preserves complete rendering data for authorized readers without changing scores or public summaries', async () => {
  const f = await completedFixture(), other = await f.join(2), observer = await f.control('observer-link'), original = detailedWork();
  const payload = classroomWorkPayload(original), design = sanitizeWorkDesign(original);
  payload.design.participantToken = 'must-not-be-stored'; payload.design.placements[0].studentName = 'must-not-be-stored';
  const submitted = await f.service.submitWork({...f.payload, work: payload}, f.student.participantToken);
  assert.equal(submitted.work.designVersion, 1); assert.equal(submitted.work.score, evaluateWork(original).total);
  assert.equal(submitted.work.explanationScore, 17);
  const query = {code: f.room.code, participantId: '1', workId: original.id};
  const observerQuery = {...query, participantId: (await f.service.observe({code: f.room.code}, observer.observerToken)).works[0].participantId};
  for (const [bearer, artworkQuery] of [[f.student.participantToken, query], [f.room.teacherToken, query], [observer.observerToken, observerQuery]]) {
    const artifact = await f.service.artwork(artworkQuery, bearer);
    assert.equal(artifact.preview, png); assert.deepEqual(artifact.design, design);
    assert.equal(artifact.design.strokes[0].points.length, 512);
  }
  await rejectsCode(f.service.artwork(query, other.participantToken), 'student-auth');
  const summary = (await f.service.overview({code: f.room.code}, f.room.teacherToken)).works[0];
  assert.equal(summary.designVersion, 1);
  for (const field of ['design', 'placements', 'strokes', 'inlay', 'preview']) assert.equal(summary[field], undefined);
  const student = (await f.store.read(`${classroomPrefix()}/${f.room.code}/participants/1.json`)).data;
  assert.ok(!JSON.stringify(student).includes('surfaceRadius'));
  assert.ok(!JSON.stringify([...f.store.records.values()]).includes('must-not-be-stored'));
  f.advance(WORK_RETENTION_MS);
  await rejectsCode(f.service.artwork(query, f.room.teacherToken), 'work-not-found');
  assert.ok(!JSON.stringify([...f.store.records.values()]).includes('surfaceRadius'));
});

test('the API accepts a complete 40-stroke drawing above the old preview-only body limit', async () => {
  const f = await completedFixture(), work = detailedWork();
  work.strokes = Array.from({length: 40}, () => ({points: Array.from({length: 512}, (_, index) => ({
    uv: [.4000000000000001 + index / 100000, .6000000000000001], surfaceAngle: Math.PI + index / 10000,
    surfaceV: .5300000000000001, surfaceRadius: .2000000000000001,
  }))}));
  const packet = {action: 'work', ...f.payload, work: classroomWorkPayload(work)};
  const bytes = Buffer.byteLength(JSON.stringify(packet)); assert.ok(bytes > 800000); assert.ok(bytes < MAX_CLASSROOM_BODY_BYTES);
  const response = await request(createClassroomHandler({store: f.store, now: f.service.now}), {method: 'POST', payload: packet, auth: f.student.participantToken});
  assert.equal(response.statusCode, 200); assert.equal(response.body.work.designVersion, 1);
  const artifact = await f.service.artwork({code: f.room.code, participantId: '1', workId: work.id}, f.room.teacherToken);
  assert.equal(artifact.design.strokes.length, 40); assert.ok(artifact.design.strokes.every(stroke => stroke.points.length === 512));
});

test('malformed or mismatched renderer designs cannot enter private artwork storage', async () => {
  for (const mutate of [design => {design.modelId = '../../secret';}, design => {design.shape = 'stool';}, design => {design.technique = 'openwork';}, design => {design.strokes[0].points[0].surfaceAngle = Infinity;}]) {
    const f = await completedFixture(), work = classroomWorkPayload(detailedWork()); mutate(work.design);
    await rejectsCode(f.service.submitWork({...f.payload, work}, f.student.participantToken), 'invalid-design');
    assert.ok(![...f.store.records.keys()].some(key => key.includes('/artworks/')));
  }
});

test('an original resend backfills legacy rendering once without changing the preview, scores, or original expiry', async () => {
  const f = await completedFixture(), original = detailedWork(), expiresAt = f.service.now() + 10000;
  const legacy = classroomWorkPayload(original); delete legacy.design;
  const initial = await f.service.submitWork({...f.payload, work: legacy, expiresAt}, f.student.participantToken);
  const query = {code: f.room.code, participantId: '1', workId: original.id}, key = `${classroomPrefix()}/${f.room.code}/artworks/1/${initial.work.imageId}.json`;
  assert.equal((await f.service.artwork(query, f.room.teacherToken)).design, null);
  f.advance(1000);
  const changed = classroomWorkPayload(detailedWork()); changed.title = '바뀐 제목';
  await f.service.submitWork({...f.payload, work: changed, expiresAt: expiresAt + 1000}, f.student.participantToken);
  assert.equal((await f.service.artwork(query, f.room.teacherToken)).design, null, 'different content is not an original resend');
  const replacementPreview = `data:image/png;base64,${Buffer.concat([Buffer.from(png.split(',')[1], 'base64'), Buffer.from([0])]).toString('base64')}`;
  const restored = await f.service.submitWork({...f.payload, work: classroomWorkPayload(original), preview: replacementPreview, expiresAt: expiresAt + WORK_RETENTION_MS}, f.student.participantToken);
  assert.equal(restored.duplicate, true); assert.deepEqual(restored.work, {...initial.work, designVersion: 1});
  const artifact = await f.store.read(key);
  assert.equal(artifact.data.preview, png); assert.equal(artifact.data.submittedAt, initial.work.submittedAt); assert.equal(artifact.data.expiresAt, expiresAt);
  assert.deepEqual(artifact.data.design, sanitizeWorkDesign(original));
  const modifiedDesign = classroomWorkPayload(original); modifiedDesign.design.placements[0].stampSize = .5;
  await f.service.submitWork({...f.payload, work: modifiedDesign, expiresAt: expiresAt + WORK_RETENTION_MS}, f.student.participantToken);
  assert.deepEqual(await f.store.read(key), artifact, 'a stored rendering is immutable');
  f.advance(9000); await rejectsCode(f.service.artwork(query, f.room.teacherToken), 'work-not-found');
  assert.equal(await f.store.read(key), null);
});

test('a rendering backfill racing expiry or classroom deletion cannot recreate private data', async () => {
  for (const action of ['expire', 'delete']) {
    const f = await completedFixture(), original = detailedWork(), legacy = classroomWorkPayload(original); delete legacy.design;
    await f.service.submitWork({...f.payload, work: legacy, expiresAt: f.service.now() + 1000}, f.student.participantToken);
    const gate = barrier(), originalUpdate = f.store.update.bind(f.store); let held = false;
    f.store.update = async (key, data, etag) => {
      if (!held && key.includes('/artworks/') && data.design) { held = true; gate.reached(); await gate.blocked; }
      return originalUpdate(key, data, etag);
    };
    const backfill = f.service.submitWork({...f.payload, work: classroomWorkPayload(original)}, f.student.participantToken); await gate.ready;
    if (action === 'expire') { f.advance(1000); await f.service.state({code: f.room.code, participantId: '1'}, f.student.participantToken); }
    else await f.control('delete');
    gate.release(); await rejectsCode(backfill, action === 'expire' ? 'work-expired' : 'room-not-found');
    assert.ok(![...f.store.records.keys()].some(key => key.includes('/artworks/')));
    assert.ok(!JSON.stringify([...f.store.records.values()]).includes('surfaceRadius'));
  }
});

test('legacy rendering backfill never recreates a missing artifact or accepts an old activity run', async () => {
  const f = await completedFixture(), original = detailedWork(), legacy = classroomWorkPayload(original); delete legacy.design;
  const initial = await f.service.submitWork({...f.payload, work: legacy}, f.student.participantToken);
  const key = `${classroomPrefix()}/${f.room.code}/artworks/1/${initial.work.imageId}.json`;
  await f.store.delete(key);
  const resent = await f.service.submitWork({...f.payload, work: classroomWorkPayload(original)}, f.student.participantToken);
  assert.equal(resent.work.designVersion, undefined); assert.equal(await f.store.read(key), null);
  await f.control('pause'); await f.control('start', 3);
  await rejectsCode(f.service.submitWork({...f.payload, work: classroomWorkPayload(original)}, f.student.participantToken), 'activity-closed');
  assert.equal(await f.store.read(key), null);
});
