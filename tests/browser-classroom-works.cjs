/* Completed-work gallery: real classroom API, sorting, accessible expansion, anonymity and expiry. */
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:4173';

(async()=>{
  assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use a local test server.');
  const {vesselSVG}=await import(pathToFileURL(path.join(__dirname,'../art.js')));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
  const errors=[];let room,teacher,releaseImage,releaseModule;
  try{
    const context=await browser.newContext({viewport:{width:1366,height:768}});
    teacher=await context.newPage();teacher.on('pageerror',error=>errors.push(error.message));
    async function api(action,{auth,body={},method='POST'}={}){
      const data={action,...(room?{code:room.code}:{}),...body},headers=auth?{Authorization:`Bearer ${auth}`}:{},response=method==='POST'?await teacher.request.post(`${base}/api/classroom`,{headers,data}):await teacher.request.get(`${base}/api/classroom`,{headers,params:data});
      const value=await response.json();assert.equal(response.status(),200,JSON.stringify(value));return value;
    }
    room=await api('create');
    const students=[];
    for(const number of [10,2,3])students.push(await api('join',{body:{number,name:`학생${number}`}}));
    const started=await api('control',{auth:room.teacherToken,body:{command:'start',activity:3}});
    await teacher.goto(`${base}/teacher`);
    const sample={id:'gallery-3',orderId:'royal-rest',shape:'pillow',modelId:'pillow',step:4,technique:'inlay',pattern:'crane',title:'학과 구름이 쉬는 베개',placements:[{x:100,y:100,pattern:'crane'}],strokes:[],decorDone:true,firing:['dry','biscuit','glaze','fire'],clay:{slip:'white'},explanationUse:'학 무늬를 넣은 베개예요. 머리를 받쳐 쉴 때 쓰면 좋아요.',explanationBeauty:'학 무늬를 파고 흰 흙을 채운 뒤\n선이 또렷하게 보이도록 여러 번 닦았어요.'};
    const preview=await teacher.evaluate(async svg=>{const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await image.decode();const canvas=document.createElement('canvas');canvas.width=640;canvas.height=640;canvas.getContext('2d').drawImage(image,0,0,640,640);return canvas.toDataURL('image/png');},vesselSVG({...sample,uid:'gallery-test'}));
    for(const student of students){const number=Number(student.participantId),work={...sample,id:`gallery-${number}`,title:`${number}번의 학과 구름`,...(number===2?{shape:'maebyeong',modelId:'cloudCraneMaebyeong',explanationUse:'학 무늬를 넣은 매병이에요. 넓은 몸통에 물이나 꽃을 담아 두면 좋아요.'}:{})};if(number===3)work.design={...sample,version:1,viewFrame:3,width:1.08,placements:[{x:190,y:170,pattern:'crane',stampSize:1.3}]};await api('work',{auth:student.participantToken,body:{participantId:student.participantId,runId:started.state.runId,work,preview}});}
    await teacher.evaluate(value=>localStorage.setItem('celadon-classroom-teacher-v1',JSON.stringify(value)),{code:room.code,teacherToken:room.teacherToken});
    await teacher.reload();await teacher.locator('.work-card').last().waitFor();
    const order=()=>teacher.locator('.work-card').evaluateAll(cards=>cards.map(card=>card.dataset.workId));
    assert.deepEqual(await order(),['gallery-2','gallery-3','gallery-10'],'number sorting is numeric');
    await teacher.click('[data-action=works-sort][data-sort=score]');
    assert.deepEqual(await order(),['gallery-3','gallery-10','gallery-2'],'score sorts descending, ties by number');
    await teacher.click('[data-action=teacher-activity][data-activity="2"]');
    await teacher.click('[data-action=teacher-activity][data-activity="3"]');
    assert.deepEqual(await order(),['gallery-3','gallery-10','gallery-2'],'choice survives switching activities');
    await teacher.waitForTimeout(4300);
    assert.equal(await teacher.getAttribute('[data-action=works-sort][data-sort=score]','aria-pressed'),'true','choice survives polling');
    const opener=teacher.locator('[data-work-id="gallery-3"] [data-action=view-work]');
    await opener.click();const dialog=teacher.locator('dialog.work-dialog[open]');
    await dialog.locator('.student-work-viewer [data-status=ready] canvas').waitFor({timeout:30000});
    assert.equal(await dialog.locator('h2').innerText(),'3번의 학과 구름');
    assert.match(await dialog.innerText(),/3번 학생3/);
    assert.match(await dialog.innerText(),/주문·제작 \d+점 · 설명 \d+점/);
    assert.match(await dialog.innerText(),/머리를 받쳐 쉴 때/);
    assert.match(await dialog.innerText(),/여러 번 닦았어요/);
    assert.equal(await dialog.locator('[data-work-view-angle]').innerText(),'45°');
    await dialog.locator('[data-work-view=right]').click();await teacher.waitForFunction(()=>document.querySelector('[data-work-view-angle]')?.textContent==='60°');
    await dialog.locator('[data-work-view=zoom-in]').click();assert.equal(await dialog.locator('[data-work-view-zoom]').innerText(),'120%');
    await dialog.locator('[data-work-view=reset]').click();await teacher.waitForFunction(()=>document.querySelector('[data-work-view-angle]')?.textContent==='45°');assert.equal(await dialog.locator('[data-work-view-zoom]').innerText(),'100%');
    for(const viewport of [{width:1366,height:768},{width:1024,height:600},{width:390,height:844}]){
      await teacher.setViewportSize(viewport);
      assert.equal(await dialog.evaluate(element=>{const rect=element.getBoundingClientRect();return rect.left>=0&&rect.right<=innerWidth+1&&rect.top>=0&&rect.bottom<=innerHeight+1&&element.scrollWidth<=element.clientWidth+1;}),true,`expanded result fits ${viewport.width}`);
      await teacher.screenshot({path:`/tmp/classroom-work-dialog-${viewport.width}.png`});
    }
    await teacher.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
    assert.equal(await opener.evaluate(button=>button===document.activeElement),true,'Escape restores focus');
    await teacher.setViewportSize({width:1366,height:768});await opener.click();await teacher.click('[data-close-work]');
    assert.equal(await opener.evaluate(button=>button===document.activeElement),true,'close restores focus');
    await opener.click();await teacher.mouse.click(2,2);await dialog.waitFor({state:'detached'});

    await teacher.locator('[data-work-id="gallery-10"] [data-action=view-work]').click();
    await teacher.locator('.work-photo-viewer img').waitFor();assert.match(await dialog.innerText(),/회전 정보가 없는 작품은 사진/);
    assert.equal(await dialog.locator('[data-work-view=right]').count(),0,'legacy image never pretends to rotate');
    await dialog.locator('[data-photo-zoom=in]').click();assert.equal(await dialog.locator('[data-photo-scale]').innerText(),'125%');
    await dialog.locator('[data-photo-zoom=reset]').click();assert.equal(await dialog.locator('[data-photo-scale]').innerText(),'100%');
    const legacyDialog=await dialog.elementHandle(),legacyStudent=students.find(student=>student.participantId==='10');
    const upgraded=await api('work',{auth:legacyStudent.participantToken,body:{participantId:'10',runId:started.state.runId,work:{...sample,id:'gallery-10',title:'10번의 학과 구름',design:{...sample,version:1,viewFrame:8}},preview}});
    assert.equal(upgraded.duplicate,true);assert.equal(upgraded.work.designVersion,1);
    await dialog.locator('.student-work-viewer [data-status=ready] canvas').waitFor({timeout:20000});
    assert.equal(await legacyDialog.evaluate(node=>node.isConnected&&node.open),true,'backfill upgrades the already-open dialog');
    assert.equal(await dialog.locator('.work-photo-viewer').count(),0,'new design replaces the cached photo viewer');
    assert.equal(await dialog.locator('[data-work-view-angle]').innerText(),'120°');
    assert.equal(await dialog.locator('h2').innerText(),'10번의 학과 구름');
    await teacher.click('[data-close-work]');

    const observerKey=await api('control',{auth:room.teacherToken,body:{command:'observer-link'}});
    const observer=await browser.newPage({viewport:{width:1024,height:600}});observer.on('pageerror',error=>errors.push(error.message));
    await observer.goto(`${base}/observe?code=${room.code}#key=${observerKey.observerToken}`);await observer.locator('.work-card').last().waitFor();
    assert.equal(await observer.locator('[data-sort=number]').count(),0);
    await observer.locator('[data-action=view-work]').first().click();
    assert.equal(await observer.locator('.work-dialog .student-line').count(),0);
    assert.doesNotMatch(await observer.locator('.work-dialog').innerText(),/학생(?:2|3|10)/);
    await observer.close();

    // Closing while the lazy renderer is downloading must not recreate the dialog.
    const lazyContext=await browser.newContext({viewport:{width:1024,height:600}}),lazy=await lazyContext.newPage();lazy.on('pageerror',error=>errors.push(error.message));
    await lazy.route('**/student-work-viewer-*.js',async route=>{await new Promise(resolve=>{releaseModule=resolve;});await route.continue();});
    await lazy.addInitScript(value=>localStorage.setItem('celadon-classroom-teacher-v1',JSON.stringify(value)),{code:room.code,teacherToken:room.teacherToken});
    await lazy.goto(`${base}/teacher`);await lazy.locator('[data-work-id="gallery-3"] [data-action=view-work]').click();
    for(let attempt=0;attempt<100&&!releaseModule;attempt++)await lazy.waitForTimeout(20);assert.ok(releaseModule,'renderer loads on demand');
    await lazy.click('[data-close-work]');releaseModule();releaseModule=null;await lazy.waitForTimeout(500);
    assert.equal(await lazy.locator('dialog.work-dialog,.student-work-viewer').count(),0);await lazyContext.close();

    // Model the moment a returned summary expires while its image is in flight.
    // Server-clock boundary/storage deletion have separate service tests.
    const expiryContext=await browser.newContext({viewport:{width:1024,height:600}}),expiring=await expiryContext.newPage();
    expiring.on('pageerror',error=>errors.push(error.message));
    const expiryAt=Date.now()+5000;
    await expiring.route('**/api/classroom?**',async route=>{
      const url=new URL(route.request().url()),action=url.searchParams.get('action');
      if(action==='teacher'){
        const response=await route.fetch(),value=await response.json();value.works=value.works.map(work=>work.id==='gallery-3'?{...work,submittedAt:expiryAt-86_400_000}:work);
        await route.fulfill({response,json:value});
      }else if(action==='artwork'&&url.searchParams.get('workId')==='gallery-3'){
        const response=await route.fetch();await new Promise(resolve=>{releaseImage=resolve;});await route.fulfill({response});
      }else await route.continue();
    });
    await expiring.addInitScript(value=>localStorage.setItem('celadon-classroom-teacher-v1',JSON.stringify(value)),{code:room.code,teacherToken:room.teacherToken});
    await expiring.goto(`${base}/teacher`);await expiring.locator('[data-work-id="gallery-3"] [data-action=view-work]').click();
    await expiring.locator('.work-dialog .image-wait').waitFor();
    await expiring.waitForFunction(()=>!document.querySelector('[data-work-id="gallery-3"]')&&!document.querySelector('dialog.work-dialog'),{},{timeout:12000});
    releaseImage?.();releaseImage=null;await expiring.waitForTimeout(600);
    assert.equal(await expiring.locator('[data-work-preview*="gallery-3"]').count(),0,'late image does not restore expired work');
    await expiryContext.close();

    // Actual server removal also closes an already-open result.
    await opener.click();await api('control',{auth:room.teacherToken,body:{command:'remove-student',participantId:'3'}});
    await teacher.locator('dialog.work-dialog').waitFor({state:'detached',timeout:15000});
    assert.equal(await teacher.locator('[data-work-id="gallery-3"]').count(),0);
    const deleteButton=teacher.locator('[data-action=delete-room]');await deleteButton.waitFor();
    teacher.once('dialog',prompt=>prompt.dismiss());await deleteButton.click();assert.equal(await teacher.locator('.teacher-stage-nav').count(),1,'cancel preserves class');
    teacher.once('dialog',prompt=>prompt.accept());await deleteButton.click();await teacher.locator('[data-form=create]').waitFor();room=null;
    assert.deepEqual(errors,[]);
    console.log('Completed works: sorting,faithfulreadonlyrotation/zoom,legacyphotozoom,story+score,keyboard/focus/mobile,observerprivacy,lazy-close/expiry/removal anddeleteconfirmationpassed.');
  }finally{releaseImage?.();releaseModule?.();if(room&&teacher)await teacher.request.post(`${base}/api/classroom`,{headers:{Authorization:`Bearer ${room.teacherToken}`},data:{action:'control',code:room.code,command:'delete'}}).catch(()=>{});await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
