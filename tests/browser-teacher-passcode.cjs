/* 선생님 확인 번호: a Korean passcode can be typed (the box is not a password box, which would switch the Korean
   keyboard off in Safari and most browsers), its letters are hidden until 보기 is pressed, and it opens the class.
   Starts its own local server with a Korean CLASSROOM_TEACHER_PASSCODE. Run after npm run build. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium,webkit}=require('playwright');

const PASSCODE='청자교실 공개수업',port=Number(process.env.PASSCODE_TEST_PORT)||4187,base=`http://127.0.0.1:${port}`;

(async()=>{
  const data=await fs.mkdtemp(path.join(os.tmpdir(),'teacher-passcode-'));
  const server=spawn(process.execPath,[path.resolve(__dirname,'..','server.mjs')],{env:{...process.env,PORT:String(port),CLASSROOM_DATA_DIR:data,CLASSROOM_TEACHER_PASSCODE:PASSCODE.normalize('NFD')},stdio:['ignore','pipe','inherit']});
  let browser;
  try{
    await new Promise((resolve,reject)=>{server.stdout.on('data',chunk=>{if(String(chunk).includes('ready'))resolve();});server.on('exit',code=>reject(new Error(`server stopped (${code})`)));setTimeout(()=>reject(new Error('server did not start')),15000);});
    // WebKit is the engine behind Safari; use it when this machine has it, otherwise Chromium.
    const engines=process.env.CHROMIUM_PATH?[[chromium,{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}]]:[[webkit,{}],[chromium,{args:['--no-sandbox']}]];
    for(const [engine,options] of engines){try{browser=await engine.launch({headless:true,...options});break;}catch(error){if(engine===engines.at(-1)[0])throw error;}}
    const errors=[],page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${base}/teacher`);
    const field=page.locator('.passcode-field'),input=page.locator('#teacher-passcode'),toggle=page.locator('[data-passcode-toggle]');
    await field.waitFor({state:'visible'});
    // The cause of the report: a password box. This must stay an ordinary text box so the Korean keyboard works.
    assert.equal(await input.getAttribute('type'),'text');
    assert.equal(await input.evaluate(el=>el.type),'text');
    assert.equal(await input.getAttribute('autocomplete'),'off');assert.equal(await input.getAttribute('autocapitalize'),'off');assert.equal(await input.getAttribute('spellcheck'),'false');
    assert.equal(await page.locator('label[for=teacher-passcode]').innerText(),'선생님 확인 번호');
    assert.match(await page.locator('#teacher-passcode-hint').innerText(),/미리 정해 둔 번호를 넣는 칸이에요\. 한글·영어·숫자 모두 쓸 수 있고/);assert.equal(await input.getAttribute('placeholder'),'미리 정해 둔 확인 번호');
    const masking=()=>input.evaluate(el=>getComputedStyle(el).webkitTextSecurity);
    assert.equal(await masking(),'disc','the letters are hidden while typing');
    assert.equal(await input.evaluate(el=>getComputedStyle(el,'::placeholder').webkitTextSecurity),'none','the hint inside the box stays readable');

    // Typing goes through the keyboard path (composition included), not a script-set value.
    await input.click();await page.keyboard.insertText('청자교시');
    assert.equal(await input.inputValue(),'청자교시');
    await page.locator('[data-form=create] button[type=submit]').click();
    await page.waitForFunction(()=>/확인 번호가 맞지 않아요/.test(document.querySelector('#classroom-toast,[role=alert],.form-error')?.textContent||document.body.innerText));
    assert.equal(await field.isVisible(),true,'a wrong passcode keeps the box on screen');
    assert.equal(await page.locator('[data-action=observer-link]').count(),0,'no class was opened');

    // 보기 shows what was typed, 가리기 hides it again; focus stays in the box.
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'),'true');assert.equal(await toggle.innerText(),'가리기');assert.equal(await masking(),'none');
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'teacher-passcode');
    await input.fill('');await page.keyboard.insertText(PASSCODE);assert.equal(await input.inputValue(),PASSCODE);
    await toggle.click();assert.equal(await toggle.innerText(),'보기');assert.equal(await masking(),'disc');
    const layout=await field.evaluate(el=>{const box=el.getBoundingClientRect(),button=el.querySelector('button').getBoundingClientRect(),text=el.querySelector('input').getBoundingClientRect();
      return button.left>=text.right&&button.right<=box.right+1&&Math.abs(button.top-text.top)<2&&el.scrollWidth<=el.clientWidth+1;});
    assert.ok(layout,'the box and the 보기 button sit side by side inside the form');

    // The Korean passcode opens the class (the server was given the same words composed differently).
    const created=page.waitForResponse(response=>response.url().endsWith('/api/classroom')&&response.request().postDataJSON()?.action==='create');
    await page.keyboard.press('Enter');const response=await created;assert.equal(response.status(),200);
    assert.equal(response.request().postDataJSON().passcode,PASSCODE);
    await page.locator('[data-action=observer-link]').waitFor();
    // On a phone-sized screen the box still fits.
    const phone=await (await browser.newContext({viewport:{width:390,height:780}})).newPage();phone.on('pageerror',error=>errors.push(error.message));
    await phone.goto(`${base}/teacher`);await phone.locator('.passcode-field').waitFor({state:'visible'});
    assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await phone.locator('#teacher-passcode').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16),true,'iPhone Safari does not zoom the page when the box is tapped');
    assert.deepEqual(errors,[]);
    console.log(`Teacher passcode (${browser.browserType().name()}): text box that accepts Korean, hidden letters with 보기/가리기, wrong passcode refused, Korean passcode opens the class, phone layout passed.`);
  }finally{
    await browser?.close();server.kill();await fs.rm(data,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
