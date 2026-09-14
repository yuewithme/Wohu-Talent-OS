import { z } from 'zod';
import { SYNC_SERVICE_ORIGIN } from '../shared/guards';

export const MAX_RESUME_BYTES = 20 * 1024 * 1024;
const id=z.string().min(1).max(160).regex(/^[\w~-]+$/);
export const ResumeMetaSchema=z.object({account_id:id,candidate_id:id,candidate_name:z.string().min(1).max(100),job_title:z.string().max(500),message_id:id,attachment_id:id,filename:z.string().min(1).max(255),received_at:z.string().datetime()}).strict();
export type ResumeMeta=z.infer<typeof ResumeMetaSchema>;
export const AttachmentSchema=z.object({meta:ResumeMetaSchema,encrypted_uid:id,resume_id:id,auth_type:z.string().regex(/^\d{1,2}$/),friend_source:z.number().int().min(0).max(100)}).strict();
export type Attachment=z.infer<typeof AttachmentSchema>;
export const SyncSettingsSchema=z.object({enabled:z.boolean().default(false),service_origin:z.string().default(''),token:z.string().max(500).default(''),backfill:z.boolean().default(true)}).strict();
export type SyncSettings=z.infer<typeof SyncSettingsSchema>;
export const SYNC_DEFAULTS:SyncSettings={enabled:false,service_origin:SYNC_SERVICE_ORIGIN,token:'',backfill:true};
export interface Contact {id:string;name:string;job:string;last_message:string;source:number}
export interface Cursor {max_id:string;page:number;done:boolean;last_message:string}
export interface SyncJob {key:string;attachment:Attachment;status:'pending'|'retry'|'syncing'|'done'|'blocked';attempts:number;next_at:number;error?:string;server_key?:string;record_url?:string;created_at:number;updated_at:number}
export interface SyncState {account_id?:string;contacts:Contact[];cursors:Record<string,Cursor>;jobs:SyncJob[];scan_after?:string;last_scan?:number;last_error?:string;scope_note?:string}
export const EMPTY_SYNC:SyncState={contacts:[],cursors:{},jobs:[]};
export function attachmentKey(m:ResumeMeta){return [m.account_id,m.candidate_id,m.message_id,m.attachment_id].join(':');}
export function incomingAttachment(message:any,contact:any,account:string):Attachment|undefined {
  const h=message?.body?.hyperLink;
  if(String(message?.to?.uid)!==account||String(message?.from?.uid)!==String(contact.friendId)||h?.hyperLinkType!==9)return;
  try {
    const u=new URL(h.url);if(u.protocol!=='bosszp:'||u.hostname!=='bosszhipin.app'||!['selectResumePreviewUrl','openFile'].includes(u.searchParams.get('type')||''))return;
    const resume=u.searchParams.get('encryptId')||u.searchParams.get('id');
    const filename=String(h.text||'').replace(/[\\/\u0000-\u001f]/g,'_');
    if(!/\.(pdf|doc|docx|rtf|txt|jpg|jpeg|png)$/i.test(filename))return;
    return AttachmentSchema.parse({meta:{account_id:account,candidate_id:String(contact.friendId),candidate_name:message.from.name||contact.name,job_title:contact.jobName||'',message_id:String(message.mid),attachment_id:resume,filename,received_at:new Date(message.time).toISOString()},encrypted_uid:contact.encryptUid,resume_id:resume,auth_type:u.searchParams.get('authType')||'0',friend_source:contact.friendSource});
  }catch{return;}
}
