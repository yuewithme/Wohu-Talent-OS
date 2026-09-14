const origin='https://open.feishu.cn';
export interface FeishuConfig {appId:string;appSecret:string;base:string;table:string;baseUrl:string;fields:{name:string;file:string;key:string;job:string;account:string;candidate:string;message:string;filename:string;received:string;hash:string}}
export class Feishu {
  private token='';private expires=0;
  constructor(readonly config:FeishuConfig){}
  private async auth(){
    if(this.expires>Date.now())return this.token;
    const r=await fetch(origin+'/open-apis/auth/v3/tenant_access_token/internal',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({app_id:this.config.appId,app_secret:this.config.appSecret}),signal:AbortSignal.timeout(15000)});
    const b=await r.json() as any;if(!r.ok||b.code!==0||!b.tenant_access_token)throw Error('FEISHU_AUTH_FAILED');
    this.token=b.tenant_access_token;this.expires=Date.now()+Math.max(0,b.expire-120)*1000;return this.token;
  }
  private async api(path:string,body?:unknown,form?:FormData){
    const token=await this.auth();
    const r=await fetch(origin+'/open-apis/'+path,{method:body||form?'POST':'GET',headers:{authorization:`Bearer ${token}`,...(!form?{'content-type':'application/json'}:{})},body:form|| (body?JSON.stringify(body):undefined),signal:AbortSignal.timeout(60000)});
    const b=await r.json() as any;
    if(!r.ok||b.code!==0){if([99991663,99991664,99991668].includes(b.code))this.expires=0;throw Error(`FEISHU_${b.code||r.status}`);}
    return b.data;
  }
  private records(){return `bitable/v1/apps/${this.config.base}/tables/${this.config.table}/records`;}
  async check(){
    const d=await this.api(`bitable/v1/apps/${this.config.base}/tables/${this.config.table}/fields?page_size=100`);
    const fields=new Map(d.items.map((f:any)=>[f.field_name,f.type]));
    for(const [k,name] of Object.entries(this.config.fields))if(fields.get(name)!==(k==='file'?17:k==='received'?5:1))throw Error('FEISHU_FIELDS_MISMATCH');
    return true;
  }
  async find(key:string){
    const d=await this.api(this.records()+'/search?page_size=2',{field_names:[this.config.fields.key,this.config.fields.file],filter:{conjunction:'and',conditions:[{field_name:this.config.fields.key,operator:'is',value:[key]}]}});
    if(d.items?.length>1)throw Error('FEISHU_DUPLICATE_KEY');
    return d.items?.[0];
  }
  async upload(filename:string,bytes:Uint8Array){
    const form=new FormData();form.set('file_name',filename);form.set('parent_type','bitable_file');form.set('parent_node',this.config.base);form.set('size',String(bytes.length));form.set('file',new Blob([new Uint8Array(bytes)]),filename);
    const d=await this.api('drive/v1/medias/upload_all',undefined,form);if(!d?.file_token)throw Error('FEISHU_UPLOAD_NO_TOKEN');return d.file_token as string;
  }
  async create(fields:Record<string,unknown>,clientToken:string){
    const d=await this.api(this.records()+'?client_token='+encodeURIComponent(clientToken),{fields});
    if(!d.record?.record_id)throw Error('FEISHU_CREATE_NO_RECORD');return d.record.record_id as string;
  }
  recordUrl(id:string){const url=new URL(this.config.baseUrl);url.searchParams.set('table',this.config.table);url.searchParams.set('record',id);return url.href;}
}
