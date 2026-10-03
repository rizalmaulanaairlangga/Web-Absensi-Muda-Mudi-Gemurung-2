import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { idbGet, idbSet, idbDel } from './idb.js';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

function uid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`; }

export function AppProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('gm-theme') || 'system');
  const [online, setOnline] = useState(() => navigator.onLine);
  const [syncState, setSyncState] = useState('Tersinkron');
  const [toasts, setToasts] = useState([]);
  const [session, setSession] = useState(null);
  const [account, setAccount] = useState(null);
  const [isGuest, setIsGuest] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [queue, setQueue] = useState([]);

  const toast = useCallback((msg) => {
    const id = uid('t');
    setToasts((p) => [...p.slice(-2), { id, msg }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3200);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const mode = theme === 'system' ? (sysDark ? 'dark' : 'light') : theme;
      root.setAttribute('data-theme', mode);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#0B1220' : '#4EA8DE');
    };
    apply();
    localStorage.setItem('gm-theme', theme);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, [theme]);

  useEffect(() => {
    const on = () => { setOnline(true); toast('Kembali online. Menyinkronkan perubahan.'); trySync(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  async function ensureAccount(userId, email) {
    if (!supabase) return { id: `local_${userId}`, type: 'REAL' };
    const { data: existing } = await supabase.from('accounts').select('*').eq('auth_user_id', userId).maybeSingle();
    if (existing) return { id: existing.id, type: existing.account_type, row: existing };
    const { data, error } = await supabase.from('accounts').insert({ auth_user_id: userId, account_type: 'REAL' }).select().single();
    if (error) throw error;
    await supabase.from('app_settings').upsert({ account_id: data.id, lock_duration_hours: 24 });
    return { id: data.id, type: 'REAL', row: data };
  }

  useEffect(() => {
    (async () => {
      const guest = localStorage.getItem('gm-guest');
      if (guest) {
        try {
          const g = JSON.parse(guest);
          if (Date.now() - g.createdAt > 24*60*60*1000) {
            localStorage.removeItem('gm-guest');
            await idbDel('guest-data');
          } else {
            setIsGuest(true);
            setAccount({ id: g.accountId, type: 'GUEST' });
            setLoadingAuth(false);
            return;
          }
        } catch { localStorage.removeItem('gm-guest'); }
      }
      if (!isSupabaseConfigured) { setLoadingAuth(false); return; }
      const { data } = await supabase.auth.getSession();
      const sess = data.session;
      setSession(sess);
      if (sess?.user) {
        try { const acc = await ensureAccount(sess.user.id); setAccount(acc); }
        catch (e) { toast('Gagal memuat akun. Coba muat ulang.'); }
      }
      setLoadingAuth(false);
      supabase.auth.onAuthStateChange(async (_ev, s) => {
        setSession(s);
        if (s?.user) {
          try { const acc = await ensureAccount(s.user.id); setAccount(acc); setIsGuest(false); }
          catch { /* abaikan */ }
        } else { setAccount(null); }
      });
    })();
  }, []);

  useEffect(() => { idbGet('sync-queue', []).then(setQueue); }, []);
  async function enqueue(op) {
    const item = { id: uid('q'), createdAt: Date.now(), status: 'PENDING', retry: 0, ...op };
    const next = [...queue, item];
    setQueue(next);
    await idbSet('sync-queue', next);
    setSyncState('Perlu sinkron');
    return item;
  }
  async function trySync() {
    if (!online || queue.length === 0) return;
    setSyncState('Menyinkronkan');
    await new Promise((r) => setTimeout(r, 600));
    setQueue([]); await idbSet('sync-queue', []);
    setSyncState('Tersinkron');
    toast('Semua perubahan telah tersinkron.');
  }
  useEffect(() => { if (online && queue.length > 0) { const t = setTimeout(trySync, 1500); return () => clearTimeout(t); } }, [online, queue.length]);

  async function loginGuest() {
    const accountId = uid('guest');
    const payload = { accountId, createdAt: Date.now() };
    localStorage.setItem('gm-guest', JSON.stringify(payload));
    setIsGuest(true);
    setAccount({ id: accountId, type: 'GUEST' });
  }
  async function logout() {
    if (isGuest) {
      localStorage.removeItem('gm-guest');
      await idbDel('guest-data');
      const keys = ['gm-data', 'gm-draft'];
      for (const k of keys) await idbDel(k);
      setIsGuest(false); setAccount(null);
      toast('Keluar dan data demo dihapus.');
    } else {
      if (supabase) await supabase.auth.signOut();
      setAccount(null); setSession(null);
    }
  }

  const value = { theme, setTheme, online, syncState, toasts, toast, session, account, isGuest, loadingAuth, queue, enqueue, trySync, loginGuest, logout, supabaseReady: isSupabaseConfigured };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
