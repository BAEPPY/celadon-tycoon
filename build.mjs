import {mkdir,copyFile,cp,rm,readFile,writeFile,readdir} from 'node:fs/promises';
import {build} from 'esbuild';
await mkdir('dist',{recursive:true});
await build({entryPoints:{app:'app-v3.js','classroom-app':'classroom-app.js'},outdir:'dist',bundle:true,format:'esm',splitting:true,minify:true,target:['es2022'],charset:'utf8'});
for(const file of ['index.html','style.css','arcade.css','stations.css','clay-workshop.css','shape-workshop.css','decoration-workshop.css','inspection-workshop.css','kiln-workshop.css','reactions.css','desk-props.css','finish-workshop.css']) await copyFile(file,`dist/${file}`);
await cp('assets','dist/assets',{recursive:true});
// Provenance remains in the repository; the blind observation activity serves only neutral assets.
await Promise.all(['README.md','provenance.json'].map(file=>rm(`dist/assets/lesson/${file}`,{force:true})));
// The repository keeps the lesson GLBs byte-identical to their sources (provenance.json). Their node, material and image
// names and extras still say what each object is ("Japanese peony vase", "Pillow", museum IDs), which would give away
// the activity answers, so only the served copies drop them. Geometry, textures and the asset block are unchanged.
async function stripGlbNames(file){
  const data=await readFile(file);
  if(data.readUInt32LE(0)!==0x46546c67||data.readUInt32LE(16)!==0x4e4f534a)throw new Error(`${file} is not a binary glTF`);
  const jsonLength=data.readUInt32LE(12),json=JSON.parse(data.subarray(20,20+jsonLength).toString('utf8')),asset=json.asset;
  const clean=value=>{if(Array.isArray(value))value.forEach(clean);else if(value&&typeof value==='object'){delete value.name;delete value.extras;Object.values(value).forEach(clean);}};
  clean(json);json.asset=asset;
  const text=Buffer.from(JSON.stringify(json)),chunk=Buffer.alloc(Math.ceil(text.length/4)*4,0x20);text.copy(chunk);
  const rest=data.subarray(20+jsonLength),header=Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+chunk.length+rest.length,8);header.writeUInt32LE(chunk.length,12);header.writeUInt32LE(0x4e4f534a,16);
  await writeFile(file,Buffer.concat([header,chunk,rest]));
}
for(const file of await readdir('dist/assets/lesson'))if(file.endsWith('.glb'))await stripGlbNames(`dist/assets/lesson/${file}`);
await copyFile('classroom.css','dist/classroom.css');
for(const route of ['lesson','teacher','observe']){
  await mkdir(`dist/${route}`,{recursive:true});
  await copyFile('classroom.html',`dist/${route}/index.html`);
}
console.log('Built classroom activities + teacher dashboard + tycoon game');
