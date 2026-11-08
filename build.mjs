import {mkdir,copyFile,cp,rm} from 'node:fs/promises';
import {build} from 'esbuild';
await mkdir('dist',{recursive:true});
await build({entryPoints:{app:'app-v3.js','classroom-app':'classroom-app.js'},outdir:'dist',bundle:true,format:'esm',splitting:true,minify:true,target:['es2022'],charset:'utf8'});
for(const file of ['index.html','style.css','arcade.css','stations.css','clay-workshop.css','shape-workshop.css','decoration-workshop.css','inspection-workshop.css','kiln-workshop.css','reactions.css','desk-props.css','finish-workshop.css']) await copyFile(file,`dist/${file}`);
await cp('assets','dist/assets',{recursive:true});
// Provenance remains in the repository; the blind observation activity serves only neutral assets.
await Promise.all(['README.md','provenance.json'].map(file=>rm(`dist/assets/lesson/${file}`,{force:true})));
await copyFile('classroom.css','dist/classroom.css');
for(const route of ['lesson','teacher']){
  await mkdir(`dist/${route}`,{recursive:true});
  await copyFile('classroom.html',`dist/${route}/index.html`);
}
console.log('Built classroom activities + teacher dashboard + tycoon game');
