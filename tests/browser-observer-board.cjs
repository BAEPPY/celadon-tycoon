/* Live board for projectors and PowerPoint slides: slide-sized observer board, pinned boards, automatic board layout
   inside another page (PowerPoint Web Viewer), ?key= fallback, and key-free links on the teacher's own computer.
   Run after npm run build against a local server.mjs, never a production class. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

const base=process.env.BASE_URL||'http://127.0.0.1:4173';
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
    await following.locator('[data-testid=live-board] .beauty-board').waitFor({timeout:15000});
    assert.match(await boardText(following),/고려청자의 아름다움 찾기/);
    await pinned.waitForTimeout(5000);
    assert.equal(await pinned.locator('[data-comparison-result="1"]').count(),1,'?show=comparison stays on the comparison results');

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

    // Activity 3: the works board shows finished works without names, with the countdown when a timer is set.
    await control('pause');const a3=await control('start',{activity:3});
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
    assert.deepEqual(errors,[]);
    console.log('Live board: key-free board on the teacher computer, pinned and following boards, automatic layout inside a slide frame, ?key fallback, empty state and anonymous works with countdown passed.');
  }finally{
    if(room&&teacher)await api('control',{command:'delete'}).catch(()=>{});
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
