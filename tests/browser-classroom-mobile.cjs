/* Real phone classroom flow. Optional source bundle keeps parallel development out of dist. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:4173';
const sizes=[{width:360,height:640},{width:390,height:844},{width:430,height:932},{width:844,height:390},{width:956,height:440}];

(async()=>{
  assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use a local classroom server.');
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
  let room,teacher;const errors=[];
  let source;
  if(process.env.CLASSROOM_SOURCE==='1')source=(await require('esbuild').build({entryPoints:[path.join(__dirname,'../classroom-app.js')],bundle:true,format:'esm',target:'es2022',write:false})).outputFiles[0].contents;
  async function phone(label){
    const context=await browser.newContext({viewport:sizes[1],deviceScaleFactor:2,isMobile:true,hasTouch:true});
    if(source){await context.route('**/classroom-app.js',route=>route.fulfill({contentType:'text/javascript',body:Buffer.from(source)}));await context.route('**/classroom.css',async route=>route.fulfill({contentType:'text/css',body:await fs.readFile(path.join(__dirname,'../classroom.css'))}));}
    const page=await context.newPage();page.on('pageerror',error=>errors.push(`${label}: ${error.message}`));return page;
  }
  async function api(action,{method='POST',auth=room?.teacherToken,body={}}={}){
    const data={action,...(room?{code:room.code}:{}),...body},headers=auth?{Authorization:`Bearer ${auth}`}:{},response=method==='POST'?await teacher.request.post(`${base}/api/classroom`,{headers,data}):await teacher.request.get(`${base}/api/classroom`,{headers,params:data});
    const value=await response.json();assert.equal(response.status(),200,JSON.stringify(value));return value;
  }
  async function layout(page,label,{dialog,targets=[]}={}){
    for(const size of sizes){
      await page.setViewportSize(size);await page.waitForTimeout(100);
      const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
      assert.ok(overflow.scroll<=size.width+1,`${label} page fits ${size.width}: ${JSON.stringify(overflow)}`);
      for(const target of targets){const boxes=await page.locator(target).evaluateAll(nodes=>nodes.map(node=>({height:node.getBoundingClientRect().height,width:node.getBoundingClientRect().width})));assert.ok(boxes.every(box=>box.height>=43),`${label} ${target} has touch height at ${size.width}: ${JSON.stringify(boxes)}`);}
      if(dialog)assert.equal(await page.locator(dialog).evaluate(node=>{const r=node.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&node.scrollWidth<=node.clientWidth+1;}),true,`${label} dialog fits ${size.width}`);
      if(size.width===390||size.width===844)await page.screenshot({path:`/tmp/mobile-classroom-${label}-${size.width}.png`});
    }
    await page.setViewportSize(sizes[1]);
  }
  async function expand(page,selector,label){
    await page.locator(selector).tap();const dialog=page.locator('.lesson-viewer__dialog[open]');await dialog.waitFor();
    await dialog.locator('[data-viewer-status=ready]').waitFor({timeout:45000});
    await layout(page,label,{dialog:'.lesson-viewer__dialog[open]',targets:['.lesson-viewer__dialog-close','.lesson-viewer__dialog .lesson-viewer__controls button']});
    const close=dialog.locator('.lesson-viewer__dialog-close');await close.tap();await dialog.waitFor({state:'detached'});
  }
  try{
    teacher=await phone('teacher');const student=await phone('student');room=await api('create');
    await api('control',{body:{command:'settings',settings:{durations:{1:1800,2:1800},beautyDuration:1800}}});
    await teacher.addInitScript(value=>localStorage.setItem('celadon-classroom-teacher-v1',JSON.stringify(value)),{code:room.code,teacherToken:room.teacherToken});
    await teacher.goto(`${base}/teacher`,{waitUntil:'domcontentloaded'});await teacher.locator('.teacher-stage-nav').waitFor();
    await student.goto(`${base}/lesson?code=${room.code}`,{waitUntil:'domcontentloaded'});
    assert.equal(await student.locator('[name=number]').getAttribute('inputmode'),'numeric');
    assert.ok(await student.locator('[data-form=join] input').evaluateAll(inputs=>inputs.every(input=>parseFloat(getComputedStyle(input).fontSize)>=16)));
    await layout(student,'welcome',{targets:['[data-form=join] button']});
    await student.locator('[name=number]').fill('7');await student.locator('[name=name]').fill('모바일학생');await student.locator('[data-form=join] button').tap();await student.getByTestId('waiting-screen').waitFor();
    const identity=await student.evaluate(()=>JSON.parse(sessionStorage.getItem('celadon-classroom-student-v1')));
    const state=()=>api('state',{method:'GET',auth:identity.participantToken,body:{participantId:identity.participantId}});
    await teacher.locator('[data-action=start][data-activity="1"]').tap();await student.locator('[data-country-for="1"]').waitFor();
    await student.waitForFunction(()=>document.querySelectorAll('[data-viewer-status=ready]').length===3,{},{timeout:60000});
    assert.equal(await student.locator('[data-action=teacher-activity],[data-action=start]').count(),0);
    await layout(student,'comparison',{targets:['.country-chip','.country-select','.lesson-viewer__controls button','.lesson-viewer__expand']});
    await expand(student,'[data-viewer="1"] .lesson-viewer__expand','comparison-expanded');
    // Tap a nameplate, scroll to its pottery, and tap the destination: no drag or mouse required.
    for(const [id,country] of [['1','japan'],['2','yuan'],['3','goryeo']]){
      await student.locator(`[data-country-chip=${country}]`).tap();await student.locator(`[data-country-for="${id}"]`).tap();
      assert.equal(await student.locator(`[data-country-for="${id}"]`).inputValue(),country);
    }
    await student.setViewportSize(sizes[3]);assert.equal(await student.locator('[data-country-for="3"]').inputValue(),'goryeo');
    await student.locator('[data-comparison-done]').tap();await student.locator('.completion-dialog[open]').waitFor();await layout(student,'comparison-wait',{dialog:'.completion-dialog[open]'});
    assert.equal((await state()).answers[1].submitted,true);
    await teacher.locator('[data-action=pause]').tap();await student.getByTestId('lock-screen').waitFor();
    await teacher.locator('[data-action=start-beauty]').tap();await student.locator('[data-beauty-answer]').waitFor();
    await layout(student,'beauty',{targets:['[data-beauty-done]']});
    await student.locator('[data-beauty-answer]').fill('푸른빛과 날아가는 학이 아름다워요.');
    await student.setViewportSize({width:390,height:420});await student.locator('[data-beauty-answer]').focus();
    assert.equal(await student.locator('[data-beauty-answer]').inputValue(),'푸른빛과 날아가는 학이 아름다워요.');
    await student.locator('[data-beauty-done]').scrollIntoViewIfNeeded();
    const footer=await student.locator('[data-beauty-done]').boundingBox();assert.ok(footer.y>=0&&footer.y+footer.height<=420,'submit remains reachable in reduced keyboard viewport');
    await student.setViewportSize(sizes[3]);assert.equal(await student.locator('[data-beauty-answer]').inputValue(),'푸른빛과 날아가는 학이 아름다워요.');
    await student.locator('[data-beauty-done]').tap();await student.locator('.completion-dialog[open]').waitFor();assert.equal((await state()).beautyAnswer.submitted,true);
    await teacher.locator('.beauty-board .word-cloud').waitFor();await layout(teacher,'teacher-beauty');assert.doesNotMatch(await teacher.locator('.beauty-board').innerText(),/모바일학생/);
    await teacher.locator('[data-action=pause]').tap();await student.getByTestId('lock-screen').waitFor();
    await teacher.locator('[data-action=teacher-activity][data-activity="2"]').tap();await teacher.locator('[data-action=start][data-activity="2"]').tap();await student.locator('#guess-use').waitFor();
    await layout(student,'observation',{targets:['.object-dot','.nav-arrow','[data-action=next-object]','[data-observation-done]']});
    await expand(student,'.observe-stage .lesson-viewer__expand','observation-expanded');
    for(let id=1;id<=5;id++){
      await student.locator('#guess-use').fill(`${id}번은 생활할 때 쓰는 그릇 같아요.`);await student.locator('#guess-name').fill(`내가 지은 청자 ${id}`);
      if(id===1){await student.setViewportSize(sizes[3]);assert.equal(await student.locator('#guess-name').inputValue(),'내가 지은 청자 1');await student.setViewportSize(sizes[1]);}
      if(id<5)await student.locator('[data-action=next-object]').tap();
    }
    await student.locator('[data-observation-done]').tap();await student.locator('.completion-dialog[open]').waitFor();assert.equal((await state()).answers[2].submitted,true);
    await teacher.locator('[data-action=pause]').tap();await student.getByTestId('lock-screen').waitFor();await layout(student,'paused');
    await teacher.locator('[data-action=teacher-activity][data-activity="3"]').tap();await teacher.locator('[data-action=start][data-activity="3"]').tap();await student.locator('iframe.game-frame').waitFor();
    for(const size of sizes){await student.setViewportSize(size);await student.waitForTimeout(100);const frame=student.locator('iframe.game-frame');assert.equal(await frame.evaluate(node=>getComputedStyle(node).transform),'none');assert.ok(await frame.evaluate(node=>Math.abs(node.contentWindow.innerWidth-node.clientWidth)<=1));assert.ok(await frame.evaluate(node=>node.clientWidth<1024));}
    await student.setViewportSize({width:1024,height:600});await student.waitForTimeout(100);assert.ok(await student.locator('iframe.game-frame').evaluate(node=>node.contentWindow.innerWidth>=1024),'Chromebook keeps existing desktop fitting');
    const active=(await state()).state;
    const sample={id:'mobile-gallery',orderId:'royal-rest',shape:'pillow',modelId:'pillow',step:4,technique:'inlay',pattern:'crane',title:'휴대폰으로 만든 학 베개',placements:[{x:190,y:170,pattern:'crane',stampSize:1.1}],strokes:[],decorDone:true,firing:['dry','biscuit','glaze','fire'],clay:{slip:'white'},explanationUse:'학 무늬를 넣은 베개예요. 머리를 받쳐 쉴 때 쓰면 좋아요.',explanationBeauty:'학 무늬를 파고 흰 흙을 채운 뒤 선을 닦았어요.'};
    const preview=await teacher.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;return canvas.toDataURL('image/png');});
    await api('work',{auth:identity.participantToken,body:{participantId:identity.participantId,runId:active.runId,work:{...sample,design:{...sample,version:1,viewFrame:3,width:1}},preview}});
    await teacher.locator('.work-card').waitFor({timeout:15000});await layout(teacher,'teacher-gallery');
    await teacher.locator('[data-action=view-work]').tap();await teacher.locator('.student-work-viewer [data-status=ready]').waitFor({timeout:30000});
    await layout(teacher,'work-expanded',{dialog:'.work-dialog[open]',targets:['[data-close-work]','[data-work-view]']});
    assert.match(await teacher.locator('.work-dialog').innerText(),/모바일학생/);assert.match(await teacher.locator('.work-dialog').innerText(),/선을 닦았어요/);
    await teacher.locator('[data-close-work]').tap();
    const {observerToken}=await api('control',{body:{command:'observer-link'}}),observer=await phone('observer');
    await observer.goto(`${base}/observe?code=${room.code}#key=${observerToken}`,{waitUntil:'domcontentloaded'});await observer.locator('.work-card').waitFor();assert.equal(await observer.locator('[data-action=start],[data-action=pause],[data-sort=number]').count(),0);
    await observer.locator('[data-action=view-work]').tap();await observer.locator('.work-dialog[open]').waitFor();assert.doesNotMatch(await observer.locator('.work-dialog').innerText(),/모바일학생/);await layout(observer,'observer-work',{dialog:'.work-dialog[open]'});
    assert.deepEqual(errors,[]);
    console.log('Mobile classroom: real join, touch nameplates, teacher-gated stages, final saves/waits, orientation drafts, reduced-keyboard viewport, enlarged 3D/works, observer privacy and native game frame passed at 360/390/430/844/956px.');
  }finally{if(room)await api('control',{body:{command:'delete'}}).catch(()=>{});await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
