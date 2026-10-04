import { SYNC_TAG } from './syncQueue.js';

export function backgroundSyncSupported() {
  try {
    return typeof navigator !== 'undefined'
      && 'serviceWorker' in navigator
      && typeof ServiceWorkerRegistration !== 'undefined'
      && 'sync' in ServiceWorkerRegistration.prototype;
  } catch {
    return false;
  }
}

export async function registerBackgroundSync(tag = SYNC_TAG) {
  if (!backgroundSyncSupported()) return { registered: false, reason: 'unsupported' };
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.sync.register(tag);
    return { registered: true };
  } catch (e) {
    return { registered: false, reason: String(e?.message || e || 'gagal') };
  }
}

export async function getBackgroundSyncTags() {
  if (!backgroundSyncSupported()) return [];
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.sync.getTags();
  } catch {
    return [];
  }
}
