import { BossAdapter } from '../adapter/boss';
import { safeError } from '../shared/errors';

const scope = globalThis as typeof globalThis & { __wohuTalentLoaded?: boolean };
if (!scope.__wohuTalentLoaded) {
  scope.__wohuTalentLoaded = true;
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || !['PAGE_CONTEXT_REQUEST','EXTRACT_CANDIDATE_REQUEST'].includes(message?.type)) return;
    const adapter = new BossAdapter();
    const task = message.type === 'PAGE_CONTEXT_REQUEST' ? adapter.detectPage() : adapter.extractCandidate();
    task.then(data => respond({ requestId: message.requestId, success: true, data })).catch(async error => {
      const safe = safeError(error);
      respond({ requestId: message.requestId, success: false, error: safe, diagnostics: await adapter.getDiagnostics(safe.code) });
    });
    return true;
  });
}
