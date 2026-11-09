/* Real invitation flow: decode the displayed QR and saved poster, then use the
   decoded address in a fresh phone browser against the actual classroom API. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const {chromium}=require('playwright');

const base=process.env.BASE_URL||'http://127.0.0.1:4173';
const teacherKey='celadon-classroom-teacher-v1';
const privateNames=['참관비공개학생가','참관비공개학생나'];
const inviteSelector='dialog.observer-invite[open]';

async function decodeImage(page,src,width){
  if(!await page.evaluate(()=>typeof window.jsQR==='function'))await page.addScriptTag({path:require.resolve('jsqr')});
  return page.evaluate(async({source,width})=>{
    const image=new Image();image.src=source;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=width||image.naturalWidth;canvas.height=Math.round(canvas.width*image.naturalHeight/image.naturalWidth);
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
    return {url:window.jsQR(pixels.data,pixels.width,pixels.height)?.data,width:canvas.width,height:canvas.height};
  },{source:src,width});
}

async function readyInvite(page){
  await page.locator(inviteSelector).waitFor();
  await page.waitForFunction(()=>{
    const dialog=document.querySelector('dialog.observer-invite[open]'),image=dialog?.querySelector('[data-observer-qr]');
    return dialog?.getAttribute('aria-busy')==='false'&&image&&!image.hidden&&image.complete&&image.naturalWidth>0;
  });
  return page.locator(inviteSelector);
}

async function assertInviteFits(page,width,height){
  await page.setViewportSize({width,height});
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  const layout=await page.locator(inviteSelector).evaluate(dialog=>{
    const r=dialog.getBoundingClientRect();
    return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,
      overflow:dialog.scrollWidth-dialog.clientWidth,pageOverflow:document.documentElement.scrollWidth-innerWidth,
      controls:[...dialog.querySelectorAll('button:not([hidden]),a:not([hidden])')].map(el=>({height:el.getBoundingClientRect().height,label:el.textContent.trim()}))};
  });
  assert.ok(layout.left>=-1&&layout.right<=width+1&&layout.top>=-1&&layout.bottom<=height+1,`Invitation fits ${width}×${height}: ${JSON.stringify(layout)}`);
  assert.ok(layout.overflow<=1&&layout.pageOverflow<=1,`Invitation has no horizontal overflow at ${width}`);
  assert.ok(layout.controls.every(control=>control.height>=43),`Invitation controls have touch targets at ${width}`);
  await page.locator(inviteSelector).evaluate(dialog=>{dialog.scrollTop=0;});
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  const scanArea=await page.locator(inviteSelector).evaluate(dialog=>{
    const image=dialog.querySelector('[data-observer-qr]').getBoundingClientRect(),header=dialog.querySelector('.observer-invite-header').getBoundingClientRect(),r=dialog.getBoundingClientRect();
    return {top:image.top,bottom:image.bottom,headerBottom:header.bottom,dialogBottom:r.bottom,viewportHeight:innerHeight};
  });
  assert.ok(scanArea.top>=scanArea.headerBottom-1&&scanArea.bottom<=Math.min(scanArea.dialogBottom,scanArea.viewportHeight)+1,`The complete QR is visible below the sticky header at ${width}: ${JSON.stringify(scanArea)}`);
  const qr=page.locator(`${inviteSelector} [data-observer-qr]`),qrSize=Math.round((await qr.boundingBox()).width);
  assert.equal((await decodeImage(page,await qr.getAttribute('src'),qrSize)).url,await page.locator(`${inviteSelector} [data-observer-url]`).inputValue(),`The QR remains scannable at its rendered ${qrSize}px size`);
  for(const selector of ['[data-copy-observer-invite]','[data-download-observer-qr]','[data-print-observer-invite]']){
    const control=page.locator(`${inviteSelector} ${selector}`);await control.scrollIntoViewIfNeeded();
    assert.equal(await control.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return r.top>=0&&r.bottom<=innerHeight+1&&(hit===el||el.contains(hit));}),true,`${selector} remains reachable at ${width}`);
  }
  await page.locator(inviteSelector).evaluate(dialog=>{dialog.scrollTop=0;});
  // Full-page screenshots change Chromium's mobile pointer emulation.
  await page.screenshot({path:`/tmp/observer-invite-${width}.png`});
}

(async()=>{
  assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use an isolated local classroom server.');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});
  const errors=[],downloadDir=await fs.mkdtemp(path.join(os.tmpdir(),'observer-qr-'));
  let teacher,room;
  const watch=page=>page.on('pageerror',error=>errors.push(error.message));
  async function api(action,{auth=room?.teacherToken,body={},method='POST',status=200}={}){
    const data={action,...(room?{code:room.code}:{}),...body},headers=auth?{Authorization:`Bearer ${auth}`}:{},response=method==='POST'
      ?await teacher.request.post(`${base}/api/classroom`,{headers,data})
      :await teacher.request.get(`${base}/api/classroom`,{headers,params:data});
    const value=await response.json();assert.equal(response.status(),status,JSON.stringify(value));return value;
  }
  const control=(command,body={})=>api('control',{body:{command,...body}});
  try{
    const teacherContext=await browser.newContext({viewport:{width:1024,height:600},acceptDownloads:true});
    await teacherContext.addInitScript(()=>{
      window.__observerCopied='';window.__observerPrints=0;
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__observerCopied=text;}}});
      window.print=()=>{window.__observerPrints++;};
    });
    teacher=await teacherContext.newPage();watch(teacher);
    await teacher.goto(`${base}/teacher`);
    const created=teacher.waitForResponse(response=>response.url().endsWith('/api/classroom')&&response.request().method()==='POST'&&response.request().postDataJSON()?.action==='create');
    await teacher.locator('[data-form=create] button[type=submit]').click();
    const creation=await created;assert.equal(creation.status(),200,'Run this regression on a fresh server with an unused public class code.');room=await creation.json();
    await teacher.locator('[data-action=observer-link]').waitFor();
    await control('settings',{settings:{durations:{1:600,2:600,3:600}}});
    await teacher.locator('[data-action=observer-link]').click();
    const dialog=await readyInvite(teacher),originalDialog=await dialog.elementHandle();
    const address=await dialog.locator('[data-observer-url]').inputValue(),parsed=new URL(address),observerToken=new URLSearchParams(parsed.hash.slice(1)).get('key');
    assert.equal(parsed.origin,new URL(base).origin);assert.equal(parsed.pathname,'/observe');assert.equal(parsed.searchParams.get('code'),'탑텐반','The 탑텐반 class shares the fixed 탑텐반 observer QR.');
    assert.deepEqual([...parsed.searchParams.keys()],['code'],'The bearer token is confined to the URL fragment.');assert.match(observerToken,/^[A-Za-z0-9_-]{43}$/);
    assert.equal(await dialog.locator('[data-observer-fixed-note]').isVisible(),true,'The invitation says the QR keeps working for new classes.');
    assert.equal(await dialog.locator('[data-rotate-observer-invite]').isVisible(),true);
    const displayed=await decodeImage(teacher,await dialog.locator('[data-observer-qr]').getAttribute('src'));
    assert.equal(displayed.url,address,'The actual QR pixels encode the full invitation, including the fragment.');
    assert.equal((await decodeImage(teacher,await dialog.locator('[data-observer-qr]').getAttribute('src'),360)).url,address,'The QR decodes at 360 displayed pixels.');
    await dialog.locator('[data-copy-observer-invite]').click();
    assert.equal(await teacher.evaluate(()=>window.__observerCopied),displayed.url,'Copy and scanning use exactly the same address.');
    const downloading=teacher.waitForEvent('download');await dialog.locator('[data-download-observer-qr]').click();
    const download=await downloading;assert.match(download.suggestedFilename(),/\.png$/);const saved=path.join(downloadDir,'invitation.png');await download.saveAs(saved);
    const poster=await decodeImage(teacher,`data:image/png;base64,${(await fs.readFile(saved)).toString('base64')}`);
    assert.deepEqual([poster.width,poster.height],[1200,1600]);assert.equal(poster.url,address,'The downloaded printable poster remains scannable.');

    // An actual changed overview must not destroy the dialog or its QR.
    const students=[];
    for(const [index,number] of [7,42].entries())students.push(await api('join',{auth:null,body:{number,name:privateNames[index]}}));
    await teacher.waitForFunction(()=>document.querySelector('.teacher-metrics strong')?.textContent==='2',{},{timeout:15000});
    assert.equal(await originalDialog.evaluate(el=>el.isConnected&&el.open),true,'Polling preserves the existing open invitation.');
    assert.equal(await dialog.locator('[data-observer-url]').inputValue(),address);
    await assertInviteFits(teacher,1024,600);
    await dialog.locator('[data-print-observer-invite]').click();assert.equal(await teacher.evaluate(()=>window.__observerPrints),1);
    await teacher.emulateMedia({media:'print'});
    const print=await dialog.evaluate(el=>({dialog:getComputedStyle(el).display,app:getComputedStyle(document.querySelector('#classroom-app')).display,
      qr:getComputedStyle(el.querySelector('[data-observer-qr]')).display,actions:getComputedStyle(el.querySelector('.observer-invite-footer')).display,
      outsiders:[...document.body.children].filter(node=>node!==el&&getComputedStyle(node).display!=='none'&&node.getBoundingClientRect().height>0).map(node=>node.id||node.tagName)}));
    assert.notEqual(print.dialog,'none');assert.notEqual(print.qr,'none');assert.equal(print.app,'none');assert.equal(print.actions,'none');assert.deepEqual(print.outsiders,[],'Printing isolates the invitation.');
    await teacher.emulateMedia({media:'screen'});await teacher.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
    assert.equal(await teacher.locator('[data-action=observer-link]').evaluate(el=>el===document.activeElement),true,'Escape returns focus after a polling rerender.');

    // A separate teacher session does not rotate the key and invalidate a QR
    // already handed to visitors. Seed credentials only, with no cached invite.
    const phoneContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
    await phoneContext.addInitScript(value=>localStorage.setItem('celadon-classroom-teacher-v1',JSON.stringify(value)),{code:room.code,teacherToken:room.teacherToken});
    const teacherPhone=await phoneContext.newPage();watch(teacherPhone);await teacherPhone.goto(`${base}/teacher`);
    await teacherPhone.locator('[data-action=observer-link]').tap();const phoneDialog=await readyInvite(teacherPhone);
    assert.equal(await phoneDialog.locator('[data-observer-url]').inputValue(),address,'Independent teacher sessions reuse the same invitation.');
    assert.equal((await decodeImage(teacherPhone,await phoneDialog.locator('[data-observer-qr]').getAttribute('src'))).url,address);
    await assertInviteFits(teacherPhone,360,800);await assertInviteFits(teacherPhone,390,844);await assertInviteFits(teacherPhone,844,390);
    await phoneDialog.locator('[data-close-observer-invite]').tap();await phoneDialog.waitFor({state:'detached'});
    await teacherPhone.close();
    if(process.env.QR_LAYOUT_ONLY==='1'){
      assert.deepEqual(errors,[]);
      console.log('Observer QR layout: fully visible and decoded QR at1024/360/390/844,reachable controls,poster/copy/print,polling/focus and stable invitations passed.');
      return;
    }

    const a1=await control('start',{activity:1});
    await api('answer',{auth:students[0].participantToken,body:{participantId:students[0].participantId,activity:1,runId:a1.state.runId,clientRevision:1,final:true,answers:{1:'japan',2:'yuan',3:'goryeo'}}});
    const guestContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1}),guest=await guestContext.newPage();watch(guest);
    const guestRequests=[];guest.on('request',request=>guestRequests.push({url:request.url(),method:request.method(),body:request.postData()}));
    await guest.goto(displayed.url);await guest.locator('.teacher-stage-nav').waitFor();
    assert.equal(await guest.locator('[data-form=join],[name=name],[name=number],[data-action=observer-link],[data-action=copy-observer],[data-action=start],[data-action=pause],[data-action=end],[data-action=delete-room]').count(),0,'Visitors need no login and have no invitation or classroom controls.');
    await guest.waitForFunction(()=>document.querySelector('.teacher-metrics strong')?.textContent==='2');
    assert.match(await guest.locator('[data-comparison-result="1"]').innerText(),/100%/);
    const fixed={code:'탑텐반'};let observed=await api('observe',{method:'GET',auth:observerToken,body:fixed});
    assert.equal(observed.participantCount,2);assert.equal(observed.completionCounts[1],1);assert.equal('participants'in observed,false,'The guest API exposes aggregate counts, not participant records.');
    for(const name of privateNames)assert.ok(!JSON.stringify(observed).includes(name));
    await api('teacher',{method:'GET',auth:observerToken,status:403});await api('control',{auth:observerToken,body:{command:'pause'},status:403});

    await control('pause');const a2=await control('start',{activity:2});
    await api('answer',{auth:students[0].participantToken,body:{participantId:students[0].participantId,activity:2,runId:a2.state.runId,clientRevision:1,answers:{1:{name:'머리받침',use:'머리를 받치고 쉬어요'}}}});
    await guest.locator('[data-action=teacher-activity][data-activity="2"].active').waitFor({timeout:15000});
    await guest.waitForFunction(()=>document.querySelector('.board-response-count')?.textContent.includes('1개'),{},{timeout:15000});
    assert.match(await guest.locator('.teacher-content').innerText(),/머리받침/,'Visitors follow the teacher and receive anonymous thoughts.');
    await control('pause');const a3=await control('start',{activity:3});
    const preview=await teacher.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=120;canvas.height=120;const ctx=canvas.getContext('2d');ctx.fillStyle='#88ae8d';ctx.fillRect(30,15,60,90);return canvas.toDataURL('image/png');});
    const work={id:'observer-display-work',orderId:'royal-rest',shape:'pillow',modelId:'pillow',step:4,technique:'inlay',pattern:'crane',title:'학이 쉬는 청자 베개',placements:[{x:100,y:100,pattern:'crane'}],strokes:[],decorDone:true,firing:['dry','biscuit','glaze','fire'],clay:{slip:'white'},explanationUse:'학 무늬를 넣은 베개예요. 머리를 받치고 쉬면 좋아요.',explanationBeauty:'학 무늬를 파고 흰 흙을 채워 또렷하게 만들었어요.'};
    await api('work',{auth:students[0].participantToken,body:{participantId:students[0].participantId,runId:a3.state.runId,work,preview}});
    await guest.locator('[data-action=teacher-activity][data-activity="3"].active').waitFor({timeout:15000});await guest.locator('[data-action=view-work]').waitFor({timeout:15000});
    observed=await api('observe',{method:'GET',auth:observerToken,body:fixed});assert.equal(observed.works.length,1);
    const visibleWork=observed.works[0];assert.match(visibleWork.participantId,/^obs_[A-Za-z0-9_-]{43}$/);assert.equal('number'in visibleWork,false);assert.equal('name'in visibleWork,false);
    for(const name of privateNames)assert.ok(!JSON.stringify(observed).includes(name));
    const artwork=await api('artwork',{method:'GET',auth:observerToken,body:{...fixed,participantId:visibleWork.participantId,workId:visibleWork.id}});assert.equal(artwork.preview,preview);
    await api('artwork',{method:'GET',auth:observerToken,body:{...fixed,participantId:students[0].participantId,workId:visibleWork.id},status:403});
    await guest.locator('[data-action=view-work]').tap();await guest.locator('.work-dialog[open] .work-photo-viewer img').waitFor();
    assert.equal(await guest.locator('.work-dialog .student-line').count(),0);
    for(const name of privateNames)assert.ok(!(await guest.locator('body').innerText()).includes(name));
    await guest.locator('[data-close-work]').tap();await control('pause');
    await guest.locator('.teacher-pause-note').waitFor({timeout:15000});
    const finalOverview=await api('teacher',{method:'GET'});assert.equal(finalOverview.participants.length,2,'Opening a QR never enrolls a visitor as a student.');
    assert.ok(guestRequests.every(request=>!request.url.includes(observerToken)),'The private fragment never travels in a request URL.');
    assert.ok(guestRequests.every(request=>request.method!=='POST'),'Read-only viewing sends no mutations or join requests.');
    assert.equal(await guest.evaluate(()=>localStorage.getItem('celadon-classroom-teacher-v1')),null);

    // 새 수업: the guest's open page (and the printed QR) follow 탑텐반 to the new, empty class.
    await teacher.goto('about:blank');
    const createToken=()=>randomBytes(32).toString('base64url');
    room=await api('create',{body:{joinCode:'탑텐반',previousCode:room.code,createToken:createToken()}});
    await guest.waitForFunction(()=>document.querySelector('.teacher-metrics strong')?.textContent==='0',{},{timeout:15000});
    await guest.locator('[data-action=teacher-activity][data-activity="1"].active').waitFor();
    assert.equal(await guest.locator('[data-action=view-work],.teacher-pause-note').count(),0,'Nothing from the deleted class remains on the guest page.');
    assert.equal((await api('observe',{method:'GET',auth:observerToken,body:fixed})).state.code,room.code);
    // With no class open the guest can still look around the lesson (activities and 3D models, no results or
    // names), stays on the tab they chose, and the next class appears without rescanning.
    await control('delete');
    await guest.getByTestId('observer-preview').waitFor({timeout:15000});
    assert.match(await guest.getByTestId('observer-preview').innerText(),/지금은 열린 수업이 없어요/);
    assert.equal(await guest.locator('.teacher-metrics strong').first().innerText(),'0');
    await guest.locator('[data-action=teacher-activity][data-activity="2"]').tap();
    await guest.locator('.observation-board .viewer-host').waitFor();
    assert.equal(await guest.locator('[data-action=teacher-result-view][data-view=exhibit]').isDisabled(),true,'no explanations before a teacher reveals them');
    await guest.locator('[data-action=teacher-activity][data-activity="3"]').tap();
    assert.equal(await guest.locator('.preview-game-link').getAttribute('href'),'/game');
    await guest.waitForTimeout(6000);
    assert.equal(await guest.locator('[data-action=teacher-activity][data-activity="3"].active').count(),1,'polling keeps the tab the visitor chose');
    for(const name of privateNames)assert.ok(!(await guest.locator('body').innerText()).includes(name));
    room=await api('create',{auth:null,body:{joinCode:'탑텐반',createToken:createToken()}});
    await guest.getByTestId('observer-preview').waitFor({state:'detached',timeout:15000});
    await guest.locator('[data-action=teacher-activity][data-activity="1"].active').waitFor({timeout:15000});

    // The new class's teacher sees the same QR, and "QR 새로 만들기" retires it everywhere.
    await teacher.goto(`${base}/teacher`);
    await teacher.evaluate(value=>localStorage.setItem('celadon-classroom-teacher-v1',JSON.stringify(value)),{code:room.code,teacherToken:room.teacherToken});
    await teacher.reload();await teacher.locator('[data-action=observer-link]').click();
    const nextDialog=await readyInvite(teacher);
    assert.equal(await nextDialog.locator('[data-observer-url]').inputValue(),address,'One QR serves every 탑텐반 class.');
    teacher.once('dialog',prompt=>{assert.match(prompt.message(),/더 이상 열리지 않아요/);prompt.accept();});
    await nextDialog.locator('[data-rotate-observer-invite]').click();
    await teacher.waitForFunction(()=>document.querySelector('[data-observer-status]')?.textContent.includes('새 참관 QR을 만들었어요'),{},{timeout:15000});
    await readyInvite(teacher);
    const rotated=await nextDialog.locator('[data-observer-url]').inputValue();
    assert.notEqual(rotated,address);assert.equal(new URL(rotated).searchParams.get('code'),'탑텐반');
    assert.equal((await decodeImage(teacher,await nextDialog.locator('[data-observer-qr]').getAttribute('src'))).url,rotated,'The displayed QR is the new one.');
    await guest.waitForFunction(()=>document.querySelector('[data-form-error]')?.textContent.includes('참관 QR이 바뀌었어요'),{},{timeout:15000});
    await api('observe',{method:'GET',auth:observerToken,body:fixed,status:403});
    assert.equal((await api('observe',{method:'GET',auth:new URLSearchParams(new URL(rotated).hash.slice(1)).get('key'),body:fixed})).state.code,room.code);
    assert.deepEqual(errors,[]);
    console.log('Observer QR: actual QR/poster decoding, copy/print, stable teacher sessions, polling/Escape,1024/390/844 layouts,anonymous phone entry,teacher-following,opaque artwork access,read-only API, one 탑텐반 QR across 새 수업/deletion and QR replacement passed.');
  }finally{
    if(room&&teacher)await api('control',{body:{command:'delete'}}).catch(()=>{});
    await browser.close();await fs.rm(downloadDir,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
