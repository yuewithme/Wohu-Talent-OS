import { DEFAULT_SETTINGS, SettingsSchema, type Draft, type Me, type PendingImport, type Settings } from '../shared/contracts';

export const storageReady = Promise.all([
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
]);
export async function settings(): Promise<Settings> {
  await storageReady;
  const data = await chrome.storage.local.get('settings');
  const parsed = SettingsSchema.safeParse(data.settings);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}
export async function session(): Promise<{ token?: string; me?: Me; draft?: Draft }> {
  await storageReady;
  const data = await chrome.storage.session.get(['token','me','draft']) as { token?: string; me?: Me; draft?: Draft };
  if (data.draft && data.draft.expires_at < Date.now()) { await chrome.storage.session.remove('draft'); delete data.draft; }
  return data;
}
export async function pending(): Promise<PendingImport | undefined> {
  await storageReady;
  const data = await chrome.storage.local.get('pending') as { pending?: PendingImport };
  return data.pending;
}
export async function saveDraft(draft: Draft) { await chrome.storage.session.set({ draft }); }
export async function clearSession() { await chrome.storage.session.remove(['token','me','draft']); }
