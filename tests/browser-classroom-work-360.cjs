/* The real game bridge, classroom API and teacher viewer retain one complete design. */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const work = {
  id: 'faithful-student-work', customerId: 'king', orderId: 'royal-crane-vessel', accepted: true,
  shape: 'maebyeong', modelId: 'cloudCraneMaebyeong', step: 4, technique: 'inlay', pattern: 'crane',
  title: '구름 사이를 나는 학', width: 1.08, viewFrame: 0, knead: 3, decorPhase: 2, decorDone: true,
  clay: {body: true, prepared: true, kneads: 6, slip: 'white'},
  inlay: {slip: 'white', fill: [], wipe: [], fillDone: true, wipeDone: true},
  placements: [
    {x: 180, y: 180, uv: [.5, .5], surfaceAngle: 0, surfaceV: .5, surfaceRadius: .25, pattern: 'crane', stampSize: 1.65, renderer: 'illustration-2d'},
    {x: 180, y: 180, uv: [.5, .5], surfaceAngle: Math.PI, surfaceV: .5, surfaceRadius: .25, pattern: 'lotus', stampSize: .65, renderer: 'illustration-2d'},
  ],
  strokes: [{renderer: 'illustration-2d', points: Array.from({length: 12}, (_, i) => ({
    x: 140 + i * 4, y: 225, uv: [(140 + i * 4) / 360, .625],
    surfaceAngle: -.3 + i * .06, surfaceV: .625 + Math.sin(i) * .015, surfaceRadius: .2,
  }))}],
  firing: ['dry', 'biscuit', 'glaze', 'fire'], inspection: {done: true},
  explanationUse: '학과 연꽃 무늬를 넣은 병이에요. 물이나 꽃을 담아 두는 데 쓰면 좋아요.',
  explanationBeauty: '앞에는 큰 학을, 뒤에는 작은 연꽃을 새기고 흰 흙을 채운 뒤 닦았어요.',
  preview: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><path d="M15 3h10v6c18 10 4 20 3 28H12C11 29-3 19 15 9Z" fill="#91ab98"/></svg>'),
};

(async () => {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
  const browser = await chromium.launch({headless: true, ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}), args: ['--no-sandbox']});
  let room, teacher;
  const errors = [];
  try {
    const teacherContext = await browser.newContext({viewport: {width: 1366, height: 768}, reducedMotion: 'reduce'});
    teacher = await teacherContext.newPage();
    teacher.on('pageerror', error => errors.push(error.message));
    const api = async (action, body = {}, method = 'POST') => {
      const data = {action, ...(room ? {code: room.code} : {}), ...body};
      const headers = room ? {Authorization: `Bearer ${room.teacherToken}`} : {};
      const response = method === 'GET'
        ? await teacher.request.get(`${base}/api/classroom`, {params: data, headers})
        : await teacher.request.post(`${base}/api/classroom`, {data, headers});
      const value = await response.json();
      assert.equal(response.status(), 200, JSON.stringify(value));return value;
    };
    room = await api('create');
    const started = await api('control', {command: 'start', activity: 3});
    const student = await browser.newPage({viewport: {width: 1366, height: 768}, reducedMotion: 'reduce'});
    student.on('pageerror', error => errors.push(error.message));
    await student.goto(`${base}/lesson?code=${room.code}`);
    const key = `celadon-tycoon-v2:classroom:${room.code}:8:run:${started.state.runId}`;
    const retentionStartedAt = Date.now();
    await student.evaluate(({key, work, retentionStartedAt}) => localStorage.setItem(key, JSON.stringify({
      history: ['royal-crane-vessel'], gallery: [work], draft: null, sound: false, retentionStartedAt,
    })), {key, work, retentionStartedAt});
    const upload = student.waitForResponse(response => {
      if (response.request().method() !== 'POST' || !response.url().endsWith('/api/classroom')) return false;
      return response.request().postDataJSON()?.action === 'work';
    });
    await student.locator('[name=number]').fill('8');
    await student.locator('[name=name]').fill('작품시험');
    await student.locator('[data-form=join] button[type=submit]').click();
    const uploaded = await upload;
    assert.equal(uploaded.status(), 200, await uploaded.text());
    const packet = uploaded.request().postDataJSON();
    assert.equal(packet.expiresAt, retentionStartedAt + 86400000);
    assert.equal(packet.work.design.version, 1);
    assert.equal(packet.work.design.strokes[0].points.length, 12, 'actual iframe transfer retains the entire drawing');
    const artifact = await api('artwork', {participantId: '8', workId: work.id}, 'GET');
    assert.equal(artifact.design.placements[1].surfaceAngle, Math.PI);
    assert.equal(artifact.design.placements[0].stampSize, 1.65);
    assert.equal(artifact.design.strokes[0].points.length, 12);
    assert.equal(artifact.design.width, 1.08);
    assert.equal(artifact.design.inlay.fillDone, true);
    assert.equal(artifact.design.participantToken, undefined);
    const overview = await api('teacher', {}, 'GET');
    assert.equal(overview.works[0].designVersion, 1);
    assert.equal(overview.works[0].design, undefined, 'polling stays a small summary');

    await teacher.goto(`${base}/teacher`);
    await teacher.evaluate(value => localStorage.setItem('celadon-classroom-teacher-v1', JSON.stringify(value)), {code: room.code, teacherToken: room.teacherToken});
    await teacher.reload();
    await teacher.locator(`[data-work-id="${work.id}"] [data-action=view-work]`).click();
    const dialog = teacher.locator('dialog.work-dialog[open]');
    const viewport = dialog.locator('.illustration-viewport[data-status=ready]');
    await viewport.waitFor();
    await teacher.evaluate(() => document.fonts.ready);
    assert.match(await dialog.innerText(), /구름 사이를 나는 학/);
    assert.match(await dialog.innerText(), /뒤에는 작은 연꽃/);
    const image = async () => {
      await teacher.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      return viewport.locator('canvas').evaluate(canvas => canvas.toDataURL());
    };
    const front = await image();
    for (let i = 0; i < 12; i++) {await dialog.locator('[data-work-view=right]').click();await viewport.waitFor();}
    assert.equal(await dialog.locator('[data-work-view-angle]').innerText(), '180°');
    assert.notEqual(await image(), front, 'the back is a different saved design, not a spin of one photograph');
    for (let i = 0; i < 12; i++) {await dialog.locator('[data-work-view=right]').click();await viewport.waitFor();}
    assert.equal(await image(), front, 'a complete turn retains the original front exactly');
    const before = await viewport.getAttribute('data-object-box');
    await dialog.locator('[data-work-view=zoom-in]').click();
    assert.equal(await dialog.locator('[data-work-view-zoom]').innerText(), '120%');
    assert.notEqual(await viewport.getAttribute('data-object-box'), before);
    await dialog.locator('[data-work-view=reset]').click();
    assert.equal(await dialog.locator('[data-work-view-zoom]').innerText(), '100%');
    await teacher.screenshot({path: '/tmp/classroom-student-work-360.png'});
    const saved = await student.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    assert.deepEqual(saved.gallery[0].placements, work.placements, 'teacher viewing cannot change the student save');
    assert.deepEqual(saved.gallery[0].strokes, work.strokes);
    const after = await api('artwork', {participantId: '8', workId: work.id}, 'GET');
    assert.deepEqual(after.design, artifact.design, 'rotation and zoom never write back the submitted work');
    await teacher.keyboard.press('Escape');await dialog.waitFor({state: 'detached'});
    assert.deepEqual(errors, []);
    console.log('Actual game iframe -> authenticated API -> teacher 360° viewer: complete strokes, front/back stamps and sizes, zoom, unchanged original design and original expiry passed.');
  } finally {
    if (room && teacher) await teacher.request.post(`${base}/api/classroom`, {headers: {Authorization: `Bearer ${room.teacherToken}`}, data: {action: 'control', code: room.code, command: 'delete'}}).catch(() => {});
    await browser.close();
  }
})().catch(error => {console.error(error);process.exitCode = 1;});
