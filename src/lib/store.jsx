import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { withTimeout, isNetworkError, isAuthInvalidError } from './net.js';
export { withTimeout, isNetworkError, isAuthInvalidError };
import { idbGet, idbSet, idbDel } from './idb.js';
import { loadQueue, saveQueue, pendingOps, normalizeOp } from '../services/sync/syncQueue.js';
import { processQueue, resolveConflictOp } from '../services/sync/syncEngine.js';
import { registerBackgroundSync } from '../services/sync/backgroundSync.js';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const ACC_KEY = 'gm-account';
const SB_SESSION_KEY = 'sb-session';
const SB_CONFIG_KEY = 'sb-config';

function uid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }
export function clientId(prefix) {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* abaikan */ }
  return `${prefix || 'id'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
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

  const [confirmReq, setConfirmReq] = useState(null);
  const confirmResolveRef = useRef(null);
  const confirmDialog = useCallback((opts = {}) => {
    if (confirmResolveRef.current) {
      try { confirmResolveRef.current(false); } catch { /* abaikan */ }
      confirmResolveRef.current = null;
    }
    return new Promise((resolve) => {
      confirmResolveRef.current = resolve;
      setConfirmReq({
        title: opts.title || 'Konfirmasi',
        desc: opts.desc || '',
        confirmLabel: opts.confirmLabel || 'Ya',
        danger: !!opts.danger,
      });
    });
  }, []);
  const closeConfirm = useCallback((val) => {
    setConfirmReq(null);
    const r = confirmResolveRef.current;
    confirmResolveRef.current = null;
    if (r) r(val);
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
    try { await idbDel(SB_SESSION_KEY); } catch { /* abaikan */ }
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
    await saveQueue(q);
    updateSyncState(q);
  }

  async function reloadQueue() {
    const valid = await loadQueue();
    queueRef.current = valid;
    setQueue(valid);
    updateSyncState(valid);
    return valid;
  }

  async function runSync(manual = false) {
    if (syncingRef.current || !supabase || !isSupabaseConfigured) return { synced: 0 };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { synced: 0 };
    syncingRef.current = true;
    setSyncState('Menyinkronkan');
    try {
      const res = await processQueue({
        getQueue: () => queueRef.current,
        persist: persistQueue,
        accountId: accountRef.current?.id || null,
        notify: toast,
        manual,
      });
      setLastSyncAt(Date.now());
      if (!manual && res.needsRecheck && onlineRef.current) {
        setTimeout(() => { if (!syncingRef.current) void runSync(false); }, 3000);
      }
      return res;
    } finally {
      syncingRef.current = false;
    }
  }

  async function enqueue(op) {
    const built = normalizeOp(op) || normalizeOp({ type: 'SAVE_ATTENDANCE', ...op });
    if (!built) throw new Error('Format operasi tidak dikenal.');
    const item = { ...built, id: built.id || clientId('q'), created_at: built.created_at || Date.now(), updated_at: Date.now(), status: 'pending', next_retry_at: 0 };
    await persistQueue([...queueRef.current, item]);
    try { await registerBackgroundSync(); } catch { /* best-effort */ }
    if (onlineRef.current) void runSync(false);
    return item;
  }

  async function resolveConflict(opId, choice) {
    await resolveConflictOp(opId, choice, {
      getQueue: () => queueRef.current,
      persist: persistQueue,
      notify: toast,
    });
    setLastSyncAt(Date.now());
  }

  async function retrySync() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      toast('Anda sedang offline. Data tetap tersimpan dan akan dikirim saat koneksi kembali.');
      return;
    }
    const reset = queueRef.current.map((o) => (o.status === 'pending' || o.status === 'failed' ? { ...o, retry_count: 0, next_retry_at: 0, updated_at: Date.now() } : o));
    await persistQueue(reset);
    await runSync(true);
  }
  async function trySync() { await runSync(true); }

  async function saveSnapshot(accountId, snap) {
    if (!accountId) return;
    try { await idbSet(`cache-${accountId}`, { ...snap, savedAt: Date.now() }); } catch { /* abaikan */ }
  }
  async function loadSnapshot(accountId) {
    if (!accountId) return null;
    return await idbGet(`cache-${accountId}`, null);
  }

  useEffect(() => { reloadQueue(); }, []);

  useEffect(() => {
    const on = () => {
      setOnline(true);
      toast('Kembali online. Menyinkronkan perubahan.');
      revalidateSession().then((valid) => { if (valid === false) clearAuthState('expired'); });
      void runSync(false);
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
    if (online && pendingOps(queue, { includeFailed: false }).length > 0) {
      const t = setTimeout(() => { void runSync(false); }, 1500);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, queue, lastSyncAt]);

  useEffect(() => {
    try {
      const url = import.meta.env.VITE_SUPABASE_URL;
      const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (url && anon) idbSet(SB_CONFIG_KEY, { url, anon });
    } catch { /* abaikan */ }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (session?.access_token && session?.refresh_token) {
          await idbSet(SB_SESSION_KEY, {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at || null,
            user_id: session.user?.id || null,
          });
        }
      } catch { /* abaikan */ }
    })();
  }, [session]);

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
      try { await idbDel(SB_SESSION_KEY); } catch { /* abaikan */ }
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
    confirmDialog, confirmReq, closeConfirm,
    session, account, isGuest, loadingAuth,
    queue, pendingCount, conflicts, lastSyncAt,
    enqueue, trySync, retrySync, resolveConflict,
    saveSnapshot, loadSnapshot,
    loginGuest, logout, supabaseReady: isSupabaseConfigured,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
