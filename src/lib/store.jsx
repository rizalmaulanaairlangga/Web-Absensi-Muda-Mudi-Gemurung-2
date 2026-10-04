import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { idbGet, idbSet, idbDel } from './idb.js';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const ACC_KEY = 'gm-account';
const QUEUE_KEY = 'sync-queue';

function uid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }
export function clientId(prefix) {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* abaikan */ }
  return `${prefix || 'id'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function withTimeout(promise, ms = 20000) {
  let timer = null;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); });
  return Promise.race([
    Promise.resolve(promise).then((v) => { if (timer) clearTimeout(timer); return v; }, (e) => { if (timer) clearTimeout(timer); throw e; }),
    timeout,
  ]);
}

export function isNetworkError(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = String(err?.message || err || '').toLowerCase();
  return /failed to fetch|networkerror|network error|load failed|timeout|timed out|aborterror|dns|econn|offline|not connected|connection|refused|unreachable|例外的|net::/i.test(msg);
}

function isAuthInvalidError(err) {
  if (isNetworkError(err)) return false;
  const status = err?.status;
  if (status === 401) return true;
  const msg = String(err?.message || err || '').toLowerCase();
  return /invalid (jwt|token|grant|claim|session)|jwt (expired|invalid)|token (expired|invalid|revoked)|session (expired|invalid|revoked|not found)|refresh token (expired|invalid|revoked|not found)|user not found/i.test(msg);
}

function readCachedAccount() {
  try {
    const raw = localStorage.getItem(ACC_KEY);
    if (!raw) return null;
    const a = JSON.parse(raw);
    return a && a.id ? a : null;
  } catch { return null; }
}
function writeCachedAccount(a) {
  try {
    if (a && a.id) localStorage.setItem(ACC_KEY, JSON.stringify({ id: a.id, type: a.type || 'REAL', email: a.email || null }));
    else localStorage.removeItem(ACC_KEY);
  } catch { /* abaikan */ }
}
function readValidGuest() {
  try {
    const raw = localStorage.getItem('gm-guest');
    if (!raw) return null;
    const g = JSON.parse(raw);
    if (!g || !g.accountId) return null;
    if (Date.now() - g.createdAt > 24 * 60 * 60 * 1000) {
      localStorage.removeItem('gm-guest');
      return null;
    }
    return g;
  } catch {
    try { localStorage.removeItem('gm-guest'); } catch { /* abaikan */ }
    return null;
  }
}

function rowsDiffer(localRows, serverRows) {
  const norm = (rows) => new Map((rows || []).map((r) => [String(r.member_id), `${r.status}|${r.absence_name_snapshot || r.absence || ''}`]));
  const a = norm(localRows);
  const b = norm(serverRows);
  if (a.size !== b.size) return true;
  for (const [k, v] of a) if (b.get(k) !== v) return true;
  return false;
}

export function AppProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem('gm-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [syncState, setSyncState] = useState('Tersinkron');
  const [toasts, setToasts] = useState([]);
  const [session, setSession] = useState(null);
  const [account, setAccount] = useState(() => {
    const g = readValidGuest();
    if (g) return { id: g.accountId, type: 'GUEST' };
    return readCachedAccount();
  });
  const [isGuest, setIsGuest] = useState(() => Boolean(readValidGuest()));
  const [loadingAuth, setLoadingAuth] = useState(() => !(readValidGuest() || readCachedAccount()));
  const [queue, setQueue] = useState([]);
  const [lastSyncAt, setLastSyncAt] = useState(0);

  const onlineRef = useRef(online);
  const queueRef = useRef([]);
  const syncingRef = useRef(false);
  const accountRef = useRef(account);
  onlineRef.current = online;
  accountRef.current = account;

  const toast = useCallback((msg) => {
    const id = uid('t');
    setToasts((p) => [...p.slice(-2), { id, msg }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3200);
  }, []);

  const setTheme = useCallback((mode) => {
    if (mode !== 'light' && mode !== 'dark') return;
    setThemeState(mode);
  }, []);
  const toggleTheme = useCallback(() => {
    setThemeState((p) => (p === 'dark' ? 'light' : 'dark'));
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0B1220' : '#4EA8DE');
    try { localStorage.setItem('gm-theme', theme); } catch { /* abaikan */ }
  }, [theme]);

  async function ensureAccount(userId) {
    if (!supabase) return { id: `local_${userId}`, type: 'REAL' };
    const { data: existing, error: selErr } = await supabase.from('accounts').select('*').eq('auth_user_id', userId).maybeSingle();
    if (selErr) throw selErr;
    if (existing) return { id: existing.id, type: existing.account_type, row: existing };
    const { data, error } = await supabase.from('accounts').insert({ auth_user_id: userId, account_type: 'REAL' }).select().single();
    if (error) throw error;
    try { await supabase.from('app_settings').upsert({ account_id: data.id, lock_duration_hours: 24 }); } catch { /* abaikan */ }
    return { id: data.id, type: 'REAL', row: data };
  }

  function applyAccount(acc, email) {
    const full = acc ? { ...acc, email: email || acc.email || null } : null;
    setAccount(full);
    if (full) {
      if (full.type === 'GUEST') setIsGuest(true);
      else setIsGuest(false);
      writeCachedAccount(full);
    }
  }

  const revalidateSession = useCallback(async () => {
    if (!supabase || !isSupabaseConfigured) return true;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    try {
      const { data, error } = await withTimeout(supabase.auth.getUser(), 15000);
      if (error) {
        if (isAuthInvalidError(error)) return false;
        return true;
      }
      return Boolean(data?.user);
    } catch (e) {
      if (isAuthInvalidError(e)) return false;
      return true;
    }
  }, []);

  async function clearAuthState(reason) {
    try { if (supabase) await supabase.auth.signOut(); } catch { /* abaikan */ }
    setAccount(null);
    setSession(null);
    setIsGuest(false);
    writeCachedAccount(null);
    try { localStorage.removeItem('gm-guest'); } catch { /* abaikan */ }
    if (reason === 'expired') toast('Sesi berakhir. Masuk kembali untuk melanjutkan.');
  }

  useEffect(() => {
    let subscription = null;
    let cancelled = false;
    (async () => {
      const g = readValidGuest();
      if (!g) {
        const raw = localStorage.getItem('gm-guest');
        if (raw) {
          try { localStorage.removeItem('gm-guest'); } catch { /* abaikan */ }
          try { await idbDel('guest-data'); } catch { /* abaikan */ }
        }
      }
      if (isSupabaseConfigured && supabase) {
        try {
          const { data } = await supabase.auth.getSession();
          const sess = data?.session || null;
          if (cancelled) return;
          setSession(sess);
          if (sess?.user && !g) {
            if (onlineRef.current) {
              try {
                const acc = await withTimeout(ensureAccount(sess.user.id), 20000);
                if (cancelled) return;
                applyAccount(acc, sess.user.email);
              } catch (e) {
                if (!isNetworkError(e) && String(e?.message || e || '') !== 'timeout') toast('Gagal memuat akun. Coba muat ulang.');
              }
            }
            if (onlineRef.current) {
              const valid = await revalidateSession();
              if (cancelled) return;
              if (!valid) {
                await clearAuthState('expired');
                setLoadingAuth(false);
                return;
              }
            }
          } else if (!sess && !g && !readCachedAccount()) {
            if (!cancelled) setAccount(null);
          }
        } catch {
          /* getSession lokal seharusnya tidak gagal; abaikan */
        }
        const { data: sub } = supabase.auth.onAuthStateChange(async (ev, s) => {
          if (cancelled) return;
          setSession(s);
          if (s?.user) {
            if (!onlineRef.current) {
              const cached = readCachedAccount();
              if (cached) {
                setAccount(cached);
                setIsGuest(cached.type === 'GUEST');
              }
              return;
            }
            try {
              const acc = await withTimeout(ensureAccount(s.user.id), 20000);
              if (cancelled) return;
              applyAccount(acc, s.user.email);
            } catch (e) {
              if (isNetworkError(e)) {
                const cached = readCachedAccount();
                if (cached) {
                  setAccount(cached);
                  setIsGuest(cached.type === 'GUEST');
                }
              }
            }
          } else {
            if (ev === 'SIGNED_OUT') {
              try {
                const { data: cur } = await supabase.auth.getSession();
                if (cur?.session) return;
              } catch { /* lanjut verifikasi offline */ }
              if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
              if (readValidGuest()) return;
              setAccount(null);
              setIsGuest(false);
              writeCachedAccount(null);
            }
          }
        });
        subscription = sub?.subscription || sub || null;
      }
      if (!cancelled) setLoadingAuth(false);
    })();
    return () => { cancelled = true; try { subscription?.unsubscribe?.(); } catch { /* abaikan */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateSyncState(q) {
    const list = q || queueRef.current;
    const conflicts = list.filter((o) => o.status === 'conflict').length;
    const pending = list.filter((o) => o.status === 'pending' || o.status === 'failed' || o.status === 'syncing').length;
    if (conflicts > 0) setSyncState('Perlu perhatian');
    else if (pending > 0) setSyncState(onlineRef.current ? 'Perlu sinkron' : 'Menunggu offline');
    else setSyncState('Tersinkron');
  }

  async function persistQueue(q) {
    queueRef.current = q;
    setQueue((prev) => (JSON.stringify(prev) === JSON.stringify(q) ? prev : q));
    await idbSet(QUEUE_KEY, q);
    updateSyncState(q);
  }

  async function loadQueue() {
    const raw = await idbGet(QUEUE_KEY, []);
    const valid = Array.isArray(raw) ? raw.filter((o) => o && o.type === 'SAVE_ATTENDANCE' && o.accountId && o.occurrence) : [];
    queueRef.current = valid;
    setQueue(valid);
    updateSyncState(valid);
    return valid;
  }

  async function markOp(id, patch) {
    const q = queueRef.current.map((o) => (o.id === id ? { ...o, ...patch } : o));
    await persistQueue(q);
    return q.find((o) => o.id === id);
  }

  async function removeOp(id) {
    const q = queueRef.current.filter((o) => o.id !== id);
    await persistQueue(q);
  }

  async function replayOp(op, opts = {}) {
    if (!supabase) throw new Error('Backend belum dikonfigurasi.');
    const { data: occ, error: occErr } = await supabase.from('schedule_occurrences').upsert({
      account_id: op.accountId,
      recurring_schedule_id: op.occurrence.recurring_schedule_id,
      occurrence_date: op.occurrence.occurrence_date,
      occurrence_time: op.occurrence.occurrence_time,
      occurrence_end_time: op.occurrence.occurrence_end_time || null,
      day_name: op.occurrence.day_name,
    }, { onConflict: 'account_id,recurring_schedule_id,occurrence_date' }).select().single();
    if (occErr) throw occErr;
    if (!opts.force) {
      const { data: serverRows, error: selErr } = await supabase.from('attendance').select('member_id,status,absence_name_snapshot,updated_at').eq('occurrence_id', occ.id);
      if (selErr) throw selErr;
      if ((serverRows || []).length > 0) {
        const serverMax = Math.max(...serverRows.map((r) => new Date(r.updated_at || 0).getTime()));
        if (serverMax > (op.createdAt || 0) && rowsDiffer(op.rows, serverRows)) {
          const conflict = new Error('conflict');
          conflict.conflict = true;
          conflict.serverRows = serverRows;
          conflict.dbId = occ.id;
          throw conflict;
        }
      }
    }
    for (const r of op.rows) {
      const { error } = await supabase.from('attendance').upsert({
        account_id: op.accountId,
        occurrence_id: occ.id,
        member_id: r.member_id,
        status: r.status,
        absence_name_snapshot: r.absence || null,
        member_name_snapshot: r.member_name,
      }, { onConflict: 'account_id,occurrence_id,member_id' });
      if (error) throw error;
    }
    for (const m of op.mats || []) {
      const payload = { id: m.clientId, account_id: op.accountId, occurrence_id: occ.id, kind: m.kind };
      if (m.kind === 'QURAN') {
        payload.quran_surah_number = m.surah;
        payload.quran_surah_name_snapshot = m.surahName;
        payload.ayat_range = m.ayat;
        payload.speaker_name_snapshot = m.speaker || null;
      } else if (m.kind === 'HADITH') {
        payload.hadith_name_snapshot = m.hadith;
        payload.hadith_page = m.halaman || null;
        payload.speaker_name_snapshot = m.speaker || null;
      } else if (m.kind === 'NASEHAT') {
        payload.speaker_name_snapshot = m.speaker || null;
      } else if (m.kind === 'FREE') {
        payload.free_activity_name_snapshot = m.activity || null;
        payload.speaker_name_snapshot = m.speaker || null;
      }
      const { error } = await supabase.from('materials').upsert(payload, { onConflict: 'id' });
      if (error) throw error;
    }
    try {
      await supabase.from('audit_logs').insert({
        account_id: op.accountId,
        action: 'SYNC_ATTENDANCE',
        entity_type: 'attendance',
        entity_id: occ.id,
        new_data: { count: op.rows.length, opId: op.id },
      });
    } catch { /* audit best-effort */ }
    return occ.id;
  }

  async function processQueue(manual = false) {
    if (syncingRef.current || !supabase || !isSupabaseConfigured) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const actionable = queueRef.current.filter((o) => o.status === 'pending' || o.status === 'failed');
    if (actionable.length === 0) {
      updateSyncState(queueRef.current);
      return;
    }
    syncingRef.current = true;
    setSyncState('Menyinkronkan');
    let synced = 0;
    for (const op of actionable) {
      const current = queueRef.current.find((o) => o.id === op.id);
      if (!current || (current.status !== 'pending' && current.status !== 'failed')) continue;
      await markOp(op.id, { status: 'syncing' });
      try {
        await replayOp(op);
        await removeOp(op.id);
        synced += 1;
      } catch (e) {
        if (e && e.conflict) {
          await markOp(op.id, { status: 'conflict', serverRows: e.serverRows || [], dbId: e.dbId || null });
        } else if (isNetworkError(e)) {
          await markOp(op.id, { status: 'pending', retry: (current.retry || 0) + 1 });
          break;
        } else {
          await markOp(op.id, { status: 'failed', error: String(e?.message || e || 'gagal').slice(0, 200) });
        }
      }
    }
    syncingRef.current = false;
    const remaining = queueRef.current;
    updateSyncState(remaining);
    setLastSyncAt(Date.now());
    const conflicts = remaining.filter((o) => o.status === 'conflict').length;
    if (conflicts > 0) toast('Ada data yang perlu perhatian sebelum sinkron.');
    else if (synced > 0 && remaining.length === 0) toast('Semua perubahan telah tersinkron.');
    else if (synced > 0) toast('Sebagian perubahan tersinkron.');
    if (!manual && onlineRef.current && remaining.some((o) => o.status === 'pending' && (o.retry || 0) < 3)) {
      setTimeout(() => { if (!syncingRef.current) void processQueue(); }, 3000);
    }
  }

  async function enqueue(op) {
    const item = { id: clientId('q'), createdAt: Date.now(), status: 'pending', retry: 0, ...op };
    await persistQueue([...queueRef.current, item]);
    if (onlineRef.current) void processQueue();
    return item;
  }

  async function resolveConflict(opId, choice) {
    const op = queueRef.current.find((o) => o.id === opId);
    if (!op) return;
    if (choice === 'server') {
      await removeOp(opId);
      setLastSyncAt(Date.now());
      toast('Menggunakan data server.');
      return;
    }
    await markOp(opId, { status: 'syncing' });
    try {
      await replayOp(op, { force: true });
      await removeOp(opId);
      setLastSyncAt(Date.now());
      toast('Perubahan lokal dikirim ke server.');
    } catch (e) {
      if (isNetworkError(e)) await markOp(opId, { status: 'pending' });
      else await markOp(opId, { status: 'failed', error: String(e?.message || e || 'gagal').slice(0, 200) });
    }
  }

  async function retrySync() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      toast('Anda sedang offline. Data tetap tersimpan dan akan dikirim saat koneksi kembali.');
      return;
    }
    const reset = queueRef.current.map((o) => (o.status === 'pending' || o.status === 'failed' ? { ...o, retry: 0 } : o));
    await persistQueue(reset);
    await processQueue(true);
  }
  async function trySync() { await processQueue(true); }

  async function saveSnapshot(accountId, snap) {
    if (!accountId) return;
    try { await idbSet(`cache-${accountId}`, { ...snap, savedAt: Date.now() }); } catch { /* abaikan */ }
  }
  async function loadSnapshot(accountId) {
    if (!accountId) return null;
    return await idbGet(`cache-${accountId}`, null);
  }

  useEffect(() => { loadQueue(); }, []);

  useEffect(() => {
    const on = () => {
      setOnline(true);
      toast('Kembali online. Menyinkronkan perubahan.');
      revalidateSession().then((valid) => { if (valid === false) clearAuthState('expired'); });
      void processQueue();
    };
    const off = () => {
      setOnline(false);
      toast('Anda sedang offline. Perubahan akan disimpan di perangkat.');
    };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (online && queue.some((o) => o.status === 'pending' || o.status === 'failed')) {
      const t = setTimeout(() => { void processQueue(); }, 1500);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, queue, lastSyncAt]);

  async function loginGuest() {
    const accountId = uid('guest');
    const payload = { accountId, createdAt: Date.now() };
    try { localStorage.setItem('gm-guest', JSON.stringify(payload)); } catch { /* abaikan */ }
    setIsGuest(true);
    const acc = { id: accountId, type: 'GUEST' };
    setAccount(acc);
    writeCachedAccount(acc);
  }
  async function logout() {
    if (isGuest) {
      try { localStorage.removeItem('gm-guest'); } catch { /* abaikan */ }
      await idbDel('guest-data');
      setIsGuest(false);
      setAccount(null);
      writeCachedAccount(null);
      toast('Keluar dan data demo dihapus.');
    } else {
      await clearAuthState();
    }
  }

  const pendingCount = queue.filter((o) => o.status === 'pending' || o.status === 'failed' || o.status === 'syncing').length;
  const conflicts = queue.filter((o) => o.status === 'conflict');

  const value = {
    theme, setTheme, toggleTheme, online, syncState, toasts, toast,
    session, account, isGuest, loadingAuth,
    queue, pendingCount, conflicts, lastSyncAt,
    enqueue, trySync, retrySync, resolveConflict,
    saveSnapshot, loadSnapshot,
    loginGuest, logout, supabaseReady: isSupabaseConfigured,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
