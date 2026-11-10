/* Live board for projectors and PowerPoint slides: slide-sized observer board, pinned boards, automatic board layout
   inside another page (PowerPoint Web Viewer), ?key= fallback, and key-free links on the teacher's own computer.
   Run after npm run build against a local server.mjs, never a production class. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

const base=process.env.BASE_URL||'http://127.0.0.1:4173';
// A board checks the class every few seconds, but while it is still drawing its 3D models (slow without a graphics
// card, as in this test browser) the next check waits. These steps test that the board follows, not how fast.
const BOARD_WAIT=45000;
const privateName='보드비공개학생';

(async()=>{
  assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use an isolated local classroom server.');
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
  const errors=[];
  let teacher,room;
  const watch=(page,label)=>page.on('pageerror',error=>errors.push(`${label}: ${error.message}`));
  async function api(action,body={},{auth=room?.teacherToken,method='POST',status=200}={}){
    const data={action,...(room?{code:room.code}:{}),...body},headers=auth?{Authorization:`Bearer ${auth}`}:{};
    const response=method==='POST'?await teacher.request.post(`${base}/api/classroom`,{headers,data}):await teacher.request.get(`${base}/api/classroom`,{headers,params:data});
    const value=await response.json();assert.equal(response.status(),status,JSON.stringify(value));return value;
  }
  const control=(command,extra={})=>api('control',{command,...extra});
  const boardText=page=>page.locator('[data-testid=live-board]').innerText();
  try{
    const teacherContext=await browser.newContext({viewport:{width:1100,height:700}});
    await teacherContext.grantPermissions(['clipboard-read','clipboard-write'],{origin:base});
    teacher=await teacherContext.newPage();watch(teacher,'teacher');
    await teacher.goto(`${base}/teacher`);
    const created=teacher.waitForResponse(response=>response.url().endsWith('/api/classroom')&&response.request().method()==='POST'&&response.request().postDataJSON()?.action==='create');
    await teacher.locator('[data-form=create] button[type=submit]').click();room=await (await created).json();
    await teacher.locator('[data-action=observer-link]').waitFor();
    const student=await api('join',{code:'탑텐반',number:4,name:privateName},{auth:null});
    const a1=await control('start',{activity:1});
    await api('answer',{participantId:student.participantId,activity:1,runId:a1.state.runId,clientRevision:1,final:true,answers:{1:'japan',2:'yuan',3:'goryeo'}},{auth:student.participantToken});

    // A PowerPoint button on the teacher's computer: no key in the link, the teacher session there opens it.
    const pinned=await teacherContext.newPage();watch(pinned,'pinned board');
    await pinned.goto(`${base}/observe?code=${encodeURIComponent('탑텐반')}&show=comparison`);
    await pinned.locator('[data-testid=live-board] [data-comparison-result="1"]').waitFor({timeout:15000});
    assert.equal(await pinned.locator('.lesson-header,.teacher-sidebar,.teacher-stage-nav,.teacher-overview').count(),0,'the board has no page header, navigation or side panel');
    assert.match(await boardText(pinned),/세 나라 도자기 비교/);assert.match(await boardText(pinned),/참여\s*1\s*명/);
    assert.match(await pinned.locator('[data-comparison-result="3"]').innerText(),/100%/);
    assert.ok(!(await pinned.locator('body').innerText()).includes(privateName),'no student names on the projector');
    assert.equal(await pinned.locator('[data-action=start],[data-action=pause],[data-action=reveal],[data-action=game-timer]').count(),0,'the board has no class controls');
    const following=await teacherContext.newPage();watch(following,'following board');
    await following.goto(`${base}/observe?code=${encodeURIComponent('탑텐반')}&board=1`);
    await following.locator('[data-testid=live-board] [data-comparison-result="1"]').waitFor({timeout:15000});

    // An unpinned board follows the teacher to 아름다움 찾기; a pinned one keeps showing its board.
    await control('pause');await control('start-beauty');
    await following.locator('[data-testid=live-board] .beauty-board').waitFor({timeout:BOARD_WAIT});
    assert.match(await boardText(following),/고려청자의 아름다움 찾기/);
    await pinned.waitForTimeout(5000);
    assert.equal(await pinned.locator('[data-comparison-result="1"]').count(),1,'?show=comparison stays on the comparison results');

    // 수업 관리 → PPT 화면 새로고침 reloads every live board once (not again on later polls); ↻ reloads one board.
    const reloads=[following,pinned].map(page=>page.waitForEvent('load',{timeout:20000}));
    await teacher.click('.manage-menu>summary');await teacher.click('[data-action=refresh-boards]');
    await teacher.waitForFunction(()=>document.querySelector('#classroom-toast')?.textContent.includes('새로고침'));
    await Promise.all(reloads);
    await following.locator('[data-testid=live-board] .beauty-board').waitFor({timeout:BOARD_WAIT});
    await pinned.locator('[data-testid=live-board] [data-comparison-result="1"]').waitFor({timeout:15000});
    await following.evaluate(()=>{window.__stayed=true;});await following.waitForTimeout(6000);
    assert.equal(await following.evaluate(()=>window.__stayed),true,'a board reloads once per press, not on every poll');
    const reloadOne=pinned.waitForEvent('load',{timeout:20000});
    await pinned.locator('[data-action=board-reload]').click();await reloadOne;
    await pinned.locator('[data-testid=live-board] [data-comparison-result="1"]').waitFor({timeout:15000});

    // Inside another page (PowerPoint's Web Viewer), the observer link alone opens the board layout.
    const {observerToken,observerCode}=await control('observer-link');assert.equal(observerCode,'탑텐반');
    const link=`${base}/observe?code=${encodeURIComponent(observerCode)}#key=${observerToken}`;
    const slideContext=await browser.newContext({viewport:{width:1280,height:720}});
    const slide=await slideContext.newPage();watch(slide,'slide');
    await slide.goto(`${base}/assets/`).catch(()=>{});
    await slide.setContent(`<!doctype html><body style="margin:0;background:#ddd"><iframe title="board" src="${link}" style="position:absolute;left:60px;top:80px;width:960px;height:600px;border:0"></iframe></body>`);
    const frame=slide.frameLocator('iframe');
    await frame.locator('[data-testid=live-board] .beauty-board').waitFor({timeout:20000});
    assert.equal(await frame.locator('.lesson-header,.teacher-sidebar').count(),0,'framed pages switch to the board layout by themselves');
    const fits=await frame.locator('[data-testid=live-board]').evaluate(el=>document.documentElement.scrollWidth<=innerWidth+1&&el.getBoundingClientRect().width<=innerWidth+1);
    assert.ok(fits,'the board fits the slide frame without sideways scrolling');

    // Some embedders drop the #fragment: ?key= works too and moves out of the address.
    const fallbackContext=await browser.newContext({viewport:{width:1000,height:640}});
    const fallback=await fallbackContext.newPage();watch(fallback,'key fallback');
    await fallback.goto(`${base}/observe?code=${encodeURIComponent(observerCode)}&board=1&key=${observerToken}`);
    await fallback.locator('[data-testid=live-board]').waitFor({timeout:15000});
    const address=new URL(fallback.url());assert.equal(address.searchParams.has('key'),false);assert.equal(new URLSearchParams(address.hash.slice(1)).get('key'),observerToken);

    // Without a key or a teacher session the board says how to open it.
    const strangerContext=await browser.newContext();const stranger=await strangerContext.newPage();watch(stranger,'stranger');
    await stranger.goto(`${base}/observe?code=${encodeURIComponent('탑텐반')}&show=works`);
    await stranger.getByTestId('board-empty').waitFor({timeout:15000});
    assert.match(await stranger.getByTestId('board-empty').innerText(),/선생님 화면을 먼저 열어/);

    // The PPT link (수업 관리 → PPT용 주소 복사) lets a slide open the explanations, which reveals them to everyone;
    // a board with the observer QR explains why the button is closed and then follows the reveal.
    await control('pause');
    await teacher.click('.manage-menu>summary');await teacher.click('[data-action=copy-ppt-link]');
    await teacher.waitForFunction(()=>document.querySelector('#classroom-toast')?.textContent.includes('PPT용 주소'));
    const pptLink=await teacher.evaluate(()=>navigator.clipboard.readText());
    assert.match(pptLink,/\/observe\?code=%ED%83%91%ED%85%90%EB%B0%98#key=[A-Za-z0-9_-]{43}$/);assert.notEqual(new URL(pptLink).hash,new URL(link).hash);
    const watcherContext=await browser.newContext({viewport:{width:1000,height:640}});
    const watcher=await watcherContext.newPage();watch(watcher,'observer board');
    await watcher.goto(link.replace('#',`&show=comparison#`));
    await watcher.locator('[data-testid=live-board] [data-comparison-result="1"]').waitFor({timeout:15000});
    assert.equal(await watcher.locator('[data-action=teacher-result-view][data-view=exhibit]').isDisabled(),true);
    assert.match(await watcher.locator('.teacher-result-tabs').innerText(),/선생님이 정답을 공개하면 열려요/);
    const presenterContext=await browser.newContext({viewport:{width:1000,height:640}});
    const presenter=await presenterContext.newPage();watch(presenter,'PPT board');
    await presenter.goto(pptLink.replace('#',`&show=comparison#`));
    const explain=presenter.locator('[data-action=teacher-result-view][data-view=exhibit]');
    await explain.waitFor({timeout:15000});
    await presenter.waitForFunction(()=>!document.querySelector('[data-action=teacher-result-view][data-view=exhibit]')?.disabled,{},{timeout:15000});
    await explain.click();
    await presenter.getByTestId('exhibit-page').waitFor({timeout:15000});
    await watcher.getByTestId('exhibit-page').waitFor({timeout:15000});
    assert.equal(await presenter.locator('[data-action=start],[data-action=pause],[data-action=game-timer],.manage-menu').count(),0,'the PPT link has no class controls');
    await watcherContext.close();await presenterContext.close();

    // Activity 3: the works board shows finished works without names, with the countdown when a timer is set.
    const a3=await control('start',{activity:3});
    const preview=await teacher.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=120;canvas.height=120;const ctx=canvas.getContext('2d');ctx.fillStyle='#88ae8d';ctx.fillRect(30,15,60,90);return canvas.toDataURL('image/png');});
    const work={id:'board-work',orderId:'royal-rest',shape:'pillow',modelId:'pillow',step:4,technique:'inlay',pattern:'crane',title:'학이 쉬는 청자 베개',placements:[{x:100,y:100,pattern:'crane'}],strokes:[],decorDone:true,firing:['dry','biscuit','glaze','fire'],clay:{slip:'white'},explanationUse:'학 무늬를 넣은 베개예요. 머리를 받치고 쉬면 좋아요.',explanationBeauty:'학 무늬를 파고 흰 흙을 채워 또렷하게 만들었어요.'};
    await api('work',{participantId:student.participantId,runId:a3.state.runId,work,preview},{auth:student.participantToken});
    await control('game-timer',{seconds:300});
    const works=await teacherContext.newPage();watch(works,'works board');
    await works.goto(`${base}/observe?code=${encodeURIComponent('탑텐반')}&show=works`);
    await works.locator('[data-testid=live-board] .work-card').waitFor({timeout:15000});
    assert.match(await boardText(works),/완성작\s*1\s*점/);assert.match(await boardText(works),/남은 시간/);
    assert.ok(!(await works.locator('body').innerText()).includes(privateName));
    await following.locator('[data-testid=live-board] .work-card').waitFor({timeout:15000});

    // 비슷한 주문끼리 비교하기 (?show=compare): works whose orders asked for the same use stand side by side on one
    // screen, the largest group first, with the order and what was made in words — still without names.
    const friend=await api('join',{code:'탑텐반',number:5,name:'비교친구'},{auth:null}),other=await api('join',{code:'탑텐반',number:6,name:'매병친구'},{auth:null});
    await api('work',{participantId:friend.participantId,runId:a3.state.runId,work:{...work,id:'board-work-2',orderId:'lady-cloud-rest',pattern:'cloud',title:'구름 베개',placements:[{x:100,y:100,pattern:'cloud'}],explanationUse:'구름 무늬를 넣은 베개예요. 누워서 쉴 때 머리를 받쳐요.',explanationBeauty:'구름 무늬를 파고 흰 흙을 채워 또렷하게 만들었어요.'},preview},{auth:friend.participantToken});
    await api('work',{participantId:other.participantId,runId:a3.state.runId,work:{...work,id:'board-work-3',orderId:'royal-crane-vessel',shape:'maebyeong',modelId:'maebyeong',title:'학 매병',explanationUse:'학 무늬를 넣은 매병이에요. 귀한 술을 담아 두면 좋아요.'},preview},{auth:other.participantToken});
    const compare=await teacherContext.newPage();watch(compare,'compare board');
    await compare.setViewportSize({width:1280,height:720});
    await compare.goto(`${base}/observe?code=${encodeURIComponent('탑텐반')}&show=compare`);
    const board=compare.getByTestId('compare-board');await board.waitFor({timeout:15000});
    await compare.waitForFunction(()=>document.querySelectorAll('.compare-card').length===2&&!document.querySelector('.compare-card .image-wait'),null,{timeout:BOARD_WAIT});
    assert.deepEqual(await compare.locator('.compare-groups button').evaluateAll(buttons=>buttons.map(button=>[button.innerText.replace(/\s+/g,' ').trim(),button.getAttribute('aria-pressed')])),[['베개 2','true'],['매병 1','false']]);
    assert.match(await board.locator('.compare-head').innerText(),/청자 베개 주문\s*2점[\s\S]*누워서 쉴 때 머리를 받칩니다[\s\S]*같은 점과 다른 점/);
    assert.deepEqual(await compare.locator('.compare-card').evaluateAll(cards=>cards.map(card=>[card.querySelector('h3').textContent,...[...card.querySelectorAll('.compare-facts dd')].map(item=>item.textContent)])),
      [['학이 쉬는 청자 베개','왕실 · 학 무늬 · 상감','학 무늬 · 상감'],['구름 베개','귀족 부인 · 구름 무늬 · 상감','구름 무늬 · 상감']]);
    // One slide: nothing scrolls, the pictures are equally tall and nothing is cut off inside a card.
    const fit=await compare.evaluate(()=>({page:document.documentElement.scrollHeight<=innerHeight&&document.documentElement.scrollWidth<=innerWidth,
      pictures:[...new Set([...document.querySelectorAll('.compare-card .work-preview')].map(node=>Math.round(node.getBoundingClientRect().height)))].length,
      inside:[...document.querySelectorAll('.compare-details')].every(node=>node.scrollHeight<=node.clientHeight+1),bottom:Math.round(document.querySelector('.compare-cards').getBoundingClientRect().bottom)}));
    assert.deepEqual({page:fit.page,pictures:fit.pictures,inside:fit.inside},{page:true,pictures:1,inside:true});assert.ok(fit.bottom<=720&&fit.bottom>660,`the cards reach the bottom of the slide (${fit.bottom})`);
    assert.equal(await compare.locator('.works-toolbar,[data-action=works-view]').count(),0,'a pinned comparison has no other view');
    for(const name of [privateName,'비교친구','매병친구'])assert.ok(!(await compare.locator('body').innerText()).includes(name));
    // The other group, and one work enlarged.
    await compare.locator('.compare-groups button',{hasText:'매병'}).click();
    assert.match(await board.locator('.compare-head').innerText(),/청자 매병 주문\s*1점[\s\S]*한 명이 받았어요/);assert.equal(await compare.locator('.compare-card').count(),1);
    await compare.locator('.compare-card [data-action=view-work]').click();await compare.locator('.work-dialog[open]').waitFor();
    assert.match(await compare.locator('.work-dialog').innerText(),/학 매병/);await compare.locator('[data-close-work]').click();
    // A following board has both views one tap apart.
    await following.locator('[data-action=works-view][data-view=compare]').click();await following.getByTestId('compare-board').waitFor();
    await following.locator('[data-action=works-view][data-view=all]').click();await following.locator('.work-card').first().waitFor();
    assert.deepEqual(errors,[]);
    console.log('Live board: key-free board on the teacher computer, pinned and following boards, teacher refresh and ↻ reload, PPT link revealing explanations, automatic layout inside a slide frame, ?key fallback, empty state, anonymous works with countdown and the similar-order comparison on one slide passed.');
  }finally{
    if(room&&teacher)await api('control',{command:'delete'}).catch(()=>{});
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
