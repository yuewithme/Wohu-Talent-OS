import { identity, projectCard, type CanvasSnapshot, type Glyph, type Raw } from './sources';

export interface PageState {
  card(id:string): Raw|undefined;
  canvas(): CanvasSnapshot;
  beginCanvasPass(subject:string,epoch:number):boolean;
  request?: (type:string)=>Promise<unknown>;
  stop():void;
}
export type PageWindow = Window & typeof globalThis & { __wohuTalentPageV2?:PageState };
export const pageState = (w:Window|null):PageState|undefined => (w as PageWindow|null)?.__wohuTalentPageV2;

export function installPageState(w:PageWindow):PageState {
  if(w.__wohuTalentPageV2)return w.__wohuTalentPageV2;
  const cards=new Map<string,{at:number;card:Raw}>(), glyphs=new Map<string,Glyph>();
  let subject='',epoch=0,started=false,truncated=false,lastDraw=0,images=0,characters=0;
  const originals: (()=>void)[]=[];
  const isResume=w.location.pathname==='/web/frame/c-resume/';
  const isList=['/web/frame/recommend/','/web/chat/recommend'].includes(w.location.pathname);
  const reset=(id:string)=>{subject=id;epoch++;started=!!id;truncated=false;lastDraw=0;images=0;characters=0;glyphs.clear();};
  const onMessage=(event:MessageEvent)=>{
    if(event.source!==w.parent||event.origin!==w.location.origin||event.data?.type!=='SET_RESUME')return;
    reset(identity(event.data.data?.dataSourceParams?.encryptGeekId));
  };
  if(isResume) {
    w.addEventListener('message',onMessage,true);
    originals.push(()=>w.removeEventListener('message',onMessage,true));
    const proto=w.CanvasRenderingContext2D.prototype;
    for(const method of ['fillText','strokeText'] as const) {
      const original=proto[method];
      const wrapped=function(this:CanvasRenderingContext2D,...args:Parameters<typeof original>) {
        const result=Reflect.apply(original,this,args);
        try {
          if(!subject||this.canvas.id!=='resume'||truncated)return result;
          const text=String(args[0]);if(!text||text.length>12000)return result;
          const transform=this.getTransform(),x=transform.a*args[1]+transform.c*args[2]+transform.e,y=transform.b*args[1]+transform.d*args[2]+transform.f;
          const key=`${Math.round(x*2)}:${Math.round(y*2)}:${this.font}`;
          characters+=text.length-(glyphs.get(key)?.text.length||0);
          if(glyphs.size>=60000||characters>120000){truncated=true;return result;}
          glyphs.set(key,{text,x,y,font:this.font});lastDraw=Date.now();
        }catch{ /* Observation must never interrupt the site's renderer. */ }
        return result;
      };
      proto[method]=wrapped;
      originals.push(()=>{if(proto[method]===wrapped)proto[method]=original;});
    }
    const original=proto.drawImage;
    const wrapped=function(this:CanvasRenderingContext2D,...args:any[]) {const result=Reflect.apply(original,this,args);if(subject&&this.canvas.id==='resume')images++;return result;};
    proto.drawImage=wrapped;
    originals.push(()=>{if(proto.drawImage===wrapped)proto.drawImage=original;});
    const clear=proto.clearRect;
    const wrappedClear:typeof clear=function(this:CanvasRenderingContext2D,...args){const result=Reflect.apply(clear,this,args);if(this.canvas.id==='resume'&&args[0]<=0&&args[1]<=0&&args[2]>=this.canvas.width&&args[3]>=this.canvas.height){glyphs.clear();characters=0;truncated=false;lastDraw=0;images=0;}return result;};
    proto.clearRect=wrappedClear;originals.push(()=>{if(proto.clearRect===wrappedClear)proto.clearRect=clear;});
  }
  const accepts=(url:unknown)=>{try{return new URL(String(url),w.location.href).origin===w.location.origin&&new URL(String(url),w.location.href).pathname==='/wapi/zpjob/rec/geek/list';}catch{return false;}};
  const ingest=(body:unknown)=>{
    try {
      if(typeof body==='string'){if(body.length>2_000_000)return;body=JSON.parse(body);}
      const data=body as Raw;if(data?.code!==0||!Array.isArray(data.zpData?.geekList))return;
      for(const item of data.zpData.geekList.slice(0,100)) {
        const card=projectCard(item),id=identity(card.encryptGeekId);if(!id)continue;
        cards.delete(id);cards.set(id,{at:Date.now(),card});
        while(cards.size>50)cards.delete(cards.keys().next().value!);
      }
    }catch{ /* Malformed upstream payloads are ignored without affecting the request. */ }
  };
  if(isList) {
    const frameReady=(event:MessageEvent)=>{
      if(event.origin!==w.location.origin)return;
      const frame=[...w.document.querySelectorAll('iframe')].find(f=>f.contentWindow===event.source);
      try{if(frame?.contentWindow&&frame.contentWindow.location.pathname==='/web/frame/c-resume/')installPageState(frame.contentWindow as PageWindow);}catch{}
    };
    w.addEventListener('message',frameReady,true);originals.push(()=>w.removeEventListener('message',frameReady,true));
    const original=w.fetch;
    const wrapped:typeof fetch=async function(...args){const result=await Reflect.apply(original,w,args);try{const url=typeof args[0]==='object'&&'url' in args[0]?args[0].url:String(args[0]);if(accepts(url))void result.clone().text().then(ingest).catch(()=>{});}catch{}return result;};
    w.fetch=wrapped;originals.push(()=>{if(w.fetch===wrapped)w.fetch=original;});
    const Constructor=w.XMLHttpRequest;
    const Observed=new Proxy(Constructor,{construct(target,args,newTarget){
      const xhr=Reflect.construct(target,args,newTarget) as XMLHttpRequest;
      xhr.addEventListener('load',()=>{try{if(accepts(xhr.responseURL)&&xhr.status===200)ingest(xhr.responseType==='json'?xhr.response:xhr.responseType===''||xhr.responseType==='text'?xhr.responseText:undefined);}catch{}});
      return xhr;
    }});
    w.XMLHttpRequest=Observed;originals.push(()=>{if(w.XMLHttpRequest===Observed)w.XMLHttpRequest=Constructor;});
  }
  const state:PageState={
    card(id){const entry=cards.get(id);if(!entry||Date.now()-entry.at>10*60_000){cards.delete(id);return;}return structuredClone(entry.card);},
    canvas:()=>({subject,epoch,glyphs:[...glyphs.values()],started,truncated,lastDraw,images}),
    beginCanvasPass(id,revision){if(id!==subject||revision!==epoch||!started)return false;glyphs.clear();characters=0;truncated=false;images=0;lastDraw=0;return true;},
    stop(){for(const restore of originals)restore();cards.clear();glyphs.clear();delete w.__wohuTalentPageV2;},
  };
  Object.defineProperty(w,'__wohuTalentPageV2',{value:state,configurable:true});
  w.addEventListener('pagehide',()=>{cards.clear();glyphs.clear();subject='';started=false;},{once:true});
  return state;
}
