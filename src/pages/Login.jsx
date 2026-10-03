import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../lib/store.jsx';
import { supabase } from '../lib/supabaseClient.js';

export default function Login() {
  const { loginGuest, toast, supabaseReady } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [showGuestInfo, setShowGuestInfo] = useState(false);
  const nav = useNavigate();

  async function onLogin(e) {
    e.preventDefault();
    if (!supabaseReady) { toast('Backend belum dikonfigurasi. Gunakan mode tamu untuk mencoba.'); return; }
    if (!email || !password) { toast('Isi email dan kata sandi.'); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { toast('Gagal masuk. Periksa email dan kata sandi.'); return; }
    toast('Selamat datang.');
    nav('/');
  }

  async function onGuest() {
    await loginGuest();
    toast('Masuk sebagai tamu. Data demo, terpisah dari data utama.');
    nav('/');
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="app-logo" aria-hidden="true">✓</div>
        <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>Selamat datang</h1>
        <p className="card-desc">Absensi pengajian Muda-Mudi Gemurung 2. Buka, isi, simpan.</p>
        <form onSubmit={onLogin}>
          <label className="field">
            <span>Email</span>
            <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@example.com" />
          </label>
          <label className="field">
            <span>Kata sandi</span>
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </label>
          <button className="btn btn-primary btn-block" disabled={busy} type="submit">{busy ? 'Masuk...' : 'Masuk'}</button>
        </form>
        <div className="divider">atau</div>
        <button className="btn btn-block" onClick={() => setShowGuestInfo(true)} type="button">Coba sebagai Tamu</button>
        {!supabaseReady && <p className="hint" style={{ marginTop: 10 }}>Mode backend belum aktif di perangkat ini. Mode tamu tetap bisa dicoba karena memakai data lokal.</p>}
        <p className="hint" style={{ marginTop: 12 }}>Tidak ada pendaftaran publik. Akun dibuat secara internal.</p>
        <p className="hint"><Link to="/">Kembali</Link></p>
        {showGuestInfo && (
          <div className="banner warn" style={{ marginTop: 12 }}>
            <div>
              <strong>Anda akan masuk sebagai tamu.</strong>
              <p style={{ margin: '6px 0 10px' }}>Data yang dibuat dalam mode tamu bukan data akun utama dan akan dihapus otomatis setelah masa demo berakhir.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={() => setShowGuestInfo(false)} type="button">Batal</button>
                <button className="btn btn-primary" onClick={onGuest} type="button">Lanjutkan</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
