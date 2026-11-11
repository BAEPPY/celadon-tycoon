import http from 'node:http';
import assess from './api/assess.js';
import classroomHandler,{createClassroomHandler} from './api/classroom.js';
// For checking on this computer without an AI helper: CLASSROOM_FAKE_GROUPING=1 puts every answer about resting the
// head (머리 · 베고 · 낮잠 · 누워) under one word, as the helper would. The deployed site never reads this file.
const fakeGrouping=async({answers})=>{const rest=answers.map((answer,id)=>/머리|베고|낮잠|누워/.test(answer.text)?id:-1).filter(id=>id>=0);
  return [...(rest.length?[{label:'머리를 받치고 쉬어요',ids:rest}]:[]),...answers.map((answer,id)=>rest.includes(id)?null:{label:answer.text,ids:[id]}).filter(Boolean)];};
const classroom=process.env.CLASSROOM_FAKE_GROUPING==='1'?createClassroomHandler({groupWithAI:fakeGrouping}):classroomHandler;
import cleanupClassroom from './api/cleanup-classroom.js';
import workPicture from './api/work-picture.js';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(process.cwd(),'dist');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.glb':'model/gltf-binary','.woff2':'font/woff2','.woff':'font/woff','.xml':'application/xml'};
http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){const entry=url.searchParams.get('classroom')==='1'?'/game':'/lesson';res.writeHead(307,{'Location':entry+url.search,'Cache-Control':'no-store'}).end();return;}if(url.pathname==='/api/assess'){await assess(req,res);return;}if(url.pathname==='/api/classroom'){await classroom(req,res);return;}if(url.pathname==='/api/work-picture'){await workPicture(req,res);return;}if(url.pathname==='/api/cleanup-classroom'){await cleanupClassroom(req,res);return;}let relative=decodeURIComponent(url.pathname)==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);if(/^(lesson|teacher|observe|model|game|present)\/?$/.test(relative))relative=relative.replace(/\/$/,'')+'/index.html';const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}const data=await readFile(file);res.writeHead(200,{'Content-Type':(types[path.extname(file)]||'application/octet-stream')+'; charset=utf-8','Cache-Control':'no-cache'}).end(data);}catch{res.writeHead(404).end('Not found');}}).listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log('Celadon workshop server ready'));
