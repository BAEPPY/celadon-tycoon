import {mkdir,copyFile,cp} from 'node:fs/promises';
import {build} from 'esbuild';
await mkdir('dist',{recursive:true});
await build({entryPoints:{app:'app-v3.js'},outdir:'dist',bundle:true,format:'esm',splitting:true,minify:true,target:['es2022'],charset:'utf8'});
for(const file of ['index.html','style.css','arcade.css','stations.css','clay-workshop.css','shape-workshop.css','decoration-workshop.css','inspection-workshop.css','kiln-workshop.css','reactions.css','desk-props.css','finish-workshop.css']) await copyFile(file,`dist/${file}`);
await cp('assets','dist/assets',{recursive:true});
console.log('Built tycoon game + lazy 3D viewer + local museum assets');
