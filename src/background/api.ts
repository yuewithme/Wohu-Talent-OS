import { z } from 'zod';
import { MAX_PAYLOAD_BYTES, VERSION, MeSchema, type Me } from '../shared/contracts';
import { AppError } from '../shared/errors';
import { apiOrigin, hostPattern, versionOlder } from '../shared/guards';
import { session, settings } from './storage';

const Envelope = z.discriminatedUnion('success', [
  z.object({ success: z.literal(true), request_id: z.string().max(160).optional(), data: z.unknown() }),
  z.object({ success: z.literal(false), request_id: z.string().max(160).optional(), error: z.object({ code: z.string().max(100) }) }),
]);
const PATH = /^\/(me|jobs|candidate-imports\/(preview|commit|[^/?]+)|candidates\/[^/?]+(?:\/applications)?|extension\/diagnostics)(?:\?[^#]*)?$/;

export async function api<T>(path: string, schema: z.ZodType<T>, requestId: string, options: { body?: unknown; key?: string } = {}): Promise<T> {
  const cfg = await settings(), auth = await session();
  if (!cfg.api_origin || !cfg.org_id) throw new AppError('BACKEND_NOT_CONFIGURED', requestId);
  if (!auth.token) throw new AppError('AUTH_REQUIRED', requestId);
  const origin = apiOrigin(cfg.api_origin);
  if (!PATH.test(path) || path.includes('..') || path.includes('\\')) throw new AppError('FORBIDDEN', requestId);
  if (!await chrome.permissions.contains({ origins: [hostPattern(origin)] })) throw new AppError('HOST_PERMISSION_REQUIRED', requestId);
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  if (body && new TextEncoder().encode(body).length > MAX_PAYLOAD_BYTES) throw new AppError('PAYLOAD_TOO_LARGE', requestId);
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(`${origin}/api/v1${path}`, {
      method: body === undefined ? 'GET' : 'POST', body, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${auth.token}`, 'X-Org-Id': cfg.org_id, 'X-Request-Id': requestId, 'X-Client-Type': 'chrome_extension', 'X-Client-Version': VERSION, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(options.key ? { 'Idempotency-Key': options.key } : {}) },
    });
    if (response.status === 401) { await chrome.storage.session.remove(['token','me']); throw new AppError('AUTH_REQUIRED', requestId); }
    if (response.status === 403) throw new AppError('FORBIDDEN', requestId);
    if (response.status === 429) throw new AppError('RATE_LIMITED', requestId);
    if (response.status === 413) throw new AppError('PAYLOAD_TOO_LARGE', requestId);
    const reader = response.body?.getReader();
    if (!reader) throw new AppError('INVALID_SCHEMA', requestId);
    let size = 0, raw = ''; const decoder = new TextDecoder();
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_PAYLOAD_BYTES * 2) { await reader.cancel(); throw new AppError('PAYLOAD_TOO_LARGE', requestId); }
      raw += decoder.decode(part.value, { stream: true });
    }
    raw += decoder.decode();
    let json: unknown;
    try { json = JSON.parse(raw); } catch { throw new AppError(response.ok ? 'INVALID_SCHEMA' : 'NETWORK_ERROR', requestId); }
    const parsed = Envelope.safeParse(json);
    if (!parsed.success) throw new AppError('INVALID_SCHEMA', requestId);
    if (!parsed.data.success) throw new AppError(parsed.data.error.code, parsed.data.request_id ?? requestId);
    if (!response.ok) throw new AppError('INTERNAL_ERROR', requestId);
    const data = schema.safeParse(parsed.data.data);
    if (!data.success) throw new AppError('INVALID_SCHEMA', parsed.data.request_id ?? requestId);
    return data.data;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(controller.signal.aborted ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR', requestId);
  } finally { clearTimeout(timeout); }
}
export async function authenticate(requestId: string, permission?: string): Promise<Me> {
  const me = await api('/me', MeSchema, requestId), cfg = await settings();
  if (me.organization.id !== cfg.org_id) throw new AppError('ORG_MISMATCH', requestId);
  if (me.extension_config?.minimum_version && versionOlder(VERSION, me.extension_config.minimum_version)) throw new AppError('CLIENT_VERSION_UNSUPPORTED', requestId);
  await chrome.storage.session.set({ me });
  if (permission && !me.permissions.includes(permission)) throw new AppError('FORBIDDEN', requestId);
  return me;
}
