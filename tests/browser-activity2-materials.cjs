/* Five real Activity 2 artifacts: glazed draw calls, neutral observation, rotation and lid/mobile controls. */
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
const {build}=require('esbuild');
const {chromium}=require('playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:4173';
const screenshots=process.env.QUALITY_SCREENSHOTS;
(async()=>{
 assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use the local built app.');
 if(screenshots)await fs.mkdir(screenshots,{recursive:true});
 const bundle=await build({stdin:{resolveDir:path.join(__dirname,'..'),contents:`
  import * as THREE from 'three';
  import {mountLessonViewer} from './lesson-viewer.js';
  import {OBSERVATION_ARTIFACTS} from './lesson-artifacts.js';
  window.drawnMaterials=new Map();
  THREE.Mesh.prototype.onBeforeRender=function(renderer,scene,camera,geometry,material){
   if(material.isMeshPhysicalMaterial)window.drawnMaterials.set(material.uuid,{metalness:material.metalness,clearcoat:material.clearcoat,roughness:material.roughness,hasMap:!!material.map,vertexColors:material.vertexColors});
  };
  window.artifacts=OBSERVATION_ARTIFACTS;
  window.mountObservation=index=>{window.drawnMaterials.clear();window.viewer=mountLessonViewer(document.querySelector('#observation'),window.artifacts[index]);};
  window.mountObservation(0);
 `},bundle:true,write:false,format:'esm',target:'es2022'});
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:768},deviceScaleFactor:1}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/__activity2-materials.js',route=>route.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text}));
  await page.route('**/__activity2-materials',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/classroom.css"><body style="margin:16px;background:#f2f5f5"><section class="object-card panel" style="width:min(100%,360px)"><h2>청자 관찰</h2><div id="observation"></div></section><script type="module" src="/__activity2-materials.js"></script></body></html>'}));
  await page.goto(`${base}/__activity2-materials`);
  const card=page.locator('#observation'),dialog=()=>page.locator('dialog.lesson-viewer__dialog[open]');
  const painted=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const ready=()=>page.locator('#observation[data-viewer-status=ready]').waitFor({timeout:60000});
  const expandedReady=()=>dialog().locator('[data-viewer-status=ready]').waitFor({timeout:60000});
  const artifacts=await page.evaluate(()=>window.artifacts);
  assert.equal(artifacts.length,5);
  for(let index=0;index<artifacts.length;index++){
   if(index)await page.evaluate(index=>window.mountObservation(index),index);
   await ready();await painted();
   const records=await page.evaluate(()=>[...window.drawnMaterials.values()]);
   assert.ok(records.length>0,`Observation ${index+1} renders a physical ceramic surface.`);
   assert.ok(records.every(material=>material.metalness===0&&material.clearcoat>0&&material.roughness>0),`Observation ${index+1} keeps a nonmetal glazed response.`);
   assert.ok(records.some(material=>material.hasMap||material.vertexColors),`Observation ${index+1} retains source colour detail.`);
   if(screenshots)await card.locator('.lesson-viewer__viewport').screenshot({path:path.join(screenshots,`observation-${index+1}-card.png`)});
   await card.getByRole('button',{name:/크게 보기/}).click();await expandedReady();await painted();
   const host=dialog().locator('[data-viewer-status=ready]');
   assert.equal(await host.getAttribute('data-model-quality'),artifacts[index].detailedSrc?'detail':'standard');
   assert.equal(await dialog().locator('.lesson-viewer__info').getAttribute('data-info-state'),'observation');
   assert.doesNotMatch(await dialog().innerText(),/베개|의자|연적|향로|주전자|고려 시대|정답/,'Observation does not reveal the object use/name.');
   const canvas=dialog().locator('canvas'),before=await canvas.screenshot();
   if(screenshots)await fs.writeFile(path.join(screenshots,`observation-${index+1}-detail.png`),before);
   await dialog().getByRole('button',{name:'오른쪽으로 돌리기',exact:true}).click();await painted();
   const turned=await canvas.screenshot();assert.notDeepEqual(turned,before,`Observation ${index+1} rotates.`);
   if(screenshots)await fs.writeFile(path.join(screenshots,`observation-${index+1}-turned.png`),turned);
   if(artifacts[index].opening){
    await dialog().getByRole('button',{name:'뚜껑 열기',exact:true}).click();
    await dialog().locator('[data-opening=open]').waitFor();
    if(screenshots)await canvas.screenshot({path:path.join(screenshots,`observation-${index+1}-open.png`)});
    await page.keyboard.press('Escape');assert.equal(await card.getAttribute('data-opening'),'open','Lid state remains open in the card.');
    await card.getByRole('button',{name:/크게 보기/}).click();await expandedReady();
    assert.equal(await dialog().locator('[data-opening]').getAttribute('data-opening'),'open');
    await dialog().getByRole('button',{name:'뚜껑 닫기',exact:true}).click();await dialog().locator('[data-opening=closed]').waitFor();
   }
   await page.keyboard.press('Escape');assert.equal(await page.locator('canvas').count(),1);
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>window.mountObservation(4));await ready();
  await card.getByRole('button',{name:/크게 보기/}).click();await expandedReady();await painted();
  const mobile=await dialog().evaluate(el=>{const body=el.querySelector('.lesson-viewer__dialog-body'),canvas=el.querySelector('canvas');return {overflow:body.scrollWidth>body.clientWidth+1,pixels:canvas.width*canvas.height,width:canvas.clientWidth};});
  assert.equal(mobile.overflow,false);assert.ok(mobile.width>150&&mobile.width<390);assert.ok(mobile.pixels<=3_000_000);
  await dialog().getByRole('button',{name:'확대하기',exact:true}).click();await painted();
  if(screenshots)await page.screenshot({path:path.join(screenshots,'observation-5-mobile.png')});
  await page.evaluate(()=>window.viewer.dispose());assert.equal(await page.locator('canvas,dialog').count(),0);assert.deepEqual(errors,[]);
  console.log('Activity 2: all five real models render source-coloured ceramic materials; rotation, neutral labels, detailed views, lid continuity and mobile passed.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
