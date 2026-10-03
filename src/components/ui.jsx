import React from 'react';
import { NavLink } from 'react-router-dom';

export function Icon({ d, size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
export const ICONS = {
  absensi: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  laporan: 'M3 3v18h18 M8 17V9 M13 17V5 M18 17v-6',
  admin: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'
};

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Navigasi utama">
      <div className="bottom-nav-inner">
        <NavLink to="/" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
          <Icon d={ICONS.absensi} /><span>Absensi</span>
        </NavLink>
        <NavLink to="/laporan" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
          <Icon d={ICONS.laporan} /><span>Laporan</span>
        </NavLink>
        <NavLink to="/admin" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
          <Icon d={ICONS.admin} /><span>Admin</span>
        </NavLink>
      </div>
    </nav>
  );
}

export function Modal({ title, onClose, children, foot }) {
  React.useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>{title}</strong>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup dialog">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

export function Empty({ title, desc, action }) {
  return (
    <div className="empty">
      <div style={{ fontSize: 30, marginBottom: 8 }} aria-hidden="true">📅</div>
      <strong>{title}</strong>
      <p className="hint">{desc}</p>
      {action}
    </div>
  );
}

export function BarChart({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.hadir + r.izin + r.alpha));
  return (
    <div className="chart-bar">
      {rows.map((r) => (
        <div className="chart-row" key={r.label}>
          <span>{r.label}</span>
          <span className="bar-track" role="img" aria-label={`${r.label}: hadir ${r.hadir}, izin ${r.izin}, alpha ${r.alpha}`}>
            <span className="bar-fill" style={{ width: `${(r.hadir/max)*100}%`, background: '#22C55E' }} />
            <span className="bar-fill" style={{ width: `${(r.izin/max)*100}%`, background: '#F59E0B' }} />
            <span className="bar-fill" style={{ width: `${(r.alpha/max)*100}%`, background: '#EF4444' }} />
          </span>
          <span>{r.hadir + r.izin + r.alpha}</span>
        </div>
      ))}
      <div className="legend">
        <span className="lg"><span className="mark hadir">✓</span> Hadir</span>
        <span className="lg"><span className="mark izin">I</span> Izin</span>
        <span className="lg"><span className="mark alpha">A</span> Alpha</span>
      </div>
    </div>
  );
}
