import React, { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './lib/store.jsx';
import { BottomNav, SunIcon, MoonIcon, UserIcon, LogoutIcon } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Absensi from './pages/Absensi.jsx';
import Laporan from './pages/Laporan.jsx';
import Admin from './pages/Admin.jsx';

function ThemeToggle() {
  const { theme, toggleTheme } = useApp();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={dark ? 'Ubah ke mode terang' : 'Ubah ke mode gelap'}
      title={dark ? 'Mode gelap aktif. Klik untuk mode terang.' : 'Mode terang aktif. Klik untuk mode gelap.'}
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <span className="theme-toggle-thumb">{dark ? <MoonIcon size={15} /> : <SunIcon size={15} />}</span>
      </span>
      <span className="theme-toggle-label">{dark ? 'Gelap' : 'Terang'}</span>
    </button>
  );
}

function AccountMenu() {
  const { account, isGuest, session, logout } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const nav = useNavigate();
  const email = session?.user?.email || (isGuest ? 'Tamu (demo)' : 'Pengelola');

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open ]);

  if (!account) return null;
  return (
    <div className="account-menu" ref={ref}>
      <button
        type="button"
        className="icon-btn account-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu akun"
        title="Menu akun"
      >
        <UserIcon />
      </button>
      {open && (
        <div className="account-pop" role="menu" aria-label="Menu akun">
          <div className="account-pop-head">
            <strong>Akun</strong>
            <span className="account-email">{email}</span>
            <span className={`badge ${isGuest ? 'amber' : 'green'}`}>{isGuest ? 'Tamu' : 'Pengelola'}</span>
          </div>
          <button
            type="button"
            className="account-logout"
            role="menuitem"
            onClick={async () => {
              if (isGuest && !window.confirm('Keluar dan hapus data demo?')) return;
              setOpen(false);
              await logout();
              nav('/login');
            }}
          >
            <LogoutIcon /> Keluar{isGuest ? ' dan hapus demo' : ''}
          </button>
        </div>
      )}
    </div>
  );
}

function Header() {
  const { online, syncState, pendingCount, retrySync } = useApp();
  const actionable = pendingCount > 0;
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">✓</span>
        <span>
          <span className="brand-title">Absensi Muda-Mudi<br />Gemurung 2</span>
        </span>
      </div>
      <div className="header-right">
        <button
          type="button"
          className="status-pill"
          role="status"
          onClick={() => { if (actionable) retrySync(); }}
          title={actionable ? `Ada ${pendingCount} perubahan menunggu. Klik untuk sinkron ulang.` : 'Status koneksi'}
          aria-label={actionable ? `Sinkronisasi tertunda (${pendingCount}). Aktifkan untuk mencoba lagi.` : `Status: ${online ? syncState : 'Offline'}`}
        >
          <span className={`dot ${online ? (syncState === 'Menyinkronkan' ? 'sync' : 'online') : 'offline'}`} />
          {online ? (syncState === 'Menyinkronkan' ? 'Menyinkronkan' : `Online${actionable ? ` • ${pendingCount}` : ''}`) : `Offline${actionable ? ` • ${pendingCount}` : ''}`}
        </button>
        <ThemeToggle />
        <AccountMenu />
      </div>
    </header>
  );
}

function Toasts() {
  const { toasts } = useApp();
  return <div className="toast-wrap" aria-live="polite">{toasts.map((t) => <div className="toast" key={t.id}>{t.msg}</div>)}</div>;
}

function Splash() {
  return (
    <div className="splash" role="status" aria-label="Memeriksa sesi">
      <div className="splash-card">
        <div className="app-logo" aria-hidden="true">✓</div>
        <strong>Memeriksa sesi...</strong>
        <p className="hint">Membuka absensi.</p>
      </div>
    </div>
  );
}

function Guard({ children }) {
  const { account, loadingAuth } = useApp();
  if (loadingAuth) return <Splash />;
  if (!account) return <Navigate to="/login" replace />;
  return children;
}

function Shell() {
  const location = useLocation();
  const { loadingAuth } = useApp();
  const isLogin = location.pathname === '/login';
  if (isLogin) {
    if (loadingAuth) {
      return (
        <div className="app-shell login-shell">
          <Splash />
        </div>
      );
    }
    return (
      <div className="app-shell login-shell">
        <main className="login-main">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Login />} />
          </Routes>
        </main>
        <Toasts />
      </div>
    );
  }
  return (
    <div className="app-shell">
      <Header />
      <main className="app-content">
        {loadingAuth ? (
          <Splash />
        ) : (
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Guard><Absensi /></Guard>} />
            <Route path="/laporan" element={<Guard><Laporan /></Guard>} />
            <Route path="/admin" element={<Guard><Admin /></Guard>} />
          </Routes>
        )}
      </main>
      <BottomNav />
      <Toasts />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Shell />
      </AppProvider>
    </BrowserRouter>
  );
}
