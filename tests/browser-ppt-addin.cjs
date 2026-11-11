/* PowerPoint content add-in page: panel picker, one-time observer link, per-instance settings through Office.js
   (stubbed here; PowerPoint itself is not available in CI) and the board shown without controls in a slide show.
   Run after npm run build against a local server.mjs, never a production class. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

const base=process.env.BASE_URL||'http://127.0.0.1:4173';
const OFFICE_JS='**/appsforoffice.microsoft.com/**';
// A minimal Office.js stand-in: one add-in instance with its own settings, reporting a chosen view.
const officeStub=view=>`window.__settings=window.__settings||{};window.__saved=0;window.__goto=[];window.Office={EventType:{ActiveViewChanged:'ActiveViewChanged'},Index:{Next:'next',Previous:'previous'},GoToType:{Index:'index'},
  onReady(callback){setTimeout(()=>callback({host:'PowerPoint'}),10);},
  context:{document:{settings:{get:k=>window.__settings[k]??null,set:(k,v)=>{window.__settings[k]=v;},saveAsync:cb=>{window.__saved++;cb&&cb({status:'succeeded'});}},
    getActiveViewAsync:cb=>cb({value:${JSON.stringify(view)}}),addHandlerAsync:(type,handler)=>{window.__viewHandler=handler;},
    goToByIdAsync:(id,type,cb)=>{window.__goto.push(id);cb&&cb({status:'succeeded'});}}}};`;

(async()=>{
  assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use an isolated local classroom server.');
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
  const errors=[];let teacher,room;
  const watch=(page,label)=>page.on('pageerror',error=>errors.push(`${label}: ${error.message}`));
  const control=async(command,extra={})=>{const r=await teacher.request.post(`${base}/api/classroom`,{headers:{Authorization:`Bearer ${room.teacherToken}`},data:{action:'control',code:room.code,command,...extra}});const v=await r.json();assert.equal(r.status(),200,JSON.stringify(v));return v;};
  try{
    const manifest=await (await fetch(`${base}/ppt-addin/manifest.xml`)).text();
    assert.match(manifest,/xsi:type="ContentApp"/);assert.match(manifest,/<Host Name="Presentation"\/>/);
    assert.match(manifest,/<SourceLocation DefaultValue="https:\/\/celadon-tycoon\.vercel\.app\/ppt-addin\/index\.html"\/>/);
    for(const size of [32,64])assert.match((await fetch(`${base}/ppt-addin/icon-${size}.png`)).headers.get('content-type'),/^image\/png/);

    const teacherContext=await browser.newContext();teacher=await teacherContext.newPage();watch(teacher,'teacher');
    await teacher.goto(`${base}/teacher`);
    const created=teacher.waitForResponse(response=>response.url().endsWith('/api/classroom')&&response.request().postDataJSON()?.action==='create');
    await teacher.locator('[data-form=create] button[type=submit]').click();room=await (await created).json();
    await control('start',{activity:1});
    const {observerToken,observerCode}=await control('observer-link');
    const link=`${base}/observe?code=${encodeURIComponent(observerCode)}#key=${observerToken}`;

    // Outside PowerPoint (Office.js unavailable) the page still works, keeping its choice on this computer.
    const plainContext=await browser.newContext({viewport:{width:900,height:560}});
    await plainContext.route(OFFICE_JS,route=>route.abort());
    const plain=await plainContext.newPage();watch(plain,'plain add-in');
    await plain.goto(`${base}/ppt-addin/index.html`);
    await plain.locator('#setup').waitFor({timeout:15000});
    // No address, then a wrong one: each is answered in a red box, with the field marked.
    await plain.locator('#link').fill('');await plain.locator('#form button[type=submit]').click();
    assert.match(await plain.locator('#error').innerText(),/PPT용 주소 칸이 비어 있어요/);
    assert.equal(await plain.locator('#link').evaluate(field=>field.classList.contains('bad')&&document.activeElement===field),true);
    await plain.locator('#link').fill('https://example.com/observe?code=ABCDEF#key=xyz');
    await plain.locator('#form button[type=submit]').click();
    assert.match(await plain.locator('#error').innerText(),/이 주소는 PPT용 주소가 아니에요/);
    await plain.locator('input[name=panel][value=comparison]').check();
    await plain.locator('#link').fill(link);
    await plain.locator('#form button[type=submit]').click();
    const frame=plain.frameLocator('#board');
    await frame.locator('[data-testid=live-board] [data-comparison-result="1"]').waitFor({timeout:20000});
    assert.equal(await frame.locator('.lesson-header,.teacher-sidebar').count(),0);
    assert.match(await plain.locator('#board').getAttribute('src'),/show=comparison/);
    await plain.reload();
    await plain.frameLocator('#board').locator('[data-testid=live-board]').waitFor({timeout:20000});
    assert.equal(await plain.locator('#setup').isHidden(),true,'the choice is remembered');
    await plain.locator('#change').click();
    assert.equal(await plain.locator('#link').inputValue(),link,'the link is filled in again');
    await plain.locator('input[name=panel][value=game]').check();
    assert.equal(await plain.locator('#link-field').isHidden(),true,'the game needs no link');
    await plain.locator('#form button[type=submit]').click();
    assert.equal(await plain.locator('#board').getAttribute('src'),'/game');

    // 3D 청자 돌려 보기: one lesson model, large and interactive, with no class link and only the blind label.
    await plain.locator('#change').click();
    await plain.locator('input[name=panel][value=model]').check();
    assert.equal(await plain.locator('#model-field').isVisible(),true);assert.equal(await plain.locator('#link-field').isHidden(),true);
    await plain.locator('#model').selectOption('observation-2');
    await plain.locator('#form button[type=submit]').click();
    assert.equal(await plain.locator('#board').getAttribute('src'),'/model?id=observation-2');
    const model=plain.frameLocator('#board');
    await model.locator('[data-testid=model-page][data-model-id=observation-2]').waitFor({timeout:15000});
    assert.match(await model.locator('.model-caption').innerText(),/쓰임 짐작 · 청자 2/);
    await model.locator('[data-model-viewer][data-viewer-status=ready]').waitFor({timeout:60000});
    assert.ok(!(await model.locator('body').innerText()).includes('의자'),'activity 2 models keep their blind label');
    const box=await plain.locator('#board').boundingBox(),before=await model.locator('[data-model-viewer] canvas').screenshot();
    await plain.mouse.move(box.x+box.width/2,box.y+box.height/2);await plain.mouse.down();await plain.mouse.move(box.x+box.width/2+160,box.y+box.height/2,{steps:8});await plain.mouse.up();
    await plain.waitForTimeout(500);
    assert.ok(!before.equals(await model.locator('[data-model-viewer] canvas').screenshot()),'dragging turns the model');
    await plain.reload();
    assert.equal(await plain.locator('#board').getAttribute('src'),'/model?id=observation-2','the model choice is remembered');
    // 청자만 크게 보기: nothing but the model and the two zoom buttons; it is still turned by dragging.
    assert.equal(await plain.locator('#model-field').isVisible(),false);
    await plain.locator('#change').click();
    assert.match(await plain.locator('label.choice:has(input[value=plain])').innerText(),/3D 청자만 크게 보기/);
    await plain.locator('input[name=panel][value=plain]').check();assert.equal(await plain.locator('#model-field').isVisible(),true);assert.equal(await plain.locator('#link-field').isHidden(),true);
    await plain.locator('#model').selectOption('beauty');await plain.locator('#form button[type=submit]').click();
    assert.equal(await plain.locator('#board').getAttribute('src'),'/model?id=beauty&plain=1');
    const only=plain.frameLocator('#board');
    await only.locator('[data-model-viewer][data-viewer-status=ready]').waitFor({timeout:60000});
    const visible=await only.locator('.lesson-viewer__control').evaluateAll(nodes=>nodes.filter(node=>node.offsetParent!==null).map(node=>node.getAttribute('aria-label')));
    assert.deepEqual(visible,['확대하기','축소하기'],'only the zoom buttons show');
    assert.equal(await only.locator('.model-caption').count(),0);assert.equal(await only.locator('.lesson-viewer__hint').isVisible(),false);
    assert.equal(await only.locator('body').evaluate(node=>node.scrollHeight<=innerHeight&&node.scrollWidth<=innerWidth),true);
    const area=await plain.locator('#board').boundingBox(),still=await only.locator('[data-model-viewer] canvas').screenshot();
    await only.locator('.lesson-viewer__control[aria-label="확대하기"]').click();await plain.waitForTimeout(500);
    const closer=await only.locator('[data-model-viewer] canvas').screenshot();assert.ok(!still.equals(closer),'확대 brings the model closer');
    await plain.mouse.move(area.x+area.width/2,area.y+area.height/2);await plain.mouse.down();await plain.mouse.move(area.x+area.width/2+120,area.y+area.height/2,{steps:6});await plain.mouse.up();await plain.waitForTimeout(500);
    assert.ok(!closer.equals(await only.locator('[data-model-viewer] canvas').screenshot()),'dragging still turns it');
    await plain.locator('#change').click();assert.equal(await plain.locator('input[name=panel][value=plain]').isChecked(),true,'the choice is remembered');
    await plain.locator('input[name=panel][value=model]').check();await plain.locator('#form button[type=submit]').click();
    assert.equal(await plain.locator('#board').getAttribute('src'),'/model?id=beauty');
    const missing=await plainContext.newPage();watch(missing,'missing model');
    await missing.goto(`${base}/model?id=nope`);await missing.getByTestId('model-missing').waitFor({timeout:15000});

    // Inside PowerPoint: each add-in keeps its own panel in the presentation; the link is filled in from this
    // computer; in a slide show (read view) there is no button over the board.
    const officeContext=await browser.newContext({viewport:{width:900,height:560}});
    await officeContext.route(OFFICE_JS,route=>route.fulfill({contentType:'text/javascript',body:officeStub('edit')}));
    const first=await officeContext.newPage();watch(first,'office add-in 1');
    await first.goto(`${base}/ppt-addin/index.html`);await first.locator('#setup').waitFor({timeout:15000});
    await first.locator('#link').fill(link);await first.locator('input[name=panel][value=follow]').check();
    await first.locator('#form button[type=submit]').click();
    await first.frameLocator('#board').locator('[data-testid=live-board] [data-comparison-result="1"]').waitFor({timeout:20000});
    assert.deepEqual(await first.evaluate(()=>({panel:window.__settings.panel,link:window.__settings.link,saved:window.__saved})),{panel:'follow',link,saved:1});
    assert.match(await first.locator('#board').getAttribute('src'),/board=1/);
    assert.equal(await first.locator('#change').isVisible(),true,'the editor can change the board');
    await first.evaluate(()=>window.__viewHandler({activeView:'read'}));
    assert.equal(await first.locator('#change').isHidden(),true,'no button over the board during the slide show');
    const second=await officeContext.newPage();watch(second,'office add-in 2');
    await second.goto(`${base}/ppt-addin/index.html`);await second.locator('#setup').waitFor({timeout:15000});
    assert.equal(await second.locator('#link').inputValue(),link,'a new add-in on the next slide gets the link from this computer');
    await second.locator('input[name=panel][value=works]').check();await second.locator('#form button[type=submit]').click();
    assert.match(await second.locator('#board').getAttribute('src'),/show=works/);
    // 비슷한 주문끼리 비교 is a choice of its own, shown by the comparison board of the site.
    await second.locator('#change').click();await second.locator('input[name=panel][value=compare]').check();await second.locator('#form button[type=submit]').click();
    assert.match(await second.locator('#board').getAttribute('src'),/show=compare/);assert.equal(await second.evaluate(()=>window.__settings.panel),'compare');
    // 워드 클라우드만 크게 보기: the cloud to show is chosen in the form and kept in the presentation.
    await second.locator('#change').click();assert.equal(await second.locator('#cloud-field').isHidden(),true);
    await second.locator('input[name=panel][value=cloud]').check();assert.equal(await second.locator('#cloud-field').isVisible(),true);assert.equal(await second.locator('#cloud option').count(),11);
    await second.locator('#cloud').selectOption('use-3');await second.locator('#form button[type=submit]').click();
    assert.match(await second.locator('#board').getAttribute('src'),/show=cloud&cloud=use-3#key=/);assert.deepEqual(await second.evaluate(()=>[window.__settings.panel,window.__settings.cloud]),['cloud','use-3']);
    // A presentation opened in slide show with a saved panel goes straight to the board.
    const showContext=await browser.newContext({viewport:{width:900,height:560}});
    await showContext.route(OFFICE_JS,route=>route.fulfill({contentType:'text/javascript',body:`window.__settings=${JSON.stringify({panel:'comparison',link})};`+officeStub('read')}));
    const show=await showContext.newPage();watch(show,'slide show');
    await show.goto(`${base}/ppt-addin/index.html`);
    await show.frameLocator('#board').locator('[data-testid=live-board] [data-comparison-result="1"]').waitFor({timeout:20000});
    assert.equal(await show.locator('#setup').isHidden(),true);assert.equal(await show.locator('#change').isHidden(),true);
    // A presenter remote keeps moving the slides even after the board inside was clicked.
    await show.frameLocator('#board').locator('[data-testid=live-board]').click({position:{x:20,y:20}});
    await show.keyboard.press('PageDown');await show.keyboard.press('PageUp');
    await show.locator('body').press('ArrowRight');
    assert.deepEqual(await show.evaluate(()=>window.__goto),['next','previous','next']);

    // 클릭하면 나타나기: covered in the slide show (the board already loads behind), revealed by a click, covered again
    // in the next slide show, never covered in the editor.
    const coverContext=await browser.newContext({viewport:{width:900,height:560}});
    await coverContext.route(OFFICE_JS,route=>route.fulfill({contentType:'text/javascript',body:`window.__settings=${JSON.stringify({panel:'comparison',link,cover:true})};`+officeStub('read')}));
    const covered=await coverContext.newPage();watch(covered,'covered board');
    await covered.goto(`${base}/ppt-addin/index.html`);
    await covered.locator('#cover-screen').waitFor({timeout:15000});
    assert.match(await covered.locator('#cover-screen').innerText(),/클릭하면 실시간 화면이 나타나요/);
    await covered.frameLocator('#board').locator('[data-testid=live-board] [data-comparison-result="1"]').waitFor({timeout:20000});
    assert.equal(await covered.locator('#cover-screen').isVisible(),true,'still covered while the board has loaded');
    await covered.locator('#cover-screen').click();
    // The board inside shares this page's thread; while it is still drawing its 3D models the cover can take a few seconds to go.
    await covered.locator('#cover-screen').waitFor({state:'hidden',timeout:20000});
    // Once open it has a ✕ in the corner that closes it again, like a pop-up; a click opens it once more.
    assert.equal(await covered.locator('#close').isVisible(),true);
    await covered.locator('#close').click();
    assert.equal(await covered.locator('#cover-screen').isVisible(),true,'✕ closes it: the cover is back');assert.equal(await covered.locator('#close').isVisible(),false);
    await covered.locator('#cover-screen').click();await covered.locator('#cover-screen').waitFor({state:'hidden',timeout:20000});assert.equal(await covered.locator('#close').isVisible(),true);
    await covered.evaluate(()=>window.__viewHandler({activeView:'edit'}));
    assert.equal(await covered.locator('#cover-screen').isHidden(),true,'no cover in the editor');
    assert.equal(await covered.locator('#close').isVisible(),false,'no ✕ in the editor');
    assert.match(await covered.locator('#change').innerText(),/클릭하면 나타나기/);
    await covered.evaluate(()=>window.__viewHandler({activeView:'read'}));
    assert.equal(await covered.locator('#cover-screen').isVisible(),true,'the next slide show starts covered again');
    // The choice is made with a checkbox when setting up an add-in.
    const fresh=await officeContext.newPage();watch(fresh,'office add-in 3');
    await fresh.goto(`${base}/ppt-addin/index.html`);await fresh.locator('#setup').waitFor({timeout:15000});
    await fresh.locator('input[name=panel][value=model]').check();await fresh.locator('#cover').check();
    await fresh.locator('#form button[type=submit]').click();
    assert.equal(await fresh.evaluate(()=>window.__settings.cover),true);

    // PowerPoint 2016/2019 without Microsoft 365 use Internet Explorer 11 or old Edge: the page hands over to its
    // old-engine board instead of staying blank (simulated by making modern syntax fail to compile; that board has
    // its own suite, browser-ppt-legacy.cjs).
    const oldContext=await browser.newContext({viewport:{width:720,height:480}});
    await oldContext.addInitScript(()=>{const F=window.Function;window.Function=function(...args){if(String(args[args.length-1]).includes('?.'))throw new SyntaxError('old engine');return F(...args);};});
    await oldContext.route(OFFICE_JS,route=>route.abort());
    const old=await oldContext.newPage();watch(old,'old engine');
    await old.goto(`${base}/ppt-addin/index.html`);
    await old.locator('#lg-root #lg-form').waitFor({timeout:15000});
    assert.match(await old.locator('#lg-root').innerText(),/옛 웹 엔진/);assert.equal(await old.locator('#setup').isVisible(),false);
    assert.deepEqual(errors,[]);
    console.log('PowerPoint add-in: manifest and icons served, link validation, remembered choice outside Office, draggable 3D model page, plain model view with zoom only, per-instance Office settings, shared link on the next slide, slide-show view without controls, remote keys moving slides, click-to-reveal cover with a ✕ that closes it again, hand-over to the old-engine board and direct board on open passed.');
  }finally{
    if(room&&teacher)await control('delete').catch(()=>{});
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
