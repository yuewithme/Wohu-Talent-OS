export const clean = (value: string) => value.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
export function experience(value?: string): number | undefined {
  if (!value) return;
  if (/应届|在校|无经验/.test(value)) return 0;
  const match = value.match(/(\d+(?:\.\d+)?)\s*年/);
  if (!match) return;
  const n = Number(match[1]); return n >= 0 && n <= 80 ? n : undefined;
}
export function education(value?: string): string | undefined {
  if (!value) return;
  const entries = [['博士','doctor'],['硕士','master'],['研究生','master'],['本科','bachelor'],['大专','associate'],['专科','associate'],['高中','high_school'],['中专','secondary'],['中技','secondary'],['初中','middle_school']] as const;
  return entries.find(([label]) => value.includes(label))?.[1];
}
export function phone(value?: string): string | undefined {
  if (!value || /[*＊•xX]/.test(value)) return;
  const compact = value.replace(/[\s()-]/g,'').replace(/^\+?86(?=1\d{10}$)/,'');
  return /^1[3-9]\d{9}$/.test(compact) ? `+86${compact}` : /^\+[1-9]\d{7,14}$/.test(compact) ? compact : undefined;
}
export function email(value?: string): string | undefined {
  if (!value || /[*＊•]/.test(value)) return;
  const normalized = value.trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : undefined;
}
export function dateRange(value?: string): { start_date?: string; end_date?: string } {
  if (!value) return {};
  const dates = value.match(/\d{4}(?:[.\-/年]\d{1,2}月?)?|至今|现在/g);
  if (!dates?.length) return {};
  const normalized = dates.map(d => /至今|现在/.test(d) ? 'present' : d.replace(/年|[./]/g,'-').replace(/月/g,''));
  if(normalized.length===1&&normalized[0]==='present')return {end_date:'present'};
  return { start_date: normalized[0], ...(normalized[1] ? { end_date: normalized[1] } : {}) };
}
