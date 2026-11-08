import http from 'node:http';
import assess from './api/assess.js';
import classroom from './api/classroom.js';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(process.cwd(),'dist');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.woff2':'font/woff2'};
http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/api/assess'){await assess(req,res);return;}if(url.pathname==='/api/classroom'){await classroom(req,res);return;}let relative=decodeURIComponent(url.pathname)==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);if(/^(lesson|teacher)\/?$/.test(relative))relative=relative.replace(/\/$/,'')+'/index.html';const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}const data=await readFile(file);res.writeHead(200,{'Content-Type':(types[path.extname(file)]||'application/octet-stream')+'; charset=utf-8','Cache-Control':'no-cache'}).end(data);}catch{res.writeHead(404).end('Not found');}}).listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log('Celadon workshop server ready'));
