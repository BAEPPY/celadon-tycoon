export const clamp=(x,min=0,max=1)=>Math.max(min,Math.min(max,x));
export function distanceToSegment(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
export function carveAlong(guide,visited,from,to,radius=.045){const next=[...visited];guide.forEach((p,i)=>{if(distanceToSegment(p,from,to)<=radius)next[i]=true;});const fraction=next.filter(Boolean).length/Math.max(1,guide.length);return {visited:next,fraction,complete:fraction>=.88};}
export function timingPosition(seconds){return .5+.46*Math.sin(seconds*2.1-Math.PI/2);}
export function timingHit(position){return position>=.57&&position<=.79;}
export function newKiln(kind){return {kind,heat:.5,steady:0,elapsed:0,overheat:0,started:false,complete:false,failed:false};}
// Keep the 55% midpoint and widen the former 18-point band by 1.5 times.
export const KILN_HEAT_RULES=Object.freeze({safeMin:.415,safeMax:.685,tapImpulse:.10,cooling:.20,steadySeconds:5.5,progressLoss:2.5});
export function fanKiln(state){return state.complete||state.failed?{...state}:{...state,started:true,heat:clamp(state.heat+KILN_HEAT_RULES.tapImpulse)};}
export function stepKiln(state,dt){
 if(state.complete||state.failed)return {...state};
 dt=clamp(dt,0,.1);
 const heat=clamp(state.heat-KILN_HEAT_RULES.cooling*dt),inZone=heat>=KILN_HEAT_RULES.safeMin&&heat<=KILN_HEAT_RULES.safeMax;
 const elapsed=state.elapsed+dt,overheat=(heat>.95||heat<.04)&&elapsed>1.4?state.overheat+dt:0,failed=overheat>.85;
 // Heat takes a moment to cool between taps. Once it leaves the good range,
 // the progress bar drains instead of retaining every earlier successful tap.
 const steady=failed||!state.started?0:Math.max(0,state.steady+(inZone?dt:-dt*KILN_HEAT_RULES.progressLoss));
 return {...state,heat,elapsed,steady,overheat,complete:steady>=KILN_HEAT_RULES.steadySeconds,failed};
}

// The pointer holds the handle. Both drawing and drying use this same clamped
// fan, whose blade is above that handle (including at workbench edges).
export function dryingFanGeometry(point,{width,height}){
 const size=Math.max(1,Math.min(clamp(width*.2,86,120),width-16,height-16));
 const x=clamp(point[0]*width-size*.5,8,width-size-8),y=clamp(point[1]*height-size*.928571,8,height-size-8);
 return {x,y,width:size,height:size,center:[x+size*.5,y+size*.42],radius:[size*.31,size*.33]};
}
export function dryingFanGrabOffset(point,current,viewport){
 const fan=dryingFanGeometry(current,viewport),x=point[0]*viewport.width,y=point[1]*viewport.height;
 const onBlade=((x-fan.center[0])/fan.radius[0])**2+((y-fan.center[1])/fan.radius[1])**2<=1;
 const onHandle=Math.abs(x-(fan.x+fan.width*.5))<=fan.width*.09&&y>=fan.y+fan.height*.65&&y<=fan.y+fan.height;
 return onBlade||onHandle?[(fan.x+fan.width*.5)/viewport.width-point[0],(fan.y+fan.height*.928571)/viewport.height-point[1]]:[0,0];
}
function dryingContact(fan,viewport,targets,bounds){
 const weights=[0,0,0];
 for(const p of targets){
  const distance=((p.x*viewport.width-fan.center[0])/fan.radius[0])**2+((p.y*viewport.height-fan.center[1])/fan.radius[1])**2;
  if(distance>=1)continue;
  const zone=clamp(Math.floor((p.y-bounds.y)/bounds.height*3),0,2);
  weights[zone]=Math.max(weights[zone],1-distance);
 }
 const total=weights.reduce((a,b)=>a+b,0),strength=Math.max(...weights);
 return weights.map(value=>total?value/total*strength:0);
}
export function dryWithFan(zones,from,to,viewport,targets,bounds,{keyboard=false}={}){
 if(!(viewport.width>16&&viewport.height>16&&bounds.height>0))return [...zones];
 const a=dryingFanGeometry(from,viewport),b=dryingFanGeometry(to,viewport);
 const travel=Math.hypot(b.center[0]-a.center[0],(b.center[1]-a.center[1])*.35);
 if(!keyboard&&travel<1e-7)return [...zones];
 // Short, slow drags accumulate instead of falling below an event threshold.
 // One whole fan-width sweep contributes at most 42% across all three zones.
 const effort=keyboard ? .34 : travel/(a.width*2.4),steps=keyboard?1:Math.max(1,Math.ceil(travel/(a.width*.12))),next=[...zones];
 for(let i=0;i<steps;i++){
  const t=(i+.5)/steps,fan={...a,center:[a.center[0]+(b.center[0]-a.center[0])*t,a.center[1]+(b.center[1]-a.center[1])*t]};
  const contact=dryingContact(fan,viewport,targets,bounds);
  for(let zone=0;zone<3;zone++)next[zone]=clamp(next[zone]+effort/steps*contact[zone]);
 }
 return next;
}
