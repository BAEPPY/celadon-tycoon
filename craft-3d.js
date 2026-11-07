import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {DecalGeometry} from 'three/addons/geometries/DecalGeometry.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {getModelArtifact} from './models-manifest.js';

// Workshop geometry comes from the museum's scan/reconstruction, with a new
// unpainted material so the learner's own decoration remains distinguishable.
export class Craft3D {
 constructor(onMark,onStroke,onError){
  this.onMark=onMark;this.onStroke=onStroke;this.onError=onError;this.meshes=[];this.progress=0;this.target=0;this.loadId=0;
  this.el=document.createElement('div');this.el.className='craft-viewport';
  this.renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.8;
  this.el.append(this.renderer.domElement);this.renderer.domElement.setAttribute('aria-label','직접 빚고 꾸미는 3D 청자');
  this.scene=new T.Scene();this.camera=new T.PerspectiveCamera(36,1,.01,60);this.camera.position.set(2.4,1.4,4.7);
  this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enablePan=false;this.controls.enableDamping=true;this.controls.minDistance=3;this.controls.maxDistance=10;this.controls.target.set(0,.1,0);this.dirty=true;this.controls.addEventListener('change',()=>{this.dirty=true;});
  const pm=new T.PMREMGenerator(this.renderer),room=new RoomEnvironment();this.env=pm.fromScene(room,.05);room.dispose();pm.dispose();this.scene.environment=this.env.texture;this.scene.environmentIntensity=.65;
  this.scene.add(new T.HemisphereLight(0xfff7df,0x66513f,1.4));const light=new T.DirectionalLight(0xffffff,2);light.position.set(3,5,4);this.scene.add(light);
  this.root=new T.Group();this.scene.add(this.root);this.marks=new T.Group();this.scene.add(this.marks);this.preview=new T.Group();this.scene.add(this.preview);
  this.ray=new T.Raycaster();this.pointer=new T.Vector2();
  this.el.addEventListener('pointerdown',e=>this.down(e),true);this.el.addEventListener('pointermove',e=>this.move(e),true);this.el.addEventListener('pointerup',e=>this.up(e),true);this.el.addEventListener('pointercancel',()=>{this.stroke=null;this.dirty=true;this.clear(this.preview);this.controls.enabled=true;},true);
  this.resize=new ResizeObserver(()=>this.size());this.resize.observe(this.el);
  this.lastTime=performance.now();this.tick=()=>{const now=performance.now(),dt=Math.min(100,now-this.lastTime);this.lastTime=now;this.frame=requestAnimationFrame(this.tick);if(!this.el.isConnected||document.hidden)return;const d=this.target-this.progress;if(Math.abs(d)>.0005){this.progress+=d*(1-Math.exp(-dt/140));this.deform();}this.controls.update();if(this.dirty){this.renderer.render(this.scene,this.camera);this.dirty=false;}};this.tick();
 }
 mount(container,w,stage){container.replaceChildren(this.el);this.update(w,stage);this.size();}
 size(){this.dirty=true;const {width,height}=this.el.getBoundingClientRect();if(!width||!height)return;this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
 async update(w,stage){this.work=w;this.stage=stage;this.target=w.step===0?(w.knead||0)/3:1;if(this.target!==1)this.clear(this.marks);
  const modelId=w.modelId||w.shape;if(this.shape!==modelId||this.el.dataset.status==='error'){this.shape=modelId;const id=++this.loadId;this.el.dataset.status='loading';this.clear(this.root);this.meshes=[];
   try{const gltf=await new GLTFLoader().loadAsync((modelId==='pillow'?getModelArtifact(modelId).detailedSrc:getModelArtifact(modelId).src));if(id!==this.loadId){this.clear(gltf.scene);return;}
    const obj=gltf.scene;obj.updateMatrixWorld(true);const box=new T.Box3().setFromObject(obj),center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3()),scale=2.7/Math.max(size.x,size.y,size.z);
    obj.traverse(n=>{if(!n.isMesh)return;const g=n.geometry.clone();g.applyMatrix4(n.matrixWorld);g.translate(-center.x,-center.y,-center.z);g.scale(scale,scale,scale);const m=new T.Mesh(g,new T.MeshPhysicalMaterial({color:0xbe8c62,roughness:.8,side:T.DoubleSide}));m.userData.original=new Float32Array(g.attributes.position.array);this.root.add(m);this.meshes.push(m);});
    this.root.position.y=-.75+size.y*scale/2;this.clear(obj);this.progress=this.target;this.deform();this.el.dataset.status='ready';this.paint();
   }catch(error){if(id===this.loadId){this.el.dataset.status='error';this.onError?.(error);}}}
  this.controls.enabled=true;this.paint();
 }
 deform(){this.el.dataset.progress=this.progress.toFixed(3);this.dirty=true;for(const m of this.meshes){const p=m.geometry.attributes.position,a=m.userData.original,t=this.progress;for(let i=0;i<p.count;i++){const x=a[i*3],y=a[i*3+1],z=a[i*3+2];const len=Math.hypot(x,y,z)||1,noise=1+.07*Math.sin(x*13+y*8)*Math.cos(z*9),r=.82*noise/len;p.setXYZ(i,T.MathUtils.lerp(x*r,x,t)*(this.work.width||1),T.MathUtils.lerp(y*r*.7-.2,y,t),T.MathUtils.lerp(z*r,z,t));}p.needsUpdate=true;m.geometry.computeVertexNormals();m.geometry.computeBoundingSphere();}this.root.updateMatrixWorld(true);}
 paint(){this.dirty=true;const final=['finished','glazed'].includes(this.stage);for(const m of this.meshes){m.material.color.set(final?0x80b4a0:this.stage==='biscuit'?0xe2c6a1:0xbe8c62);m.material.roughness=final?.24:.84;m.material.clearcoat=final?.85:0;}this.clear(this.marks);if(!this.meshes.length)return;
  for(const p of this.work.placements){if(!p.point){this.camera.updateMatrixWorld();for(const [x,y]of [[(p.x-180)/180,-(p.y-180)/180],[0,-.3],[0,-.5],[0,0]]){this.ray.setFromCamera(new T.Vector2(x,y),this.camera);const h=this.ray.intersectObjects(this.meshes)[0];if(h){p.point=h.point.toArray();p.normal=h.face.normal.clone().transformDirection(h.object.matrixWorld).toArray();p.pattern??=this.work.pattern;break;}}}if(p.point&&p.normal)this.decal(p);}
  for(const stroke of this.work.strokes||[])this.drawStroke(stroke);
 }
 clear(group){while(group.children.length){const child=group.children[0];group.remove(child);child.traverse(n=>{n.geometry?.dispose();for(const m of [].concat(n.material||[])){m.map?.dispose();m.dispose();}});}}
 hit(e){const r=this.renderer.domElement.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);this.ray.setFromCamera(this.pointer,this.camera);return this.ray.intersectObjects(this.meshes,false)[0];}
 editable(){return this.work.step===1&&this.work.decorPhase===0&&this.work.technique!=='plain';}
 down(e){if(!this.editable()||this.work.tool==='rotate')return;const hit=this.hit(e);if(!hit)return;this.controls.enabled=false;e.stopImmediatePropagation();e.preventDefault();this.el.setPointerCapture(e.pointerId);this.start=[e.clientX,e.clientY];this.stroke=[];this.append(hit,e);}
 append(hit,e){const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld);this.stroke.push({point:hit.point.toArray(),normal:normal.toArray(),screen:[e.clientX,e.clientY]});}
 move(e){if(!this.stroke)return;e.stopImmediatePropagation();if(this.work.tool!=='draw')return;const hit=this.hit(e);if(hit){const prev=this.stroke.at(-1);if(Math.hypot(e.clientX-prev.screen[0],e.clientY-prev.screen[1])<3)return;this.append(hit,e);this.dirty=true;this.clear(this.preview);this.drawStroke({points:this.stroke},this.preview);}}
 up(e){if(!this.stroke)return;e.stopImmediatePropagation();const points=this.stroke;this.stroke=null;this.dirty=true;this.clear(this.preview);this.controls.enabled=true;if(this.work.tool==='draw'){if(points.length>1)this.onStroke({points});}else if(Math.hypot(e.clientX-this.start[0],e.clientY-this.start[1])<12){const p=points[0];this.onMark({...p,x:180,y:190,scale:.55,pattern:this.work.pattern});}}
 stamp(){const n=this.work.placements.length;const preferred=[[0,0],[-.22,0],[.22,0],[0,.22],[0,-.22],[-.22,-.22],[.22,.22]][n%7];for(const [x,y]of [preferred,[0,0],[0,-.3],[0,-.5],[-.15,-.25],[.15,-.25]]){this.ray.setFromCamera(new T.Vector2(x,y),this.camera);const h=this.ray.intersectObjects(this.meshes)[0];if(h){this.onMark({point:h.point.toArray(),normal:h.face.normal.clone().transformDirection(h.object.matrixWorld).toArray(),x:180,y:190,scale:.55,pattern:this.work.pattern});return;}}}

 decal(p){const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');const carved=this.work.decorPhase===0;ctx.strokeStyle=this.work.technique==='openwork'?'#253c32':carved?'#69432e':'#fff0ce';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=this.work.decorPhase===1?24:9;ctx.lineCap='round';ctx.lineJoin='round';ctx.translate(128,128);ctx.beginPath();
  const pattern=p.pattern||this.work.pattern;
  if(['peony','chrysanthemum','plum','wildflower'].includes(pattern)){const petals=pattern==='chrysanthemum'?16:pattern==='peony'?10:5;for(let i=0;i<petals;i++){const a=i*Math.PI*2/petals;ctx.moveTo(0,0);ctx.quadraticCurveTo(Math.cos(a-.3)*90,Math.sin(a-.3)*90,Math.cos(a)*90,Math.sin(a)*90);ctx.quadraticCurveTo(Math.cos(a+.3)*90,Math.sin(a+.3)*90,0,0);}ctx.moveTo(16,0);ctx.arc(0,0,16,0,Math.PI*2);if(pattern==='wildflower'){ctx.moveTo(0,20);ctx.lineTo(0,110);ctx.moveTo(0,65);ctx.quadraticCurveTo(-60,10,-55,60);ctx.lineTo(0,85);}}
  else if(pattern==='bamboo'){for(let x=-40;x<=40;x+=80){ctx.moveTo(x,100);ctx.lineTo(x,-100);for(let y=-60;y<=70;y+=60){ctx.moveTo(x-10,y);ctx.lineTo(x+10,y);ctx.moveTo(x,y);ctx.quadraticCurveTo(x+65,y-65,x+75,y-25);ctx.quadraticCurveTo(x+45,y,x,y);}}}
  else if(pattern==='willow'){ctx.moveTo(-65,95);ctx.quadraticCurveTo(-60,-50,10,-100);for(let i=0;i<5;i++){ctx.moveTo(-15,-65);ctx.quadraticCurveTo(110-i*20,-100,100-i*30,100-i*9);}}
  else if(pattern==='grape'){for(let row=0;row<4;row++)for(let col=0;col<4-row;col++){const x=(col-(3-row)/2)*38,y=row*37-45;ctx.moveTo(x+19,y);ctx.arc(x,y,19,0,Math.PI*2);}ctx.moveTo(0,-65);ctx.quadraticCurveTo(0,-110,65,-100);}
  else if(pattern==='text'){ctx.save();ctx.font='bold 110px serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('詩',0,5);ctx.restore();}
  else if(pattern==='cloud'){ctx.moveTo(-80,22);ctx.bezierCurveTo(-115,-10,-65,-65,-40,-35);ctx.bezierCurveTo(-35,-100,55,-95,60,-35);ctx.bezierCurveTo(110,-60,120,35,70,35);ctx.lineTo(-75,35);ctx.moveTo(-50,8);ctx.quadraticCurveTo(0,-30,45,12);}
  else if((p.pattern||this.work.pattern)==='lotus'){for(let i=-2;i<=2;i++){ctx.moveTo(0,65);ctx.quadraticCurveTo(i*50,-15,i*38,-65+Math.abs(i)*20);ctx.quadraticCurveTo(i*25,40,0,65);}}
  else {ctx.moveTo(-10,10);ctx.quadraticCurveTo(-50,-85,-105,-50);ctx.quadraticCurveTo(-65,20,-10,30);ctx.quadraticCurveTo(45,20,100,-55);ctx.quadraticCurveTo(40,-45,5,5);ctx.moveTo(0,15);ctx.bezierCurveTo(65,5,0,-70,55,-75);ctx.lineTo(85,-65);ctx.moveTo(-5,27);ctx.lineTo(-35,85);ctx.moveTo(8,25);ctx.lineTo(-10,85);}
  ctx.stroke();const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const pos=new T.Vector3().fromArray(p.point),normal=new T.Vector3().fromArray(p.normal),orientation=new T.Euler().setFromQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),normal));
  for(const mesh of this.meshes){const geo=new DecalGeometry(mesh,pos,orientation,new T.Vector3(.55,.55,.22));if(!geo.attributes.position.count){geo.dispose();continue;}this.marks.add(new T.Mesh(geo,new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,side:T.DoubleSide})));}
 }
 drawStroke(stroke,target=this.marks){const points=stroke.points.map(p=>new T.Vector3().fromArray(p.point).addScaledVector(new T.Vector3().fromArray(p.normal),.008));if(points.length<2)return;const curve=new T.CatmullRomCurve3(points);target.add(new T.Mesh(new T.TubeGeometry(curve,Math.min(256,points.length*3),this.work.decorPhase===1?.024:.012,5,false),new T.MeshStandardMaterial({color:this.work.technique==='openwork'?0x253c32:this.work.decorPhase===0?0x69432e:0xffefcf,roughness:.75})));}
 snapshot(){this.renderer.render(this.scene,this.camera);const image=document.createElement('canvas'),source=this.renderer.domElement;const scale=Math.min(1,384/Math.max(source.width,source.height));image.width=Math.round(source.width*scale);image.height=Math.round(source.height*scale);image.getContext('2d').drawImage(source,0,0,image.width,image.height);return image.toDataURL('image/png');}
 dispose(){++this.loadId;cancelAnimationFrame(this.frame);this.resize.disconnect();this.controls.dispose();this.clear(this.root);this.clear(this.marks);this.clear(this.preview);this.env.dispose();this.renderer.dispose();this.renderer.forceContextLoss();}
}
