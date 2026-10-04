const CACHE = 'gemurung-v4';
const CORE = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];
const SYNC_TAG = 'attendance-sync';
const IDB_NAME = 'gemurung-idb';
const IDB_STORE = 'kv';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match('/index.html')))
  );
});

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { try { req.result.createObjectStore(IDB_STORE); } catch (e) { /* abaikan */ } };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGetKey(key, fallback) {
  try {
    const db = await idbOpen();
    return await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const rq = tx.objectStore(IDB_STORE).get(key);
      rq.onsuccess = () => resolve(rq.result === undefined ? fallback : rq.result);
      rq.onerror = () => resolve(fallback);
    });
  } catch (e) {
    return fallback;
  }
}
async function idbSetKey(key, value) {
  try {
    const db = await idbOpen();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) { /* abaikan */ }
}

async function sbFetch(config, token, path, options) {
  const res = await fetch(config.url + path, {
    ...(options || {}),
    headers: {
      apikey: config.anon,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...((options && options.headers) || {}),
    },
  });
  return res;
}

async function refreshAccessToken(config, session) {
  const res = await fetch(config.url + '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    headers: { apikey: config.anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || !data.access_token) return null;
  const next = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || session.refresh_token,
    expires_at: data.expires_at || null,
    user_id: (data.user && data.user.id) || session.user_id || null,
  };
  await idbSetKey('sb-session', next);
  return next;
}

function rowsDiffer(localRows, serverRows) {
  const norm = (rows) => {
    const m = new Map();
    (rows || []).forEach((r) => m.set(String(r.member_id), r.status + '|' + (r.absence_name_snapshot || r.absence || '')));
    return m;
  };
  const a = norm(localRows);
  const b = norm(serverRows);
  if (a.size !== b.size) return true;
  for (const [k, v] of a) if (b.get(k) !== v) return true;
  return false;
}

async function replayAttendance(config, token, op) {
  const payload = op.payload || {};
  const occ = payload.occurrence || {};
  let res = await sbFetch(config, token, '/rest/v1/schedule_occurrences?onConflict=account_id,recurring_schedule_id,occurrence_date&select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify({
      account_id: op.account_id,
      recurring_schedule_id: occ.recurring_schedule_id || null,
      occurrence_date: occ.occurrence_date,
      occurrence_time: occ.occurrence_time,
      occurrence_end_time: occ.occurrence_end_time || null,
      day_name: occ.day_name || null,
    }),
  });
  if (res.status === 401) return { auth: true };
  if (!res.ok) throw new Error('occurrence:' + res.status);
  const occRows = await res.json();
  const dbId = occRows && occRows[0] && occRows[0].id;
  if (!dbId) throw new Error('occurrence kosong');
  res = await sbFetch(config, token, '/rest/v1/attendance?occurrence_id=eq.' + dbId + '&select=member_id,status,absence_name_snapshot,updated_at', { method: 'GET' });
  if (res.status === 401) return { auth: true };
  if (!res.ok) throw new Error('read:' + res.status);
  const serverRows = await res.json();
  if ((serverRows || []).length > 0) {
    const serverMax = Math.max.apply(null, serverRows.map((r) => new Date(r.updated_at || 0).getTime()));
    if (serverMax > (op.created_at || 0) && rowsDiffer(payload.rows, serverRows)) {
      return { conflict: true, serverRows, dbId };
    }
  }
  const attBody = (payload.rows || []).map((r) => ({
    account_id: op.account_id,
    occurrence_id: dbId,
    member_id: r.member_id,
    status: r.status,
    absence_name_snapshot: r.absence || null,
    member_name_snapshot: r.member_name,
  }));
  if (attBody.length) {
    res = await sbFetch(config, token, '/rest/v1/attendance?onConflict=account_id,occurrence_id,member_id', {
      method: 'POST',
      headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify(attBody),
    });
    if (res.status === 401) return { auth: true };
    if (!res.ok) throw new Error('attendance:' + res.status);
  }
  const matBody = (payload.mats || []).map((m) => {
    const item = { id: m.clientId, account_id: op.account_id, occurrence_id: dbId, kind: m.kind };
    if (m.kind === 'QURAN') {
      item.quran_surah_number = m.surah;
      item.quran_surah_name_snapshot = m.surahName;
      item.ayat_range = m.ayat;
      item.speaker_name_snapshot = m.speaker || null;
    } else if (m.kind === 'HADITH') {
      item.hadith_name_snapshot = m.hadith;
      item.hadith_page = m.halaman || null;
      item.speaker_name_snapshot = m.speaker || null;
    } else if (m.kind === 'NASEHAT') {
      item.speaker_name_snapshot = m.speaker || null;
    } else if (m.kind === 'FREE') {
      item.free_activity_name_snapshot = m.activity || null;
      item.speaker_name_snapshot = m.speaker || null;
    }
    return item;
  });
  if (matBody.length) {
    res = await sbFetch(config, token, '/rest/v1/materials?onConflict=id', {
      method: 'POST',
      headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify(matBody),
    });
    if (res.status === 401) return { auth: true };
    if (!res.ok) throw new Error('materials:' + res.status);
  }
  try {
    await sbFetch(config, token, '/rest/v1/audit_logs', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        account_id: op.account_id,
        action: 'SYNC_ATTENDANCE_BG',
        entity_type: 'attendance',
        entity_id: dbId,
        new_data: { count: attBody.length, opId: op.id },
      }),
    });
  } catch (e) { /* audit best-effort */ }
  return { ok: true };
}

async function runBackgroundSync() {
  const config = await idbGetKey('sb-config', null);
  let session = await idbGetKey('sb-session', null);
  const queue = await idbGetKey('sync-queue', []);
  if (!config || !config.url || !config.anon) return;
  if (!session || !session.access_token) return;
  if (!Array.isArray(queue) || !queue.length) return;
  const actionable = queue.filter((o) => o && o.operation_type === 'SAVE_ATTENDANCE' && (o.status === 'pending' || o.status === 'failed'));
  if (!actionable.length) return;
  let token = session.access_token;
  const touch = async (id, patch) => {
    const next = (await idbGetKey('sync-queue', [])).map((o) => (o.id === id ? { ...o, ...patch, updated_at: Date.now() } : o));
    await idbSetKey('sync-queue', next);
  };
  for (const op of actionable) {
    await touch(op.id, { status: 'syncing', last_error: null });
    try {
      let r = await replayAttendance(config, token, op);
      if (r && r.auth) {
        const refreshed = session.refresh_token ? await refreshAccessToken(config, session) : null;
        if (!refreshed) throw new Error('auth');
        session = refreshed;
        token = refreshed.access_token;
        r = await replayAttendance(config, token, op);
        if (r && r.auth) throw new Error('auth');
      }
      if (r && r.conflict) {
        await touch(op.id, { status: 'conflict', serverRows: r.serverRows || [], dbId: r.dbId || null, last_error: 'Berbeda dengan data server.' });
        continue;
      }
      const rest = (await idbGetKey('sync-queue', [])).filter((o) => o.id !== op.id);
      await idbSetKey('sync-queue', rest);
    } catch (e) {
      const msg = String((e && e.message) || e || 'gagal');
      if (/failed to fetch|network|timeout|abort|offline|not connected|connection|refused|unreachable/i.test(msg)) {
        await touch(op.id, { status: 'pending', last_error: 'Jaringan terputus.' });
        throw e;
      }
      if (msg === 'auth') {
        await touch(op.id, { status: 'pending', last_error: 'Sesi berakhir.' });
        throw e;
      }
      await touch(op.id, { status: 'failed', last_error: msg.slice(0, 200) });
    }
  }
}

self.addEventListener('sync', (e) => {
  if (e.tag === SYNC_TAG) {
    e.waitUntil(runBackgroundSync());
  }
});
