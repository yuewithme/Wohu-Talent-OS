import { z } from 'zod';

export const VERSION = '0.2.1';
export const ADAPTER_VERSION = 'boss-adapter-0.2.1';
export const MAX_PAYLOAD_BYTES = 1_048_576;
const text = z.string().trim().min(1).max(500);
const optionalText = text.optional();
const id = z.string().min(1).max(160);
const date = z.string().datetime({ offset: true });

export const WorkSchema = z.object({ company: optionalText, title: optionalText, start_date: optionalText, end_date: optionalText, description: z.string().max(12000).optional(), skills:z.array(text).max(100).optional() });
export const EducationSchema = z.object({ school: optionalText, major: optionalText, degree: optionalText, start_date: optionalText, end_date: optionalText, description:z.string().max(12000).optional() });
export const ProjectSchema = z.object({ name: optionalText, role: optionalText, start_date: optionalText, end_date: optionalText, description: z.string().max(12000).optional() });
export const CandidateSchema = z.object({
  name: z.string().trim().min(1).max(100), phone: z.string().max(32).optional(), email: z.string().max(254).optional(),
  age:z.number().int().min(1).max(119).optional(), availability:optionalText, experience_description:optionalText,
  recent_interest:z.object({title:optionalText,city:optionalText,salary:optionalText,label:optionalText}).optional(),
  resume_text:z.string().max(120000).optional(),
  city: optionalText, experience_years: z.number().min(0).max(80).optional(), highest_education: optionalText,
  current_company: optionalText, current_title: optionalText, expected_city: optionalText, expected_title: optionalText,
  expected_salary: optionalText, personal_summary: z.string().max(12000).optional(),
  skills: z.array(text).max(100).optional(), work_experiences: z.array(WorkSchema).max(60).optional(),
  educations: z.array(EducationSchema).max(30).optional(), projects: z.array(ProjectSchema).max(60).optional(),
});
export type Candidate = z.infer<typeof CandidateSchema>;
export const EvidenceSchema = z.object({ field: text, value: z.unknown(), source: z.literal('boss'), method: z.enum(['dom','network','runtime','canvas']), selector_version: text, locator:text.optional(), subject_key:id.optional(), capture_epoch:z.string().max(200).optional(), confidence: z.number().min(0).max(1), captured_at: date });
export const SourceRecordSchema = z.object({
  source: z.literal('boss'), external_ids: z.partialRecord(z.enum(['uid','encryptGeekId','securityId','url_id']), z.string().max(512)).default({}),
  source_url: z.string().url().max(4096).refine(value => { const u = new URL(value); return u.protocol === 'https:' && (u.hostname === 'zhipin.com' || u.hostname.endsWith('.zhipin.com')); }),
  captured_at: date, extractor_version: text, candidate: CandidateSchema,
  evidence: z.array(EvidenceSchema).max(300).optional(),
});
export type SourceRecord = z.infer<typeof SourceRecordSchema>;
export const CaptureRecordSchema = SourceRecordSchema.extend({candidate:CandidateSchema.extend({name:z.string().trim().max(100)})});

export const JobSchema = z.object({ id, name: text, department: optionalText, location: optionalText, status: z.string().default('open'), recruiter_id: id.optional() });
export type Job = z.infer<typeof JobSchema>;
export const JobsSchema = z.object({ items: z.array(JobSchema).max(200), page: z.number().int().positive(), page_size: z.number().int().positive(), total: z.number().int().nonnegative() });
export const MeSchema = z.object({
  user: z.object({ id, name: text }), organization: z.object({ id, name: text }), permissions: z.array(z.string()),
  extension_config: z.object({ boss_adapter_enabled: z.boolean().optional(), minimum_version: z.string().optional() }).optional(),
});
export type Me = z.infer<typeof MeSchema>;
export const ActionSchema = z.enum(['create_candidate_and_application','link_existing_candidate_to_job','update_existing_candidate','create_new_candidate','merge_with_existing']);
export type ImportAction = z.infer<typeof ActionSchema>;
export const DuplicateSchema = z.object({
  status: z.enum(['not_found','possible','confirmed','conflict']),
  matches: z.array(z.object({ candidate_id: id, name: text, confidence: z.number().min(0).max(1), match_reason: z.array(z.string().max(200)).max(20) })).max(100),
});
export const PreviewSchema = z.object({
  import_id: id, status: z.enum(['ready','decision_required','preview_created']), normalized_candidate: CandidateSchema.optional(),
  duplicate: DuplicateSchema, job: z.object({ id, name: text }).optional(), allowed_actions: z.array(ActionSchema), expires_at: date.optional(),
});
export type Preview = z.infer<typeof PreviewSchema>;
export const CommitSchema = z.object({
  import_id: id, action: ActionSchema, job_id: id, candidate_id: id.optional(), merge_policy: z.literal('prefer_internal_confirmed_fields').optional(),
}).strict();
export type CommitBody = z.infer<typeof CommitSchema>;
export const SyncSchema = z.object({ status: z.enum(['pending','processing','success','failed']), last_attempt_at: z.string().nullable().optional(), error: z.union([z.string(), z.object({ code: z.string().optional(), message: z.string().optional() })]).nullable().optional(), record_url: z.string().url().optional() });
export const CommitResultSchema = z.object({ import_id: id, candidate: z.object({ id, name: text }), application: z.object({ id, job_id: id, current_stage: text }), feishu_sync: SyncSchema });
export type CommitResult = z.infer<typeof CommitResultSchema>;
export const ImportStatusSchema = z.object({ import_id: id, status: z.enum(['preview_created','decision_required','ready','committing','committed','commit_failed','expired']), candidate_id: id.optional(), application_id: id.optional(), feishu_sync: SyncSchema.optional() });
export type ImportStatus = z.infer<typeof ImportStatusSchema>;
export const SummarySchema = z.object({ id, name: text, city: optionalText, current_company: optionalText, current_title: optionalText, applications_count: z.number().int().nonnegative().optional(), updated_at: z.string().optional() });
export const ApplicationsSchema = z.object({ items: z.array(z.object({ id, job_id: id, job_name: text, current_stage: text, status: text, created_at: z.string() })) });
export type CandidateDetail = { summary: z.infer<typeof SummarySchema>; applications: z.infer<typeof ApplicationsSchema>['items'] };

export const SettingsSchema = z.object({ api_origin: z.string().default(''), org_id: z.string().max(160).default(''), adapter_enabled: z.boolean().default(true), diagnostics_enabled: z.boolean().default(false) }).strict();
export type Settings = z.infer<typeof SettingsSchema>;
export const DEFAULT_SETTINGS: Settings = { api_origin: '', org_id: '', adapter_enabled: true, diagnostics_enabled: false };
export interface Diagnostics {
  source: 'boss'; extension_version: string; adapter_version: string; page_type: string;
  source_url_hash: string; error_code: string;
  diagnostics: { selectors_hit: string[]; selectors_missed: string[]; page_fingerprint: string };
}
export interface PageContext { supported: boolean; source: 'boss'; page_type: 'candidate_detail' | 'unknown'; reason?: string; tab_id?: number; fingerprint?: string; selector_version?: string }
export interface Capture { record: SourceRecord; context: PageContext; warnings: string[]; diagnostics: Diagnostics; dom_text?: string; coverage?: {canvas:'captured'|'partial'|'unavailable';sources:string[];conflicts:string[];glyphs:number;scanned_to_bottom:boolean} }
export interface Draft { capture: Capture; preview?: Preview; job?: Job; preview_created_at?: number; expires_at: number }
export interface PendingImport { body: CommitBody; key: string; origin: string; org_id: string; user_id: string; created_at: number; status?: ImportStatus }
export interface Bootstrap { settings: Settings; authenticated: boolean; me?: Me; auth_error?: { code: string; message: string; request_id?: string }; draft?: Draft; pending?: PendingImport; page: PageContext }

export const MessageSchema = z.object({ requestId: z.string().uuid(), type: z.enum(['BOOTSTRAP','GET_SETTINGS','SAVE_SETTINGS','SIGN_OUT','PAGE_CONTEXT_REQUEST','EXTRACT_CANDIDATE_REQUEST','SAVE_CANDIDATE_NAME','GET_JOBS_REQUEST','IMPORT_PREVIEW_REQUEST','IMPORT_COMMIT_REQUEST','IMPORT_RETRY_REQUEST','IMPORT_STATUS_REQUEST','CANDIDATE_DETAIL_REQUEST','DIAGNOSTIC_REPORT','CLEAR_DRAFT','DISMISS_IMPORT']), payload: z.unknown().optional() }).strict();
export type Message = z.infer<typeof MessageSchema>;
export interface Response<T = unknown> { requestId: string; success: boolean; data?: T; error?: { code: string; message: string; request_id?: string } }
