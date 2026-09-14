import { AttachmentSchema, EMPTY_SYNC, MAX_RESUME_BYTES, SYNC_DEFAULTS, SyncSettingsSchema, attachmentKey, type Contact, type SyncSettings, type SyncState } from '../sync/contracts';
import { apiOrigin, hostPattern, isBossUrl } from '../shared/guards';
import { storageReady } from './storage';

let running=false;
const alarm='resume-sync';
async function config(){await storageReady;const d=await chrome.storage.local.get('resumeSyncSettings');return SyncSettingsSchema.parse(d.resumeSyncSettings||SYNC_DEFAULTS);}
async function state():Promise<SyncState>{await storageReady;return (await chrome.storage.local.get('resumeSyncState')).resumeSyncState as SyncState||structuredClone(EMPTY_SYNC);}
async function save(s:SyncState){await chrome.storage.local.set({resumeSyncState:s});}
async function api(c:SyncSettings,path:string,body?:unknown){
  const r=await fetch(apiOrigin(c.service_origin)+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${c.token}`,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(25000)});
  const d=await r.json();if(!r.ok)throw Error(typeof d.error==='string'?d.error:`SERVICE_HTTP_${r.status}`);return d;
}
async function chatTab(){
  const tabs=await chrome.tabs.query({url:'https://www.zhipin.com/*'});
  if(!tabs.length)throw Error('WAITING_BOSS');
  const existing=tabs.find(t=>t.url&&new URL(t.url).pathname==='/web/chat/index'&&new URL(t.url).searchParams.get('wohu_sync')==='1');
  if(existing?.id)return existing.id;
  await chrome.tabs.create({url:'https://www.zhipin.com/web/chat/index?wohu_sync=1',active:false});throw Error('CHAT_NOT_READY');
}
async function page<T>(tab:number,type:string,args:unknown={}):Promise<T>{
  await chrome.scripting.executeScript({target:{tabId:tab},world:'MAIN',files:['chat.js']});
  const r=await chrome.scripting.executeScript({target:{tabId:tab},world:'MAIN',func:async(type:string,args:unknown)=>(window as any).__wohuChat.request(type,args),args:[type,args]});
  const result=r[0]?.result;if(!result?.ok)throw Error(result?.error||'CHAT_NOT_READY');return result.data as T;
}
async function fileBytes(url:string){
  const u=new URL(url);if(u.origin!=='https://docdownload.zhipin.com'||!u.pathname.startsWith('/wflow/zpgeek/download/download4boss/'))throw Error('DOWNLOAD_URL_REJECTED');
  const r=await fetch(url,{credentials:'include',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(25000)});
  if(!r.ok||/json|html/i.test(r.headers.get('content-type')||''))throw Error('DOWNLOAD_REQUIRES_LOGIN');
  const reader=r.body?.getReader();if(!reader)throw Error('EMPTY_FILE');
  const parts:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_RESUME_BYTES)throw Error('FILE_TOO_LARGE');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}
  if(!size)throw Error('EMPTY_FILE');
  const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);
}
export async function syncStatus(){const c=await config(),s=await state();return {settings:{...c,token:''},has_token:!!c.token,state:s,running};}
export async function saveSync(input:unknown){
  if(running)throw Error('SYNC_BUSY');
  running=true;
  try{
  const c=SyncSettingsSchema.parse(input),old=await config();if(!c.token)c.token=old.token;
  if(c.enabled){c.service_origin=apiOrigin(c.service_origin);if(!c.token)throw Error('SYNC_TOKEN_REQUIRED');if(!await chrome.permissions.contains({origins:[hostPattern(c.service_origin)]}))throw Error('HOST_PERMISSION_REQUIRED');await api(c,'/v1/status');}
  if(old.service_origin&&old.service_origin!==c.service_origin&&(await state()).jobs.some(j=>j.status!=='done'))throw Error('SYNC_DESTINATION_HAS_PENDING_JOBS');
  if(old.service_origin&&old.service_origin!==c.service_origin)await save(structuredClone(EMPTY_SYNC));
  await chrome.storage.local.set({resumeSyncSettings:c});
  if(c.enabled)await chrome.alarms.create(alarm,{periodInMinutes:.5});else await chrome.alarms.clear(alarm);
  }finally{running=false;}
  void tick();return syncStatus();
}
export async function retrySync(){
  if(running)throw Error('SYNC_BUSY');running=true;
  try{const c=await config(),s=await state();
  for(const j of s.jobs.filter(j=>j.status==='blocked')){if(j.server_key)await api(c,`/v1/resumes/${j.server_key}/retry`,{});j.status=j.server_key?'syncing':'retry';j.attempts=0;j.next_at=0;delete j.error;}
  await save(s);}finally{running=false;}void tick();return syncStatus();
}
export async function backfillSync(){if(running)throw Error('SYNC_BUSY');running=true;try{const s=await state();s.cursors={};delete s.scan_after;await save(s);}finally{running=false;}void tick();return syncStatus();}
async function tick(){
  if(running)return;running=true;let s:SyncState|undefined;
  try{
    const c=await config();if(!c.enabled)return;s=await state();
    const tab=await chatTab(),snapshot=await page<{account:string;contacts:Contact[];has_more:boolean;scope_note:string}>(tab,'CONTACTS');
    if(s.account_id&&s.account_id!==snapshot.account){s.account_id=snapshot.account;s.contacts=[];s.cursors={};}
    s.account_id=snapshot.account;s.contacts=snapshot.contacts;s.scope_note=snapshot.scope_note;
    if(snapshot.has_more)await page(tab,'NEXT_CONTACTS',{account:s.account_id});
    for(const contact of s.contacts){const old=s.cursors[contact.id];if(old&&old.last_message!==contact.last_message)delete s.cursors[contact.id];}
    const start=s.contacts.findIndex(x=>x.id===s!.scan_after)+1;
    const contact=[...s.contacts.slice(start),...s.contacts.slice(0,start)].find(x=>!s!.cursors[x.id]?.done);
    delete s.last_error;
    if(contact){
      s.scan_after=contact.id;
      try{
      const cursor=s.cursors[contact.id]||{max_id:'0',page:1,done:false,last_message:contact.last_message};
      const data=await page<{attachments:unknown[];has_more:boolean;max_id:string;messages:number}>(tab,'HISTORY',{account:s.account_id,contact_id:contact.id,max_id:cursor.max_id,page:cursor.page});
      for(const item of data.attachments){const attachment=AttachmentSchema.parse(item);if(attachment.meta.account_id!==s.account_id||attachment.meta.candidate_id!==contact.id)throw Error('ATTACHMENT_IDENTITY_CHANGED');const key=attachmentKey(attachment.meta);if(!s.jobs.some(j=>j.key===key))s.jobs.push({key,attachment,status:'pending',attempts:0,next_at:0,created_at:Date.now(),updated_at:Date.now()});}
      if(data.has_more&&(data.max_id===cursor.max_id||data.messages===0))throw Error('HISTORY_CURSOR_STALLED');
      s.cursors[contact.id]={max_id:data.max_id,page:cursor.page+1,done:!data.has_more||!c.backfill,last_message:cursor.last_message};
      await save(s);
      }catch(e){s.last_error=e instanceof Error?e.message:'HISTORY_FAILED';}
    }
    const job=s.jobs.filter(j=>j.attachment.meta.account_id===s!.account_id&&['pending','retry','syncing'].includes(j.status)&&j.next_at<=Date.now()).sort((a,b)=>a.updated_at-b.updated_at)[0];
    if(job){
      try{
        if(!job.server_key){
          const d=await page<{url:string}>(tab,'DOWNLOAD_URL',{account:s.account_id,attachment:job.attachment});
          const file=await fileBytes(d.url),response=await api(c,'/v1/resumes',{meta:job.attachment.meta,file});
          if(!/^[a-f0-9]{64}$/.test(response.key))throw Error('SERVICE_SCHEMA_CHANGED');job.server_key=response.key;job.status='syncing';await save(s);
        }
        const result=await api(c,'/v1/resumes/'+job.server_key);
        if(result.state==='done'){job.status='done';job.record_url=result.record_url;delete job.error;}
        else if(result.state==='blocked'){job.status='blocked';job.error=result.error||'SYNC_FAILED';}
        else {job.status='syncing';job.next_at=Date.now()+15000;job.error=result.error;}
      }catch(e){job.attempts++;job.status=job.attempts>=5?'blocked':'retry';job.next_at=Date.now()+Math.min(1800000,30000*2**job.attempts);job.error=e instanceof Error?e.message:'SYNC_FAILED';}
      job.updated_at=Date.now();
    }
    s.last_scan=Date.now();await save(s);
  }catch(e){if(!s)s=await state();s.last_error=e instanceof Error?e.message:'SYNC_FAILED';await save(s);}
  finally{running=false;}
}
export function installResumeSync(){
  chrome.runtime.onMessage.addListener((input,sender,respond)=>{
    if(input?.channel!=='resume-sync'||sender.id!==chrome.runtime.id||!['popup.html','options.html'].some(p=>sender.url===chrome.runtime.getURL(p)))return;
    const actions:Record<string,()=>Promise<unknown>>={STATUS:syncStatus,SAVE:()=>saveSync(input.settings),RETRY:retrySync,BACKFILL:backfillSync};
    const action=Object.hasOwn(actions,input.action)?actions[input.action]:undefined;if(!action){respond({ok:false,error:'INVALID_SYNC_ACTION'});return;}
    void action().then(data=>respond({ok:true,data})).catch(e=>respond({ok:false,error:e instanceof Error&&/^[A-Z][A-Z0-9_]{1,80}$/.test(e.message)?e.message:'SYNC_OPERATION_FAILED'}));return true;
  });
  chrome.alarms.onAlarm.addListener(a=>{if(a.name===alarm)void tick();});
  chrome.tabs.onUpdated.addListener((_id,change,tab)=>{if(change.status==='complete'&&isBossUrl(tab.url))void tick();});
  const init=()=>void config().then(async c=>{if(c.enabled){await chrome.alarms.create(alarm,{periodInMinutes:.5});void tick();}});
  chrome.runtime.onStartup.addListener(init);chrome.runtime.onInstalled.addListener(init);init();
}
