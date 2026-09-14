import { type Message, type Response } from './contracts';
import { AppError } from './errors';

export async function rpc<T>(type: Message['type'], payload?: unknown): Promise<T> {
  const requestId = crypto.randomUUID();
  let response: Response<T>;
  try { response = await chrome.runtime.sendMessage({ requestId, type, ...(payload === undefined ? {} : { payload }) }); }
  catch { throw new AppError('INTERNAL_ERROR', requestId); }
  if (!response || response.requestId !== requestId) throw new AppError('INVALID_SCHEMA', requestId);
  if (!response.success) throw new AppError(response.error?.code ?? 'INTERNAL_ERROR', response.error?.request_id ?? requestId);
  return response.data as T;
}
