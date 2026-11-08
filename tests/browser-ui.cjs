const {enterGame}=require('./game-entry.cjs');
/* UI regressions: first entry, prepared clay, inline models, typography and help. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const KEY='celadon-tycoon-v2';
const base=process.env.BASE_URL||'http://127.0.0.1:4173';
const sizes=[[1024,600],[1280,720],[1366,768],[1536,864]];
async function saved(page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);}
async function layout(page,stage,problems){
 const issues=await page.evaluate(()=>{
  const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&!el.closest('dialog:not([open])');};
  const result=[];
  if(document.documentElement.scrollHeight>innerHeight+1||document.documentElement.scrollWidth>innerWidth+1)result.push('document scroll');
  for(const b of document.querySelectorAll('#app button,#app input,#app select')){
   if(!visible(b))continue;const r=b.getBoundingClientRect();
   if(r.left<0||r.top<0||r.right>innerWidth+1||r.bottom>innerHeight+1)result.push(`outside control: ${b.textContent.trim()||b.getAttribute('aria-label')}`);
   if(b.disabled||getComputedStyle(b).pointerEvents==='none')continue;
   const at=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
   if(at&&at!==b&&!b.contains(at))result.push(`covered control: ${b.textContent.trim()||b.getAttribute('aria-label')} by ${at.className?.baseVal||at.className||at.tagName}`);
  }
  const walker=document.createTreeWalker(document.querySelector('#app'),NodeFilter.SHOW_TEXT);let node;
  while(node=walker.nextNode()){
   if(!node.textContent.trim())continue;const el=node.parentElement;if(!visible(el))continue;
   const font=parseFloat(getComputedStyle(el).fontSize);if(font<14)result.push(`small text ${font}px: ${node.textContent.trim().slice(0,35)}`);
  }
  if(document.querySelector('.game-footer'))result.push('footer still rendered');
  if(document.querySelector('#app').textContent.includes('${clayLumpSVG()}'))result.push('literal clay template rendered');
  return result;
 });
 problems.push(...issues.map(issue=>`${stage}: ${issue}`));
 if(issues.length)console.log(JSON.stringify({stage,issues}));
}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 const problems=[];
 try{
  for(const [width,height] of sizes){
   const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(new URL('/game',base).href);await page.evaluate(()=>document.fonts.ready);await layout(page,`${width} cover`,problems);
   assert.equal(await page.locator('[data-action=start]').count(),0);await enterGame(page,'new-order');await page.click('[data-action=accept]');
   await page.waitForSelector('.clay-scene');const initial=(await saved(page)).draft;
   assert.equal(initial.clay.body,true,'body clay is automatically ready');assert.equal(await page.locator('[data-clay]').count(),0,'no redundant clay selection');assert.equal(await page.locator('.knead-pad svg image[href="./assets/clay/kneading-states.png"]').count()>0,true);
   await layout(page,`${width} clay`,problems);if(width===1024||width===1366)await page.screenshot({path:`/tmp/ui-clay-${width}.png`});
   await page.locator('.knead-pad').focus();for(let i=0;i<6;i++)await page.keyboard.press('Space');assert.equal((await saved(page)).draft.clay.kneads,6);await page.click('[data-action=clay-ready]');
   await page.waitForSelector('.empty-clay>svg');assert.equal(await page.locator('.empty-clay>svg image[href="./assets/clay/kneading-states.png"]').count()>0,true,'blank shaping uses actual clay illustration');await layout(page,`${width} empty shape`,problems);
   await page.click('[data-shape=incense]');await page.waitForSelector('.variant-shelf');const cards=page.locator('.variant-card');assert.ok(await cards.count()>=2,'family opens inline illustrated choices');
   await page.waitForFunction(()=>[...document.querySelectorAll('.variant-card img')].every(img=>img.complete&&img.naturalWidth>0));await layout(page,`${width} variants`,problems);if(width===1024||width===1366)await page.screenshot({path:`/tmp/ui-variants-${width}.png`});
   await page.click('[data-model=duckIncense]');await page.waitForSelector('.illustration-viewport[data-status=ready]');assert.equal((await saved(page)).draft.modelId,'duckIncense');assert.equal(await page.locator('.variant-shelf').count(),0);await layout(page,`${width} selected duck`,problems);
   const existing=await saved(page);existing.draft={...existing.draft,step:1,knead:3,stationView:'game',sculpt:{fraction:1,complete:true},decorPhase:0,decorDone:false};
   await page.evaluate(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:KEY,state:existing});await page.reload();await enterGame(page,'start');await page.waitForSelector('.decoration-scene');await page.waitForSelector('.illustration-viewport[data-status=ready]');await layout(page,`${width} decoration`,problems);
   for(const id of ['inlay','openwork','plain']){
    const button=page.locator(`.help-dot[aria-describedby="tip-${id}"]`),tip=page.locator(`#tip-${id}`);await button.hover();await tip.waitFor({state:'visible'});assert.ok((await tip.innerText()).length>10);let b=await tip.boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=width&&b.y+b.height<=height,'tooltip fits viewport');
    await page.mouse.move(5,5);await button.focus();await tip.waitFor({state:'visible'});assert.equal(await button.evaluate(el=>document.activeElement===el),true,'tooltip available on keyboard focus');
   }
   await page.locator('[data-action=home]').focus();await page.mouse.move(5,5);if(width===1024||width===1366)await page.screenshot({path:`/tmp/ui-decoration-${width}.png`});
   if(width===1024){const longOrder=await saved(page);longOrder.draft={...longOrder.draft,orderId:'example-plumBambooMaebyeong',shape:'maebyeong',modelId:'plumBambooMaebyeong'};await page.evaluate(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:KEY,state:longOrder});await page.reload();await enterGame(page,'start');await page.waitForSelector('.illustration-viewport[data-status=ready]');}
   await page.click('[data-tool=draw]');await page.waitForSelector('#drawing-label');await layout(page,`${width} drawing controls`,problems);
   if(width===1024)await page.screenshot({path:'/tmp/ui-drawing-1024.png'});
   // Firing displays the pot without exposing decoration/rotation input.
   const kilnState=await saved(page);kilnState.draft={...kilnState.draft,step:2,stationView:'game',decorPhase:2,decorDone:true,firing:[]};
   await page.evaluate(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:KEY,state:kilnState});await page.reload();await enterGame(page,'start');await page.waitForSelector('.kiln-scene .illustration-viewport[data-status=ready]');
   const vessel=page.locator('.illustration-viewport>canvas');await page.waitForTimeout(120);
   const beforePixels=await vessel.evaluate(c=>c.toDataURL()),beforeState=(await saved(page)).draft;
   assert.equal(await vessel.getAttribute('tabindex'),'-1');assert.equal(await page.locator('.illustration-viewport').evaluate(el=>el.inert),true);assert.equal(await page.locator('.vessel-turns').isVisible(),false);
   const vb=await vessel.boundingBox();await page.mouse.click(vb.x+vb.width*.5,vb.y+vb.height*.6);await page.mouse.move(vb.x+vb.width*.45,vb.y+vb.height*.55);await page.mouse.down();await page.mouse.move(vb.x+vb.width*.7,vb.y+vb.height*.5,{steps:6});await page.mouse.up();await page.keyboard.press('ArrowRight');
   await vessel.evaluate(c=>c.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowLeft',bubbles:true})));await page.waitForTimeout(100);
   assert.deepEqual((await saved(page)).draft,beforeState,'kiln display input cannot change work or view frame');assert.equal(await vessel.evaluate(c=>c.toDataURL()),beforePixels,'kiln clicks must not pulse, tilt or rotate');assert.equal(await vessel.evaluate(c=>document.activeElement===c),false,'kiln pot must not receive focus outline');await layout(page,`${width} kiln display`,problems);
   if(width===1024){
    await page.click('[data-fire=dry]');const mini=page.locator('.kiln-gesture-canvas'),mb=await mini.boundingBox();await page.mouse.move(mb.x+mb.width*.12,mb.y+mb.height*.27);await page.mouse.down();await page.mouse.move(mb.x+mb.width*.88,mb.y+mb.height*.27,{steps:12});await page.mouse.up();assert.ok(Number(await page.locator('.minigame-overlay').getAttribute('data-progress'))>0,'fan mini-game remains interactive beside inert vessel');await page.click('[data-mini=cancel]');
    const glazeState=await saved(page);glazeState.draft.firing=['dry','biscuit'];await page.evaluate(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:KEY,state:glazeState});await page.reload();await enterGame(page,'start');await page.waitForSelector('.illustration-viewport[data-status=ready]');await page.click('[data-fire=glaze]');const gb=await page.locator('.kiln-gesture-canvas').boundingBox();await page.mouse.move(gb.x+gb.width*.28,gb.y+gb.height*.5);await page.mouse.down();await page.mouse.move(gb.x+gb.width*.72,gb.y+gb.height*.5,{steps:12});await page.mouse.up();assert.ok(Number(await page.locator('.minigame-overlay').getAttribute('data-progress'))>0,'glaze mini-game remains interactive');await page.click('[data-mini=cancel]');
   }
   problems.push(...errors.map(e=>`${width} runtime: ${e}`));console.log(`${width}×${height}: fresh order, auto clay, six kneads, real empty clay, incense variants, duck model, technique help, inert kiln display checked`);await page.close();
  }
  assert.deepEqual(problems,[]);console.log('All visible controls reachable, text ≥14px, no footer/template literal or page scrolling.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
