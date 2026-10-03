import React from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './lib/store.jsx';
import { BottomNav } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Absensi from './pages/Absensi.jsx';
import Laporan from './pages/Laporan.jsx';
import Admin from './pages/Admin.jsx';

function Header() {
  const { online, syncState, theme, setTheme, account, isGuest, logout } = useApp();
  const nav = useNavigate();
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">✓</span>
        <span>
          <span className="brand-title">Absensi Muda-Mudi<br />Gemurung 2</span>
        </span>
      </div>
      <div className="header-right">
        <span className="status-pill" role="status">
          <span className={`dot ${online ? (syncState === 'Menyinkronkan' ? 'sync' : 'online') : 'offline'}`} />
          {online ? (syncState === 'Menyinkronkan' ? 'Menyinkronkan' : 'Online') : 'Offline'}
        </span>
        <select className="theme-select" value={theme} onChange={(e) => setTheme(e.target.value)} aria-label="Pilih tema">
          <option value="system">Auto</option>
          <option value="light">Terang</option>
          <option value="dark">Gelap</option>
        </select>
        {account ? (
          <button className="icon-btn" onClick={async () => { if (isGuest && !confirm('Keluar dan hapus data demo?')) return; await logout(); nav('/login'); }} aria-label={isGuest ? 'Keluar dan hapus data demo' : 'Keluar'}>
            {isGuest ? '🚪' : '👤'}
          </button>
        ) : (
          <Link className="icon-btn" to="/login" aria-label="Masuk" style={{ textDecoration: 'none' }}>→</Link>
        )}
      </div>
    </header>
  );
}

function Toasts() {
  const { toasts } = useApp();
  return <div className="toast-wrap" aria-live="polite">{toasts.map((t) => <div className="toast" key={t.id}>{t.msg}</div>)}</div>;
}

function Guard({ children }) {
  const { account, loadingAuth } = useApp();
  if (loadingAuth) return <div className="card"><p className="hint">Memuat...</p></div>;
  if (!account) return <Navigate to="/login" replace />;
  return children;
}

function Shell() {
  const location = useLocation();
  const isLogin = location.pathname === '/login';
  if (isLogin) {
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
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Guard><Absensi /></Guard>} />
          <Route path="/laporan" element={<Guard><Laporan /></Guard>} />
          <Route path="/admin" element={<Guard><Admin /></Guard>} />
        </Routes>
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
