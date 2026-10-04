import { supabase } from '../../lib/supabaseClient.js';
import { withTimeout, isNetworkError } from '../../lib/net.js';
import { saveQueue, pendingOps, opsForAccount, backoffDelay } from './syncQueue.js';

function rowsDiffer(localRows, serverRows) {
  const norm = (rows) => new Map((rows || []).map((r) => [String(r.member_id), `${r.status}|${r.absence_name_snapshot || r.absence || ''}`]));
  const a = norm(localRows);
  const b = norm(serverRows);
  if (a.size !== b.size) return true;
  for (const [k, v] of a) if (b.get(k) !== v) return true;
  return false;
}

function opOccurrence(op) {
  return (op.payload && op.payload.occurrence) || {};
}

export async function replayAttendanceOp(op, { force = false } = {}) {
  if (!supabase) throw new Error('Backend belum dikonfigurasi.');
  if (op.operation_type !== 'SAVE_ATTENDANCE') throw new Error('Jenis operasi tidak dikenal.');
  const accountId = op.account_id;
  const payload = op.payload || {};
  const occ = payload.occurrence || {};
  const { data: dbOcc, error: occErr } = await withTimeout(supabase.from('schedule_occurrences').upsert({
    account_id: accountId,
    recurring_schedule_id: occ.recurring_schedule_id || null,
    occurrence_date: occ.occurrence_date,
    occurrence_time: occ.occurrence_time,
    occurrence_end_time: occ.occurrence_end_time || null,
    day_name: occ.day_name || null,
  }, { onConflict: 'account_id,recurring_schedule_id,occurrence_date' }).select().single(), 20000);
  if (occErr) throw occErr;
  if (!force) {
    const { data: serverRows, error: selErr } = await withTimeout(
      supabase.from('attendance').select('member_id,status,absence_name_snapshot,updated_at').eq('occurrence_id', dbOcc.id), 20000,
    );
    if (selErr) throw selErr;
    if ((serverRows || []).length > 0) {
      const serverMax = Math.max(...serverRows.map((r) => new Date(r.updated_at || 0).getTime()));
      if (serverMax > (op.created_at || 0) && rowsDiffer(payload.rows, serverRows)) {
        const conflict = new Error('conflict');
        conflict.conflict = true;
        conflict.serverRows = serverRows;
        conflict.dbId = dbOcc.id;
        throw conflict;
      }
    }
  }
  for (const r of payload.rows || []) {
    const { error } = await withTimeout(supabase.from('attendance').upsert({
      account_id: accountId,
      occurrence_id: dbOcc.id,
      member_id: r.member_id,
      status: r.status,
      absence_name_snapshot: r.absence || null,
      member_name_snapshot: r.member_name,
    }, { onConflict: 'account_id,occurrence_id,member_id' }), 30000);
    if (error) throw error;
  }
  for (const m of payload.mats || []) {
    const item = { id: m.clientId, account_id: accountId, occurrence_id: dbOcc.id, kind: m.kind };
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
    const { error } = await withTimeout(supabase.from('materials').upsert(item, { onConflict: 'id' }), 20000);
    if (error) throw error;
  }
  try {
    await supabase.from('audit_logs').insert({
      account_id: accountId,
      action: 'SYNC_ATTENDANCE',
      entity_type: 'attendance',
      entity_id: dbOcc.id,
      new_data: { count: (payload.rows || []).length, opId: op.id },
    });
  } catch { /* audit best-effort */ }
  return dbOcc.id;
}

export async function replayOp(op, opts = {}) {
  if (op.operation_type === 'SAVE_ATTENDANCE') return replayAttendanceOp(op, opts);
  if (op.operation_type === 'SAVE_SPECIAL_EVENT') return replaySpecialEventOp(op, opts);
  if (op.operation_type === 'SAVE_SPECIAL_ATTENDANCE') return replaySpecialAttendanceOp(op, opts);
  throw new Error('Jenis operasi tidak dikenal.');
}

export async function replaySpecialEventOp(op) {
  if (!supabase) throw new Error('Backend belum dikonfigurasi.');
  const payload = op.payload || {};
  const ev = payload.event || {};
  const accountId = op.account_id;
  const { data: saved, error: evErr } = await withTimeout(supabase.from('special_events').upsert({
    id: ev.id,
    account_id: accountId,
    event_type_id: ev.event_type_id || null,
    event_type_snapshot: ev.event_type_snapshot || null,
    event_date: ev.event_date,
    day_name: ev.day_name || null,
    event_time: ev.event_time,
    end_time: ev.end_time || null,
    linked_holiday_occurrence_id: null,
  }, { onConflict: 'id' }).select().single(), 20000);
  if (evErr) throw evErr;
  const rep = payload.replacement;
  if (rep && rep.recurring_schedule_id && rep.occurrence_date) {
    const { data: dbOcc, error: occErr } = await withTimeout(supabase.from('schedule_occurrences').upsert({
      account_id: accountId,
      recurring_schedule_id: rep.recurring_schedule_id,
      occurrence_date: rep.occurrence_date,
      occurrence_time: rep.occurrence_time,
      occurrence_end_time: rep.occurrence_end_time || null,
      day_name: rep.day_name || null,
    }, { onConflict: 'account_id,recurring_schedule_id,occurrence_date' }).select().single(), 20000);
    if (occErr) throw occErr;
    await withTimeout(supabase.from('schedule_occurrences').update({ is_holiday: true }).eq('id', dbOcc.id), 15000);
    const { error: holErr } = await withTimeout(supabase.from('holidays').upsert({
      account_id: accountId,
      occurrence_id: dbOcc.id,
      holiday_date: rep.occurrence_date,
      day_name: rep.day_name || null,
      reason: rep.reason || 'Digantikan pengajian khusus',
    }, { onConflict: 'occurrence_id' }), 15000);
    if (holErr) throw holErr;
    const { data: verify } = await withTimeout(supabase.from('holidays').select('id').eq('occurrence_id', dbOcc.id).maybeSingle(), 15000);
    if (!verify) throw new Error('Event tersimpan, tetapi status libur belum tercatat. Coba lagi.');
    await withTimeout(supabase.from('special_events').update({ linked_holiday_occurrence_id: dbOcc.id }).eq('id', saved.id), 15000);
  }
  try {
    await supabase.from('audit_logs').insert({
      account_id: accountId,
      action: 'SYNC_SPECIAL_EVENT',
      entity_type: 'special_event',
      entity_id: saved.id,
      new_data: { opId: op.id },
    });
  } catch { /* audit best-effort */ }
  return saved.id;
}

export async function replaySpecialAttendanceOp(op, opts = {}) {
  if (!supabase) throw new Error('Backend belum dikonfigurasi.');
  const payload = op.payload || {};
  const ev = payload.event || {};
  const accountId = op.account_id;
  let eventId = ev.id;
  const { data: existing } = await withTimeout(supabase.from('special_events').select('id').eq('id', ev.id).maybeSingle(), 15000);
  if (!existing) {
    const { data: created, error: evErr } = await withTimeout(supabase.from('special_events').upsert({
      id: ev.id,
      account_id: accountId,
      event_type_id: ev.event_type_id || null,
      event_type_snapshot: ev.event_type_snapshot || null,
      event_date: ev.event_date,
      day_name: ev.day_name || null,
      event_time: ev.event_time,
      end_time: ev.end_time || null,
    }, { onConflict: 'id' }).select().single(), 20000);
    if (evErr) throw evErr;
    eventId = created.id;
  }
  if (!opts.force) {
    const { data: serverRows, error: selErr } = await withTimeout(
      supabase.from('special_attendance').select('member_id,status,absence_name_snapshot,created_at').eq('special_event_id', eventId), 20000,
    );
    if (selErr) throw selErr;
    if ((serverRows || []).length > 0) {
      const serverMax = Math.max(...serverRows.map((r) => new Date(r.created_at || 0).getTime()));
      if (serverMax > (op.created_at || 0) && rowsDiffer(payload.rows, serverRows)) {
        const conflict = new Error('conflict');
        conflict.conflict = true;
        conflict.serverRows = serverRows;
        conflict.dbId = eventId;
        throw conflict;
      }
    }
  }
  for (const r of payload.rows || []) {
    const { error } = await withTimeout(supabase.from('special_attendance').upsert({
      account_id: accountId,
      special_event_id: eventId,
      member_id: r.member_id,
      status: r.status,
      absence_name_snapshot: r.absence || null,
      member_name_snapshot: r.member_name,
    }, { onConflict: 'account_id,special_event_id,member_id' }), 30000);
    if (error) throw error;
  }
  try {
    await supabase.from('audit_logs').insert({
      account_id: accountId,
      action: 'SYNC_SPECIAL_ATTENDANCE',
      entity_type: 'special_attendance',
      entity_id: eventId,
      new_data: { count: (payload.rows || []).length, opId: op.id },
    });
  } catch { /* audit best-effort */ }
  return eventId;
}

export function touchOp(op, patch) {
  return { ...op, ...patch, updated_at: Date.now() };
}

export async function processQueue({ getQueue, persist, accountId, notify, manual = false }) {
  const all = getQueue();
  const scoped = opsForAccount(all, accountId);
  const actionable = pendingOps(scoped, { includeFailed: true }).filter((o) => (o.retry_count || 0) < 5 || manual);
  if (actionable.length === 0) return { synced: 0, conflicts: 0, failed: 0, remaining: all };
  let synced = 0;
  const touch = async (id, patch) => {
    const next = getQueue().map((o) => (o.id === id ? touchOp(o, patch) : o));
    await persist(next);
    return next.find((o) => o.id === id);
  };
  for (const op of actionable) {
    const current = getQueue().find((o) => o.id === op.id);
    if (!current || (current.status !== 'pending' && current.status !== 'failed')) continue;
    await touch(op.id, { status: 'syncing', last_error: null });
    try {
      await replayOp(op);
      const next = getQueue().filter((o) => o.id !== op.id);
      await persist(next);
      synced += 1;
    } catch (e) {
      if (e && e.conflict) {
        await touch(op.id, { status: 'conflict', serverRows: e.serverRows || [], dbId: e.dbId || null, last_error: 'Berbeda dengan data server.' });
      } else if (isNetworkError(e)) {
        const retryCount = (current.retry_count || 0) + 1;
        await touch(op.id, { status: 'pending', retry_count: retryCount, next_retry_at: Date.now() + backoffDelay(retryCount), last_error: 'Jaringan terputus.' });
        break;
      } else {
        await touch(op.id, { status: 'failed', last_error: String(e?.message || e || 'gagal').slice(0, 200) });
      }
    }
  }
  const remaining = getQueue();
  const conflicts = remaining.filter((o) => o.status === 'conflict').length;
  const failed = remaining.filter((o) => o.status === 'failed').length;
  if (conflicts > 0) notify?.('Ada data yang perlu perhatian sebelum sinkron.');
  else if (synced > 0 && !remaining.some((o) => o.status === 'pending' || o.status === 'failed' || o.status === 'syncing')) notify?.('Semua perubahan telah tersinkron.');
  else if (synced > 0) notify?.('Sebagian perubahan tersinkron.');
  const needsRecheck = !manual && remaining.some((o) => o.status === 'pending' && (o.retry_count || 0) < 3);
  return { synced, conflicts, failed, remaining, needsRecheck };
}

export async function resolveConflictOp(opId, choice, { getQueue, persist, notify }) {
  const op = getQueue().find((o) => o.id === opId);
  if (!op) return;
  if (choice === 'server') {
    await persist(getQueue().filter((o) => o.id !== opId));
    notify?.('Menggunakan data server.');
    return;
  }
  const next = getQueue().map((o) => (o.id === opId ? touchOp(o, { status: 'syncing', last_error: null }) : o));
  await persist(next);
  try {
    await replayOp(op, { force: true });
    await persist(getQueue().filter((o) => o.id !== opId));
    notify?.('Perubahan lokal dikirim ke server.');
  } catch (e) {
    if (isNetworkError(e)) {
      const cur = getQueue().find((o) => o.id === opId);
      await persist(getQueue().map((o) => (o.id === opId ? touchOp(o, { status: 'pending', retry_count: (cur?.retry_count || 0) + 1, next_retry_at: Date.now() + backoffDelay((cur?.retry_count || 0) + 1), last_error: 'Jaringan terputus.' }) : o)));
    } else {
      await persist(getQueue().map((o) => (o.id === opId ? touchOp(o, { status: 'failed', last_error: String(e?.message || e || 'gagal').slice(0, 200) }) : o)));
    }
  }
}

export { opOccurrence };
