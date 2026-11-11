import {getRunPose} from './loading-gait.js';

// Pose guides use permanent anatomical legs, drawn far then near. The final
// runtime sheets are image-generated redraws following these joint positions.
const ink='#554337',cloth='#9295a0',shade='#777c89',ivory='#f6e8ce';
const normal=(a,b)=>{const d=Math.hypot(b.x-a.x,b.y-a.y);return {x:-(b.y-a.y)/d,y:(b.x-a.x)/d};};
function disc(ctx,p,r){ctx.moveTo(p.x+r,p.y);ctx.arc(p.x,p.y,r,0,Math.PI*2);}
function tapered(ctx,a,b,ra,rb){
 const n=normal(a,b);
 const m={x:(a.x+b.x)/2,y:(a.y+b.y)/2},bulge=(ra+rb)/2+.007;
 ctx.moveTo(a.x+n.x*ra,a.y+n.y*ra);ctx.lineTo(a.x-n.x*ra,a.y-n.y*ra);
 ctx.quadraticCurveTo(m.x-n.x*bulge,m.y-n.y*bulge,b.x-n.x*rb,b.y-n.y*rb);
 ctx.lineTo(b.x+n.x*rb,b.y+n.y*rb);
 ctx.quadraticCurveTo(m.x+n.x*bulge,m.y+n.y*bulge,a.x+n.x*ra,a.y+n.y*ra);ctx.closePath();
 disc(ctx,a,ra);disc(ctx,b,rb);
}
function trouserPath(ctx,leg,extra=0){
 ctx.beginPath();tapered(ctx,leg.hip,leg.knee,.052+extra,.047+extra);
 tapered(ctx,leg.knee,leg.ankle,.047+extra,.024+extra);
}
function shoe(ctx,leg){
 const a=leg.ankle;ctx.save();ctx.translate(a.x,a.y+.013);ctx.rotate(leg.footAngle*Math.PI/180);
 ctx.lineWidth=.0045;ctx.strokeStyle=ink;ctx.lineJoin='round';ctx.lineCap='round';
 // A small ivory sock connects the same ankle to the same forward-facing shoe.
 ctx.fillStyle=ivory;ctx.beginPath();ctx.moveTo(-.018,-.022);ctx.lineTo(.019,-.022);ctx.lineTo(.025,.010);ctx.lineTo(-.024,.013);ctx.closePath();ctx.fill();ctx.stroke();
 ctx.fillStyle='#c6a273';ctx.beginPath();ctx.moveTo(-.035,.008);ctx.quadraticCurveTo(-.039,.024,-.020,.027);ctx.bezierCurveTo(.013,.033,.066,.021,.079,.010);ctx.quadraticCurveTo(.085,.003,.074,-.002);ctx.quadraticCurveTo(.054,.009,.018,.008);ctx.lineTo(-.035,.008);ctx.closePath();ctx.fill();ctx.stroke();
 ctx.fillStyle='#e5c799';ctx.beginPath();ctx.moveTo(-.034,.003);ctx.quadraticCurveTo(-.033,-.013,-.019,-.011);ctx.lineTo(.011,-.009);ctx.quadraticCurveTo(.022,.009,.059,.000);ctx.quadraticCurveTo(.076,-.010,.078,.002);ctx.quadraticCurveTo(.071,.016,.032,.020);ctx.quadraticCurveTo(-.016,.030,-.035,.013);ctx.closePath();ctx.fill();ctx.stroke();
 ctx.strokeStyle='#ae8b60';ctx.lineWidth=.0017;
 for(let i=0;i<6;i++){const x=-.022+i*.016;ctx.beginPath();ctx.moveTo(x,.008);ctx.lineTo(x+.003,.019);ctx.stroke();}
 ctx.strokeStyle=ink;ctx.lineWidth=.0025;ctx.beginPath();ctx.moveTo(-.024,-.009);ctx.quadraticCurveTo(-.010,.001,.010,-.005);ctx.stroke();
 ctx.restore();
}
function legArt(ctx,leg){
 // Fill the union of two tapered sections before adding crease lines. There
 // is no internal outline around the knee and no circular hinge drawn on it.
 trouserPath(ctx,leg,.0045);ctx.fillStyle=ink;ctx.fill();
 trouserPath(ctx,leg);ctx.fillStyle=cloth;ctx.fill();
 ctx.save();trouserPath(ctx,leg);ctx.clip();
 const g=ctx.createLinearGradient(leg.hip.x-.045,0,leg.hip.x+.075,0);g.addColorStop(0,'#a2a4ad');g.addColorStop(.58,cloth);g.addColorStop(1,'#858a97');ctx.fillStyle=g;ctx.fillRect(0,0,1,1);
 const n=normal(leg.hip,leg.knee),k=leg.knee;
 ctx.strokeStyle=shade;ctx.lineWidth=.004;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(k.x+n.x*.027,k.y+n.y*.027);ctx.quadraticCurveTo(k.x-.009,k.y-.012,k.x-n.x*.018,k.y-n.y*.018);ctx.stroke();
 ctx.restore();
 shoe(ctx,leg);
 // Cuff and ties are attached to this leg's ankle, never to screen position.
 const a=leg.ankle,n2=normal(leg.knee,a);ctx.strokeStyle=ink;ctx.fillStyle=cloth;ctx.lineWidth=.003;
 ctx.beginPath();ctx.moveTo(a.x+n2.x*.021,a.y+n2.y*.021);ctx.lineTo(a.x-n2.x*.021,a.y-n2.y*.021);ctx.stroke();
 ctx.beginPath();ctx.moveTo(a.x-.008,a.y-.003);ctx.quadraticCurveTo(a.x-.039,a.y-.026,a.x-.030,a.y+.001);ctx.quadraticCurveTo(a.x-.020,a.y+.010,a.x-.008,a.y-.003);ctx.quadraticCurveTo(a.x+.019,a.y-.019,a.x+.017,a.y+.002);ctx.quadraticCurveTo(a.x+.008,a.y+.012,a.x-.008,a.y-.003);ctx.fill();ctx.stroke();
}

export function drawRunner(ctx,bodyImage,character,phase,size=320){
 const pose=getRunPose(phase);ctx.save();ctx.scale(size,size);
 legArt(ctx,pose.left);legArt(ctx,pose.right);
 const hip={x:.50,y:.65+pose.body.bob},bodyScale=.71;
 const sourceHipY=character==='boy'?.82:.79;
 // Shoulder counter-rotation follows the stride around the connected waist;
 // head, arms and pottery stay together instead of trembling independently.
 const shoulderSway=2*Math.sin(phase*Math.PI*2+Math.PI);
 ctx.translate(hip.x,hip.y);ctx.rotate((pose.body.lean+shoulderSway)*Math.PI/180);
 ctx.drawImage(bodyImage,-.50*bodyScale,-sourceHipY*bodyScale,bodyScale,bodyScale);
 ctx.restore();
 return pose;
}
