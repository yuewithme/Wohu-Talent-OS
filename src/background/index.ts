import { z } from 'zod';
import {
  ApplicationsSchema, CaptureRecordSchema, CommitResultSchema, ImportStatusSchema, JobsSchema, MessageSchema, PreviewSchema,
  SettingsSchema, SourceRecordSchema, SummarySchema, type Bootstrap, type Capture, type Diagnostics,
  type Draft, type Message, type PageContext, type PendingImport, type Response,
} from '../shared/contracts';
import { AppError, safeError } from '../shared/errors';
import { apiOrigin, commitDecision, isBossUrl } from '../shared/guards';
import { api, authenticate } from './api';
import { clearSession, pending, saveDraft, session, settings, storageReady } from './storage';
import { installResumeSync } from './resume-sync';

const noPayload = z.undefined();
const requestSchema = {
  BOOTSTRAP: noPayload, GET_SETTINGS: noPayload, SIGN_OUT: noPayload, PAGE_CONTEXT_REQUEST: noPayload,
  EXTRACT_CANDIDATE_REQUEST: noPayload, CLEAR_DRAFT: noPayload, IMPORT_RETRY_REQUEST: noPayload,
  IMPORT_STATUS_REQUEST: noPayload, DIAGNOSTIC_REPORT: noPayload, DISMISS_IMPORT: noPayload,
  SAVE_SETTINGS: z.object({ settings: SettingsSchema, token: z.string().trim().max(16000).optional() }).strict(),
  GET_JOBS_REQUEST: z.object({ keyword: z.string().max(100).default(''), page: z.number().int().min(1).max(10000).default(1) }).strict(),
  IMPORT_PREVIEW_REQUEST: z.object({ job_id: z.string().min(1).max(160) }).strict(),
  IMPORT_COMMIT_REQUEST: z.object({ action: z.string(), candidate_id: z.string().max(160).optional() }).strict(),
  CANDIDATE_DETAIL_REQUEST: z.object({ candidate_id: z.string().min(1).max(160) }).strict(),
  SAVE_CANDIDATE_NAME: z.object({ name: z.string().trim().min(1).max(100) }).strict(),
};
const safeId = (id: string) => encodeURIComponent(id);
async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !isBossUrl(tab.url)) throw new AppError('UNSUPPORTED_PAGE');
  return tab;
}
async function pageMessage<T>(type: string, requestId: string, tabId?: number): Promise<T> {
  const tab = tabId ? await chrome.tabs.get(tabId).catch(() => undefined) : await currentTab();
  if (!tab?.id || !isBossUrl(tab.url)) throw new AppError('UNSUPPORTED_PAGE');
  try { await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames:true }, world:'MAIN', files: ['main.js'] }); }
  catch { throw new AppError('UNSUPPORTED_PAGE'); }
  let response: Response<T> & { diagnostics?: Diagnostics };
  try {
    const result=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:async(type:string)=>{
      const collector=(window as unknown as {__wohuTalentPageV2?:{request?:(type:string)=>Promise<unknown>}}).__wohuTalentPageV2;
      return collector?.request?collector.request(type):{success:false,error:{code:'EXTRACTION_FAILED'}};
    },args:[type]});
    response={...(result[0]?.result as Response<T>),requestId};
  }
  catch { throw new AppError('EXTRACTION_FAILED', requestId); }
  if (response?.requestId !== requestId) throw new AppError('INVALID_SCHEMA', requestId);
  if (!response.success) {
    if (response.diagnostics) await chrome.storage.session.set({ diagnostics: response.diagnostics });
    throw new AppError(response.error?.code ?? 'EXTRACTION_FAILED', requestId);
  }
  return response.data as T;
}
async function pageContext(requestId: string): Promise<PageContext> {
  const cfg = await settings();
  if (!cfg.adapter_enabled) return { supported: false, source: 'boss', page_type: 'unknown', reason: 'ADAPTER_DISABLED' };
  try {
    const tab = await currentTab(), context = await pageMessage<PageContext>('PAGE_CONTEXT_REQUEST', requestId, tab.id);
    return { ...context, tab_id: tab.id };
  } catch (e) { return { supported: false, source: 'boss', page_type: 'unknown', reason: safeError(e).code }; }
}
async function requireDraft(): Promise<Draft> {
  const draft = (await session()).draft;
  if (!draft) throw new AppError('IMPORT_SESSION_EXPIRED');
  return draft;
}
async function checkPage(draft: Draft, requestId: string) {
  const cfg = await settings();
  if (!cfg.adapter_enabled || (await session()).me?.extension_config?.boss_adapter_enabled === false) throw new AppError('ADAPTER_DISABLED', requestId);
  const current = await pageContext(requestId);
  if (!current.supported || current.tab_id !== draft.capture.context.tab_id || current.fingerprint !== draft.capture.context.fingerprint) throw new AppError('PAGE_CHANGED', requestId);
}
async function pendingOwner(item: PendingImport, requestId: string) {
  const cfg = await settings(), me = await authenticate(requestId, 'candidate:import');
  if (item.origin !== cfg.api_origin || item.org_id !== cfg.org_id || item.user_id !== me.user.id) throw new AppError('CONTEXT_MISMATCH', requestId);
}
async function queryStatus(requestId: string) {
  const item = await pending();
  if (!item) return undefined;
  await pendingOwner(item, requestId);
  const status = await api(`/candidate-imports/${safeId(item.body.import_id)}`, ImportStatusSchema, requestId);
  if (status.import_id !== item.body.import_id) throw new AppError('INVALID_SCHEMA', requestId);
  if (status.status === 'committed' && (!status.candidate_id || !status.application_id)) throw new AppError('INVALID_SCHEMA', requestId);
  await chrome.storage.local.set({ pending: { ...item, status } });
  if (status.status === 'committed') await chrome.storage.session.remove('draft');
  if (['success','failed'].includes(status.feishu_sync?.status ?? '') || ['expired','commit_failed'].includes(status.status)) await chrome.alarms.clear('import-status');
  return status;
}
async function submit(item: PendingImport, requestId: string) {
  await pendingOwner(item, requestId);
  try {
    const result = await api('/candidate-imports/commit', CommitResultSchema, requestId, { body: item.body, key: item.key });
    if (result.import_id !== item.body.import_id || result.application.job_id !== item.body.job_id) throw new AppError('INVALID_SCHEMA', requestId);
    const status = { import_id: result.import_id, status: 'committed' as const, candidate_id: result.candidate.id, application_id: result.application.id, feishu_sync: result.feishu_sync };
    await chrome.storage.local.set({ pending: { ...item, status } });
    await chrome.storage.session.remove('draft');
    await chrome.alarms.create('import-status', { periodInMinutes: 1 });
    return result;
  } catch (error) {
    // Only explicit business rejections prove that a new preview is safe. Network errors retain the original key.
    if (error instanceof AppError && ['JOB_CLOSED','JOB_NOT_FOUND','IMPORT_SESSION_EXPIRED','DUPLICATE_REVIEW_REQUIRED','FORBIDDEN','IDENTITY_CONFLICT'].includes(error.code)) {
      await chrome.storage.local.remove('pending');
      const draft = (await session()).draft;
      if (draft) { delete draft.preview; delete draft.job; await saveDraft(draft); }
    }
    throw error;
  }
}
async function dispatch(message: Message): Promise<unknown> {
  const { type, requestId } = message;
  const parsed = requestSchema[type].safeParse(message.payload);
  if (!parsed.success) throw new AppError('INVALID_SCHEMA', requestId);
  await storageReady;
  switch (type) {
    case 'GET_SETTINGS': return { settings: await settings(), has_token: Boolean((await session()).token) };
    case 'SAVE_SETTINGS': {
      const data = requestSchema.SAVE_SETTINGS.parse(message.payload), cfg = data.settings;
      if (cfg.api_origin) cfg.api_origin = apiOrigin(cfg.api_origin);
      if (cfg.api_origin && !cfg.org_id.trim()) throw new AppError('INVALID_SCHEMA', requestId);
      cfg.org_id = cfg.org_id.trim();
      const previous = await settings();
      if (cfg.api_origin !== previous.api_origin || cfg.org_id !== previous.org_id || data.token !== undefined) await clearSession();
      await chrome.storage.local.set({ settings: cfg });
      if (data.token) {
        if (/\s/.test(data.token)) throw new AppError('INVALID_SCHEMA', requestId);
        await chrome.storage.session.set({ token: data.token });
      }
      if (!cfg.api_origin || !(await session()).token) return { settings: cfg, authenticated: false };
      const me = await authenticate(requestId);
      return { settings: cfg, authenticated: true, me };
    }
    case 'SIGN_OUT': await clearSession(); await chrome.alarms.clear('import-status'); return {};
    case 'BOOTSTRAP': {
      const cfg = await settings(); const state: Bootstrap = { settings: cfg, authenticated: false, page: await pageContext(requestId) };
      if (cfg.api_origin) {
        try { state.me = await authenticate(requestId); state.authenticated = true; } catch (error) { state.auth_error = safeError(error); }
      }
      state.draft = (await session()).draft;
      const item = await pending();
      if (item && item.origin === cfg.api_origin && item.org_id === cfg.org_id && state.me?.user.id === item.user_id) state.pending = item;
      else if (item) state.auth_error = safeError(new AppError('CONTEXT_MISMATCH'));
      if (state.me?.extension_config?.boss_adapter_enabled === false) state.page = { ...state.page, supported: false, reason: 'ADAPTER_DISABLED' };
      return state;
    }
    case 'PAGE_CONTEXT_REQUEST': return pageContext(requestId);
    case 'EXTRACT_CANDIDATE_REQUEST': {
      if (await pending()) throw new AppError('IMPORT_PENDING', requestId);
      const cfg = await settings();
      if (cfg.api_origin) { const me = await authenticate(requestId, 'candidate:import'); if (me.extension_config?.boss_adapter_enabled === false) throw new AppError('ADAPTER_DISABLED', requestId); }
      if (!cfg.adapter_enabled) throw new AppError('ADAPTER_DISABLED', requestId);
      const tab = await currentTab(), capture = await pageMessage<Capture>('EXTRACT_CANDIDATE_REQUEST', requestId, tab.id);
      capture.record = CaptureRecordSchema.parse(capture.record);
      capture.context.tab_id = tab.id;
      const current=await pageMessage<PageContext>('PAGE_CONTEXT_REQUEST',requestId,tab.id);
      if(current.fingerprint!==capture.context.fingerprint)throw new AppError('PAGE_CHANGED',requestId);
      await saveDraft({ capture, expires_at: Date.now() + 30 * 60_000 });
      await chrome.storage.session.set({ diagnostics: capture.diagnostics });
      return capture;
    }
    case 'SAVE_CANDIDATE_NAME': {
      if(await pending())throw new AppError('IMPORT_PENDING',requestId);
      const draft=await requireDraft(), input=requestSchema.SAVE_CANDIDATE_NAME.parse(message.payload);
      await checkPage(draft,requestId);
      draft.capture.record=SourceRecordSchema.parse({...draft.capture.record,candidate:{...draft.capture.record.candidate,name:input.name}});
      draft.capture.record.evidence=draft.capture.record.evidence?.filter(e=>e.field!=='candidate.name');
      delete draft.preview;delete draft.job;
      await saveDraft(draft);return draft;
    }
    case 'GET_JOBS_REQUEST': {
      await authenticate(requestId, 'job:read');
      const query = requestSchema.GET_JOBS_REQUEST.parse(message.payload);
      return api(`/jobs?${new URLSearchParams({ status: 'open', keyword: query.keyword, page: String(query.page), page_size: '20' })}`, JobsSchema, requestId);
    }
    case 'IMPORT_PREVIEW_REQUEST': {
      if (await pending()) throw new AppError('IMPORT_PENDING', requestId);
      await authenticate(requestId, 'candidate:import');
      const draft = await requireDraft(); await checkPage(draft, requestId);
      if(!SourceRecordSchema.safeParse(draft.capture.record).success)throw new AppError('CANDIDATE_INCOMPLETE',requestId);
      const input = requestSchema.IMPORT_PREVIEW_REQUEST.parse(message.payload);
      const preview = await api('/candidate-imports/preview', PreviewSchema, requestId, { body: { job_id: input.job_id, source_record: draft.capture.record } });
      if (preview.job && preview.job.id !== input.job_id) throw new AppError('INVALID_SCHEMA', requestId);
      const created = Date.now(), expiry = preview.expires_at ? Date.parse(preview.expires_at) : created + 30 * 60_000;
      const next = { ...draft, preview, job: { id: input.job_id, name: preview.job?.name ?? '已选岗位', status: 'open' }, preview_created_at: created, expires_at: Math.min(expiry, draft.expires_at) };
      await saveDraft(next); return next;
    }
    case 'CANDIDATE_DETAIL_REQUEST': {
      await authenticate(requestId, 'candidate:import');
      const data = requestSchema.CANDIDATE_DETAIL_REQUEST.parse(message.payload), draft = await requireDraft();
      if (!draft.preview?.duplicate.matches.some(match => match.candidate_id === data.candidate_id)) throw new AppError('FORBIDDEN', requestId);
      const [summary, applications] = await Promise.all([
        api(`/candidates/${safeId(data.candidate_id)}`, SummarySchema, requestId),
        api(`/candidates/${safeId(data.candidate_id)}/applications`, ApplicationsSchema, requestId),
      ]);
      if (summary.id !== data.candidate_id) throw new AppError('INVALID_SCHEMA', requestId);
      return { summary, applications: applications.items };
    }
    case 'IMPORT_COMMIT_REQUEST': {
      if (await pending()) throw new AppError('IMPORT_PENDING', requestId);
      const me = await authenticate(requestId, 'candidate:import');
      const draft = await requireDraft(); await checkPage(draft, requestId);
      if(!SourceRecordSchema.safeParse(draft.capture.record).success)throw new AppError('CANDIDATE_INCOMPLETE',requestId);
      if (!draft.preview || !draft.job || draft.expires_at < Date.now()) throw new AppError('IMPORT_SESSION_EXPIRED', requestId);
      const input = requestSchema.IMPORT_COMMIT_REQUEST.parse(message.payload);
      const body = commitDecision(draft.preview, me.permissions, draft.job.id, input.action as Parameters<typeof commitDecision>[3], input.candidate_id);
      const cfg = await settings();
      const item: PendingImport = { body, key: crypto.randomUUID(), origin: cfg.api_origin, org_id: cfg.org_id, user_id: me.user.id, created_at: Date.now() };
      await chrome.storage.local.set({ pending: item });
      await chrome.alarms.create('import-status', { periodInMinutes: 1 });
      return submit(item, requestId);
    }
    case 'IMPORT_RETRY_REQUEST': {
      const item = await pending(); if (!item) throw new AppError('IMPORT_SESSION_EXPIRED', requestId);
      if (item.status?.status === 'committed') return queryStatus(requestId);
      return submit(item, requestId);
    }
    case 'IMPORT_STATUS_REQUEST': return queryStatus(requestId);
    case 'CLEAR_DRAFT': if (await pending()) throw new AppError('IMPORT_PENDING', requestId); await chrome.storage.session.remove(['draft','diagnostics']); return {};
    case 'DISMISS_IMPORT': {
      const item = await pending();
      if (item) { await pendingOwner(item, requestId); if (!['committed','expired','commit_failed'].includes(item.status?.status ?? '')) throw new AppError('IMPORT_PENDING', requestId); }
      await chrome.storage.local.remove('pending'); await chrome.storage.session.remove(['draft','diagnostics']); await chrome.alarms.clear('import-status'); return {};
    }
    case 'DIAGNOSTIC_REPORT': {
      const cfg = await settings(); if (!cfg.diagnostics_enabled) throw new AppError('FORBIDDEN', requestId);
      await authenticate(requestId);
      const data = await chrome.storage.session.get('diagnostics'), report = data.diagnostics as Diagnostics | undefined;
      if (!report) throw new AppError('INVALID_SCHEMA', requestId);
      const keySchema = z.string().regex(/^(candidate|work|education|projects)\.[a-z_]{1,40}$/);
      const safe = z.object({ source: z.literal('boss'), extension_version: z.string().regex(/^\d+\.\d+\.\d+$/), adapter_version: z.string().regex(/^boss-adapter-\d+\.\d+\.\d+$/), page_type: z.literal('candidate_detail'), source_url_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/), error_code: z.string().regex(/^[A-Z_]{1,80}$/), diagnostics: z.object({ selectors_hit: z.array(keySchema).max(100), selectors_missed: z.array(keySchema).max(100), page_fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }) }).parse(report);
      return api('/extension/diagnostics', z.unknown(), requestId, { body: safe });
    }
  }
}

let queue: Promise<unknown> = Promise.resolve();
function sequential<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task); queue = next.catch(() => undefined); return next;
}
chrome.runtime.onMessage.addListener((input, sender, respond) => {
  if(input?.channel==='resume-sync')return;
  const allowedPages = ['popup.html','options.html'].map(page => chrome.runtime.getURL(page));
  if (sender.id !== chrome.runtime.id || !sender.url || !allowedPages.includes(sender.url.split('?')[0].split('#')[0]) || sender.tab?.url && isBossUrl(sender.tab.url)) return;
  const message = MessageSchema.safeParse(input);
  if (!message.success) { respond({ requestId: typeof input?.requestId === 'string' ? input.requestId : '', success: false, error: safeError(new AppError('INVALID_SCHEMA')) }); return; }
  sequential(() => dispatch(message.data)).then(data => respond({ requestId: message.data.requestId, success: true, data })).catch(error => respond({ requestId: message.data.requestId, success: false, error: safeError(error) }));
  return true;
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'import-status') void sequential(() => queryStatus(crypto.randomUUID())).catch(() => undefined);
});
chrome.runtime.onStartup.addListener(() => { void pending().then(item => { if (item) return chrome.alarms.create('import-status', { periodInMinutes: 1 }); }); });
installResumeSync();
