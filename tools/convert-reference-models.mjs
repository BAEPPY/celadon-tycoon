/**
 * Rebuild the user-supplied museum references without changing originals.
 * Dependencies (conversion only): meshoptimizer@1.1.1, sharp@0.35.5.
 * Install with npm install --no-save --package-lock=false meshoptimizer@1.1.1 sharp@0.35.5.
 * Extract each OBJ ZIP into <extracted-root>/<museum-id>/ first, then run:
 * node tools/convert-reference-models.mjs <extracted-root> <original-downloads-root> <report.json> [museum-ids...]
 * Optional MESHOPT_MODULE and SHARP_MODULE environment variables select installed modules.
 * Loose source OBJ/JPG files are also read directly from <original-downloads-root>.
 * Report includes source/output hashes, counts, and all conversion settings.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const {MeshoptSimplifier} = await import(process.env.MESHOPT_MODULE
  ? pathToFileURL(process.env.MESHOPT_MODULE).href : 'meshoptimizer');
await MeshoptSimplifier.ready;
const [extractedRoot, archiveRoot, reportPath, ...onlyIds] = process.argv.slice(2);
if (!extractedRoot || !archiveRoot || !reportPath) {
  throw new Error('Usage: node tools/convert-reference-models.mjs <extracted-root> <original-downloads-root> <report.json>');
}
const outputRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/models');
const definitions = [
  {id:'ssu015485', output:'celadon-cup-stand.glb', zUp:true, parts:['ssu015485-001-30000','ssu015485-002-30000'], triangles:16000},
  {id:'ssu000548', output:'celadon-chrysanthemum-cup.glb', zUp:false, smoothNormals:true, parts:['ssu000548-000-30000'], triangles:18000},
  {id:'duk005382', output:'celadon-willow-maebyeong.glb', zUp:true, parts:['duk005382-000-30000'], triangles:28000},
  {id:'duk002170', output:'celadon-pomegranate-ewer.glb', zUp:false, smoothNormals:true, parts:['duk002170-000-30000'], triangles:36000},
  {id:'koo010256', output:'celadon-plum-bamboo-maebyeong.glb', zUp:false, smoothNormals:true, parts:['koo010256-000-30000'], triangles:30000},
  {id:'duk002182', output:'celadon-cloud-crane-maebyeong.glb', zUp:false, parts:['duk002182_000_30000'], triangles:18000, stagedArchive:'duk002182_000_30000.zip'},
  {id:'duk000510', output:'celadon-pomegranate-waterdropper.glb', zUp:false, smoothNormals:true, parts:['duk000510-000-30000 (1)'], triangles:24000, looseTemporaryFiles:true},
  {id:'duk000648', output:'celadon-duck-waterdropper.glb', zUp:false, smoothNormals:true, parts:['duk000648-000-30000'], triangles:30000},
  {id:'duk000019', output:'celadon-gourd-ewer.glb', zUp:false, smoothNormals:true, parts:['duk000019-001-30000','duk000019-002-30000','duk000019-003-30000'], triangles:22000},
  {id:'duk004499', output:'celadon-bamboo-shoot-ewer.glb', zUp:false, parts:['duk004499_001_30000','duk004499_002_30000'], triangles:16000, archiveName:'duk004499_000_30000.zip'},
  {id:'duk006236', output:'celadon-wildflower-gourd-ewer.glb', zUp:false, parts:['duk006236_001_30000','duk006236_002_30000','duk006236_003_30000'], triangles:18000, archiveName:'duk006236_000_30000.zip'},
  {id:'jng007282', output:'celadon-qilin-incense.glb', zUp:false, parts:['jng007282_001_30000','jng007282_002_30000'], triangles:22000, archiveName:'jng007282_000_30000.zip'},
  {id:'duk003063', output:'celadon-qilin-decorated-incense.glb', zUp:false, parts:['duk003063_001_30000','duk003063_002_30000'], triangles:20000, archiveName:'duk003063_000_30000.zip'},
  {id:'ssu010352', output:'celadon-duck-incense.glb', zUp:false, parts:['ssu010352_001_30000','ssu010352_002_30000'], triangles:18000, archiveName:'ssu010352_000_30000.zip'},
  {id:'bon010075', output:'celadon-peony-gourd-ewer.glb', zUp:false, parts:['bon010075-000-30000'], triangles:32000},
  {id:'duk000045', output:'celadon-lotus-incense.glb', zUp:false, parts:['duk000045_001_30000','duk000045_002_30000'], triangles:28000, archiveName:'duk000045_000_30000.zip'},
  {id:'bon000219', output:'celadon-gourd-bottle.glb', zUp:false, parts:['bon000219_000_30000'], triangles:17570, archiveName:'bon000219_000_30000.zip', textures:{bon000219_000_30000:'bon000219-000-30000.jpg'}},
  {id:'duk002857', output:'celadon-poem-gourd-bottle.glb', zUp:false, parts:['duk002857_000_30000'], triangles:22000, archiveName:'duk002857_000_30000.zip'},
];
const settings = {
  meshoptimizer:'1.1.1', sharp:'0.35.5', textureSize:1024, jpegQuality:86,
  maxRelativeError:0.003, attributeWeights:[0.25,0.25,0.05,0.05,0.05],
  sourceUnits:'source coordinates preserved; viewer normalizes displayed size',
  zUpTransform:'(x, y, z) -> (x, z, -y); applied to positions and normals',
  textureCoordinates:'OBJ v flipped to glTF convention',
  material:'JPEG base color from supplied matching JPG; metallic 0; roughness 0.7; no normal map',
  simplification:'attribute-aware, UV and normal seams preserved; vertices compacted after simplification',
  // Default rule; per-model filename overrides are recorded as sourceTexture.
  materialPathRepair:'use same-basename JPG; ignore broken source MTL absolute paths and su/ssu typos',
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function loadObj(text, zUp, smoothNormals=false) {
  const p=[],uv=[],n=[],positions=[],texcoords=[],normals=[],indices=[],unique=new Map();
  const sourcePositionIndices=[];
  let sourceFaces=0;
  const resolveIndex = (s, length) => Number(s)>0 ? Number(s)-1 : length+Number(s);
  const transform = v => zUp ? [v[0],v[2],-v[1]] : v;
  for (const line of text.split(/\r?\n/)) {
    const a=line.trim().split(/\s+/), kind=a.shift();
    if(kind==='v') p.push(a.slice(0,3).map(Number));
    else if(kind==='vt') uv.push(a.slice(0,2).map(Number));
    else if(kind==='vn') n.push(a.slice(0,3).map(Number));
    else if(kind==='f') {
      const face=a.map(key=>{
        const [pi,ti,ni]=key.split('/');
        if(smoothNormals) key=pi+'/'+ti;
        if(unique.has(key)) return unique.get(key);
        if(!ti || !ni) throw new Error('Expected textured OBJ with source normals');
        const i=unique.size;unique.set(key,i);
        sourcePositionIndices.push(resolveIndex(pi,p.length));
        positions.push(...transform(p[resolveIndex(pi,p.length)]));
        const t=uv[resolveIndex(ti,uv.length)];texcoords.push(t[0],1-t[1]);
        normals.push(...transform(n[resolveIndex(ni,n.length)]));
        return i;
      });
      for(let i=1;i<face.length-1;i++) {indices.push(face[0],face[i],face[i+1]);sourceFaces++;}
    }
  }
  if(smoothNormals) {
    // Some Blender OBJ exports have flat per-face normals. Smooth normals across
    // identical positions so these artificial seams do not block simplification.
    const sums=new Float64Array(p.length*3);
    for(let k=0;k<indices.length;k+=3){
      const [a,b,c]=indices.slice(k,k+3),ai=a*3,bi=b*3,ci=c*3;
      const u=[positions[bi]-positions[ai],positions[bi+1]-positions[ai+1],positions[bi+2]-positions[ai+2]];
      const v=[positions[ci]-positions[ai],positions[ci+1]-positions[ai+1],positions[ci+2]-positions[ai+2]];
      const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      for(const i of [a,b,c]) for(let j=0;j<3;j++) sums[sourcePositionIndices[i]*3+j]+=cross[j];
    }
    for(let i=0;i<sourcePositionIndices.length;i++){
      const offset=sourcePositionIndices[i]*3,len=Math.hypot(...sums.subarray(offset,offset+3));
      for(let j=0;j<3;j++) normals[i*3+j]=sums[offset+j]/(len||1);
    }
  }
  return {positions:new Float32Array(positions),texcoords:new Float32Array(texcoords),normals:new Float32Array(normals),indices:new Uint32Array(indices),sourceFaces,sourceVertices:p.length};
}
function simplify(mesh, targetTriangles) {
  const count=mesh.positions.length/3,attrs=new Float32Array(count*5);
  for(let i=0;i<count;i++) {attrs.set(mesh.texcoords.subarray(i*2,i*2+2),i*5);attrs.set(mesh.normals.subarray(i*3,i*3+3),i*5+2);}
  const targetIndices=Math.min(targetTriangles*3,mesh.indices.length);
  const [reduced,error]=MeshoptSimplifier.simplifyWithAttributes(mesh.indices,mesh.positions,3,attrs,5,settings.attributeWeights,null,targetIndices,settings.maxRelativeError,[]);
  const [remap,newCount]=MeshoptSimplifier.compactMesh(reduced);
  const positions=new Float32Array(newCount*3),normals=new Float32Array(newCount*3),texcoords=new Float32Array(newCount*2);
  for(let i=0;i<remap.length;i++) {
    const j=remap[i]; if(j===0xffffffff) continue;
    positions.set(mesh.positions.subarray(i*3,i*3+3),j*3);
    normals.set(mesh.normals.subarray(i*3,i*3+3),j*3);
    texcoords.set(mesh.texcoords.subarray(i*2,i*2+2),j*2);
  }
  return {...mesh, positions,normals,texcoords,indices:newCount<=65535 ? new Uint16Array(reduced) : reduced,error};
}
function makeGlb(parts, id) {
  const doc={asset:{version:'2.0',generator:'celadon-tycoon reference converter'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],textures:[],images:[],samplers:[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}],accessors:[],bufferViews:[],buffers:[{byteLength:0}],extras:{museumId:id,source:'User-provided museum OBJ scan and photograph texture',conversion:settings}};
  const chunks=[];let bytes=0;
  function view(buffer, target) {
    const aligned=(4-bytes%4)%4;if(aligned){chunks.push(Buffer.alloc(aligned));bytes+=aligned;}
    const index=doc.bufferViews.length;
    doc.bufferViews.push({buffer:0,byteOffset:bytes,byteLength:buffer.length,...(target ? {target} : {})});
    chunks.push(buffer);bytes+=buffer.length;return index;
  }
  function accessor(data,type,target,withBounds=false) {
    const width={VEC3:3,VEC2:2,SCALAR:1}[type],a={bufferView:view(Buffer.from(data.buffer,data.byteOffset,data.byteLength),target),componentType:data instanceof Float32Array ? 5126 : data instanceof Uint16Array ? 5123 : 5125,count:data.length/width,type};
    if(withBounds){a.min=Array(width).fill(Infinity);a.max=Array(width).fill(-Infinity);for(let i=0;i<data.length;i++){const j=i%width;a.min[j]=Math.min(a.min[j],data[i]);a.max[j]=Math.max(a.max[j],data[i]);}}
    doc.accessors.push(a);return doc.accessors.length-1;
  }
  for(const part of parts) {
    const i=doc.meshes.length,m=part.mesh;
    const primitive={attributes:{POSITION:accessor(m.positions,'VEC3',34962,true),NORMAL:accessor(m.normals,'VEC3',34962),TEXCOORD_0:accessor(m.texcoords,'VEC2',34962)},indices:accessor(m.indices,'SCALAR',34963),material:i};
    doc.images.push({name:part.name,bufferView:view(part.texture),mimeType:'image/jpeg'});
    doc.textures.push({sampler:0,source:i});
    doc.materials.push({name:part.name,pbrMetallicRoughness:{baseColorTexture:{index:i},metallicFactor:0,roughnessFactor:0.7},doubleSided:true});
    doc.meshes.push({name:part.name,primitives:[primitive]});doc.nodes.push({name:part.name,mesh:i});doc.scenes[0].nodes.push(i);
  }
  const pad=(4-bytes%4)%4;if(pad){chunks.push(Buffer.alloc(pad));bytes+=pad;}doc.buffers[0].byteLength=bytes;
  let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
  const header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+json.length+8+bytes,8);
  jh.writeUInt32LE(json.length,0);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(bytes,0);bh.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,jh,json,bh,...chunks]);
}
const report={settings,artifacts:[]};
if(onlyIds.length) {
  try {report.artifacts=JSON.parse(await fs.readFile(reportPath,'utf8')).artifacts.filter(a=>!onlyIds.includes(a.id));}
  catch(error){if(error.code!=='ENOENT')throw error;}
  for(const id of onlyIds) if(!definitions.some(d=>d.id===id)) throw new Error('Unknown museum ID: '+id);
}
for(const def of definitions.filter(d=>!onlyIds.length || onlyIds.includes(d.id))) {
  const parts=[],details=[];
  let sourceDir=path.join(extractedRoot,def.id);
  try {await fs.access(sourceDir);} catch {sourceDir=path.join(archiveRoot,def.id,'디지털콘텐츠_OBJ');}
  for(const name of def.parts) {
    const obj=await fs.readFile(path.join(sourceDir,name+'.obj'),'utf8');
    const mesh=simplify(loadObj(obj,def.zUp,def.smoothNormals),def.triangles);
    const textureFile=def.textures?.[name] || name+'.jpg';
    const texture=await sharp(path.join(sourceDir,textureFile)).resize(settings.textureSize,settings.textureSize,{fit:'inside'}).jpeg({quality:settings.jpegQuality,chromaSubsampling:'4:4:4',mozjpeg:false}).toBuffer();
    parts.push({name,mesh,texture});
    details.push({name,sourceVertices:mesh.sourceVertices,sourceTriangles:mesh.sourceFaces,outputVertices:mesh.positions.length/3,outputTriangles:mesh.indices.length/3,relativeSimplificationError:mesh.error,sourceTexture:textureFile,textureResolution:[settings.textureSize,settings.textureSize],textureBytes:texture.length});
  }
  const archiveName=def.archiveName || def.id+'-000-30000.zip';
  const glb=makeGlb(parts,def.id),sourceZip=def.stagedArchive ? path.join(sourceDir,def.stagedArchive) : path.join(archiveRoot,def.id,'디지털콘텐츠_OBJ',archiveName);
  await fs.mkdir(outputRoot,{recursive:true});await fs.writeFile(path.join(outputRoot,def.output),glb);
  const sourceHashes={};
  try {sourceHashes.sourceArchive=def.stagedArchive || def.id+'/디지털콘텐츠_OBJ/'+archiveName;sourceHashes.sourceArchiveSha256=sha256(await fs.readFile(sourceZip));}
  catch(error) {if(error.code!=='ENOENT')throw error;delete sourceHashes.sourceArchive;sourceHashes.sourceFiles=[];for(const name of def.parts)for(const ext of ['obj','mtl','jpg']){const filename=name+'.'+ext;sourceHashes.sourceFiles.push({path:def.looseTemporaryFiles ? filename : def.id+'/디지털콘텐츠_OBJ/'+filename,sha256:sha256(await fs.readFile(path.join(sourceDir,filename)))});}}
  const entry={id:def.id,output:def.output,...sourceHashes,outputSha256:sha256(glb),outputBytes:glb.length,rotation:def.zUp ? 'X -90 degrees' : 'unchanged Y-up',normals:def.smoothNormals ? 'area-weighted smooth normals at shared source positions' : 'source normals preserved',parts:details};
  report.artifacts.push(entry);console.log(JSON.stringify(entry));
}
await fs.mkdir(path.dirname(path.resolve(reportPath)),{recursive:true});
report.artifacts.sort((a,b)=>definitions.findIndex(d=>d.id===a.id)-definitions.findIndex(d=>d.id===b.id));
await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
