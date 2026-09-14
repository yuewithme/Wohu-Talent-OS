import { AttachmentSchema, incomingAttachment, type Contact } from '../sync/contracts';

const win=window as any;
function context(){
  if(location.origin!=='https://www.zhipin.com'||location.pathname!=='/web/chat/index')throw Error('CHAT_UNAVAILABLE');
  const vm=(document.querySelector('.chat-user') as any)?.__vue__,account=String(win.iBossRoot?.user?.val?.userId||'');
  if(!vm||!/^\d+$/.test(account)||!Array.isArray(vm.list$))throw Error('CHAT_NOT_READY');
  if(vm.filter$?.labelId!==0||vm.filter$?.encJobId)throw Error('CHAT_FILTERED');
  return {vm,account};
}
async function json(path:string){const r=await fetch(path,{credentials:'include',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`BOSS_HTTP_${r.status}`);const b=await r.json();if(b.code!==0)throw Error(`BOSS_API_${b.code}`);return b.zpData;}
win.__wohuChat={async request(type:string,args:any={}){
  try{
    const {vm,account}=context();if(args.account&&args.account!==account)throw Error('BOSS_ACCOUNT_CHANGED');
    if(type==='CONTACTS'){
      const contacts:Contact[]=vm.list$.filter((c:any)=>c.friendId>0).map((c:any)=>({id:String(c.friendId),name:c.name,job:c.jobName||'',last_message:String(c.lastMsgId||0),source:c.friendSource}));
      return {ok:true,data:{account,contacts,has_more:vm.hasMore$,scope_note:String(vm.chatBottomText$||'联系人范围以 BOSS 当前开放列表为准；可能只包含近 30 天。')}};
    }
    if(type==='NEXT_CONTACTS'){
      if(vm.hasMore$&&!vm.loading$)vm.scrollBottom();
      return {ok:true};
    }
    if(type==='HISTORY'){
      const contact=vm.list$.find((c:any)=>String(c.friendId)===args.contact_id);if(!contact)throw Error('CONTACT_UNAVAILABLE');
      if(!/^\d+$/.test(String(args.max_id))||!Number.isInteger(args.page)||args.page<1)throw Error('INVALID_CURSOR');
      const data=await json('/wapi/zpchat/boss/historyMsg?'+new URLSearchParams({src:String(contact.friendSource),gid:String(contact.friendId),maxMsgId:args.max_id,c:'20',page:String(args.page)}));
      if(context().account!==account)throw Error('BOSS_ACCOUNT_CHANGED');
      if(!Array.isArray(data.messages))throw Error('HISTORY_SCHEMA_CHANGED');
      const attachments=data.messages.map((m:any)=>incomingAttachment(m,contact,account)).filter(Boolean);
      return {ok:true,data:{attachments,has_more:!!data.hasMore,max_id:String(data.minMsgId||0),messages:data.messages.length}};
    }
    if(type==='DOWNLOAD_URL'){
      const a=AttachmentSchema.parse(args.attachment);if(a.meta.account_id!==account)throw Error('BOSS_ACCOUNT_CHANGED');
      const d=await json('/wapi/zpgeek/resume/boss/preview/check.json?'+new URLSearchParams({geekId:a.encrypted_uid,id:a.resume_id,authType:a.auth_type}));
      if(!d.isCanPreview||!d.isResumeVisible||d.expired||d.deletedFriendRelation)throw Error('ATTACHMENT_UNAVAILABLE');
      if(context().account!==account||d.encryptGeekId!==a.encrypted_uid)throw Error('ATTACHMENT_IDENTITY_CHANGED');
      if(!/^[\w~-]+$/.test(d.encryptAuthorityId))throw Error('DOWNLOAD_SCHEMA_CHANGED');
      const url=new URL('https://docdownload.zhipin.com/wflow/zpgeek/download/download4boss/'+encodeURIComponent(d.encryptGeekId));
      url.search=new URLSearchParams({id:d.encryptAuthorityId,authType:a.auth_type}).toString();
      return {ok:true,data:{url:url.href}};
    }
    throw Error('UNSUPPORTED_CHAT_ACTION');
  }catch(e){return {ok:false,error:e instanceof Error?e.message:'CHAT_ERROR'};}
}};
