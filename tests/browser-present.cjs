/* Presentation window (/present): one screen of the site under a thin bar, opened from a slide button. It asks for
   one click to fill the screen, "슬라이드로 돌아가기" closes it, and only the game, a 3D model or a live board can be
   shown. Run after npm run build against a local server.mjs. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

const base=process.env.BASE_URL||'http://127.0.0.1:4173';

(async()=>{
  assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use a local server.');
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
  const errors=[];
  try{
    // An ordinary browser window: smaller than the screen, so the page asks for one click to fill it.
    const context=await browser.newContext({viewport:{width:1280,height:660},screen:{width:1280,height:720}});
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${base}/present?open=game`);
    assert.equal(await page.title(),'청자 만들기 게임 · 청자 교실 발표 창');assert.equal(await page.locator('#title').innerText(),'청자 만들기 게임');
    assert.equal(await page.locator('#stage').getAttribute('src'),'/game');assert.equal(await page.locator('#stage').getAttribute('allow'),'fullscreen');
    await page.frameLocator('#stage').locator('.game-window').waitFor({timeout:30000});
    assert.equal(await page.locator('#start').isVisible(),true);assert.match(await page.locator('#start').innerText(),/화면을 한 번 눌러 주세요/);
    assert.equal(await page.locator('#full').isVisible(),true);
    // The screen below the bar belongs to the game; nothing scrolls or spills.
    const layout=await page.evaluate(()=>{const bar=document.querySelector('#bar').getBoundingClientRect(),stage=document.querySelector('#stage').getBoundingClientRect();
      return {bar:bar.height,top:stage.top,bottom:stage.bottom,width:stage.width,scroll:document.documentElement.scrollHeight<=innerHeight&&document.documentElement.scrollWidth<=innerWidth};});
    assert.deepEqual(layout,{bar:34,top:34,bottom:660,width:1280,scroll:true});
    assert.equal(await page.evaluate(()=>document.body.className),'','a mouse-and-keyboard screen keeps the thin bar at the top');
    await page.locator('#start').click();
    await page.waitForFunction(()=>Boolean(document.fullscreenElement));
    assert.equal(await page.locator('#start').isVisible(),false);assert.equal(await page.locator('#full').isVisible(),false,'nothing to fill once it fills the screen');
    // Leaving full screen (Esc) brings the fill button back, not the big prompt.
    await page.evaluate(()=>document.exitFullscreen());await page.waitForFunction(()=>!document.fullscreenElement);
    assert.equal(await page.locator('#full').isVisible(),true);assert.equal(await page.locator('#start').isVisible(),false);
    // A presenter remote: one PageDown only warns, a second within two seconds goes back. The key also works after the game was clicked.
    await page.evaluate(()=>{window.__closed=0;window.close=()=>{window.__closed++;};});
    await page.keyboard.press('PageDown');
    assert.match(await page.locator('#note').innerText(),/한 번 더 누르면 슬라이드로 돌아가요/);assert.equal(await page.evaluate(()=>window.__closed),0);
    await page.frameLocator('#stage').locator('.game-window').click({position:{x:20,y:200}});
    await page.waitForTimeout(2100);
    await page.keyboard.press('PageUp');assert.equal(await page.evaluate(()=>window.__closed),0,'a slip long after the first press does not close it');
    await page.keyboard.press('PageDown');await page.waitForFunction(()=>window.__closed===1);
    // If the browser will not let the page close the window, it says which key does.
    await page.locator('#back').click();
    await page.waitForFunction(()=>/Alt\+F4/.test(document.querySelector('#note').textContent)&&!document.querySelector('#note').hidden);
    assert.equal(await page.evaluate(()=>window.__closed),2);
    await page.close();

    // A window opened for this page alone really closes, which is what returns the slide show to the front.
    const opener=await context.newPage();await opener.goto(`${base}/present?open=model&id=observation-5`);
    const [popup]=await Promise.all([context.waitForEvent('page'),opener.evaluate(base=>{window.open(`${base}/present?open=game`,'_blank');},base)]);
    popup.on('pageerror',error=>errors.push(error.message));await popup.locator('#back').waitFor();
    await Promise.all([popup.waitForEvent('close'),popup.locator('#back').click()]);
    // Only the fixed list can be shown: a 3D model by its blind name, a live board of a class with its key, else the game.
    assert.equal(await opener.locator('#stage').getAttribute('src'),'/model?id=observation-5');assert.equal(await opener.locator('#title').innerText(),'청자 돌려 보기');
    const shown=async address=>{await opener.goto(`${base}/present${address}`);return {src:await opener.locator('#stage').getAttribute('src'),title:await opener.locator('#title').innerText()};};
    assert.deepEqual(await shown('?open=model&id=../../teacher'),{src:'/model?id=beauty',title:'청자 돌려 보기'});
    const key='k'.repeat(43);
    assert.deepEqual(await shown(`?open=works&code=${encodeURIComponent('탑텐반')}#key=${key}`),{src:`/observe?code=${encodeURIComponent('탑텐반')}&show=works#key=${key}`,title:'완성작 모음'});
    assert.deepEqual(await shown(`?open=compare&code=${encodeURIComponent('탑텐반')}#key=${key}`),{src:`/observe?code=${encodeURIComponent('탑텐반')}&show=compare#key=${key}`,title:'비슷한 주문끼리 비교'});
    assert.deepEqual(await shown(`?open=follow&code=abc234#key=${key}`),{src:`/observe?code=ABC234&board=1#key=${key}`,title:'지금 활동 따라가기'});
    assert.deepEqual(await shown('?open=comparison&code=%3Cscript%3E#key=short'),{src:`/observe?code=${encodeURIComponent('탑텐반')}&show=comparison`,title:'세 나라 비교 결과'});
    for(const address of ['','?open=https://example.com','?open=//example.com/x','?open=teacher','?open=javascript:alert(1)'])assert.deepEqual(await shown(address),{src:'/game',title:'청자 만들기 게임'},address);
    await context.close();

    // A window that already fills the screen (opened that way from the slide) starts at once, without the prompt.
    const filled=await (await browser.newContext({viewport:{width:1280,height:720},screen:{width:1280,height:720}})).newPage();filled.on('pageerror',error=>errors.push(error.message));
    await filled.goto(`${base}/present?open=game`);await filled.frameLocator('#stage').locator('.game-window').waitFor({timeout:30000});
    assert.equal(await filled.locator('#start').isVisible(),false);assert.equal(await filled.locator('#full').isVisible(),false);assert.equal(await filled.locator('#back').isVisible(),true);
    await filled.context().close();

    // A touch screen (an interactive whiteboard): large buttons at the bottom edge, where a hand reaches; the game
    // keeps everything above. ⇅ moves the bar, and the choice is kept for the next time.
    const board=await (await browser.newContext({viewport:{width:1920,height:1000},screen:{width:1920,height:1080},hasTouch:true})).newPage();board.on('pageerror',error=>errors.push(error.message));
    await board.goto(`${base}/present?open=game`);await board.frameLocator('#stage').locator('.game-window').waitFor({timeout:30000});
    const places=()=>board.evaluate(()=>{const box=name=>{const r=document.querySelector(name).getBoundingClientRect();return {top:Math.round(r.top),bottom:Math.round(r.bottom),height:Math.round(r.height)};};
      return {body:document.body.className,bar:box('#bar'),back:box('#back'),move:box('#move'),stage:box('#stage'),start:box('#start')};});
    let touch=await places();
    assert.equal(touch.body,'big below');assert.deepEqual(touch.bar,{top:940,bottom:1000,height:60});assert.deepEqual(touch.stage,{top:0,bottom:940,height:940});
    assert.ok(touch.back.height>=44&&touch.move.height>=44,'buttons are large enough for a finger');assert.equal(touch.start.bottom,940,'the start prompt leaves the bar free');
    await board.locator('#start').tap();await board.waitForFunction(()=>Boolean(document.fullscreenElement));
    await board.evaluate(()=>document.exitFullscreen());await board.waitForFunction(()=>!document.fullscreenElement);
    await board.locator('#move').tap();touch=await places();
    assert.equal(touch.body,'big');assert.deepEqual([touch.bar.top,touch.stage.top,touch.stage.bottom],[0,60,1000]);
    await board.reload();await board.locator('#back').waitFor();assert.equal((await places()).body,'big','the bar stays where it was put');
    await board.locator('#move').tap();assert.equal((await places()).body,'big below');
    // Without a keyboard the hint names the ✕ of the window.
    await board.evaluate(()=>{window.close=()=>{};});await board.locator('#back').tap();
    await board.waitForFunction(()=>/위쪽의 ✕를 눌러/.test(document.querySelector('#note').textContent)&&!document.querySelector('#note').hidden);
    assert.deepEqual(errors,[]);
    console.log('Presentation window: game under a thin bar, one click to fill the screen, fill button after Esc, remote keys (twice), closing a window opened for it, key hint when it cannot close, fixed list of screens, no prompt when already full screen, large bottom bar on a touch screen with a kept position passed.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
