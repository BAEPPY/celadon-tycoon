// Temporary preview-only diagnostic. Removed before the fix is merged.
import {randomBytes} from 'node:crypto';
import {BlobClassroomStore, classroomPrefix} from '../classroom-store.js';
export default async function handler(req,res) {
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','private, no-store');
  if(process.env.VERCEL_ENV!=='preview'){res.statusCode=404;res.end('{}');return;}
  const store=new BlobClassroomStore(),key=`${classroomPrefix()}/ZZZZZZ/checks/${randomBytes(16).toString('hex')}.json`,steps=[];
  const safe=error=>({name:String(error?.name||'Error'),status:error?.statusCode??error?.status??null,message:String(error?.message||'').replace(/https?:\/\/\S+|vercel_blob_rw_\S+/g,'[redacted]').slice(0,220)});
  try {
    const created=await store.create(key,{version:1});steps.push({step:'create',etag:created.etag});
    const read=await store.read(key);steps.push({step:'read',version:read?.data.version,etag:read?.etag,equal:read?.etag===created.etag});
    try{const changed=await store.update(key,{version:2},read.etag);steps.push({step:'conditional-update',ok:true,etag:changed.etag});}
    catch(error){steps.push({step:'conditional-update',ok:false,error:safe(error)});}
    const {head,put}=await store.sdk(),meta=await head(key);steps.push({step:'metadata',etag:meta.etag});
    try{const changed=await put(key,JSON.stringify({version:3}),{access:'private',addRandomSuffix:false,allowOverwrite:true,ifMatch:meta.etag,contentType:'application/json'});steps.push({step:'metadata-conditional-update',ok:true,etag:changed.etag});}
    catch(error){steps.push({step:'metadata-conditional-update',ok:false,error:safe(error)});}
    const final=await store.read(key);steps.push({step:'final-read',version:final?.data.version,etag:final?.etag});
  }catch(error){steps.push({step:'exception',error:safe(error)});}
  finally{try{await store.delete(key);steps.push({step:'cleanup',ok:true});}catch(error){steps.push({step:'cleanup',error:safe(error)});}}
  res.end(JSON.stringify({steps}));
}
