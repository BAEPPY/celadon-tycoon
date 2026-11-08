const {enterGame}=require('./game-entry.cjs');
/* The two longest order quotes × five speakers × two Chromebook sizes, on the actual built app. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const base=process.env.BASE_URL||'http://127.0.0.1:4173',KEY='celadon-tycoon-v2';
(async()=>{
 const {ORDERS}=await import(pathToFileURL(path.resolve(__dirname,'../domain.js'))),{orderQuote}=await import(pathToFileURL(path.resolve(__dirname,'../dialogue.js')));
 const customers=['king','queen','noble','noblewoman','artisan'];
 const targetOrders=[...ORDERS].sort((a,b)=>orderQuote(b).length-orderQuote(a).length).slice(0,2),longest=targetOrders[0];
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 const failures=[];let total=0;
 try{
  await Promise.all([[1366,768],[1024,600]].map(async([width,height])=>{
   const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(new URL('/game',base).href);
   for(const [index,order]of targetOrders.entries())for(const customerId of customers){
    const draft={id:`dialogue-${order.id}-${customerId}`,orderId:order.id,customerId,accepted:true,shape:null,modelId:null,step:0,stationView:'counter',technique:'inlay',pattern:'crane',placements:[],strokes:[],width:1,knead:0,decorPhase:0,decorDone:false,firing:[],clay:{body:true,slip:'white',kneads:0,prepared:false},explanationUse:'',explanationBeauty:''};
    await page.evaluate(({key,draft})=>localStorage.setItem(key,JSON.stringify({history:[draft.orderId],gallery:[],draft})),{key:KEY,draft});await page.reload();await enterGame(page,'start');await page.waitForSelector('.counter-speech');await page.evaluate(()=>document.fonts.ready);
    const result=await page.evaluate(()=>{
     const bubble=document.querySelector('.counter-speech'),quote=bubble.querySelector('p'),scene=document.querySelector('.counter-scene'),b=bubble.getBoundingClientRect(),tail=getComputedStyle(bubble,'::after'),tailOuter=getComputedStyle(bubble,'::before');
     const issues=[];if(document.documentElement.scrollWidth>innerWidth+1||document.documentElement.scrollHeight>innerHeight+1)issues.push('page scroll');
     if(b.x<0||b.y<0||b.right>innerWidth||b.bottom>innerHeight)issues.push('bubble outside viewport');
     for(const el of bubble.querySelectorAll('span,p')){const r=el.getBoundingClientRect();if(r.x<b.x||r.right>b.right||r.y<b.y||r.bottom>b.bottom||el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1)issues.push('clipped bubble text');const range=document.createRange();range.selectNodeContents(el);for(const fragment of range.getClientRects())if(fragment.x<b.x||fragment.right>b.right||fragment.y<b.y||fragment.bottom>b.bottom)issues.push('text range outside bubble');}
     for(const button of document.querySelectorAll('.counter-responses button')){const r=button.getBoundingClientRect();if(r.x<0||r.y<0||r.right>innerWidth||r.bottom>innerHeight||button.scrollWidth>button.clientWidth+1||button.scrollHeight>button.clientHeight+1)issues.push('clipped/outside response button');for(const [x,y]of[[r.x+r.width/2,r.y+r.height/2],[r.x+5,r.y+5],[r.right-5,r.bottom-5]]){const hit=document.elementFromPoint(x,y);if(hit!==button&&!button.contains(hit))issues.push('covered response button by '+(hit?.className||hit?.tagName));}}
     const left=parseFloat(tail.left),top=parseFloat(tail.top),h=parseFloat(tail.height);if(!(left<0&&tail.transform==='none'&&tail.clipPath.includes('0px 50%')))issues.push('tail not pointing left');if(!(top>=0&&top+h<=b.height&&b.x+parseFloat(tailOuter.left)>=0))issues.push('tail outside bubble edge');
     const s=scene.getBoundingClientRect();return {issues,quote:quote.textContent,tail:{left:tail.left,top:tail.top,transform:tail.transform,clipPath:tail.clipPath},bubble:{x:b.x,y:b.y,right:b.right,bottom:b.bottom},relative:{left:(b.x-s.x)/s.width,top:(b.y-s.y)/s.height}};
    });
    const label=`${width}×${height} ${order.id} ${customerId}`;
    if(result.quote!==orderQuote(order))result.issues.push('full quote differs from order data');
    if(result.relative.left>.34||result.relative.top<.19||result.relative.top>.21)result.issues.push('stale distant/high bubble position');
    failures.push(...result.issues.map(issue=>`${label}: ${issue}`));total++;
    if(order.id===longest.id&&(customerId==='queen'||width===1366)){await page.screenshot({path:`/tmp/bubble-longest-${width}-${customerId}.png`});if(customerId==='queen')await page.screenshot({path:`/tmp/bubble-longest-${width}.png`});console.log('Longest quote screenshot',width,customerId,longest.id,JSON.stringify(result));}
    if(customerId==='artisan')console.log(`${width}: long quote ${index+1}/2 × five speakers checked`);
   }
   failures.push(...errors.map(e=>`${width}: browser error ${e}`));await page.close();
  }));
  assert.equal(total,targetOrders.length*customers.length*2);assert.deepEqual(failures,[]);console.log(`PASS: ${total} order/speaker/viewport combinations; complete quotes, joined left tails, accessible response buttons, no clipping or scrolling.`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
