import React from 'react';
import { NavLink } from 'react-router-dom';

export function Icon({ d, size = 24, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children || <path d={d} />}
    </svg>
  );
}
export const ICONS = {
  absensi: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  laporan: 'M3 3v18h18 M8 17V9 M13 17V5 M18 17v-6',
  admin: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'
};

export function SunIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M6.34 17.66l-1.41 1.41 M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}
export function MoonIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />
    </svg>
  );
}
export function PlusIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14 M5 12h14" />
    </svg>
  );
}
export function TrashIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M10 11v6 M14 11v6" />
    </svg>
  );
}
export function PencilIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    </svg>
  );
}
export function UserIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
export function LogoutIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9" />
    </svg>
  );
}
export function CalendarIcon({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4 M8 2v4 M3 10h18" />
    </svg>
  );
}
export function ClockIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}
export function CloseIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18 M6 6l12 12" />
    </svg>
  );
}
export function ChevronLeftIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
export function ChevronRightIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function ChevronUpIcon({ size = 16 }) {  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}
export function UsersIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
export function BookOpenIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}
export function LayersIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" />
      <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
      <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
    </svg>
  );
}
export function RefreshIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}
export function EyeIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
export function ArrowLeftIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5 M12 19l-7-7 7-7" />
    </svg>
  );
}

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
          <button className="icon-btn" onClick={onClose} aria-label="Tutup dialog"><CloseIcon /></button>
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
      <div className="empty-icon" aria-hidden="true"><CalendarIcon /></div>
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

function CheckMark({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 16 }) {
  return (
    <svg className="cselect-chevron" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function CustomSelect({ value, onChange, options = [], placeholder = 'Pilih...', ariaLabel, disabled = false, className = '' }) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const rootRef = React.useRef(null);
  const rawId = React.useId();
  const safeId = String(rawId).replace(/[^a-zA-Z0-9]/g, '');
  const typeRef = React.useRef({ text: '', timer: null });
  const selectedIndex = options.findIndex((o) => String(o.value) === String(value));
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const close = () => { setOpen(false); setActive(-1); };
  const pick = (idx) => {
    const opt = options[idx];
    if (!opt) return;
    close();
    if (String(opt.value) !== String(value)) onChange?.(opt.value);
  };

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) close(); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function onButtonKey(e) {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        setActive(selectedIndex >= 0 ? selectedIndex : 0);
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % options.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + options.length) % options.length); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(active >= 0 ? active : 0); }
    else if (e.key === 'Tab') { close(); }
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      const t = typeRef.current;
      t.text = (t.text + e.key).toLowerCase().slice(-12);
      clearTimeout(t.timer);
      t.timer = setTimeout(() => { t.text = ''; }, 600);
      const idx = options.findIndex((o) => String(o.label).toLowerCase().startsWith(t.text));
      if (idx >= 0) setActive(idx);
    }
  }

  React.useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(`${safeId}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, safeId]);

  return (
    <div ref={rootRef} className={`cselect ${className}`}>
      <button
        type="button"
        className={`cselect-btn${selected ? '' : ' is-placeholder'}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-activedescendant={open && active >= 0 ? `${safeId}-opt-${active}` : undefined}
        disabled={disabled}
        onClick={() => { if (open) close(); else { setActive(selectedIndex >= 0 ? selectedIndex : 0); setOpen(true); } }}
        onKeyDown={onButtonKey}
      >
        <span className="cselect-value">{selected ? selected.label : placeholder}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <ul className="cselect-list" role="listbox" id={`${safeId}-list`} aria-label={ariaLabel} tabIndex={-1}>
          {options.map((opt, i) => (
            <li
              key={String(opt.value) + '-' + i}
              id={`${safeId}-opt-${i}`}
              role="option"
              aria-selected={String(opt.value) === String(value)}
              className={`cselect-opt${i === active ? ' active' : ''}${String(opt.value) === String(value) ? ' selected' : ''}`}
              onClick={() => pick(i)}
              onMouseEnter={() => setActive(i)}
            >
              <span>{opt.label}</span>
              {String(opt.value) === String(value) && <CheckMark />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ID_MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export function MonthPicker({ y, m, onChange, ariaLabel = 'Pilih bulan dan tahun' }) {
  const [open, setOpen] = React.useState(false);
  const [year, setYear] = React.useState(y);
  const rootRef = React.useRef(null);

  React.useEffect(() => { if (!open) setYear(y); }, [y, open ]);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open ]);

  function onGridKey(e) {
    const btns = [...rootRef.current.querySelectorAll('.mp-month')];
    const idx = btns.indexOf(document.activeElement);
    if (idx < 0) return;
    let next = null;
    if (e.key === 'ArrowRight') next = idx + 1;
    else if (e.key === 'ArrowLeft') next = idx - 1;
    else if (e.key === 'ArrowDown') next = idx + 3;
    else if (e.key === 'ArrowUp') next = idx - 3;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = btns.length - 1;
    if (next !== null && btns[next]) { e.preventDefault(); btns[next].focus(); }
  }

  return (
    <div ref={rootRef} className="mpick">
      <button
        type="button"
        className="cselect-btn mpick-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="cselect-value">{ID_MONTHS[m - 1]} {y}</span>
        <CalendarIcon size={18} />
      </button>
      {open && (
        <div className="mpick-pop" role="dialog" aria-label={ariaLabel}>
          <div className="mpick-year">
            <button type="button" className="icon-btn" aria-label="Tahun sebelumnya" onClick={() => setYear((v) => v - 1)}><ChevronLeftIcon /></button>
            <strong>{year}</strong>
            <button type="button" className="icon-btn" aria-label="Tahun berikutnya" onClick={() => setYear((v) => v + 1)}><ChevronRightIcon /></button>
          </div>
          <div className="mpick-grid" onKeyDown={onGridKey}>
            {ID_MONTHS.map((name, i) => (
              <button
                key={name}
                type="button"
                className={`mp-month${year === y && i + 1 === m ? ' selected' : ''}`}
                autoFocus={year === y && i + 1 === m}
                onClick={() => { onChange?.({ y: year, m: i + 1 }); setOpen(false); }}
              >
                {name.slice(0, name.length > 7 ? 4 : name.length)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
