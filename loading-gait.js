// A side-view run in normalized artwork coordinates (+x forward, +y down).
// These permanent left/far and right/near identities never swap as feet cross.
export const RUN_FRAME_COUNT=24;
export const RUN_GAIT=Object.freeze({
 thighLength:.148,
 shinLength:.148,
 groundY:.91,
 supportFraction:.32,
});
const TAU=Math.PI*2;
const wrap=value=>{if(!Number.isFinite(value))return 0;const phase=value%1;return phase<0?phase+1:phase;};
const supportVelocity=-.26/RUN_GAIT.supportFraction;
// Recovery keys carry derivatives so the planted path and the swing join
// continuously. The heel folds behind, the knee comes forward, then the foot
// reaches out and moves backward before landing instead of snapping into place.
const recovery=[
 {t:.32,x:-.13,y:.91,vx:supportVelocity,vy:0},
 {t:.46,x:-.15,y:.78,vx:.25,vy:-.3},
 {t:.62,x:-.06,y:.755,vx:1,vy:0},
 {t:.80,x:.11,y:.81,vx:.6,vy:.35},
 {t:.91,x:.145,y:.86,vx:0,vy:.7},
 {t:1,x:.13,y:.91,vx:supportVelocity,vy:0},
];
const angleKeys=[[.32,0],[.44,80],[.50,82],[.62,40],[.80,-20],[.9,-8],[1,0]];
function hermite(a,b,va,vb,t,span){
 const t2=t*t,t3=t2*t;
 return (2*t3-3*t2+1)*a+(t3-2*t2+t)*span*va+(-2*t3+3*t2)*b+(t3-t2)*span*vb;
}
function footTarget(phase){
 if(phase<=RUN_GAIT.supportFraction)return {x:.13+supportVelocity*phase,y:RUN_GAIT.groundY};
 const end=recovery.findIndex(point=>point.t>=phase),a=recovery[end-1],b=recovery[end],span=b.t-a.t,t=(phase-a.t)/span;
 return {x:hermite(a.x,b.x,a.vx,b.vx,t,span),y:hermite(a.y,b.y,a.vy,b.vy,t,span)};
}
function footAngle(phase){
 if(phase<=RUN_GAIT.supportFraction)return 0;
 const end=angleKeys.findIndex(([t])=>t>=phase),a=angleKeys[end-1],b=angleKeys[end],t=(phase-a[0])/(b[0]-a[0]),ease=t*t*(3-2*t);
 return a[1]+(b[1]-a[1])*ease;
}
function leg(phase,hip,side,depth){
 const target=footTarget(phase),ankle={x:hip.x+target.x,y:target.y};
 const upper=RUN_GAIT.thighLength,lower=RUN_GAIT.shinLength,maxReach=(upper+lower)*.985;
 let dx=ankle.x-hip.x,dy=ankle.y-hip.y,distance=Math.hypot(dx,dy);
 if(distance>maxReach){const scale=maxReach/distance;dx*=scale;dy*=scale;ankle.x=hip.x+dx;ankle.y=hip.y+dy;distance=maxReach;}
 const along=(upper*upper-lower*lower+distance*distance)/(2*distance);
 const bend=Math.sqrt(Math.max(0,upper*upper-along*along));
 // Keep the same positive perpendicular branch, even when the foot passes
 // behind the hip. Choosing the visually frontmost knee per frame can flip it.
 const knee={x:hip.x+along*dx/distance+bend*dy/distance,y:hip.y+along*dy/distance-bend*dx/distance};
 return {side,depth,phase,hip,knee,ankle,footAngle:footAngle(phase),grounded:phase<=RUN_GAIT.supportFraction};
}

// phase is continuous, in strides; 0 and 1 describe the same pose. Angles are
// degrees. Shoes should always point along local +x, without mirroring legs.
export function getRunPose(phase=0){
 phase=wrap(phase);
 const bob=.006+.006*Math.cos(TAU*2*(phase-.16));
 return {
  phase,
  body:{bob,lean:5+.65*Math.sin(TAU*2*phase)},
  left:leg(wrap(phase+.5),{x:.47,y:.65+bob},'left','far'),
  right:leg(phase,{x:.50,y:.65+bob},'right','near'),
 };
}
export function getRunFrame(frame=0){const index=Number.isFinite(frame)?frame%RUN_FRAME_COUNT:0;return getRunPose((index<0?index+RUN_FRAME_COUNT:index)/RUN_FRAME_COUNT);}
