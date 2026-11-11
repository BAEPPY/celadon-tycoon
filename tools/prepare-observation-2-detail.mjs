/** Build an enlarged-view LOD from the supplied openwork stool's original WRL-derived GLB.
 * Dependency (conversion only): meshoptimizer@1.1.1.
 * npm install --prefix /tmp/celadon-stool-tools --no-package-lock meshoptimizer@1.1.1
 * MESHOPT_MODULE=/tmp/celadon-stool-tools/node_modules/meshoptimizer/index.js node tools/prepare-observation-2-detail.mjs
 * The card stays unchanged. No fabricated texture, new surface, hole filling,
 * colour adjustment or normal regeneration is used by this conversion.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source='assets/models/detail/celadon-stool-wrl.glb';
const destination='assets/lesson/detail/observation-2.glb';
const {MeshoptSimplifier}=await import(process.env.MESHOPT_MODULE?pathToFileURL(process.env.MESHOPT_MODULE).href:'meshoptimizer');
await MeshoptSimplifier.ready;
const original=await fs.readFile(path.join(root,source));
assert.equal(original.toString('ascii',0,4),'glTF');
assert.equal(original.readUInt32LE(8),original.length);
const jsonLength=original.readUInt32LE(12),doc=JSON.parse(original.toString('utf8',20,20+jsonLength));
const binary=original.subarray(28+jsonLength),primitive=doc.meshes[0].primitives[0];
assert.equal(doc.meshes.length,1);assert.equal(doc.meshes[0].primitives.length,1);
assert.deepEqual(Object.keys(primitive.attributes).sort(),['COLOR_0','NORMAL','POSITION']);
assert.equal(doc.images?.length||0,0);
const types={5123:Uint16Array,5125:Uint32Array,5126:Float32Array},widths={SCALAR:1,VEC3:3,VEC4:4};
function readAccessor(index){
 const accessor=doc.accessors[index],view=doc.bufferViews[accessor.bufferView],Type=types[accessor.componentType];
 assert.ok(Type);assert.equal(view.byteStride,undefined);assert.equal(accessor.sparse,undefined);
 const offset=(view.byteOffset||0)+(accessor.byteOffset||0),count=accessor.count*widths[accessor.type];
 const bytes=binary.subarray(offset,offset+count*Type.BYTES_PER_ELEMENT);
 return new Type(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
}
const positions=readAccessor(primitive.attributes.POSITION),normals=readAccessor(primitive.attributes.NORMAL),colours=readAccessor(primitive.attributes.COLOR_0),indices=readAccessor(primitive.indices);
const vertexCount=positions.length/3,attributes=new Float32Array(vertexCount*7);
assert.equal(colours.length,vertexCount*4);assert.equal(doc.accessors[primitive.attributes.COLOR_0].normalized,true);
for(let i=0;i<vertexCount;i++){
 attributes.set(normals.subarray(i*3,i*3+3),i*7);
 for(let c=0;c<4;c++)attributes[i*7+3+c]=colours[i*4+c]/65535;
}
// Preserve colour transitions, geometric boundaries and original topology.
// In particular, do not use meshoptimizer's Prune or permissive options.
const settings={meshoptimizer:'1.1.1',targetTriangles:160000,maxRelativeError:0.001,
 attributeWeights:[0.15,0.15,0.15,1,1,1,1],flags:['LockBorder']};
function topology(elements,count){
 const parent=Uint32Array.from({length:count},(_,i)=>i),used=new Uint8Array(count),edges=new Map();
 const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
 let faces=0;
 for(let i=0;i<elements.length;i+=3){
  const a=elements[i],b=elements[i+1],c=elements[i+2];if(a===b||a===c||b===c)continue;faces++;
  for(const [x,y]of[[a,b],[b,c],[c,a]]){used[x]=1;parent[find(x)]=find(y);const key=Math.min(x,y)*count+Math.max(x,y);edges.set(key,(edges.get(key)||0)+1);}
 }
 const roots=new Set(),defects=new Set();let vertices=0,boundaryEdges=0,nonManifoldEdges=0;
 for(let i=0;i<count;i++)if(used[i]){vertices++;roots.add(find(i));}
 for(const [key,n]of edges){if(n===1)boundaryEdges++;if(n>2){nonManifoldEdges++;defects.add(Math.floor(key/count));defects.add(key%count);}}
 return {stats:{vertices,edges:edges.size,faces,components:roots.size,eulerCharacteristic:vertices-edges.size+faces,boundaryEdges,nonManifoldEdges},defects:[...defects]};
}
const sourceTopology=topology(indices,vertexCount).stats,locks=new Uint8Array(vertexCount);
let reduced,error,detailTopology,topologyPasses=0;
for(;topologyPasses<4;topologyPasses++){
 [reduced,error]=MeshoptSimplifier.simplifyWithAttributes(indices,positions,3,attributes,7,settings.attributeWeights,locks,settings.targetTriangles*3,settings.maxRelativeError,settings.flags);
 const result=topology(reduced,vertexCount);detailTopology=result.stats;
 if(['components','eulerCharacteristic','boundaryEdges','nonManifoldEdges'].every(key=>detailTopology[key]===sourceTopology[key]))break;
 // Very thin source structures can otherwise pinch into non-manifold edges.
 // Keep the entire source neighbourhood around those edges at original detail
 // and repeat from the original mesh, not from the already simplified result.
 assert.ok(result.defects.length,'Simplification changed topology without an identifiable pinched edge.');
 const pinRadius=3.6;
 for(const point of result.defects)for(let i=0;i<vertexCount;i++){
  const x=positions[i*3]-positions[point*3],y=positions[i*3+1]-positions[point*3+1],z=positions[i*3+2]-positions[point*3+2];
  if(x*x+y*y+z*z<pinRadius*pinRadius)locks[i]=1;
 }
}
for(const key of ['components','eulerCharacteristic','boundaryEdges','nonManifoldEdges'])assert.equal(detailTopology[key],sourceTopology[key],`Openwork topology changed: ${key}`);
const [remap,newCount]=MeshoptSimplifier.compactMesh(reduced),newPositions=new Float32Array(newCount*3),newNormals=new Float32Array(newCount*3),newColours=new Uint16Array(newCount*4);
for(let i=0;i<remap.length;i++){
 const target=remap[i];if(target===0xffffffff)continue;
 newPositions.set(positions.subarray(i*3,i*3+3),target*3);
 newNormals.set(normals.subarray(i*3,i*3+3),target*3);
 newColours.set(colours.subarray(i*4,i*4+4),target*4);
}
const arrays=[newPositions,newNormals,newColours,newCount<=65535?new Uint16Array(reduced):reduced];
const accessorIndices=[primitive.attributes.POSITION,primitive.attributes.NORMAL,primitive.attributes.COLOR_0,primitive.indices];
const outputChunks=[];let offset=0;
for(let i=0;i<arrays.length;i++){
 const array=arrays[i],accessor=doc.accessors[accessorIndices[i]],view=doc.bufferViews[accessor.bufferView];
 const padding=(-offset)&3;if(padding){outputChunks.push(Buffer.alloc(padding));offset+=padding;}
 const data=Buffer.from(array.buffer,array.byteOffset,array.byteLength);view.byteOffset=offset;view.byteLength=data.length;offset+=data.length;outputChunks.push(data);
 accessor.count=i===3?array.length:newCount;accessor.componentType=array instanceof Float32Array?5126:array instanceof Uint16Array?5123:5125;
 if(i===0){accessor.min=[Infinity,Infinity,Infinity];accessor.max=[-Infinity,-Infinity,-Infinity];for(let j=0;j<array.length;j++){const c=j%3;accessor.min[c]=Math.min(accessor.min[c],array[j]);accessor.max[c]=Math.max(accessor.max[c],array[j]);}}
}
doc.buffers[0].byteLength=offset;doc.asset.generator='Activity 2 enlarged-view LOD; source geometry, colours and normals retained';
const geometry=Buffer.concat(outputChunks);let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((-json.length)&3,32)]);
const header=Buffer.alloc(20),binaryHeader=Buffer.alloc(8);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+geometry.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);binaryHeader.writeUInt32LE(geometry.length);binaryHeader.writeUInt32LE(0x004e4942,4);
const output=Buffer.concat([header,json,binaryHeader,geometry]);assert.ok(output.length<10_000_000);
await fs.mkdir(path.dirname(path.join(root,destination)),{recursive:true});await fs.writeFile(path.join(root,destination),output);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const record={id:'observation-2',file:'detail/observation-2.glb',quality:'detail',source,sourceSha256:sha(original),bytes:output.length,sha256:sha(output),copiedWithoutModification:false,triangles:reduced.length/3,vertices:newCount,
 conversion:{script:'tools/prepare-observation-2-detail.mjs',...settings,achievedRelativeError:error,topologyPasses:topologyPasses+1,lockedVertices:locks.reduce((sum,value)=>sum+value,0),
 geometry:'Topology-preserving attribute-aware simplification. Source positions, normals and uint16 RGBA vertex colours are retained for every surviving vertex. No new surfaces or filled holes.',
 texture:'No supplied photographic texture is present. Original vertex colours remain unchanged; no synthetic atlas.',sourceTopology,detailTopology}};
const provenancePath=path.join(root,'assets/lesson/provenance.json'),report=JSON.parse(await fs.readFile(provenancePath,'utf8'));
report.assets=report.assets.filter(item=>item.file!==record.file);report.assets.push(record);
await fs.writeFile(provenancePath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(record,null,2));
