import { AppError } from './errors';
import { type CommitBody, type ImportAction, type Preview } from './contracts';

export function apiOrigin(value: string): string {
  try {
    const url = new URL(value.trim());
    const local = ['localhost','127.0.0.1'].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '') || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) throw new Error();
    if (url.hostname === 'zhipin.com' || url.hostname.endsWith('.zhipin.com') || url.hostname === 'open.feishu.cn') throw new Error();
    return url.origin;
  } catch { throw new AppError('INVALID_API_ORIGIN'); }
}
export function isBossUrl(value?: string): boolean {
  try { const u = new URL(value ?? ''); return u.protocol === 'https:' && (u.hostname === 'zhipin.com' || u.hostname.endsWith('.zhipin.com')); } catch { return false; }
}
export function hostPattern(origin: string) { const u = new URL(apiOrigin(origin)); return `${u.protocol}//${u.hostname}/*`; }
export function safeRecordUrl(value: string): string | undefined {
  try { const u = new URL(value); if (u.protocol === 'https:' && !u.username && !u.password && (u.hostname.endsWith('.feishu.cn') || u.hostname.endsWith('.larksuite.com'))) return u.href; } catch { /* Invalid URLs must not become navigable links. */ }
}
export function supportedActions(preview: Preview, permissions: string[]): ImportAction[] {
  if (!permissions.includes('candidate:import') || preview.duplicate.status === 'conflict') return [];
  if (preview.duplicate.status === 'confirmed' && preview.duplicate.matches.length !== 1) return [];
  const allowed: Record<string, ImportAction[]> = {
    not_found: ['create_candidate_and_application'],
    possible: ['create_new_candidate','merge_with_existing'],
    confirmed: ['link_existing_candidate_to_job','update_existing_candidate'],
  };
  return preview.allowed_actions.filter(action => allowed[preview.duplicate.status]?.includes(action) && (action !== 'merge_with_existing' || permissions.includes('candidate:merge')));
}
export function commitDecision(preview: Preview, permissions: string[], jobId: string, action: ImportAction, candidateId?: string): CommitBody {
  if (!supportedActions(preview, permissions).includes(action)) throw new AppError('DUPLICATE_REVIEW_REQUIRED');
  const needsCandidate = ['link_existing_candidate_to_job','update_existing_candidate','merge_with_existing'].includes(action);
  if (needsCandidate && !preview.duplicate.matches.some(match => match.candidate_id === candidateId)) throw new AppError('DUPLICATE_REVIEW_REQUIRED');
  return { import_id: preview.import_id, job_id: jobId, action, ...(needsCandidate ? { candidate_id: candidateId } : {}), ...(action === 'merge_with_existing' ? { merge_policy: 'prefer_internal_confirmed_fields' as const } : {}) };
}
export function versionOlder(current: string, minimum: string): boolean {
  if (!/^\d+\.\d+\.\d+$/.test(minimum)) throw new AppError('INVALID_SCHEMA');
  const a = current.split('.').map(Number), b = minimum.split('.').map(Number);
  for (let i=0; i<3; i++) { if (a[i] !== b[i]) return a[i] < b[i]; }
  return false;
}
export async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2,'0')).join('');
}
