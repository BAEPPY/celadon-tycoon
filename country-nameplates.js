/** Pointer-based nameplates work with mouse, trackpad, touch and pen. */
export function mountCountryNameplates(root,{canDrag,getRunId,onDragStart,onDrop}){
  let drag=null,suppressClick=null;
  const clearHighlight=()=>root.querySelectorAll('[data-country-drop].drop-over').forEach(node=>node.classList.remove('drop-over'));
  const targetAt=(x,y)=>{
    const target=document.elementFromPoint(x,y)?.closest('[data-country-drop]');
    return target&&root.contains(target)?target:null;
  };
  const allowed=()=>drag&&canDrag()&&drag.runId===getRunId();
  function cancel(){
    const previous=drag;drag=null;
    if(previous?.moved)suppressClick=previous.pointerId;
    previous?.preview?.remove();clearHighlight();
    if(previous?.source.hasPointerCapture?.(previous.pointerId))previous.source.releasePointerCapture(previous.pointerId);
  }
  function down(event){
    suppressClick=null;
    const source=event.target.closest('[data-country-chip]');
    if(!source||source.disabled||!event.isPrimary||event.button!==0||!canDrag()||drag)return;
    drag={source,pointerId:event.pointerId,runId:getRunId(),value:source.dataset.countryChip,x:event.clientX,y:event.clientY,moved:false,preview:null};
    // Capture prevents a native select or the 3D canvas from consuming the release.
    try{source.setPointerCapture(event.pointerId);}catch{}
  }
  function move(event){
    if(!drag||event.pointerId!==drag.pointerId)return;
    if(!allowed()){cancel();return;}
    if(!drag.moved&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<6)return;
    if(!drag.moved){
      drag.moved=true;onDragStart?.();
      drag.preview=document.createElement('div');drag.preview.className='country-drag-preview';
      drag.preview.textContent=drag.source.textContent;drag.preview.setAttribute('aria-hidden','true');document.body.append(drag.preview);
    }
    if(event.cancelable)event.preventDefault();
    drag.preview.style.transform=`translate(${event.clientX+14}px,${event.clientY-20}px)`;
    clearHighlight();targetAt(event.clientX,event.clientY)?.classList.add('drop-over');
  }
  function up(event){
    if(!drag||event.pointerId!==drag.pointerId)return;
    const previous=drag,target=targetAt(event.clientX,event.clientY),commit=previous.moved&&allowed()&&target;
    if(previous.moved){suppressClick=event.pointerId;if(event.cancelable)event.preventDefault();}
    cancel();
    if(commit)onDrop(target.dataset.countryDrop,previous.value);
  }
  function cancelled(event){if(drag&&event.pointerId===drag.pointerId)cancel();}
  function click(event){
    if(suppressClick===null||event.detail===0)return;
    // A completed drag must not also click the original chip or select popup.
    suppressClick=null;event.preventDefault();event.stopImmediatePropagation();
  }
  function nativeDrag(event){if(event.target.closest('[data-country-chip]'))event.preventDefault();}
  function key(event){if(event.key==='Escape')cancel();}
  root.addEventListener('pointerdown',down);
  root.addEventListener('click',click,true);
  root.addEventListener('dragstart',nativeDrag);
  window.addEventListener('pointermove',move,{capture:true,passive:false});
  window.addEventListener('pointerup',up,{capture:true,passive:false});
  window.addEventListener('pointercancel',cancelled,true);
  root.addEventListener('lostpointercapture',cancelled);
  window.addEventListener('blur',cancel);
  window.addEventListener('pagehide',cancel);
  window.addEventListener('keydown',key);
  return {cancel};
}
