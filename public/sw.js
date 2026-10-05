const CACHE = 'gemurung-v5';
const CORE = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];
const SYNC_TAG = 'attendance-sync';
const IDB_NAME = 'gemurung-idb';
const IDB_STORE = 'kv';
const DEV_BYPASS = ['/@vite/', '/@react-refresh', '/@fs/', '/src/', '/node_modules/'];

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
  if (DEV_BYPASS.some((p) => url.pathname.startsWith(p))) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('/index.html')))
    );
    return;
  }
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

async function pgUpsert(config, token, table, onConflict, body, select) {
  const res = await sbFetch(config, token, '/rest/v1/' + table + '?onConflict=' + onConflict + (select ? '&select=*' : ''), {
    method: 'POST',
    headers: { Prefer: 'return=' + (select ? 'representation' : 'minimal') + ',resolution=merge-duplicates' },
    body: JSON.stringify(body),
  });
  if (res.status === 401) return { auth: true };
  if (!res.ok) throw new Error(table + ':' + res.status);
  if (select) {
    const rows = await res.json();
    return { rows };
  }
  return {};
}

async function replaySpecialEvent(config, token, op) {
  const payload = op.payload || {};
  const ev = payload.event || {};
  if (!ev.id || !ev.event_date) throw new Error('Data event tidak lengkap.');
  const r1 = await pgUpsert(config, token, 'special_events', 'id', {
    id: ev.id,
    account_id: op.account_id,
    event_type_id: ev.event_type_id || null,
    event_type_snapshot: ev.event_type_snapshot || null,
    event_date: ev.event_date,
    day_name: ev.day_name || null,
    event_time: ev.event_time,
    end_time: ev.end_time || null,
    linked_holiday_occurrence_id: null,
  }, true);
  if (r1.auth) return r1;
  const saved = r1.rows[0];
  const rep = payload.replacement;
  if (rep && rep.recurring_schedule_id && rep.occurrence_date) {
    const r2 = await pgUpsert(config, token, 'schedule_occurrences', 'account_id,recurring_schedule_id,occurrence_date', {
      account_id: op.account_id,
      recurring_schedule_id: rep.recurring_schedule_id,
      occurrence_date: rep.occurrence_date,
      occurrence_time: rep.occurrence_time,
      occurrence_end_time: rep.occurrence_end_time || null,
      day_name: rep.day_name || null,
    }, true);
    if (r2.auth) return r2;
    const dbOcc = r2.rows[0];
    const r3 = await sbFetch(config, token, '/rest/v1/schedule_occurrences?id=eq.' + dbOcc.id, {
      method: 'PATCH',
      body: JSON.stringify({ is_holiday: true }),
    });
    if (r3.status === 401) return { auth: true };
    if (!r3.ok) throw new Error('holiday-flag:' + r3.status);
    const r4 = await pgUpsert(config, token, 'holidays', 'occurrence_id', {
      account_id: op.account_id,
      occurrence_id: dbOcc.id,
      holiday_date: rep.occurrence_date,
      day_name: rep.day_name || null,
      reason: rep.reason || 'Digantikan pengajian khusus',
    }, false);
    if (r4.auth) return r4;
    const r5 = await sbFetch(config, token, '/rest/v1/holidays?occurrence_id=eq.' + dbOcc.id + '&select=id', { method: 'GET' });
    if (r5.status === 401) return { auth: true };
    const check = await r5.json();
    if (!check || !check.length) throw new Error('Holiday belum tercatat.');
    const r6 = await sbFetch(config, token, '/rest/v1/special_events?id=eq.' + saved.id, {
      method: 'PATCH',
      body: JSON.stringify({ linked_holiday_occurrence_id: dbOcc.id }),
    });
    if (r6.status === 401) return { auth: true };
    if (!r6.ok) throw new Error('link:' + r6.status);
  }
  try {
    await sbFetch(config, token, '/rest/v1/audit_logs', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ account_id: op.account_id, action: 'SYNC_SPECIAL_EVENT_BG', entity_type: 'special_event', entity_id: saved.id, new_data: { opId: op.id } }),
    });
  } catch (e) { /* audit best-effort */ }
  return { ok: true };
}

async function replaySpecialAttendance(config, token, op) {
  const payload = op.payload || {};
  const ev = payload.event || {};
  if (!ev.id || !ev.event_date) throw new Error('Data event tidak lengkap.');
  let eventId = ev.id;
  let chk = await sbFetch(config, token, '/rest/v1/special_events?id=eq.' + ev.id + '&select=id', { method: 'GET' });
  if (chk.status === 401) return { auth: true };
  if (!chk.ok) throw new Error('event-read:' + chk.status);
  const found = await chk.json();
  if (!found || !found.length) {
    const r = await pgUpsert(config, token, 'special_events', 'id', {
      id: ev.id,
      account_id: op.account_id,
      event_type_id: ev.event_type_id || null,
      event_type_snapshot: ev.event_type_snapshot || null,
      event_date: ev.event_date,
      day_name: ev.day_name || null,
      event_time: ev.event_time,
      end_time: ev.end_time || null,
    }, true);
    if (r.auth) return r;
    eventId = r.rows[0].id;
  }
  const srv = await sbFetch(config, token, '/rest/v1/special_attendance?special_event_id=eq.' + eventId + '&select=member_id,status,absence_name_snapshot,created_at', { method: 'GET' });
  if (srv.status === 401) return { auth: true };
  if (!srv.ok) throw new Error('read:' + srv.status);
  const serverRows = await srv.json();
  if ((serverRows || []).length > 0) {
    const serverMax = Math.max.apply(null, serverRows.map((r) => new Date(r.created_at || 0).getTime()));
    if (serverMax > (op.created_at || 0) && rowsDiffer(payload.rows, serverRows)) {
      return { conflict: true, serverRows, dbId: eventId };
    }
  }
  const attBody = (payload.rows || []).map((r) => ({
    account_id: op.account_id,
    special_event_id: eventId,
    member_id: r.member_id,
    status: r.status,
    absence_name_snapshot: r.absence || null,
    member_name_snapshot: r.member_name,
  }));
  if (attBody.length) {
    const r = await pgUpsert(config, token, 'special_attendance', 'account_id,special_event_id,member_id', attBody, false);
    if (r.auth) return r;
  }
  try {
    await sbFetch(config, token, '/rest/v1/audit_logs', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ account_id: op.account_id, action: 'SYNC_SPECIAL_ATTENDANCE_BG', entity_type: 'special_attendance', entity_id: eventId, new_data: { count: attBody.length, opId: op.id } }),
    });
  } catch (e) { /* audit best-effort */ }
  return { ok: true };
}

async function replayAttendance(config, token, op) {
  const payload = op.payload || {};
  const occ = payload.occurrence || {};
  if (!occ.recurring_schedule_id || !occ.occurrence_date) throw new Error('Data occurrence tidak lengkap.');
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
  const actionable = queue.filter((o) => o && ['SAVE_ATTENDANCE', 'SAVE_SPECIAL_EVENT', 'SAVE_SPECIAL_ATTENDANCE'].includes(o.operation_type || 'SAVE_ATTENDANCE') && (o.status === 'pending' || o.status === 'failed'));
  if (!actionable.length) return;
  let token = session.access_token;
  const touch = async (id, patch) => {
    const next = (await idbGetKey('sync-queue', [])).map((o) => (o.id === id ? { ...o, ...patch, updated_at: Date.now() } : o));
    await idbSetKey('sync-queue', next);
  };
  const runOp = async (op) => {
    if (!op.operation_type || op.operation_type === 'SAVE_ATTENDANCE') return replayAttendance(config, token, op);
    if (op.operation_type === 'SAVE_SPECIAL_EVENT') return replaySpecialEvent(config, token, op);
    if (op.operation_type === 'SAVE_SPECIAL_ATTENDANCE') return replaySpecialAttendance(config, token, op);
    throw new Error('Jenis operasi tidak dikenal.');
  };
  for (const op of actionable) {
    await touch(op.id, { status: 'syncing', last_error: null });
    try {
      let r = await runOp(op);
      if (r && r.auth) {
        const refreshed = session.refresh_token ? await refreshAccessToken(config, session) : null;
        if (!refreshed) throw new Error('auth');
        session = refreshed;
        token = refreshed.access_token;
        r = await runOp(op);
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
