import { ADAPTER_VERSION, CaptureRecordSchema, VERSION, type Candidate, type Capture, type PageContext } from '../shared/contracts';
import { AppError } from '../shared/errors';
import { hash, isBossUrl } from '../shared/guards';
import { BossAdapter, visible } from './boss';
import { pageState } from './page-state';
import { canvasHeaderCandidate, canvasLines, cardCandidate, COLLECTOR_VERSION, comparable, identity, list, projectCard, resolveFields, string, type CanvasSnapshot, type FieldEvidence, type Raw } from './sources';
import { dateRange, email, phone } from './normalize';

const delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
const props=(el:Element|null):Raw=>(el as any)?.__vue__?.$props||{};
function documents(doc:Document,depth=0):Document[]{const all=[doc];if(depth<3)for(const f of doc.querySelectorAll('iframe'))try{if(visible(f)&&f.contentDocument&&isBossUrl(f.contentDocument.URL))all.push(...documents(f.contentDocument,depth+1));}catch{}return all;}
function current(doc:Document) {
  if(!isBossUrl(doc.URL))throw new AppError('UNSUPPORTED_PAGE');
  const roots=documents(doc).filter(d=>new URL(d.URL).pathname==='/web/frame/recommend/').flatMap(d=>[...d.querySelectorAll('.dialog-wrap.active .lib-standard-resume')].filter(r=>visible(r)&&!r.closest('.v-leave,.v-leave-active,.v-leave-to')).map(root=>({doc:d,root})));
  if(roots.length!==1)throw new AppError(roots.length?'AMBIGUOUS_CANDIDATE':'UNSUPPORTED_PAGE');
  const {doc:d,root}=roots[0],p=props(root),info=p.resumeInfo as Raw;
  if(!info||p.loading===true)throw new AppError('PAGE_NOT_READY');
  const id=identity(info.geekBaseInfo?.encryptGeekId || info.encryptGeekId);
  if(!id)throw new AppError('PAGE_NOT_READY');
  if(info.encryptGeekId&&id!==identity(info.encryptGeekId))throw new AppError('PAGE_NOT_READY');
  const frame=[...root.querySelectorAll('iframe')].find(f=>{try{return f.contentDocument&&new URL(f.contentDocument.URL).pathname==='/web/frame/c-resume/';}catch{return false;}});
  const cardNode=[...d.querySelectorAll('.candidate-card-wrap')].find(c=>identity(props(c).geekInfo?.encryptGeekId)===id);
  const card=cardNode?projectCard(props(cardNode).geekInfo):undefined;
  return {doc:d,root,info,id,frame,cardNode,card};
}
type Current=ReturnType<typeof current>;
function epoch(c:Current){return pageState(c.frame?.contentWindow||null)?.canvas().epoch||0;}
async function context(c:Current):Promise<PageContext> {return {source:'boss',page_type:'candidate_detail',supported:true,fingerprint:await hash(`${c.id}|${epoch(c)}|${JSON.stringify([c.info.geekBaseInfo?.name,c.info.geekWorkExpList,c.info.geekEduExpList])}`),selector_version:COLLECTOR_VERSION};}
export async function detectContext(doc:Document):Promise<PageContext>{try{return await context(current(doc));}catch(e){return {source:'boss',page_type:'unknown',supported:false,reason:e instanceof AppError?e.code:'UPSTREAM_PAGE_CHANGED'};}}

async function ensureCanvas(doc:Document,c:Current):Promise<Current> {
  const snapshot=pageState(c.frame?.contentWindow||null)?.canvas();
  if(snapshot?.subject===c.id&&snapshot.started&&snapshot.glyphs.length)return c;
  const owner=(c.root as any).__vue__?.$parent;
  if(owner?.$options?.name!=='ResumeRoot'||owner.$refs?.iframe!==c.frame||identity(owner.currGeek?.encryptGeekId)!==c.id||typeof owner.handleIframeLoad!=='function')return c;
  if(current(doc).id!==c.id)throw new AppError('PAGE_CHANGED');
  // Use the page's existing same-candidate load path; do not construct or replay authenticated requests.
  owner.handleIframeLoad();
  const until=Date.now()+8000;
  while(Date.now()<until) {
    await delay(100);
    if(doc.visibilityState==='hidden')throw new AppError('PAGE_NOT_VISIBLE');
    try {
      const next=current(doc);if(next.id!==c.id)throw new AppError('PAGE_CHANGED');
      const s=pageState(next.frame?.contentWindow||null)?.canvas();
      if(s?.subject===next.id&&s.glyphs.length&&Date.now()-s.lastDraw>250)return next;
    }catch(e){if(e instanceof AppError&&e.code==='PAGE_CHANGED')throw e;}
  }
  return current(doc);
}

async function scanCanvas(doc:Document,c:Current) {
  const unavailable:{complete:boolean;snapshot?:CanvasSnapshot}={complete:false};
  const rd=c.frame?.contentDocument;if(!rd)return unavailable;
  const state=pageState(rd.defaultView),canvas=rd.querySelector<HTMLCanvasElement>('canvas#resume');if(!state||!canvas)return unavailable;
  const initial=state.canvas();if(initial.subject!==c.id||!initial.started)return unavailable;
  const target=c.root.querySelector<HTMLElement>('.resume-detail-wrap');if(!target)return unavailable;
  if(initial.glyphs.length&&!initial.truncated&&canvas.getBoundingClientRect().height<target.clientHeight-2)return {complete:true,snapshot:initial};
  const originalHeight=target.style.getPropertyValue('height'),heightPriority=target.style.getPropertyPriority('height');
  const originalMin=target.style.getPropertyValue('min-height'),minPriority=target.style.getPropertyPriority('min-height');
  let result=unavailable;
  try {
    // BOSS virtualizes the resume inside Canvas. Enlarging its viewport renders the document
    // at once; scrolling the adjacent DOM summary does not reveal the remaining resume text.
    for(const height of [4096,8192,16384]) {
      if(!state.beginCanvasPass(c.id,initial.epoch))throw new AppError('PAGE_CHANGED');
      target.style.setProperty('height',`${height}px`,'important');target.style.setProperty('min-height',`${height}px`,'important');
      const until=Date.now()+4000;let stableHeight=-1,stableAt=Date.now();
      while(Date.now()<until) {
        await delay(100);
        if(doc.visibilityState==='hidden')throw new AppError('PAGE_NOT_VISIBLE');
        const now=current(doc),snapshot=state.canvas();
        if(now.id!==c.id||now.frame?.contentDocument!==rd||snapshot.epoch!==initial.epoch)throw new AppError('PAGE_CHANGED');
        const bounds=canvas.getBoundingClientRect();
        if(bounds.height!==stableHeight){stableHeight=bounds.height;stableAt=Date.now();}
        if(snapshot.glyphs.length&&Date.now()-snapshot.lastDraw>250&&Date.now()-stableAt>350) {
          result={snapshot,complete:bounds.height<target.clientHeight-2&&!snapshot.truncated};
          break;
        }
      }
      if(result.complete)break;
    }
  }finally{
    if(originalHeight)target.style.setProperty('height',originalHeight,heightPriority);else target.style.removeProperty('height');
    if(originalMin)target.style.setProperty('min-height',originalMin,minPriority);else target.style.removeProperty('min-height');
  }
  return result;
}

function detailWorks(c:Current,base:Candidate['work_experiences']):Candidate['work_experiences'] {
  const detailed=list(c.info.geekWorkExpList);
  if(!detailed.length)return base;
  return detailed.map(w=>{
    const dates=dateRange(`${w.startYearMonStr||''} - ${w.endYearMonStr||''}`);
    const matches=(base||[]).filter(b=>comparable(b.title)===comparable(w.positionName)&&b.start_date===dates.start_date&&!!b.company&&(comparable(w.company).includes(comparable(b.company))||comparable(b.company).includes(comparable(w.company))));
    const match=matches.length===1?matches[0]:undefined;
    return {...match,company:string(w.company,500),title:string(w.positionName,500),...dates};
  });
}
function enrichFromCanvas(candidate:Partial<Candidate>,lines:string[]):{field:string;value:string}[] {
  const added:{field:string;value:string}[]=[];
  const sections=[{title:'工作经历',field:'work_experiences' as const,items:candidate.work_experiences||[],anchor:(w:Raw)=>[w.company,w.title]},{title:'项目经历',field:'projects' as const,items:candidate.projects||[],anchor:(p:Raw)=>[p.name]},{title:'教育经历',field:'educations' as const,items:candidate.educations||[],anchor:(e:Raw)=>[e.school,e.major]}];
  for(const section of sections) {
    const start=lines.findIndex(l=>l.startsWith(section.title)||(section.field==='projects'&&l.startsWith('项目经验')));if(start<0)continue;
    const end=lines.findIndex((l,i)=>i>start&&/^(教育经历|教育背景|项目经历|项目经验|工作经历|图片作品|资格证书|个人优势|自我评价|社交主页|志愿者经历|语言能力|专业技能|获奖经历)/.test(l));
    const rows=lines.slice(start,end<0?undefined:end);
    const indices=section.items.map(item=>{const anchor=section.anchor(item).filter(Boolean);return anchor.length?rows.findIndex(l=>anchor.every(a=>comparable(l).includes(comparable(a)))):-1;});
    section.items.forEach((item,index)=>{
      if(item.description||indices[index]<0)return;
      const next=Math.min(...indices.filter(i=>i>indices[index]),rows.length),value=rows.slice(indices[index]+1,next).join('\n');
      if(value){item.description=value.slice(0,12000);added.push({field:`${section.field}.${index}.description`,value:item.description});}
    });
  }
  return added;
}

export async function extractAll(doc:Document):Promise<Capture> {
  if(doc.visibilityState==='hidden')throw new AppError('PAGE_NOT_VISIBLE');
  let c=current(doc);c=await ensureCanvas(doc,c);
  const before=await context(c),scan=await scanCanvas(doc,c),scanned=scan.complete;
  const after=current(doc);if(after.id!==c.id||(await context(after)).fingerprint!==before.fingerprint)throw new AppError('PAGE_CHANGED');
  c=after;
  const fields:FieldEvidence[]=[],add=(candidate:Partial<Candidate>,method:FieldEvidence['method'],confidence:number,locator:string)=>{for(const [field,value] of Object.entries(candidate))fields.push({field,value,method,confidence,locator,subject:c.id});};
  const network=pageState(c.doc.defaultView)?.card(c.id)||pageState(doc.defaultView)?.card(c.id);
  if(network)add(cardCandidate(network),'network',.94,'zpData.geekList[].geekCard');
  if(c.card)add(cardCandidate(c.card),'runtime',.95,'candidateCard.geekInfo');
  let dom:Capture|undefined;
  try{dom=await new BossAdapter(doc).extractCandidate();add(dom.record.candidate,'dom',.85,'.resume-summary');}catch{}
  const resolved=resolveFields(c.id,fields),candidate:Partial<Candidate>={...resolved.candidate};
  const name=string(c.info.geekBaseInfo?.name,100);if(name){candidate.name=name;fields.push({field:'name',value:name,method:'runtime',confidence:.98,subject:c.id,locator:'resumeInfo.geekBaseInfo.name'});}
  candidate.work_experiences=detailWorks(c,candidate.work_experiences);
  const currentWork=candidate.work_experiences?.find(w=>w.end_date==='present');
  if(currentWork){candidate.current_company=currentWork.company;candidate.current_title=currentWork.title;for(const field of ['current_company','current_title'] as const)if(candidate[field])fields.push({field,value:candidate[field],method:'runtime',confidence:.98,subject:c.id,locator:'resumeInfo.geekWorkExpList.current'});}
  const edus=list(c.info.geekEduExpList);
  if(edus.length)candidate.educations=edus.map(e=>({school:string(e.school,500),major:string(e.major,500),degree:string(e.degreeName,500),...dateRange(`${e.startDateDesc||''} - ${e.endDateDesc||''}`)}));
  const projects=list(c.info.geekProjExpList);
  if(projects.length)candidate.projects=projects.map(p=>({name:string(p.projectName||p.name,500),role:string(p.roleName||p.role,500),...dateRange(`${p.startDateDesc||''} - ${p.endDateDesc||''}`),description:string(p.description)}));
  for(const field of ['work_experiences','educations','projects'] as const)if(candidate[field]?.length)fields.push({field,value:structuredClone(candidate[field]),method:'runtime',locator:`resumeInfo.${field}`,confidence:.96,subject:c.id});
  const snap=scan.snapshot,validCanvas=!!snap&&snap.subject===c.id&&snap.glyphs.length>0;
  const lines=validCanvas?canvasLines(snap.glyphs):[],canvasText=lines.join('\n');
  const canvasNode=c.frame?.contentDocument?.querySelector<HTMLCanvasElement>('canvas#resume');
  const pixelRatio=canvasNode?canvasNode.width/Math.max(1,canvasNode.getBoundingClientRect().width):1;
  if(validCanvas&&name&&!comparable(canvasLines(snap.glyphs.filter(g=>g.y<=120*pixelRatio)).join('')).includes(comparable(name)))throw new AppError('PAGE_CHANGED');
  if(validCanvas) {
    const detailHeader=canvasHeaderCandidate(snap.glyphs,pixelRatio);
    add(detailHeader,'canvas',.99,'canvas#resume.header.labelled');
    for(const [field,value] of Object.entries(detailHeader))if(value){
      const old=candidate[field as keyof Candidate];
      if(typeof old==='string'&&comparable(old)!==comparable(value)&&!resolved.conflicts.includes(field))resolved.conflicts.push(field);
    }
    Object.assign(candidate,Object.fromEntries(Object.entries(detailHeader).filter(([,value])=>value!==undefined)));
    const recent=candidate.recent_interest;
    if(detailHeader.expected_title&&recent&&comparable(recent.title)===comparable(detailHeader.expected_title)&&comparable(recent.city)===comparable(detailHeader.expected_city)&&comparable(recent.salary)===comparable(detailHeader.expected_salary))delete candidate.recent_interest;
  }
  if(canvasText){candidate.resume_text=canvasText;for(const added of enrichFromCanvas(candidate,lines))fields.push({...added,method:'canvas',locator:'canvas#resume.fillText.section',confidence:.85,subject:c.id});fields.push({field:'resume_text',value:canvasText,method:'canvas',locator:'canvas#resume.fillText',confidence:.9,subject:c.id});}
  const header=canvasText.split(/工作经历|项目经历|项目经验|教育经历/)[0];
  const contacts={phone:phone(header.match(/(?:手机|电话|联系方式)[：: ]+([+\d ()*-]{7,25})/)?.[1]),email:email(header.match(/(?:邮箱|电子邮件|Email)[：: ]+([^\s]+@[^\s]+)/i)?.[1])};
  for(const field of ['phone','email'] as const)if(contacts[field]){candidate[field]=contacts[field];fields.push({field,value:contacts[field],method:'canvas',locator:`canvas#resume.header.${field}`,confidence:.9,subject:c.id});}
  const warnings:string[]=[];
  if(!validCanvas)warnings.push('详情绘制文字未捕获，本次只包含可获取的结构化资料。请刷新 BOSS 页面并重新打开该候选人后读取。');
  else if(!scanned||snap.truncated)warnings.push('详情文字只捕获了部分区域；请核对原文，不能视为完整简历。');
  if(validCanvas&&snap.images)warnings.push('已保留详情绘制文字；图片、视频及附件内的内容不包含在文字采集中。');
  if(canvasText.includes('查看全部'))warnings.push('页面存在折叠文字。工作职责和个人简介优先使用结构化原文；其他折叠段落可能尚未展开，请核对。');
  if(candidate.recent_interest)warnings.push('页面展示的最近关注或推荐方向已单独保留，没有作为本人期望。');
  if(resolved.conflicts.length)warnings.push(`来源存在差异：${resolved.conflicts.join('、')}。采用当前详情及结构化来源，其他证据保留供核对。`);
  if(!candidate.name)warnings.push('未读取到姓名；导入前需要人工补充。');
  if(!candidate.city)warnings.push('未找到可确认的当前所在城市，期望或关注城市没有代填。');
  if(!candidate.phone&&!candidate.email)warnings.push('本次未读取到联系方式。');
  const capturedAt=new Date().toISOString(),sources=[...new Set(fields.filter(f=>f.value!==undefined&&f.value!==null&&f.value!=='').map(f=>f.method))];
  const record=CaptureRecordSchema.parse({source:'boss',source_url:'https://www.zhipin.com/web/chat/recommend',external_ids:{encryptGeekId:c.id},captured_at:capturedAt,extractor_version:ADAPTER_VERSION,candidate:{...candidate,name:candidate.name||''},evidence:fields.filter(f=>f.value!==undefined&&f.value!==null&&f.value!=='').map(f=>({field:`candidate.${f.field}`,value:f.value,source:'boss',method:f.method,confidence:f.confidence,selector_version:COLLECTOR_VERSION,locator:f.locator,subject_key:c.id,capture_epoch:String(snap?.epoch||0),captured_at:capturedAt}))});
  if((await detectContext(doc)).fingerprint!==before.fingerprint)throw new AppError('PAGE_CHANGED');
  return {record,context:before,warnings,dom_text:dom?.dom_text,coverage:{canvas:validCanvas?scanned&&!snap.truncated?'captured':'partial':'unavailable',sources,conflicts:resolved.conflicts,glyphs:snap?.glyphs.length||0,scanned_to_bottom:scanned},diagnostics:{source:'boss',extension_version:VERSION,adapter_version:ADAPTER_VERSION,page_type:'candidate_detail',source_url_hash:await hash(record.source_url),error_code:validCanvas?'EXTRACT_OK':'EXTRACT_PARTIAL',diagnostics:{selectors_hit:sources,selectors_missed:validCanvas?[]:['canvas'],page_fingerprint:before.fingerprint!}}};
}
