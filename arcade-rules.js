export const clamp=(x,min=0,max=1)=>Math.max(min,Math.min(max,x));
export function distanceToSegment(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
export function carveAlong(guide,visited,from,to,radius=.045){const next=[...visited];guide.forEach((p,i)=>{if(distanceToSegment(p,from,to)<=radius)next[i]=true;});const fraction=next.filter(Boolean).length/Math.max(1,guide.length);return {visited:next,fraction,complete:fraction>=.88};}
export function timingPosition(seconds){return .5+.46*Math.sin(seconds*2.1-Math.PI/2);}
export function timingHit(position){return position>=.57&&position<=.79;}
export function newKiln(kind){return {kind,heat:.5,steady:0,elapsed:0,overheat:0,complete:false,failed:false};}
export const KILN_HEAT_RULES=Object.freeze({safeMin:.46,safeMax:.64,tapImpulse:.10,cooling:.20,steadySeconds:5.5});
export function fanKiln(state){return state.complete||state.failed?{...state}:{...state,heat:clamp(state.heat+KILN_HEAT_RULES.tapImpulse)};}
export function stepKiln(state,dt){if(state.complete||state.failed)return {...state};dt=clamp(dt,0,.1);const heat=clamp(state.heat-KILN_HEAT_RULES.cooling*dt),inZone=heat>=KILN_HEAT_RULES.safeMin&&heat<=KILN_HEAT_RULES.safeMax;const elapsed=state.elapsed+dt,steady=state.steady+(inZone?dt:0),overheat=(heat>.95||heat<.04)&&elapsed>1.4?state.overheat+dt:0;return {...state,heat,elapsed,steady,overheat,complete:steady>=KILN_HEAT_RULES.steadySeconds,failed:overheat>.85};}
