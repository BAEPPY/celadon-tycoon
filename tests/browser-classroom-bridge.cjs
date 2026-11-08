const assert = require('node:assert/strict');
const path = require('node:path');
const {build} = require('esbuild');
const {chromium} = require('playwright');

(async () => {
  const bundle = await build({entryPoints:[path.join(__dirname, '../classroom-game-bridge.js')], bundle:true, write:false, format:'iife', globalName:'ClassroomBridge'});
  const browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}), args:['--no-sandbox']});
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.clock.install();
    await page.route('http://classroom.test/**', route => {
      const child = new URL(route.request().url()).searchParams.has('classroom');
      route.fulfill({contentType:'text/html', body:child
        ? `<body><button id="game">게임</button><script>${bundle.outputFiles[0].text}</script><script>
            window.calls={pause:0,resume:0};window.gallery=[];
            window.bridge=ClassroomBridge.createClassroomGameBridge({onPause:()=>calls.pause++,onResume:()=>calls.resume++,getCompleted:()=>gallery});
          </script></body>`
        : '<body><script>window.messages=[];addEventListener("message",event=>messages.push(event.data));</script><iframe src="/?classroom=1&room=ABCDEF&student=student-1&run=run-1"></iframe></body>'});
    });
    await page.goto('http://classroom.test/');
    const frame = page.frames().find(item => item.url().includes('classroom=1'));
    await frame.waitForFunction(() => window.bridge);
    await page.waitForFunction(() => messages.some(message => message.type === 'celadon:ready'));
    assert.deepEqual(await frame.evaluate(() => ({active:bridge.active, ...calls})), {active:false,pause:1,resume:0});

    await frame.evaluate(() => {
      for (const [origin, source] of [[location.origin,window],['https://untrusted.test',parent]]) {
        dispatchEvent(new MessageEvent('message',{origin,source,data:{type:'celadon:classroom-state',active:true,runId:'spoof'}}));
      }
    });
    assert.equal(await frame.evaluate(() => bridge.active), false, 'wrong origin or source cannot unlock the game');
    const send = data => page.evaluate(data => document.querySelector('iframe').contentWindow.postMessage(data,location.origin),data);
    const state = async (active, milliseconds=300000) => {
      const now = await page.evaluate(() => Date.now());
      await send({type:'celadon:classroom-state',active,runId:'run-1',serverNow:now,endsAt:now+milliseconds});
      await frame.waitForFunction(active => bridge.active === active, active);
    };
    await state(true);
    assert.equal(await frame.locator('#classroom-game-pause').isVisible(),false);
    await frame.evaluate(async () => {
      const preview='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#8db6a1"/></svg>');
      const complete={id:'completed-1',step:4,preview};
      window.gallery=[complete,{id:'draft-1',step:3,preview}];
      await bridge.completed(gallery[1]);
      await bridge.completed(complete);
    });
    await page.waitForFunction(() => messages.some(message => message.type === 'celadon:completed'));
    const completed = await page.evaluate(() => messages.filter(message => message.type === 'celadon:completed'));
    assert.equal(completed.length,1);
    assert.equal(completed[0].work.id,'completed-1');
    assert.equal(completed[0].runId,'run-1');
    assert.match(completed[0].preview,/^data:image\/(?:png|webp);base64,/);
    assert.ok(Buffer.from(completed[0].preview.split(',')[1],'base64').length<=300*1024);
    const dimensions = await frame.evaluate(async source => {const image=new Image();image.src=source;await image.decode();return [image.width,image.height];},completed[0].preview);
    assert.deepEqual(dimensions,[480,360]);
    await send({type:'celadon:request-completed'});
    await page.waitForFunction(() => messages.filter(message => message.type === 'celadon:completed').length===2);
    await state(false);
    await frame.evaluate(() => bridge.completed(gallery[0]));
    assert.equal(await page.evaluate(() => messages.filter(message => message.type === 'celadon:completed').length),2);
    assert.equal(await frame.locator('#classroom-game-pause').isVisible(),true);

    await state(true,1000);
    await page.clock.fastForward(1500);
    assert.equal(await frame.evaluate(() => bridge.active),false,'the local deadline stops the game without another parent event');
    await state(true);
    await page.clock.fastForward(16000);
    assert.equal(await frame.evaluate(() => bridge.active),false,'missing parent heartbeat stops the game');
    assert.match(await frame.locator('#classroom-game-pause').innerText(),/수업 연결/);
    await state(true);
    await send({type:'celadon:classroom-state',active:true,runId:'replacement-run'});
    await frame.waitForFunction(()=>!bridge.active);
    assert.equal(await frame.evaluate(()=>bridge.active),false,'a stale iframe cannot upload its gallery under a replacement run');
    await state(true);
    await frame.evaluate(() => bridge.dispose());
    assert.equal(await frame.locator('#classroom-game-pause').count(),0);
    assert.deepEqual(errors,[]);
    console.log('Classroom bridge: origin/source validation, completed-only raster transport, reconnect, teacher pause, deadline and heartbeat passed.');
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exit(1);});
