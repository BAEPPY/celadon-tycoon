import {Craft2D} from './craft-2d.js';
import {ROTATION_IDS, wrapFrame} from './rotation-rules.js';

const MIN_ZOOM=.65, MAX_ZOOM=2.5, ZOOM_STEP=.2;
const STYLE_ID='student-work-viewer-style';
function installStyles() {
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');style.id=STYLE_ID;
  style.textContent=`
    .student-work-viewer{display:flex;flex-direction:column;width:100%;height:100%;min-width:0;min-height:280px;background:#f6f3e9;color:#35564d;border-radius:16px;overflow:hidden;isolation:isolate}
    .student-work-viewer__stage{position:relative;flex:1;min-height:0;overflow:hidden;background:radial-gradient(ellipse at 50% 45%,#fffdf6 0,#f1eee1 76%)}
    .student-work-viewer .craft-viewport{position:absolute;inset:0;overflow:hidden}
    .student-work-viewer .craft-viewport>canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab}
    .student-work-viewer .craft-viewport>canvas:active{cursor:grabbing}
    .student-work-viewer .craft-viewport>canvas:focus-visible{outline:3px solid #3b8270;outline-offset:-4px;border-radius:12px}
    .student-work-viewer .vessel-turns{display:none}
    .student-work-viewer__controls{display:flex;align-items:center;justify-content:center;gap:7px;flex-wrap:wrap;padding:10px 8px 6px;background:#fffdf5;border-top:1px solid #dedfce}
    .student-work-viewer__controls button{display:inline-flex;align-items:center;justify-content:center;min-width:40px;min-height:38px;padding:6px 10px;border:1px solid #b7c6b7;border-radius:9px;background:#fff;color:#315c4f;font:inherit;font-size:17px;font-weight:700;cursor:pointer;line-height:1.2}
    .student-work-viewer__controls button:hover:not(:disabled){background:#eaf1e7}
    .student-work-viewer__controls button:focus-visible{outline:3px solid #3b8270;outline-offset:2px}
    .student-work-viewer__controls button:disabled{opacity:.4;cursor:default}
    .student-work-viewer__controls output{min-width:43px;text-align:center;font:inherit;font-size:15px;font-variant-numeric:tabular-nums}
    .student-work-viewer__group{display:flex;align-items:center;gap:5px}
    .student-work-viewer__group[hidden]{display:none}
    .student-work-viewer__help{margin:0;padding:4px 10px 9px;background:#fffdf5;text-align:center;font-size:13px;line-height:1.4;color:#68786a;word-break:keep-all}
    .student-work-viewer__status{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#f6f3e9d9;font-size:15px;color:#68786a;pointer-events:none}
    .student-work-viewer__status[hidden]{display:none}
    @media(max-width:600px){.student-work-viewer__controls{gap:5px;padding:8px 5px 4px}.student-work-viewer__controls button{padding:5px 8px;min-width:36px;min-height:36px;font-size:16px}.student-work-viewer__controls output{min-width:38px;font-size:14px}.student-work-viewer__help{font-size:12px}}
  `;
  document.head.append(style);
}

// Render the saved design with the game's renderer; rotations modify only this copy.
export function mountStudentWorkViewer(container, design, {onError}={}) {
  installStyles();
  const work=structuredClone(design);
  work.step=4;work.tool='rotate';work.knead=3;
  work.placements??=[];work.strokes??=[];
  const originalFrame=wrapFrame(work.viewFrame||0), rotating=ROTATION_IDS.includes(work.modelId||work.shape);
  let disposed=false,failed=false;
  const abort=new AbortController(), opt={signal:abort.signal};
  const root=document.createElement('div');root.className='student-work-viewer';root.dataset.readonly='true';
  root.innerHTML=`<div class="student-work-viewer__stage"><div class="student-work-viewer__canvas"></div><div class="student-work-viewer__status" role="status">작품을 불러오고 있어요…</div></div><div class="student-work-viewer__controls" role="group" aria-label="완성 작품 보기 도구"><div class="student-work-viewer__group" ${rotating?'':'hidden'}><button type="button" data-work-view="left" aria-label="작품 왼쪽으로 15도 회전">↶</button><output data-work-view-angle aria-label="작품 회전 각도">${originalFrame*15}°</output><button type="button" data-work-view="right" aria-label="작품 오른쪽으로 15도 회전">↷</button></div><div class="student-work-viewer__group"><button type="button" data-work-view="zoom-out" aria-label="작품 축소">−</button><output data-work-view-zoom aria-label="작품 확대 비율">100%</output><button type="button" data-work-view="zoom-in" aria-label="작품 확대">＋</button></div><button type="button" data-work-view="reset" aria-label="작품 처음 방향과 크기로 보기">처음 보기</button></div><p class="student-work-viewer__help">${rotating?'좌우로 드래그해 한 바퀴 돌려요.':'이 작품은 한 방향으로 볼 수 있어요.'} 스크롤이나 ＋·−로 확대해요.</p>`;
  container.replaceChildren(root);
  const stage=root.querySelector('.student-work-viewer__canvas'), status=root.querySelector('.student-work-viewer__status');
  const error=reason=>{
    if(disposed)return;
    failed=true;status.hidden=false;status.textContent='작품을 불러오지 못했어요.';
    root.querySelectorAll('button').forEach(button=>{button.disabled=true;});
    onError?.(reason);
  };
  const craft=new Craft2D(()=>{},()=>{},error,()=>syncControls(),{readOnly:true});
  function syncControls() {
    if(disposed)return;
    root.querySelector('[data-work-view-angle]').value=`${wrapFrame(work.viewFrame||0)*15}°`;
    root.querySelector('[data-work-view-zoom]').value=`${Math.round(craft.zoom*100)}%`;
    root.querySelector('[data-work-view="zoom-out"]').disabled=failed||craft.zoom<=MIN_ZOOM;
    root.querySelector('[data-work-view="zoom-in"]').disabled=failed||craft.zoom>=MAX_ZOOM;
    root.dataset.viewFrame=String(wrapFrame(work.viewFrame||0));root.dataset.zoom=String(craft.zoom);
  }
  const observer=new MutationObserver(()=>{
    if(disposed||failed)return;
    const loading=craft.el.dataset.status==='loading';
    root.setAttribute('aria-busy',String(loading));status.hidden=!loading;
    syncControls();
  });
  observer.observe(craft.el,{attributes:true,attributeFilter:['data-status','data-view-frame']});
  const ready=craft.mount(stage,work,'finished').then(()=>{if(!disposed&&!failed){syncControls();status.hidden=true;root.setAttribute('aria-busy','false');}});
  function setZoom(value) {
    if(disposed||failed)return craft.zoom;
    const zoom=craft.setZoom(value);syncControls();return zoom;
  }
  async function rotate(delta) {
    if(disposed||failed||!rotating)return;
    await craft.setRotation((work.viewFrame||0)+delta);
  }
  function resetView() {
    if(disposed||failed)return;
    setZoom(1);
    return craft.setRotation(originalFrame);
  }
  root.addEventListener('click',event=>{
    const button=event.target.closest('[data-work-view]');if(!button||button.disabled)return;
    const action=button.dataset.workView;
    if(action==='left')void rotate(-1);else if(action==='right')void rotate(1);
    else if(action==='zoom-in')setZoom(craft.zoom+ZOOM_STEP);else if(action==='zoom-out')setZoom(craft.zoom-ZOOM_STEP);
    else if(action==='reset')void resetView();
  },opt);
  craft.canvas.addEventListener('keydown',event=>{
    if(disposed||failed)return;
    if(['+','=','Add','-','_','Subtract','Home','0'].includes(event.key)){
      event.preventDefault();
      if(['Home','0'].includes(event.key))void resetView();
      else setZoom(craft.zoom+(['-','_','Subtract'].includes(event.key)?-ZOOM_STEP:ZOOM_STEP));
    }
  },opt);
  craft.canvas.addEventListener('wheel',event=>{
    if(disposed||failed||!event.deltaY)return;
    event.preventDefault();setZoom(craft.zoom+(event.deltaY<0?ZOOM_STEP:-ZOOM_STEP));
  },{...opt,passive:false});
  return {
    ready,setZoom,resetView,
    get zoom(){return craft.zoom;},get viewFrame(){return wrapFrame(work.viewFrame||0);},
    dispose(){if(disposed)return;disposed=true;abort.abort();observer.disconnect();craft.dispose();root.remove();},
  };
}
