import * as T from 'three';
import {Brush,Evaluator,HOLLOW_SUBTRACTION} from 'three-bvh-csg';

// Scanned museum surfaces are not necessarily watertight. Hollow subtraction
// removes actual triangles inside a closed punch without inventing a solid scan.
// Separate short inward walls give the cut rim the thickness of the clay.
export function punchShape(pattern){
 const s=new T.Shape(),r=.27;
 if(pattern==='cloud'){s.moveTo(-.22,.03);s.bezierCurveTo(-.35,.06,-.28,.24,-.14,.19);s.bezierCurveTo(-.12,.38,.13,.33,.15,.19);s.bezierCurveTo(.34,.26,.37,.02,.2,-.03);s.lineTo(-.2,-.03);s.closePath();}
 else if(pattern==='crane'){s.moveTo(-.02,-.03);s.lineTo(-.27,.18);s.quadraticCurveTo(-.3,-.03,-.06,-.1);s.lineTo(-.1,-.22);s.lineTo(.02,-.1);s.quadraticCurveTo(.23,-.09,.29,.18);s.lineTo(.04,.02);s.quadraticCurveTo(.1,.22,.16,.19);s.lineTo(.23,.17);s.lineTo(.14,.13);s.quadraticCurveTo(.08,.12,.08,-.03);s.closePath();}
 else if(pattern==='lotus'){s.moveTo(0,-.21);s.quadraticCurveTo(-.28,-.13,-.26,.12);s.quadraticCurveTo(-.14,.12,-.11,.04);s.quadraticCurveTo(-.12,.18,0,.29);s.quadraticCurveTo(.12,.18,.11,.04);s.quadraticCurveTo(.14,.12,.26,.12);s.quadraticCurveTo(.28,-.13,0,-.21);}
 else if(pattern==='text'){const pts=[[-.045,.25],[.045,.25],[.045,.045],[.24,.045],[.24,-.045],[.045,-.045],[.045,-.25],[-.045,-.25],[-.045,-.045],[-.24,-.045],[-.24,.045],[-.045,.045]];pts.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();}
 else if(pattern==='willow'){s.moveTo(-.14,-.25);s.bezierCurveTo(.03,-.16,.15,.15,.04,.28);s.bezierCurveTo(.02,.08,-.06,-.08,-.14,-.25);s.closePath();}
 else if(pattern==='bamboo'){s.moveTo(-.055,-.27);s.lineTo(.055,-.27);s.lineTo(.055,-.1);s.lineTo(.085,-.09);s.lineTo(.085,-.05);s.lineTo(.055,-.04);s.lineTo(.055,.27);s.lineTo(-.055,.27);s.lineTo(-.055,-.04);s.lineTo(-.085,-.05);s.lineTo(-.085,-.09);s.lineTo(-.055,-.1);s.closePath();}
 else {const n=pattern==='chrysanthemum'?12:pattern==='peony'?8:5;for(let i=0;i<=n*8;i++){const a=i/(n*8)*Math.PI*2,rad=.2+.065*Math.cos(a*n);const x=Math.cos(a)*rad,y=Math.sin(a)*rad;i?s.lineTo(x,y):s.moveTo(x,y);}s.closePath();}
 return s;
}
export function prepareSurface(geometry){const g=geometry.clone();if(!g.attributes.normal)g.computeVertexNormals();if(!g.attributes.uv)g.setAttribute('uv',new T.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));return g;}
export function subtractPunch(source,punch){const evaluator=new Evaluator();evaluator.attributes=['position','normal','uv'];evaluator.useGroups=false;const brush=new Brush(prepareSurface(source));brush.updateMatrixWorld(true);punch.updateMatrixWorld(true);const result=evaluator.evaluate(brush,punch,HOLLOW_SUBTRACTION);brush.geometry.dispose();result.geometry.computeBoundingSphere();return result.geometry;}
export function makePunch(mark,rootPosition){const shape=punchShape(mark.pattern),g=new T.ExtrudeGeometry(shape,{depth:6,bevelEnabled:false,curveSegments:7});g.translate(0,0,-3);const punch=new Brush(g);punch.position.fromArray(mark.point).sub(rootPosition);punch.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),new T.Vector3().fromArray(mark.normal).normalize());punch.updateMatrixWorld(true);return punch;}
export function strokePunch(stroke,rootPosition){if(stroke.points.length<2)return null;const origin=new T.Vector3().fromArray(stroke.points[0].point),normal=new T.Vector3().fromArray(stroke.points[0].normal).normalize(),q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),normal),inverse=q.clone().invert();const points=stroke.points.filter((_,i)=>i%Math.max(1,Math.floor(stroke.points.length/45))===0).map(p=>new T.Vector3().fromArray(p.point).sub(origin).applyQuaternion(inverse));const left=[],right=[];
 for(let i=0;i<points.length;i++){const d=points[Math.min(i+1,points.length-1)].clone().sub(points[Math.max(0,i-1)]);const len=Math.hypot(d.x,d.y)||1,n=new T.Vector2(-d.y/len*.025,d.x/len*.025);left.push(new T.Vector2(points[i].x+n.x,points[i].y+n.y));right.push(new T.Vector2(points[i].x-n.x,points[i].y-n.y));}
 const shape=new T.Shape([...left,...right.reverse()]),g=new T.ExtrudeGeometry(shape,{depth:6,bevelEnabled:false});g.translate(0,0,-3);const brush=new Brush(g);brush.position.copy(origin).sub(rootPosition);brush.quaternion.copy(q);brush.updateMatrixWorld(true);return brush;
}
export class Openwork {
 constructor(){this.records=new WeakMap();}
 base(mesh){return this.records.get(mesh)?.base||mesh.geometry;}
 reset(mesh){const r=this.records.get(mesh);if(r){if(mesh.geometry!==r.base)mesh.geometry.dispose();mesh.geometry=r.base;this.records.delete(mesh);}}
 apply(mesh,marks,strokes,rootPosition){const cuts=[...marks.filter(p=>p.point&&p.normal).map(p=>({key:JSON.stringify(p),create:()=>makePunch(p,rootPosition)})),...strokes.map(s=>({key:JSON.stringify(s.points),create:()=>strokePunch(s,rootPosition)}))];let r=this.records.get(mesh);const keys=cuts.map(c=>c.key);if(!r){r={base:mesh.geometry,keys:[]};this.records.set(mesh,r);}let start=r.keys.length;
 if(!r.keys.every((key,i)=>key===keys[i])||keys.length<start){if(mesh.geometry!==r.base)mesh.geometry.dispose();mesh.geometry=r.base;start=0;}
 for(let i=start;i<cuts.length;i++){const punch=cuts[i].create();if(!punch)continue;const old=mesh.geometry;mesh.geometry=subtractPunch(old,punch);punch.geometry.dispose();if(old!==r.base)old.dispose();}r.keys=keys;return keys.length;
 }
}
