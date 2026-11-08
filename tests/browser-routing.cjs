const {enterGame}=require('./game-entry.cjs');
/* Verify the public classroom entry and the separately routed game, including its relative assets. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:4173';

(async()=>{
  assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Run routing tests on a local test server.');
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1024,height:600}}),errors=[],badAssets=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{if(response.status()>=400&&['script','stylesheet','image','font'].includes(response.request().resourceType()))badAssets.push(new URL(response.url()).pathname);});
    for(const [source,destination] of [
      ['/', '/lesson'],
      ['/?code=ABCDEF&from=lesson', '/lesson'],
      ['/?classroom=1&room=ABCDEF&student=1&run=legacy-run','/game'],
    ]){
      const response=await page.request.get(new URL(source,base).href,{maxRedirects:0});
      assert.equal(response.status(),307);
      const target=new URL(response.headers().location,base),original=new URL(source,base);
      assert.equal(target.pathname,destination);assert.equal(target.search,original.search,'redirects preserve classroom identity/run and join codes');
    }
    await page.goto(new URL('/?code=ABCDEF',base).href);
    assert.equal(new URL(page.url()).pathname,'/lesson');
    await page.locator('[data-form=join]').waitFor();
    assert.equal(await page.locator('[name=code]').inputValue(),'ABCDEF');
    assert.equal(await page.locator('#app,.cover-start').count(),0,'base URL opens the classroom, not the standalone game');
    await page.goto(new URL('/index.html',base).href);await page.locator('[data-form=join]').waitFor();
    await page.goto(new URL('/teacher',base).href);await page.locator('[data-form=create]').waitFor();
    await page.goto(new URL('/observe',base).href);assert.match(await page.locator('.welcome-form h2').innerText(),/수업 참관/);
    assert.equal(await page.locator('[data-form=create],[data-form=join]').count(),0);
    for(const pathname of ['/game','/game/']){
      await page.goto(new URL(pathname,base).href);await page.locator('[data-action=new-order]').waitFor();
      assert.equal(await page.title(),'좋은 청자 위대한 청자');
      assert.equal(await page.evaluate(()=>document.baseURI),new URL('/',base).href);
      assert.equal(await page.evaluate(()=>[...document.styleSheets].filter(sheet=>sheet.href).length),await page.evaluate(()=>document.querySelectorAll('link[rel=stylesheet]').length));
      assert.ok(await page.evaluate(()=>document.querySelectorAll('link[rel=stylesheet]').length)>=11,'all game stylesheets are linked');
    }
    // The trailing slash is the important asset-resolution regression: all
    // existing ./assets and ./app.js references must still resolve at origin.
    await enterGame(page,'new-order');await page.locator('[data-action=accept]').waitFor();
    await page.waitForFunction(()=>[...document.querySelectorAll('.desk-props img,.reference-book img')].every(image=>image.complete&&image.naturalWidth>0));
    await page.locator('[data-action=accept]').click();
    await page.locator('.knead-pad').focus();for(let i=0;i<6;i++)await page.locator('.knead-pad').press('Space');
    await page.locator('[data-action=clay-ready]').click();
    await page.locator('[data-shape=pillow]').click();
    await page.locator('.illustration-viewport[data-status=ready]').waitFor();
    await page.locator('[data-action=museum]').click();
    await page.locator('#model-viewer[data-status=ready]').waitFor({timeout:45000});
    assert.ok(Number(await page.locator('#model-viewer').getAttribute('data-meshes'))>0,'the dynamically imported model viewer loads the real local model');
    await page.locator('[data-action=close-museum]').click();
    assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);
    console.log('Routing: base URL opens classroom with preserved query; legacy iframes redirect to /game; teacher/observer routes remain; /game and /game/ load game controls, illustrations, CSS and 3D models.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
