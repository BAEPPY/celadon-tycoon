import {LoadingMotion} from './loading-motion.js';

const overlay=document.querySelector('#game-loading'),app=document.querySelector('#app');
const progress=overlay.querySelector('#loading-progress'),fill=overlay.querySelector('.loading-progress-fill'),label=overlay.querySelector('#loading-percent'),status=overlay.querySelector('#loading-status'),retry=overlay.querySelector('#loading-retry');
const runners=[...overlay.querySelectorAll('.loading-runner')],dust=[...overlay.querySelectorAll('.loading-dust')];
const columns=6,rows=4,poseCount=columns*rows,halfStride=poseCount/2;
const captions=['가마를 정리하는 중','공방을 청소하는 중','고운 흙을 준비하는 중','도구를 가지런히 놓는 중','청자를 조심히 옮기는 중','손님 맞을 준비를 하는 중'];
const reduced=matchMedia('(prefers-reduced-motion: reduce)'),events=new AbortController(),motion=new LoadingMotion(performance.now());
let finished=false,phase=0,last=null,frame,settled=0,moduleTimer,captionTime=0,captionIndex=0;
status.textContent=captions[0];
app.inert=true;
const assets=[
 ['/assets/scenes/counter.webp'],['/assets/scenes/workbench.webp'],
 ['/assets/loading/girl-run-24.webp',runners[0]],['/assets/loading/boy-run-24.webp',runners[1]],['/assets/loading/dust.webp',...dust],
];
const total=assets.length+2;
function record(){
 const value=++settled/total;motion.observe(value,performance.now());
 overlay.dataset.progress=String(value);progress.setAttribute('aria-valuenow',String(Math.round(value*100)));
 fill.style.width=`${value*100}%`;label.textContent=`${Math.round(value*100)}%`;
}
function pose(runner,index){runner.style.backgroundPosition=`${index%columns*100/(columns-1)}% ${Math.floor(index/columns)*100/(rows-1)}%`;runner.dataset.frame=String(index);}
function tick(now){
 if(finished||document.hidden||overlay.dataset.phase==='error')return;
 const rate=motion.rateAt(now),dt=last===null?0:Math.min(.1,(now-last)/1000);last=now;
 captionTime+=dt;
 if(captionTime>=2.6){captionTime%=2.6;captionIndex=(captionIndex+1)%captions.length;status.textContent=captions[captionIndex];}
 overlay.dataset.playbackRate=rate.toFixed(3);
 if(!reduced.matches){
  // Keep the accumulated phase: changing the loading speed never restarts a step.
  phase=(phase+dt*rate/.8)%1;
  runners.forEach((runner,i)=>pose(runner,(Math.floor(phase*poseCount)+i*halfStride)%poseCount));
  dust.forEach((puff,i)=>{const age=(phase+i*.5)%1;puff.style.transform=`translateX(${-age*22}px) scale(${.75+age*.25})`;puff.style.opacity=String((1-age)*.55);});
 }else{runners.forEach((runner,i)=>pose(runner,i*halfStride));dust.forEach(puff=>{puff.style.transform='none';puff.style.opacity='.3';});}
 frame=requestAnimationFrame(tick);
}
function stop(){finished=true;cancelAnimationFrame(frame);clearTimeout(moduleTimer);events.abort();}
function showError(){
 if(finished||overlay.dataset.phase==='error')return;
 overlay.dataset.phase='error';overlay.setAttribute('aria-busy','false');
 status.textContent='공방을 불러오지 못했어요. 다시 불러와 주세요.';retry.hidden=false;
 cancelAnimationFrame(frame);last=null;retry.focus({preventScroll:true});
}
function preloadImage(url,elements){
 return new Promise(resolve=>{
  const image=new Image();let done=false;
  const finish=ok=>{if(done)return;done=true;clearTimeout(timer);image.onload=image.onerror=null;if(ok)elements.forEach(el=>el?.classList.add('is-ready'));resolve();};
  const timer=setTimeout(()=>finish(false),20000);
  image.onload=()=>image.decode().then(()=>finish(true),()=>finish(false));image.onerror=()=>finish(false);image.src=url;
 });
}
function preloadFont(){
 if(!document.fonts?.load)return Promise.resolve();
 return new Promise(resolve=>{const timer=setTimeout(resolve,20000);document.fonts.load('20px "Celadon Game"').catch(()=>{}).finally(()=>{clearTimeout(timer);resolve();});});
}
retry.addEventListener('click',()=>location.reload(),{signal:events.signal});
function pause(){cancelAnimationFrame(frame);last=null;}
function resume(){pause();if(!document.hidden&&!finished&&overlay.dataset.phase!=='error')frame=requestAnimationFrame(tick);}
document.addEventListener('visibilitychange',resume,{signal:events.signal});
// A page cached during startup must still finish when the user comes back.
window.addEventListener('pagehide',pause,{signal:events.signal});
window.addEventListener('pageshow',resume,{signal:events.signal});
frame=requestAnimationFrame(tick);
moduleTimer=setTimeout(showError,20000);
// The entry stays a normal app.js request so the game and its saved/classroom
// state initialize exactly once. All preparation runs concurrently.
const moduleReady=import(new URL('./app.js',document.baseURI).href).then(value=>{clearTimeout(moduleTimer);return value;},error=>{clearTimeout(moduleTimer);showError();throw error;});
const preparation=[...assets.map(([url,...elements])=>preloadImage(url,elements)),preloadFont(),moduleReady];
Promise.allSettled(preparation.map(task=>task.then(value=>{record();return value;},error=>{record();throw error;}))).then(results=>{
 if(finished)return;
 clearTimeout(moduleTimer);
 if(results.at(-1).status==='rejected'){showError();return;}
 stop();app.inert=false;overlay.remove();
});
