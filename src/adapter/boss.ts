import { ADAPTER_VERSION, VERSION, CaptureRecordSchema, SourceRecordSchema, type Capture, type Candidate, type Diagnostics, type PageContext } from '../shared/contracts';
import { AppError } from '../shared/errors';
import { hash, isBossUrl } from '../shared/guards';
import { clean, dateRange, education } from './normalize';
import { DETAIL_SELECTORS as selectors } from './registry';

export function visible(element: Element): boolean {
  if (!element.isConnected || !element.getClientRects().length) return false;
  for (let node: Element | null = element; node; node = node.parentElement) {
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true' || style?.display === 'none' || style?.visibility === 'hidden' || style?.opacity === '0') return false;
  }
  return true;
}
function visibleText(element: Element): string {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT), parts: string[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (parent && !parent.closest('script,style,noscript,button') && visible(parent)) parts.push(node.textContent ?? '');
  }
  return clean(parts.join('\n'));
}
function documents(doc: Document, depth = 0): Document[] {
  const result = [doc];
  if (depth >= 3) return result;
  for (const frame of doc.querySelectorAll('iframe')) {
    if (!visible(frame)) continue;
    try { if (frame.contentDocument && isBossUrl(frame.contentDocument.URL)) result.push(...documents(frame.contentDocument, depth+1)); } catch { /* Reading is limited to visible, same-origin frames. */ }
  }
  return result;
}
export class BossAdapter {
  source = 'boss' as const;
  private hit = new Set<string>();
  private missed = new Set<string>();
  constructor(private doc: Document = document) {}
  private resolve() {
    if (!isBossUrl(this.doc.URL)) throw new AppError('UNSUPPORTED_PAGE');
    const choices: {root:Element;doc:Document}[]=[];
    for(const doc of documents(this.doc)) {
      if(new URL(doc.URL).pathname!==selectors.path)continue;
      for(const root of doc.querySelectorAll(selectors.root)) {
        // BOSS keeps a closing dialog's text in the DOM while its transition is pending.
        if(root.closest(selectors.closing))continue;
        const marker=root.querySelector(selectors.marker);
        if(visible(root)&&marker&&visible(marker)&&visibleText(marker)==='经历概览')choices.push({root,doc});
      }
    }
    if(choices.length>1)throw new AppError('AMBIGUOUS_CANDIDATE');
    if(!choices.length)throw new AppError('UNSUPPORTED_PAGE');
    return choices[0];
  }
  async detectPage():Promise<PageContext> {
    try {
      const {root,doc}=this.resolve();
      if(!root.querySelector(selectors.work)&&!root.querySelector(selectors.education))throw new AppError('UPSTREAM_PAGE_CHANGED');
      return {source:'boss',page_type:'candidate_detail',supported:true,fingerprint:await hash(`${doc.URL}|${visibleText(root)}`),selector_version:selectors.version};
    } catch(error) {return {source:'boss',page_type:'unknown',supported:false,reason:error instanceof AppError?error.code:'UPSTREAM_PAGE_CHANGED'};}
  }
  private read(root:Element,selector:string,key:string):string|undefined {
    const node=Array.from(root.querySelectorAll(selector)).find(visible);
    const text=node?visibleText(node):undefined;
    if(text){this.hit.add(key);return text;}
    this.missed.add(key);return undefined;
  }
  async extractCandidate():Promise<Capture> {
    this.hit.clear();this.missed.clear();
    const {root,doc}=this.resolve(), before=visibleText(root);
    const workNodes=Array.from(root.querySelectorAll(selectors.work)).filter(visible);
    const educationNodes=Array.from(root.querySelectorAll(selectors.education)).filter(visible);
    if(workNodes.length>60||educationNodes.length>30||(!workNodes.length&&!educationNodes.length))throw new AppError('UPSTREAM_PAGE_CHANGED');
    const work=workNodes.map(node=>({company:this.read(node,selectors.organization,'work.company'),title:this.read(node,selectors.title,'work.title'),...dateRange(this.read(node,selectors.dates,'work.date_range'))}));
    const educations=educationNodes.map(node=>({school:this.read(node,selectors.organization,'education.school'),major:this.read(node,selectors.title,'education.major')?.split(/[•·|]/)[0].trim(),degree:this.read(node,selectors.degree,'education.degree'),...dateRange(this.read(node,selectors.dates,'education.date_range'))}));
    if(work.some(item=>!item.company)||educations.some(item=>!item.school))throw new AppError('UPSTREAM_PAGE_CHANGED');
    const current=work.find(item=>item.end_date==='present');
    const degrees=educations.map(item=>education(item.degree));
    const highest=['doctor','master','bachelor','associate','high_school','secondary','middle_school'].find(degree=>degrees.includes(degree));
    const candidate:Candidate={name:'',highest_education:highest,current_company:current?.company,current_title:current?.title,work_experiences:work,educations,projects:[]};
    const capturedAt=new Date().toISOString(),sourceUrl=new URL(doc.URL);sourceUrl.search='';sourceUrl.hash='';
    const evidence=Object.entries(candidate).filter(([,value])=>value!==undefined&&value!==''&&(!Array.isArray(value)||value.length)).map(([field,value])=>({field:`candidate.${field}`,value,source:'boss' as const,method:'dom' as const,selector_version:selectors.version,confidence:1,captured_at:capturedAt}));
    const record=CaptureRecordSchema.parse({source:'boss',source_url:sourceUrl.href,captured_at:capturedAt,extractor_version:ADAPTER_VERSION,external_ids:{},candidate,evidence});
    const fingerprint=await hash(`${doc.URL}|${before}`);
    if(!root.isConnected||before!==visibleText(root))throw new AppError('PAGE_CHANGED');
    return {record,dom_text:before,context:{source:'boss',page_type:'candidate_detail',supported:true,fingerprint,selector_version:selectors.version},warnings:['姓名未出现在当前详情的 DOM 中；如需导入，请人工补充','已读取可见经历摘要，页面未展示的正文、联系方式及渠道标识保持为空',...(!work.length?['当前未显示工作经历']:[]),...(!educations.length?['当前未显示教育经历']:[])],diagnostics:await this.getDiagnostics('EXTRACT_OK',doc.URL)};
  }
  validateCandidate(record:unknown){return SourceRecordSchema.safeParse(record);}
  async getDiagnostics(code:string,url=this.doc.URL):Promise<Diagnostics>{return {source:'boss',extension_version:VERSION,adapter_version:ADAPTER_VERSION,page_type:'candidate_detail',source_url_hash:`sha256:${await hash(url)}`,error_code:code,diagnostics:{selectors_hit:[...this.hit],selectors_missed:[...this.missed],page_fingerprint:await hash([...this.hit].sort().join('|'))}};}
}
