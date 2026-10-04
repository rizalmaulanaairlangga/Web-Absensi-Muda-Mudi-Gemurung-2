import React from 'react';
import { CalendarIcon, ClockIcon, ChevronLeftIcon, ChevronRightIcon } from './ui.jsx';
import { MONTHS } from '../lib/dates.js';

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

function pad(n) {
  return String(n).padStart(2, '0');
}
export function toISO(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}
function parseISO(value) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}
export function formatLongID(value) {
  const p = parseISO(value);
  if (!p) return '';
  return `${p.d} ${MONTHS[p.m - 1]} ${p.y}`;
}

function useOutsideClose(open, ref, onClose) {
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open, ref, onClose]);
}

export function DateField({ value, onChange, ariaLabel = 'Pilih tanggal', placeholder = 'Pilih tanggal' }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef(null);
  const parsed = parseISO(value);
  const today = new Date();
  const [view, setView] = React.useState(() => parsed ? { y: parsed.y, m: parsed.m } : { y: today.getFullYear(), m: today.getMonth() + 1 });
  useOutsideClose(open, rootRef, () => setOpen(false));

  React.useEffect(() => {
    if (open) {
      const p = parseISO(value);
      const t = new Date();
      setView(p ? { y: p.y, m: p.m } : { y: t.getFullYear(), m: t.getMonth() + 1 });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const firstDow = new Date(view.y, view.m - 1, 1).getDay();
  const leadBlanks = (firstDow + 6) % 7;
  const daysInMonth = new Date(view.y, view.m, 0).getDate();
  const cells = [...Array(leadBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const todayISO = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  function shiftMonth(delta) {
    setView((v) => {
      const d = new Date(v.y, v.m - 1 + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() + 1 };
    });
  }
  function onGridKey(e) {
    const btns = [...rootRef.current.querySelectorAll('.date-day')];
    const idx = btns.indexOf(document.activeElement);
    if (idx < 0) return;
    let next = null;
    if (e.key === 'ArrowRight') next = idx + 1;
    else if (e.key === 'ArrowLeft') next = idx - 1;
    else if (e.key === 'ArrowDown') next = idx + 7;
    else if (e.key === 'ArrowUp') next = idx - 7;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = btns.length - 1;
    if (next !== null && btns[next]) { e.preventDefault(); btns[next].focus(); }
  }

  return (
    <div ref={rootRef} className="field-pick">
      <button
        type="button"
        className={`field-btn${value ? '' : ' is-placeholder'}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="field-btn-value">{value ? formatLongID(value) : placeholder}</span>
        <CalendarIcon size={18} />
      </button>
      {open && (
        <div
          className="field-pop"
          role="dialog"
          aria-label={ariaLabel}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        >
          <div className="date-head">
            <button type="button" className="icon-btn" aria-label="Bulan sebelumnya" onClick={() => shiftMonth(-1)}><ChevronLeftIcon /></button>
            <strong>{MONTHS[view.m - 1]} {view.y}</strong>
            <button type="button" className="icon-btn" aria-label="Bulan berikutnya" onClick={() => shiftMonth(1)}><ChevronRightIcon /></button>
          </div>
          <div className="date-week">{WEEKDAYS.map((w) => <span key={w}>{w}</span>)}</div>
          <div className="date-grid" onKeyDown={onGridKey}>
            {cells.map((d, i) => d === null ? <span key={`b${i}`} /> : (
              <button
                key={d}
                type="button"
                className={`date-day${toISO(view.y, view.m, d) === value ? ' selected' : ''}${toISO(view.y, view.m, d) === todayISO ? ' today' : ''}`}
                autoFocus={toISO(view.y, view.m, d) === (value || todayISO)}
                onClick={() => { onChange?.(toISO(view.y, view.m, d)); setOpen(false); }}
              >
                {d}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => setOpen(false)}>Batal</button>
        </div>
      )}
    </div>
  );
}

export function TimeField({ value, onChange, ariaLabel = 'Pilih waktu', placeholder = 'Pilih waktu', minuteStep = 5 }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef(null);
  const [hour, setHour] = React.useState(19);
  const [minute, setMinute] = React.useState(30);
  useOutsideClose(open, rootRef, () => setOpen(false));

  React.useEffect(() => {
    if (open && value) {
      const m = /^(\d{2}):(\d{2})/.exec(value);
      if (m) {
        setHour(Math.min(23, Math.max(0, Number(m[1]))));
        setMinute(Math.min(59, Math.max(0, Number(m[2]))));
      }
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const minutes = [];
  for (let mm = 0; mm < 60; mm += minuteStep) minutes.push(mm);
  if (!minutes.includes(minute)) minutes.push(minute);

  function confirm(h, m) {
    onChange?.(`${pad(h)}:${pad(m)}`);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="field-pick">
      <button
        type="button"
        className={`field-btn${value ? '' : ' is-placeholder'}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="field-btn-value">{value ? String(value).slice(0, 5) : placeholder}</span>
        <ClockIcon size={18} />
      </button>
      {open && (
        <div
          className="field-pop time-pop"
          role="dialog"
          aria-label={ariaLabel}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        >
          <div className="time-preview" aria-live="polite">{pad(hour)} : {pad(minute)}</div>
          <div className="time-cols">
            <div>
              <div className="time-cap">Jam</div>
              <div className="time-grid" role="group" aria-label="Jam">
                {Array.from({ length: 24 }, (_, h) => (
                  <button key={h} type="button" className={`time-cell${h === hour ? ' selected' : ''}`} onClick={() => setHour(h)}>{pad(h)}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="time-cap">Menit</div>
              <div className="time-grid" role="group" aria-label="Menit">
                {minutes.map((mm) => (
                  <button key={mm} type="button" className={`time-cell${mm === minute ? ' selected' : ''}`} onClick={() => confirm(hour, mm)}>{pad(mm)}</button>
                ))}
              </div>
              <label className="field" style={{ marginTop: 8, marginBottom: 0 }}>
                <span>Menit bebas (0–59)</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="59"
                  value={minute}
                  onChange={(e) => {
                    const v = Math.min(59, Math.max(0, Number(e.target.value || 0)));
                    setMinute(v);
                  }}
                />
              </label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setOpen(false)}>Batal</button>
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => confirm(hour, minute)}>Pilih</button>
          </div>
        </div>
      )}
    </div>
  );
}
