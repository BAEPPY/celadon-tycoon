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
async function saved(page) {return page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);}
async function seed(page, draft) {
  await page.goto(base);
  await page.evaluate(({key,draft}) => localStorage.setItem(key, JSON.stringify({history:['royal-rest'],gallery:[],draft})), {key:KEY,draft});
  await page.reload();await page.click('[data-action=start]');await page.waitForSelector('.counter-scene');
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
    assert.match(await page.locator('.name-scaffold').innerText(),/청자[\s\S]*상감[\s\S]*운학문[\s\S]*베개/);
    assert.match(await page.inputValue('#work-title'),/청자 상감 운학문 베개/);
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
    assert.match(await page.locator('.assessment-notice').innerText(),/기본 기준 평가/);
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
    assert.deepEqual(errors,[]);
    console.log('Naming scaffold, 40% hints, no checks, real API rejection/acceptance, stale-score invalidation, saved title, safe text, and character review passed.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
