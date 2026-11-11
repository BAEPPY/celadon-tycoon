const {enterGame}=require('./game-entry.cjs');
/* Run against the real local /api/assess route; no mocked scoring response. */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const KEY = 'celadon-tycoon-v2', base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const work = {
  id: 'assessment-browser', orderId: 'royal-rest', customerId: 'king', accepted: true,
  shape: 'pillow', modelId: 'pillow', step: 3, stationView: 'counter-delivery',
  width: 1, knead: 3, viewFrame: 0, technique: 'inlay', pattern: 'crane',
  placements: [{x:180,y:180,uv:[.45,.5],pattern:'cloud'}, {x:190,y:190,uv:[.6,.5],pattern:'crane'}], strokes: [],
  decorPhase: 2, decorDone: true, firing: ['dry','biscuit','glaze','fire'],
  clay: {body:true,slip:'white',kneads:6,prepared:true},
  inspection: {done:true}, explanationUse:'', explanationBeauty:'',
  preview: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect x="10" y="25" width="80" height="45" rx="12" fill="#9db497"/></svg>'),
};
const useReason = '구름과 학 무늬가 있는 베개를 만들었어요. 누워서 잘 때 쓰면 좋겠어요.';
const beautyReason = '구름을 파고 흰 흙을 채운 다음 여러 번 닦아 무늬가 선명하게 보이게 했어요.';
const shortIncenseUse = '연꽃무늬를 넣고, 향로예요';
const shortIncenseBeauty = '따뜻한 손길로 곳곳에 연꽃무늬를 넣는데 신경 썼다. 투각기법을 사용했다.';
async function saved(page) {return page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);}
async function seed(page, draft) {
  await page.goto(new URL('/game', base).href);
  await page.evaluate(({key,draft}) => localStorage.setItem(key, JSON.stringify({history:[draft.orderId],gallery:[],draft})), {key:KEY,draft});
  await page.reload();await enterGame(page,'start');await page.waitForSelector('.counter-scene');
}
(async () => {
  const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}),args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:1366,height:768}}), errors=[], api=[];
    page.on('pageerror', e=>errors.push(e.message));
    page.on('response', async response=>{if(new URL(response.url()).pathname==='/api/assess'&&response.request().method()==='POST')api.push(await response.json());});
    await seed(page,work);await page.click('[data-action=explain]');
    await page.waitForSelector('.explanation-popup[open]');
    assert.equal(await page.locator('.explanation-popup input[type=checkbox]').count(),0);
    assert.match(await page.locator('label[for=explain-use]').innerText(), /어떤 모양과 문양[\s\S]*어디에 쓰면/);
    assert.match(await page.locator('label[for=explain-beauty]').innerText(), /어느 부분에 가장 공[\s\S]*어떻게 만들었는지/);
    assert.equal(await page.locator('.name-scaffold,#title-motif,[data-action=suggest-title]').count(),0);
    assert.equal(await page.inputValue('#work-title'),'');
    assert.equal(await page.getAttribute('#work-title','placeholder'),'내가 지은 작품 이름');
    assert.match(await page.locator('#naming-hint').innerText(),/재료.*만드는 방법.*무늬.*모양/);
    assert.doesNotMatch(await page.locator('.name-workshop').innerText(),/상감|운학문|베개/,'title hint does not reveal selected-work answers');
    await page.fill('#work-title','   ');await page.click('[data-action=submit]');
    assert.equal(api.length,0,'a blank title does not submit an automatic answer');
    assert.equal(await page.locator('#title-feedback').innerText(),'작품에 붙이고 싶은 이름을 적어 주세요.');
    assert.equal(await page.locator('#work-title').getAttribute('aria-invalid'),'true');
    assert.equal(await page.locator('#work-title').evaluate(el=>el===document.activeElement),true);
    await page.fill('#work-title','구름이 쉬어 가는 곳');
    await page.click('[data-action=close-popup]');await page.click('[data-action=explain]');
    assert.equal(await page.inputValue('#work-title'),'구름이 쉬어 가는 곳','reopening preserves the learner’s own title');
    for(const id of ['#explain-use','#explain-beauty']) {
      assert.match(await page.getAttribute(id,'placeholder'),/때문/);
      const style=await page.locator(id).evaluate(el=>({color:getComputedStyle(el,'::placeholder').color,opacity:getComputedStyle(el,'::placeholder').opacity}));
      assert.ok(style.color.includes('0.4')&&style.opacity==='1','hint uses 40% ink opacity');
    }
    for(const [width,height] of [[1366,768],[1024,600]]) {
      await page.setViewportSize({width,height});
      await page.evaluate(()=>document.fonts.ready);
      const bounds=await page.locator('[data-action=submit]').boundingBox();
      assert.ok(bounds.y>=0&&bounds.y+bounds.height<=height,'submit remains on-screen');
      const dialog=await page.locator('.explanation-popup').evaluate(el=>({h:el.clientHeight,scroll:el.scrollHeight}));
      assert.ok(dialog.scroll<=dialog.h+2,'explanation form fits without its own scrolling');
    }
    await page.screenshot({path:'/tmp/assessment-form-1024.png'});
    await page.fill('#explain-use','ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ');
    await page.fill('#explain-beauty','아무 말이나 썼다. 오늘 점심은 피자다.');
    await page.click('[data-action=submit]');
    await page.waitForSelector('.explanation-popup.needs-revision');
    let state=await saved(page);
    assert.equal(state.draft.step,3);assert.equal(state.gallery.length,0);assert.equal(state.draft.assessment.accepted,false);
    assert.ok((await page.locator('#use-feedback').innerText()).length>10);
    assert.match(await page.locator('.assessment-notice').innerText(),/기본 기준/);
    await page.fill('#explain-use',useReason);
    assert.equal((await saved(page)).draft.assessment,null,'editing invalidates rejected assessment');
    await page.fill('#explain-beauty',beautyReason);
    const title='<img src=x onerror="window.__titleXss=1">';
    await page.fill('#work-title',title);
    await page.click('[data-action=submit]');
    await page.waitForSelector('.customer-review-scene');
    assert.equal(await page.locator('#popup').evaluate(el=>el.open),false,'review is a full scene, not a score modal');
    state=await saved(page);
    assert.equal(state.draft.assessment.source,'rubric','local API clearly labels its fallback');
    assert.equal(state.draft.assessment.accepted,true);assert.ok(state.draft.assessment.use.score>=5&&state.draft.assessment.beauty.score>=5);
    assert.equal(state.gallery.length,1);assert.equal(state.gallery[0].title,title);assert.equal(state.gallery[0].customerId,'king');
    assert.match(await page.locator('.review-speaker').innerText(),/img src=x/);
    assert.equal(await page.evaluate(()=>window.__titleXss),undefined);
    assert.equal(await page.locator('.review-speaker img').count(),0);
    assert.equal(await page.locator('.reaction-portrait').count(),1);
    await page.click('[data-action=gallery]');
    assert.equal(await page.locator('.gallery-grid h3').innerText(),title);
    assert.equal(await page.locator('.gallery-grid h3 img').count(),0);
    await page.click('[data-action=close-popup]');
    assert.ok(api.length>=2);assert.equal(api[0].accepted,false);assert.equal(api.at(-1).accepted,true);

    // A brief, concrete revision like the learner's actual answer must also pass.
    const incense = {...work,id:'short-incense-assessment',customerId:'artisan',orderId:'lady-lotus-fragrance',shape:'incense',modelId:'incense',technique:'openwork',pattern:'lotus',
      placements:[{x:180,y:180,uv:[.45,.5],pattern:'lotus'}]};
    await seed(page,incense);
    assert.match(await page.locator('.counter-speech>span').innerText(),/도공 선생님의 질문/);
    assert.match(await page.locator('.counter-speech>p').innerText(),/혼자 여기까지 완성했구나/);
    await page.click('[data-action=explain]');
    assert.equal(await page.locator('.explanation-order h3').innerText(),'도공 선생님의 과제');
    assert.match(await page.locator('.explanation-order p').innerText(),/^이제 혼자 청자를 빚을 수 있는지 보겠다\./);
    await page.fill('#work-title','따뜻한 향기');
    await page.fill('#explain-use',shortIncenseUse);
    await page.fill('#explain-beauty','오늘 점심은 피자였어요.');
    await page.click('[data-action=submit]');
    await page.waitForSelector('.explanation-popup.needs-revision');
    state=await saved(page);
    assert.equal(state.draft.step,3);assert.equal(state.gallery.length,0);
    assert.ok(state.draft.assessment.use.score>=5,'the short shape and motif introduction already passes');
    assert.equal(state.draft.assessment.accepted,false,'unrelated second answer still needs revision');
    assert.match(await page.locator('.assessment-notice').innerText(),/기본 기준/);
    await page.fill('#explain-beauty',shortIncenseBeauty);
    assert.equal((await saved(page)).draft.assessment,null,'revising only the second answer clears the previous rejection');
    assert.equal(await page.inputValue('#explain-use'),shortIncenseUse,'the first answer does not need rewriting');
    await page.click('[data-action=submit]');
    await page.waitForSelector('.customer-review-scene');
    state=await saved(page);
    assert.equal(state.draft.step,4);assert.equal(state.draft.assessment.source,'rubric');
    assert.equal(state.draft.assessment.accepted,true);assert.ok(state.draft.assessment.use.score>=5&&state.draft.assessment.beauty.score>=5);
    assert.equal(state.gallery.length,1);assert.equal(state.gallery[0].explanationBeauty,shortIncenseBeauty);
    assert.equal(state.gallery[0].customerId,'artisan');
    assert.match(await page.locator('.review-speaker').innerText(),/도공 선생님의 평가/);
    assert.match(await page.locator('.review-score').innerText(),/과제·제작/);
    assert.doesNotMatch(await page.locator('.review-quote').innerText(),/주문|받겠소|고맙소|형편없소/);
    await page.locator('.reaction-portrait').evaluate(async image=>{await image.decode();await Promise.all(image.parentElement.getAnimations().map(animation=>animation.finished));});
    await page.screenshot({path:'/tmp/mentor-review-1024.png'});
    assert.equal(await page.locator('#popup').evaluate(el=>el.open),false);
    assert.equal(api.at(-1).accepted,true);
    assert.deepEqual(errors,[]);
    console.log('Blank learner title, generic naming hints, required-title feedback, real API rejection/revision, short incense explanation, saved title, safe text, and character review passed.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
