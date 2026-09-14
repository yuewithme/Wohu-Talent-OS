import { createServer } from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ResumeMetaSchema, MAX_RESUME_BYTES } from '../src/sync/contracts';
import { Feishu } from './feishu';

const required=(key:string)=>{const v=process.env[key];if(!v)throw Error(`Missing ${key}`);return v;};
const access=required('SYNC_ACCESS_TOKEN');if(access.length<32)throw Error('SYNC_ACCESS_TOKEN must contain at least 32 characters');
const directory=resolve(process.env.DATA_DIR||'server/data');mkdirSync(directory,{recursive:true,mode:0o700});
const db=new DatabaseSync(join(directory,'sync.sqlite'));db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS jobs(key TEXT PRIMARY KEY,meta TEXT NOT NULL,hash TEXT NOT NULL,path TEXT NOT NULL,state TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,file_token TEXT,record_id TEXT,error TEXT,client_token TEXT NOT NULL,created_at INTEGER NOT NULL);
UPDATE jobs SET state='retry' WHERE state='processing';`);
const feishu=new Feishu({appId:required('FEISHU_APP_ID'),appSecret:required('FEISHU_APP_SECRET'),base:required('FEISHU_BASE_TOKEN'),table:required('FEISHU_TABLE_ID'),baseUrl:required('FEISHU_BASE_URL'),fields:{name:'候选人',file:'简历附件',key:'同步键',job:'沟通职位',account:'BOSS账号',candidate:'候选人标识',message:'消息标识',filename:'原文件名',received:'接收时间',hash:'文件SHA256'}});
let working=false;
async function work(){
  if(working)return;working=true;
  try{
    const j=db.prepare("SELECT * FROM jobs WHERE state IN ('pending','retry') AND next_at<=? ORDER BY created_at LIMIT 1").get(Date.now()) as any;if(!j)return;
    db.prepare("UPDATE jobs SET state='processing',attempts=attempts+1 WHERE key=?").run(j.key);
    try{
      const existing=await feishu.find(j.key);
      let record=existing?.record_id;
      if(existing&&!existing.fields?.[feishu.config.fields.file]?.length)throw Error('FEISHU_EXISTING_WITHOUT_ATTACHMENT');
      if(!record){
        let token=j.file_token;
        const meta=ResumeMetaSchema.parse(JSON.parse(j.meta));
        if(!token){token=await feishu.upload(meta.filename,readFileSync(j.path));db.prepare('UPDATE jobs SET file_token=? WHERE key=?').run(token,j.key);}
        record=await feishu.create({'候选人':meta.candidate_name,'简历附件':[{file_token:token}],'同步键':j.key,'沟通职位':meta.job_title,'BOSS账号':meta.account_id,'候选人标识':meta.candidate_id,'消息标识':meta.message_id,'原文件名':meta.filename,'接收时间':Date.parse(meta.received_at),'文件SHA256':j.hash},j.client_token);
      }
      db.prepare("UPDATE jobs SET state='done',record_id=?,error=NULL WHERE key=?").run(record,j.key);
      if(existsSync(j.path))unlinkSync(j.path);
    }catch(e){
      const error=e instanceof Error&&/^FEISHU_[A-Z0-9_]+$/.test(e.message)?e.message:'SYNC_FAILED';
      const tries=j.attempts+1;db.prepare('UPDATE jobs SET state=?,next_at=?,error=? WHERE key=?').run(tries>=6?'blocked':'retry',Date.now()+Math.min(3600000,30000*2**tries),error,j.key);
    }
  }finally{working=false;}
}
setInterval(()=>void work(),3000).unref();
const authorize=(header:unknown)=>{const value=typeof header==='string'?header.replace(/^Bearer /,''):'';const a=Buffer.from(value),b=Buffer.from(access);return a.length===b.length&&timingSafeEqual(a,b);};
const output=(res:any,status:number,body:unknown)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
function fileValid(bytes:Buffer,name:string){
  if(/\.pdf$/i.test(name))return bytes.subarray(0,5).toString()==='%PDF-';
  if(/\.docx$/i.test(name))return bytes[0]===0x50&&bytes[1]===0x4b;
  if(/\.doc$/i.test(name))return bytes.subarray(0,8).toString('hex')==='d0cf11e0a1b11ae1';
  if(/\.png$/i.test(name))return bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a';
  if(/\.(jpg|jpeg)$/i.test(name))return bytes[0]===255&&bytes[1]===216;
  if(/\.rtf$/i.test(name))return bytes.subarray(0,5).toString()==='{\\rtf';
  return /\.txt$/i.test(name)&&!bytes.includes(0)&&!bytes.subarray(0,100).toString().includes('<html');
}
createServer(async(req,res)=>{
  try{
    const url=new URL(req.url||'/', 'http://localhost');
    if(req.method==='GET'&&url.pathname==='/healthz')return output(res,200,{ok:true});
    if(!authorize(req.headers.authorization))return output(res,401,{error:'UNAUTHORIZED'});
    if(req.method==='GET'&&url.pathname==='/v1/status'){await feishu.check();return output(res,200,{ok:true});}
    if(req.method==='GET'&&/^\/v1\/resumes\/[a-f0-9]{64}$/.test(url.pathname)){
      const row=db.prepare('SELECT key,state,record_id,error FROM jobs WHERE key=?').get(url.pathname.split('/').pop()!) as any;
      return row?output(res,200,{...row,record_url:row.record_id?feishu.recordUrl(row.record_id):undefined}):output(res,404,{error:'NOT_FOUND'});
    }
    if(req.method==='POST'&&/^\/v1\/resumes\/[a-f0-9]{64}\/retry$/.test(url.pathname)){
      const key=url.pathname.split('/')[3];db.prepare("UPDATE jobs SET state='retry',attempts=0,next_at=0,error=NULL WHERE key=? AND state='blocked'").run(key);void work();return output(res,200,{ok:true});
    }
    if(req.method!=='POST'||url.pathname!=='/v1/resumes')return output(res,404,{error:'NOT_FOUND'});
    let size=0;const parts:Buffer[]=[];
    for await(const part of req){size+=part.length;if(size>MAX_RESUME_BYTES*1.4+16384){output(res,413,{error:'FILE_TOO_LARGE'});return;}parts.push(part);}
    const body=JSON.parse(Buffer.concat(parts).toString('utf8')),meta=ResumeMetaSchema.parse(body.meta);
    if(typeof body.file!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.file))return output(res,400,{error:'INVALID_FILE'});
    const bytes=Buffer.from(body.file,'base64');if(!bytes.length||bytes.length>MAX_RESUME_BYTES||!fileValid(bytes,meta.filename))return output(res,400,{error:'INVALID_FILE'});
    const hash=createHash('sha256').update(bytes).digest('hex'),key=createHash('sha256').update(`${meta.account_id}:${meta.candidate_id}:${hash}`).digest('hex');
    let row=db.prepare('SELECT key,state,record_id FROM jobs WHERE key=?').get(key) as any;
    if(!row){
      const path=join(directory,key+'.bin');writeFileSync(path,bytes,{mode:0o600});
      db.prepare("INSERT INTO jobs(key,meta,hash,path,state,client_token,created_at) VALUES(?,?,?,?,'pending',?,?)").run(key,JSON.stringify(meta),hash,path,randomUUID(),Date.now());
      row={key,state:'pending'};
    }
    void work();return output(res,202,{...row,record_url:row.record_id?feishu.recordUrl(row.record_id):undefined});
  }catch(e){
    const message=e instanceof Error&&/^FEISHU_[A-Z0-9_]+$/.test(e.message)?e.message:'REQUEST_FAILED';output(res,400,{error:message});
  }
}).listen(Number(process.env.PORT||8787),process.env.HOST||'127.0.0.1',()=>console.log('Resume sync service ready'));
