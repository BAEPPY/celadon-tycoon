// Finished works' pictures as JPEG for the PowerPoint add-in's old-engine board (api/work-picture.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {previewAsJpeg, PICTURE_BACKGROUND} from './work-picture.js';
import {createWorkPictureHandler} from './api/work-picture.js';
import {ClassroomService} from './classroom-domain.js';
import {StoreConflict, classroomPrefix} from './classroom-store.js';
import {assessmentFingerprint} from './assessment-rules.js';

class MemoryStore {
  records = new Map(); sequence = 0;
  async read(key) { return this.records.has(key) ? structuredClone(this.records.get(key)) : null; }
  async create(key, data) { if (this.records.has(key)) throw new StoreConflict(); const etag = String(++this.sequence); this.records.set(key, {data: structuredClone(data), etag}); return {etag}; }
  async update(key, data, etag) { if (this.records.get(key)?.etag !== etag) throw new StoreConflict(); const next = String(++this.sequence); this.records.set(key, {data: structuredClone(data), etag: next}); return {etag: next}; }
  async list(prefix) { return [...this.records.keys()].filter(key => key.startsWith(prefix)); }
  async delete(key) { this.records.delete(key); }
}
// A vessel-coloured oval on a see-through background, like the game's snapshot.
const picture = format => sharp({create: {width: 240, height: 180, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}})
  .composite([{input: Buffer.from('<svg width="240" height="180"><ellipse cx="120" cy="95" rx="55" ry="70" fill="#88ae8d"/></svg>'), top: 0, left: 0}])
  .toFormat(format).toBuffer().then(data => `data:image/${format};base64,${data.toString('base64')}`);
const pixels = async url => { const {data, info} = await sharp(Buffer.from(url.split(',')[1], 'base64')).raw().toBuffer({resolveWithObject: true}); return {info, at: (x, y) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)]}; };
const near = (actual, expected, tolerance = 8) => actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance);
const work = () => {
  const value = {id: 'finished-1', step: 4, orderId: 'royal-rest', shape: 'pillow', technique: 'inlay', pattern: 'crane', modelId: '', drawingLabel: '', clay: {slip: 'white'}, title: '쉬어 가는 베개',
    placements: [{x: 0.4, y: 0.5, pattern: 'crane'}], strokes: [], decorDone: true, firing: ['dry', 'biscuit', 'glaze', 'fire'],
    explanationUse: '머리를 받치는 베개예요.\n편하게 누워서 쉬기 좋아요.', explanationBeauty: '학 무늬를 파고 흰 흙을 채워 넣었어요.\n여러 번 다듬어 또렷하게 만들었어요.'};
  value.assessment = {version: 1, source: 'ai', fingerprint: assessmentFingerprint(value), accepted: true, use: {score: 8, feedback: '모양과 쓰임을 설명했어요.'}, beauty: {score: 9, feedback: '만든 과정을 설명했어요.'}};
  return value;
};
const call = async (handler, query, token, method = 'GET') => {
  const res = {headers: {}, setHeader(name, value) { this.headers[name.toLowerCase()] = value; }, end(text) { this.body = JSON.parse(text); }};
  await handler({method, url: `/api/work-picture?${new URLSearchParams(query)}`, headers: token ? {authorization: `Bearer ${token}`} : {}}, res);
  return res;
};

test('a stored WebP or PNG picture becomes a JPEG on the colour of the picture frame', async () => {
  for (const format of ['webp', 'png']) {
    const jpeg = await previewAsJpeg(await picture(format));
    assert.match(jpeg, /^data:image\/jpeg;base64,/);
    const image = await pixels(jpeg);
    assert.deepEqual([image.info.width, image.info.height, image.info.format], [240, 180, 'raw']);
    const frame = [0xf5, 0xf1, 0xe6]; assert.equal(PICTURE_BACKGROUND, '#f5f1e6');
    assert.ok(near(image.at(4, 4), frame), 'the see-through corner takes the frame colour');
    assert.ok(near(image.at(120, 95), [0x88, 0xae, 0x8d]), 'the vessel keeps its colour');
  }
});

test('pictures that cannot be read, or a server without the image library, give nothing instead of failing', async () => {
  const webp = await picture('webp');
  for (const bad of [null, 42, '', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/webp;base64,AAAA', 'data:image/jpeg;base64,/9j/', `data:image/png;base64,${'A'.repeat(410004)}`, `${webp} `]) assert.equal(await previewAsJpeg(bad), null);
  assert.equal(await previewAsJpeg(webp, {load: () => Promise.reject(new Error('not installed'))}), null);
  // A picture built to exhaust memory is refused by its size in pixels.
  const huge = await sharp({create: {width: 3000, height: 3000, channels: 3, background: '#88ae8d'}}).webp({quality: 1}).toBuffer();
  assert.ok(huge.length < 300 * 1024); assert.equal(await previewAsJpeg(`data:image/webp;base64,${huge.toString('base64')}`), null);
});

test('the picture address follows the same access rules as the classroom API and never stores anything', async () => {
  const store = new MemoryStore(), service = new ClassroomService(store), room = await service.create({});
  const student = await service.join({code: room.code, number: 3, name: '봄샘'}), other = await service.join({code: room.code, number: 5, name: '하늘'});
  const game = await service.control({code: room.code, command: 'start', activity: 3}, room.teacherToken);
  await service.submitWork({code: room.code, participantId: student.participantId, runId: game.state.runId, work: work(), preview: await picture('webp')}, student.participantToken);
  const {observerToken} = await service.control({code: room.code, command: 'observer-link'}, room.teacherToken);
  const observed = (await service.observe({code: room.code}, observerToken)).works[0];
  const handler = createWorkPictureHandler({store}), records = store.records.size;
  const query = {code: room.code, participantId: String(student.participantId), workId: 'finished-1', _: '123'};
  // The teacher, the student who made it, and an observer (through the anonymous reference) get the JPEG.
  for (const [who, params, token] of [['teacher', query, room.teacherToken], ['student', query, student.participantToken], ['observer', {...query, participantId: observed.participantId}, observerToken]]) {
    const res = await call(handler, params, token);
    assert.equal(res.statusCode, 200, who); assert.equal(res.body.converted, true); assert.match(res.body.preview, /^data:image\/jpeg;base64,/);
    assert.equal(res.headers['cache-control'], 'private, no-store'); assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
    assert.ok(!JSON.stringify(res.body).includes('봄샘'), 'no name travels with the picture');
  }
  // Another student, a stranger and a missing work are refused exactly as the classroom API refuses them.
  assert.equal((await call(handler, query, other.participantToken)).statusCode, 403);
  assert.equal((await call(handler, query, '')).statusCode, 403);
  assert.equal((await call(handler, {...query, workId: 'no-such-work'}, room.teacherToken)).statusCode, 404);
  assert.equal((await call(handler, query, room.teacherToken, 'POST')).statusCode, 405);
  assert.equal(store.records.size, records, 'nothing is written');
  // Where conversion is not possible the stored picture comes back unchanged and says so.
  const plain = await call(createWorkPictureHandler({store, convert: async () => null}), query, room.teacherToken);
  assert.equal(plain.body.converted, false); assert.match(plain.body.preview, /^data:image\/webp;base64,/);
  // ?check=1 tells whether this server can convert, without touching any class.
  assert.deepEqual((await call(createWorkPictureHandler({store: {read() { throw new Error('the store is not used'); }}}), {check: '1'})).body, {conversion: true});
  assert.deepEqual((await call(createWorkPictureHandler({convert: async () => null}), {check: '1'})).body, {conversion: false});
  assert.ok(classroomPrefix());
});
