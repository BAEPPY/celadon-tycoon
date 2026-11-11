import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {RUN_FRAME_COUNT} from '../loading-gait.js';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const cell=320,columns=6,rows=4;
const outputDirectory=process.env.LOADING_OUTPUT_DIR||join(tmpdir(),'celadon-loading');
const bundle=await build({entryPoints:['loading-runner-art.js'],bundle:true,write:false,format:'iife',globalName:'RunnerArt',target:'es2022'});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
await mkdir(outputDirectory,{recursive:true});
try{
 const page=await browser.newPage();await page.setContent('<canvas></canvas>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 for(const character of ['girl','boy']){
  const body=await readFile(`art-source/loading/${character}-body.webp`);
  const data=await page.evaluate(async({src,character,cell,columns,rows,count})=>{
   const image=new Image();image.src=src;await image.decode();
   const canvas=document.querySelector('canvas');canvas.width=cell*columns;canvas.height=cell*rows;
   const ctx=canvas.getContext('2d');
   for(let i=0;i<count;i++){ctx.save();ctx.translate(i%columns*cell,Math.floor(i/columns)*cell);RunnerArt.drawRunner(ctx,image,character,i/count,cell);ctx.restore();}
   return canvas.toDataURL('image/png').split(',')[1];
  },{src:`data:image/webp;base64,${body.toString('base64')}`,character,cell,columns,rows,count:RUN_FRAME_COUNT});
  const png=Buffer.from(data,'base64');
  await writeFile(join(outputDirectory,`${character}-run-24.png`),png);
  console.log(`${character}: ${RUN_FRAME_COUNT} connected pose guides, ${cell*columns}×${cell*rows}`);
 }
}finally{await browser.close();}
