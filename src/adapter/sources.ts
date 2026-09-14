import { clean, dateRange, education, experience } from './normalize';
import type { Candidate } from '../shared/contracts';

export const COLLECTOR_VERSION = 'boss-multi-2026-09-14.1';
export type Method = 'network' | 'runtime' | 'dom' | 'canvas';
export interface FieldEvidence { field: string; value: unknown; method: Method; locator: string; confidence: number; subject: string }
export interface Glyph { text: string; x: number; y: number; font: string }
export interface CanvasSnapshot { subject: string; epoch: number; glyphs: Glyph[]; started: boolean; truncated: boolean; lastDraw: number; images: number }
export type Raw = Record<string, any>;
export const string = (v: unknown, max = 12000): string | undefined => typeof v === 'string' && clean(v) ? clean(v).slice(0, max) : undefined;
export const list = (v: unknown): Raw[] => Array.isArray(v) ? v.filter(x => x && typeof x === 'object').slice(0, 60) : [];
export const identity = (v: unknown): string => typeof v === 'string' && /^[\w~-]{6,160}$/.test(v) ? v : '';
export const comparable = (v: unknown) => String(v ?? '').replace(/[\s·•（）()]/g, '');
const fontSize = (font:string) => Number(font.match(/([\d.]+)px\b/)?.[1]) || 14;

// Retain only candidate fields, never request credentials or the original response envelope.
export function projectCard(input: Raw): Raw {
  const c = input.geekCard || input;
  const copy = (item: Raw, keys: string[]) => Object.fromEntries(keys.filter(k => item[k] !== undefined).map(k => [k, typeof item[k] === 'string' ? item[k].slice(0,12000) : typeof item[k] === 'boolean' || typeof item[k] === 'number' ? item[k] : undefined]));
  const works = (items: unknown) => list(items).map(w => ({...copy(w, ['company','positionName','startDate','endDate','responsibility','workPerformance','current']), workEmphasisList:Array.isArray(w.workEmphasisList) ? w.workEmphasisList.filter((x:unknown)=>typeof x==='string').slice(0,100) : []}));
  return {
    ...copy(c, ['geekName','geekWorkYear','geekDegree','ageDesc','applyStatusDesc','expectPositionName','expectLocationName','salary']),
    encryptGeekId: identity(input.encryptGeekId || c.encryptGeekId || c.encGeekId),
    geekDesc: {content:string(c.geekDesc?.content)},
    geekWorks: works(c.geekWorks || input.showWorks),
    geekEdus: list(c.geekEdus || input.showEdus).map(e => copy(e, ['school','major','degreeName','startDate','endDate','eduDescription'])),
    viewExpect: copy(c.viewExpect || {}, ['positionName','locationName','source','recentAttentionPositionExpect','recentAttentionCityExpect','interestCityExpect','similarityPositionExpect','showExpect']),
  };
}

export function cardCandidate(card: Raw): Partial<Candidate> {
  const v = card.viewExpect || {}, recent = v.recentAttentionPositionExpect === true || v.recentAttentionCityExpect === true;
  const inferred = recent || v.interestCityExpect === true || v.similarityPositionExpect === true;
  const work = list(card.geekWorks).map(w => ({ company:string(w.company,500),title:string(w.positionName,500),...dateRange(`${w.startDate||''} - ${w.current ? '至今' : w.endDate||''}`),description:string([w.responsibility,w.workPerformance].filter(Boolean).join('\n')),skills:Array.isArray(w.workEmphasisList)?w.workEmphasisList:[] }));
  const current = work.find(w => w.end_date === 'present');
  const age = Number(String(card.ageDesc||'').match(/^(\d{1,3})岁$/)?.[1]);
  return {
    name:string(card.geekName,100), age:age>0&&age<120?age:undefined,
    experience_years:experience(card.geekWorkYear), experience_description:string(card.geekWorkYear,500),
    highest_education:education(card.geekDegree), availability:string(card.applyStatusDesc,500),
    personal_summary:string(card.geekDesc?.content),
    current_company:current?.company,current_title:current?.title,
    expected_title:!inferred?string(v.positionName||card.expectPositionName,500):undefined,
    expected_city:!inferred?string(v.locationName||card.expectLocationName,500):undefined,
    expected_salary:!inferred?string(card.salary,500):undefined,
    recent_interest:inferred?{title:string(v.positionName||card.expectPositionName,500),city:string(v.locationName||card.expectLocationName,500),salary:string(card.salary,500),label:recent?'最近关注':'平台推荐方向'}:undefined,
    work_experiences:work,
    educations:list(card.geekEdus).map(e=>({school:string(e.school,500),major:string(e.major,500),degree:string(e.degreeName,500),...dateRange(`${e.startDate||''} - ${e.endDate||''}`),description:string(e.eduDescription)})),
  };
}

export function canvasLines(glyphs: Glyph[]): string[] {
  const rows: {y:number;items:Glyph[]}[] = [];
  for(const glyph of [...glyphs].sort((a,b)=>a.y-b.y||a.x-b.x)) {
    let row=rows.at(-1);
    if(!row||Math.abs(row.y-glyph.y)>2) {row={y:glyph.y,items:[]};rows.push(row);}
    row.items.push(glyph);
  }
  return rows.map(row=>{
    const parts:string[]=[];let previous:Glyph|undefined;
    for(const g of row.items.sort((a,b)=>a.x-b.x)) {
      if(previous && g.x-previous.x>Math.max(24,fontSize(previous.font)*2))parts.push('\t');
      parts.push(g.text);previous=g;
    }
    return clean(parts.join(''));
  }).filter(Boolean);
}

export function canvasHeaderCandidate(glyphs: Glyph[], pixelRatio = 1): Partial<Candidate> {
  const candidate:Partial<Candidate>={}, rows:{y:number;items:Glyph[]}[]=[];
  for(const glyph of [...glyphs].sort((a,b)=>a.y-b.y||a.x-b.x)) {
    let row=rows.at(-1);
    if(!row||Math.abs(row.y-glyph.y)>2*pixelRatio){row={y:glyph.y,items:[]};rows.push(row);}
    row.items.push(glyph);
  }
  for(const row of rows) {
    const cells:string[]=[];let text='',previous:Glyph|undefined;
    for(const g of row.items.sort((a,b)=>a.x-b.x)) {
      if(previous&&g.x-previous.x>Math.max(24,fontSize(previous.font)*2)*pixelRatio){cells.push(clean(text));text='';}
      text+=g.text;previous=g;
    }
    cells.push(clean(text));
    const joined=cells.join(' ');
    if(/^(工作经历|项目经历|项目经验|教育经历)/.test(joined))break;
    if(row.y<=120*pixelRatio) {
      const status=string(joined.match(/(?:离职|在职|离校|在校)[-－—·・]?(?:随时到岗|月内到岗|考虑机会|暂不考虑|正在找工作|正在找机会|周内到岗)/)?.[0],500);
      if(status)candidate.availability=status;
    }
    // Detail labels describe what is displayed; recommendation flags are not a substitute for them.
    if(cells[0]==='求职期望'&&cells.length===5) {
      candidate.expected_city=string(cells[1],500);
      candidate.expected_title=string(cells[2],500);
      candidate.expected_salary=string(cells[4],500);
    }
  }
  return candidate;
}

export function resolveFields(subject: string, fields: FieldEvidence[]): {candidate:Partial<Candidate>;evidence:FieldEvidence[];conflicts:string[]} {
  const grouped=new Map<string,FieldEvidence[]>();
  for(const f of fields) {
    if(f.subject!==subject || f.value===undefined || f.value===null || f.value==='' || (Array.isArray(f.value)&&!f.value.length))continue;
    const entries=grouped.get(f.field)||[];entries.push(f);grouped.set(f.field,entries);
  }
  const candidate:Raw={},evidence:FieldEvidence[]=[],conflicts:string[]=[];
  for(const [field,entries] of grouped) {
    entries.sort((a,b)=>b.confidence-a.confidence);
    const best=entries[0];candidate[field]=best.value;evidence.push(...entries);
    if(entries.some(e=>e.method!==best.method&&typeof e.value==='string'&&comparable(e.value)!==comparable(best.value)))conflicts.push(field);
  }
  return {candidate,evidence,conflicts};
}
