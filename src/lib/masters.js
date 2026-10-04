import { idbGet, idbSet } from './idb.js';
import { supabase } from './supabaseClient.js';

export const MASTER_TABLES = {
  speakers: 'speakers',
  hadith: 'hadith_materials',
  free: 'free_activity_types',
  specialTypes: 'special_event_types',
};

export async function loadMastersCache(aid) {
  if (!aid) return {};
  return await idbGet(`masters-${aid}`, {});
}

export async function saveMastersCache(aid, patch) {
  if (!aid) return {};
  const cur = await idbGet(`masters-${aid}`, {});
  const next = { ...cur, ...patch, savedAt: Date.now() };
  await idbSet(`masters-${aid}`, next);
  return next;
}

export async function fetchMasterList(table, accountId) {
  const { data, error } = await supabase.from(table).select('*').eq('account_id', accountId).order('name');
  if (error) throw error;
  return data || [];
}

export async function ensureMasterLists(accountId, keys, current, { online = true } = {}) {
  const need = keys.filter((k) => !((current && current[k]) || []).length);
  if (!need.length) return {};
  const cached = await loadMastersCache(accountId);
  const fromCache = {};
  const stillNeed = [];
  need.forEach((k) => {
    if ((cached[k] || []).length) fromCache[k] = cached[k];
    else stillNeed.push(k);
  });
  const out = { ...fromCache };
  if (stillNeed.length && online && typeof navigator !== 'undefined' && navigator.onLine !== false) {
    const fetched = {};
    await Promise.all(stillNeed.map(async (k) => {
      fetched[k] = await fetchMasterList(MASTER_TABLES[k], accountId);
    }));
    Object.assign(out, fetched);
    await saveMastersCache(accountId, fetched);
  } else if (stillNeed.length) {
    stillNeed.forEach((k) => { out[k] = []; });
  }
  return out;
}
