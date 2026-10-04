import { idbGet, idbSet } from '../../lib/idb.js';

export const QUEUE_KEY = 'sync-queue';
export const SYNC_TAG = 'attendance-sync';

const VALID_STATUSES = ['pending', 'syncing', 'synced', 'failed', 'conflict'];

function uid(prefix) {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* abaikan */ }
  return `${prefix || 'id'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function newOpId(prefix) {
  return uid(prefix);
}

export function createAttendanceOp(accountId, occurrence, rows, mats) {
  const now = Date.now();
  return {
    id: uid('q'),
    account_id: accountId,
    operation_type: 'SAVE_ATTENDANCE',
    entity_type: 'attendance',
    entity_id: null,
    payload: {
      occurrence: { ...occurrence },
      rows: (rows || []).map((r) => ({ ...r })),
      mats: (mats || []).map((m) => ({ ...m })),
    },
    created_at: now,
    updated_at: now,
    status: 'pending',
    retry_count: 0,
    next_retry_at: 0,
    last_error: null,
    synced_at: null,
  };
}

export function createSpecialEventOp(accountId, event, replacement) {
  const now = Date.now();
  return {
    id: uid('q'),
    account_id: accountId,
    operation_type: 'SAVE_SPECIAL_EVENT',
    entity_type: 'special_event',
    entity_id: event?.id || null,
    payload: {
      label: `${event?.event_type_snapshot || 'Pengajian khusus'} • ${event?.event_date || ''}`,
      event: { ...(event || {}) },
      replacement: replacement ? { ...replacement } : null,
    },
    created_at: now,
    updated_at: now,
    status: 'pending',
    retry_count: 0,
    next_retry_at: 0,
    last_error: null,
    synced_at: null,
  };
}

export function createSpecialAttendanceOp(accountId, event, rows) {
  const now = Date.now();
  return {
    id: uid('q'),
    account_id: accountId,
    operation_type: 'SAVE_SPECIAL_ATTENDANCE',
    entity_type: 'special_attendance',
    entity_id: event?.id || null,
    payload: {
      label: `${event?.event_type_snapshot || 'Pengajian khusus'} • ${event?.event_date || ''}`,
      event: { ...(event || {}) },
      rows: (rows || []).map((r) => ({ ...r })),
    },
    created_at: now,
    updated_at: now,
    status: 'pending',
    retry_count: 0,
    next_retry_at: 0,
    last_error: null,
    synced_at: null,
  };
}

function normalizeStatus(s) {
  const v = String(s || 'pending').toUpperCase();
  if (v === 'PENDING') return 'pending';
  if (v === 'SYNCING') return 'syncing';
  if (v === 'SYNCED') return 'synced';
  if (v === 'FAILED') return 'failed';
  if (v === 'CONFLICT') return 'conflict';
  if (VALID_STATUSES.includes(String(s))) return String(s);
  return 'pending';
}

export function normalizeOp(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.operation_type === 'SAVE_ATTENDANCE' && raw.account_id && raw.payload && raw.payload.occurrence) {
    return {
      id: String(raw.id || uid('q')),
      account_id: raw.account_id,
      operation_type: 'SAVE_ATTENDANCE',
      entity_type: raw.entity_type || 'attendance',
      entity_id: raw.entity_id || null,
      payload: {
        label: raw.payload.label || '',
        occurrence: { ...(raw.payload.occurrence || {}) },
        rows: Array.isArray(raw.payload.rows) ? raw.payload.rows : [],
        mats: Array.isArray(raw.payload.mats) ? raw.payload.mats : [],
      },
      created_at: Number(raw.created_at) || Date.now(),
      updated_at: Number(raw.updated_at) || Date.now(),
      status: normalizeStatus(raw.status),
      retry_count: Number(raw.retry_count ?? raw.retry ?? 0) || 0,
      next_retry_at: Number(raw.next_retry_at) || 0,
      last_error: raw.last_error || raw.error || null,
      synced_at: raw.synced_at || null,
      serverRows: raw.serverRows || undefined,
      dbId: raw.dbId || undefined,
    };
  }
  if (raw.operation_type === 'SAVE_SPECIAL_EVENT' && raw.account_id && raw.payload && raw.payload.event) {
    return {
      id: String(raw.id || uid('q')),
      account_id: raw.account_id,
      operation_type: 'SAVE_SPECIAL_EVENT',
      entity_type: raw.entity_type || 'special_event',
      entity_id: raw.entity_id || raw.payload.event?.id || null,
      payload: {
        label: raw.payload.label || '',
        event: { ...(raw.payload.event || {}) },
        replacement: raw.payload.replacement ? { ...raw.payload.replacement } : null,
      },
      created_at: Number(raw.created_at) || Date.now(),
      updated_at: Number(raw.updated_at) || Date.now(),
      status: normalizeStatus(raw.status),
      retry_count: Number(raw.retry_count ?? 0) || 0,
      next_retry_at: Number(raw.next_retry_at) || 0,
      last_error: raw.last_error || null,
      synced_at: raw.synced_at || null,
      serverRows: raw.serverRows || undefined,
    };
  }
  if (raw.operation_type === 'SAVE_SPECIAL_ATTENDANCE' && raw.account_id && raw.payload && raw.payload.event) {
    return {
      id: String(raw.id || uid('q')),
      account_id: raw.account_id,
      operation_type: 'SAVE_SPECIAL_ATTENDANCE',
      entity_type: raw.entity_type || 'special_attendance',
      entity_id: raw.entity_id || raw.payload.event?.id || null,
      payload: {
        label: raw.payload.label || '',
        event: { ...(raw.payload.event || {}) },
        rows: Array.isArray(raw.payload.rows) ? raw.payload.rows : [],
      },
      created_at: Number(raw.created_at) || Date.now(),
      updated_at: Number(raw.updated_at) || Date.now(),
      status: normalizeStatus(raw.status),
      retry_count: Number(raw.retry_count ?? 0) || 0,
      next_retry_at: Number(raw.next_retry_at) || 0,
      last_error: raw.last_error || null,
      synced_at: raw.synced_at || null,
      serverRows: raw.serverRows || undefined,
    };
  }
  if (raw.type === 'SAVE_ATTENDANCE' && (raw.accountId || raw.account_id) && raw.occurrence) {
    const now = Date.now();
    return {
      id: String(raw.id || uid('q')),
      account_id: raw.accountId || raw.account_id,
      operation_type: 'SAVE_ATTENDANCE',
      entity_type: 'attendance',
      entity_id: null,
      payload: {
        occurrence: { ...(raw.occurrence || {}) },
        rows: Array.isArray(raw.rows) ? raw.rows : [],
        mats: Array.isArray(raw.mats) ? raw.mats : [],
      },
      created_at: Number(raw.createdAt) || now,
      updated_at: now,
      status: normalizeStatus(raw.status),
      retry_count: Number(raw.retry ?? 0) || 0,
      next_retry_at: 0,
      last_error: raw.error || null,
      synced_at: null,
    };
  }
  return null;
}

export async function loadQueue() {
  const raw = await idbGet(QUEUE_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeOp).filter(Boolean);
}

export async function saveQueue(queue) {
  await idbSet(QUEUE_KEY, queue);
  return queue;
}

export function pendingOps(queue, { includeFailed = true, respectBackoff = true, now = Date.now() } = {}) {
  return (queue || []).filter((o) => {
    if (o.status !== 'pending' && !(includeFailed && o.status === 'failed')) return false;
    if (respectBackoff && (o.next_retry_at || 0) > now) return false;
    return true;
  });
}

export function opsForAccount(queue, accountId) {
  if (!accountId) return queue || [];
  return (queue || []).filter((o) => !o.account_id || o.account_id === accountId);
}

export function backoffDelay(retryCount) {
  const n = Math.max(0, Number(retryCount) || 0);
  return Math.min(2000 * 2 ** Math.min(n, 4), 30000);
}
