import React from 'react';
import { CalendarIcon, ClockIcon, ChevronLeftIcon, ChevronRightIcon } from './ui.jsx';
import { AnchoredPopover } from './popover.jsx';
import { MONTHS, todayJakarta } from '../lib/dates.js';

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

export function DateField({ value, onChange, ariaLabel = 'Pilih tanggal', placeholder = 'Pilih tanggal' }) {
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef(null);
  const close = React.useCallback(() => setOpen(false), []);
  const parsed = parseISO(value);
  const today = new Date();
  const [view, setView] = React.useState(() => parsed ? { y: parsed.y, m: parsed.m } : { y: today.getFullYear(), m: today.getMonth() + 1 });

  React.useEffect(() => {
    if (open) {
      const p = parseISO(value);
      const t = new Date();
      setView(p ? { y: p.y, m: p.m } : { y: t.getFullYear(), m: t.getMonth() + 1 });
      setLevel('dates');
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
  const [level, setLevel] = React.useState('dates');
  const [panelYear, setPanelYear] = React.useState(view.y);
  const currentYear = React.useMemo(() => todayJakarta().getFullYear(), []);
  const years = React.useMemo(() => Array.from({ length: 51 }, (_, i) => currentYear - i), [currentYear]);
  const minYear = currentYear - 50;
  const selYear = panelYear > currentYear || panelYear < minYear ? null : panelYear;
  const yearListRef = React.useRef(null);
  function openYears() {
    setPanelYear(view.y);
    setLevel('years');
  }
  React.useEffect(() => {
    if (level !== 'years' || !open) return;
    const box = yearListRef.current;
    if (!box) return;
    const sel = box.querySelector('.yr-item.selected') || box.querySelector('.yr-item');
    try { sel?.scrollIntoView?.({ block: 'nearest' }); } catch { /* abaikan */ }
  }, [level, open]);
  function onGridKey(e) {
    const scope = e.currentTarget?.closest?.('.field-pop') || document;
    const btns = [...scope.querySelectorAll('.date-day')];
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
  function onPickKey(e, cls) {
    const scope = e.currentTarget?.closest?.('.field-pop') || document;
    const btns = [...scope.querySelectorAll(cls)];
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
  function onYearKey(e) {
    const scope = e.currentTarget?.closest?.('.field-pop') || document;
    const btns = [...scope.querySelectorAll('.yr-item')];
    const idx = btns.indexOf(document.activeElement);
    if (idx < 0) return;
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = idx + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = idx - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = btns.length - 1;
    if (next !== null && btns[next]) { e.preventDefault(); btns[next].focus(); }
  }

  return (
    <div className="field-pick">
      <button
        ref={btnRef}
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
      <AnchoredPopover anchorRef={btnRef} open={open} onClose={close} className="field-pop" label={ariaLabel}>
        <div
          className="date-head"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && level !== 'dates') { e.stopPropagation(); setLevel(level === 'years' ? 'months' : 'dates'); }
          }}
        >
          {level === 'dates' && (
            <>
              <button type="button" className="icon-btn" aria-label="Bulan sebelumnya" onClick={() => shiftMonth(-1)}><ChevronLeftIcon /></button>
              <button
                type="button"
                className="date-title-btn"
                aria-label="Pilih tahun"
                title="Pilih tahun"
                onClick={openYears}
              >
                {MONTHS[view.m - 1]} {view.y}
              </button>
              <button type="button" className="icon-btn" aria-label="Bulan berikutnya" onClick={() => shiftMonth(1)}><ChevronRightIcon /></button>
            </>
          )}
          {level === 'months' && (
            <>
              <span aria-hidden="true" style={{ width: 40 }} />
              <button
                type="button"
                className="date-title-btn"
                aria-label="Kembali ke pilihan tahun"
                title="Kembali ke pilihan tahun"
                onClick={() => setLevel('years')}
              >
                {panelYear}
              </button>
              <span aria-hidden="true" style={{ width: 40 }} />
            </>
          )}
          {level === 'years' && (
            <>
              <span aria-hidden="true" style={{ width: 40 }} />
              <button
                type="button"
                className="date-title-btn"
                aria-label="Kembali ke kalender tanggal"
                title="Kembali ke kalender tanggal"
                onClick={() => setLevel('dates')}
              >
                Pilih Tahun
              </button>
              <span aria-hidden="true" style={{ width: 40 }} />
            </>
          )}
        </div>
        {level === 'months' && (
          <div className="mpick-grid" onKeyDown={(e) => onPickKey(e, '.my-month')}>
            {MONTHS.map((name, i) => (
              <button
                key={name}
                type="button"
                className={`mp-month my-month${panelYear === view.y && i + 1 === view.m ? ' selected' : ''}`}
                aria-pressed={panelYear === view.y && i + 1 === view.m}
                aria-label={`${name} ${panelYear}`}
                onClick={() => { setView({ y: panelYear, m: i + 1 }); setLevel('dates'); }}
              >
                {name.slice(0, name.length > 7 ? 4 : name.length)}
              </button>
            ))}
          </div>
        )}
        {level === 'years' && (
          <div ref={yearListRef} className="year-list" role="listbox" aria-label="Pilih tahun" onKeyDown={onYearKey}>
            {years.map((y) => (
              <button
                key={y}
                type="button"
                role="option"
                aria-selected={y === selYear}
                className={`yr-item${y === selYear ? ' selected' : ''}`}
                autoFocus={y === selYear}
                aria-label={`Tahun ${y}`}
                onClick={() => { setPanelYear(y); setLevel('months'); }}
              >
                {y}
              </button>
            ))}
          </div>
        )}
        {level === 'dates' && (
          <>
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
          </>
        )}
        <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => setOpen(false)}>Batal</button>
      </AnchoredPopover>
    </div>
  );
}

function clockPos(index, total, radiusPct) {
  const a = (index / total) * Math.PI * 2 - Math.PI / 2;
  return { left: `${50 + radiusPct * Math.cos(a)}%`, top: `${50 + radiusPct * Math.sin(a)}%` };
}

export function TimeField({ value, onChange, ariaLabel = 'Pilih waktu', placeholder = 'Pilih waktu', minuteStep = 5 }) {
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef(null);
  const close = React.useCallback(() => setOpen(false), []);
  const faceRef = React.useRef(null);
  const [hour, setHour] = React.useState(19);
  const [minute, setMinute] = React.useState(30);
  const [mode, setMode] = React.useState('hour');
  const [freeOpen, setFreeOpen] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      const m = /^(\d{2}):(\d{2})/.exec(value || '');
      if (m) {
        setHour(Math.min(23, Math.max(0, Number(m[1]))));
        setMinute(Math.min(59, Math.max(0, Number(m[2]))));
      }
      setMode('hour');
      setFreeOpen(false);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const minutes = [];
  for (let mm = 0; mm < 60; mm += minuteStep) minutes.push(mm);

  function confirm(h, m) {
    onChange?.(`${pad(h)}:${pad(m)}`);
    setOpen(false);
  }

  function pickHour(h) {
    setHour(h);
    setMode('minute');
  }

  function nearestFromEvent(e, values, ringSplit) {
    const el = faceRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX ?? cx) - cx;
    const dy = (e.clientY ?? cy) - cy;
    let ang = Math.atan2(dy, dx) + Math.PI / 2;
    if (ang < 0) ang += Math.PI * 2;
    const total = values.length;
    const idx = Math.round((ang / (Math.PI * 2)) * total) % total;
    if (!ringSplit) return values[idx];
    const dist = Math.sqrt(dx * dx + dy * dy);
    const mid = (rect.width / 2) * 0.68;
    return dist < mid ? values[idx] : values[idx] + 12;
  }

  function onFaceClick(e) {
    if (e.target.closest('button')) return;
    if (mode === 'hour') {
      const v = nearestFromEvent(e, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], true);
      if (v !== null && v !== undefined) pickHour(v);
    } else {
      const v = nearestFromEvent(e, minutes, false);
      if (v !== null && v !== undefined) setMinute(v);
    }
  }

  function onFaceKey(e) {
    if (mode === 'hour') {
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); setHour((h) => (h + 1) % 24); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); setHour((h) => (h + 23) % 24); }
      else if (e.key === 'Enter') { e.preventDefault(); setMode('minute'); }
    } else {
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); setMinute((m) => (m + minuteStep) % 60); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); setMinute((m) => (m - minuteStep + 60) % 60); }
      else if (e.key === 'Enter') { e.preventDefault(); confirm(hour, minute); }
    }
  }

  const hourAngle = ((hour % 12) / 12) * 360;
  const minuteAngle = ((minute % 60) / 60) * 360;
  const outerHours = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
  const innerHours = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  return (
    <div className="field-pick">
      <button
        ref={btnRef}
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
      <AnchoredPopover anchorRef={btnRef} open={open} onClose={close} className="field-pop time-pop" label={ariaLabel}>
        <div className="time-head" aria-live="polite">
            <button type="button" className={`time-head-part${mode === 'hour' ? ' active' : ''}`} onClick={() => setMode('hour')} aria-label="Ubah jam" aria-pressed={mode === 'hour'}>{pad(hour)}</button>
            <span aria-hidden="true">:</span>
            <button type="button" className={`time-head-part${mode === 'minute' ? ' active' : ''}`} onClick={() => setMode('minute')} aria-label="Ubah menit" aria-pressed={mode === 'minute'}>{pad(minute)}</button>
          </div>
          <div
            ref={faceRef}
            className="clock-face"
            role="group"
            aria-label={mode === 'hour' ? 'Pilih jam' : 'Pilih menit'}
            tabIndex={0}
            onClick={onFaceClick}
            onKeyDown={onFaceKey}
          >
            <div className="clock-hand" style={{ transform: `rotate(${mode === 'hour' ? hourAngle : minuteAngle}deg)`, height: mode === 'hour' && hour < 12 ? '26%' : '38%' }} aria-hidden="true" />
            <div className="clock-dot" aria-hidden="true" />
            {mode === 'hour' ? (
              <>
                {outerHours.map((h, i) => (
                  <button key={h} type="button" className={`clock-num outer${h === hour ? ' selected' : ''}`} style={clockPos(i, 12, 40)} onClick={() => pickHour(h)} aria-label={`Jam ${pad(h)}`} aria-pressed={h === hour}>{pad(h)}</button>
                ))}
                {innerHours.map((h, i) => (
                  <button key={h} type="button" className={`clock-num inner${h === hour ? ' selected' : ''}`} style={clockPos(i, 12, 24)} onClick={() => pickHour(h)} aria-label={`Jam ${pad(h)}`} aria-pressed={h === hour}>{pad(h)}</button>
                ))}
              </>
            ) : (
              minutes.map((mm, i) => (
                <button key={mm} type="button" className={`clock-num${Math.floor(minute / minuteStep) * minuteStep === mm ? ' selected' : ''}`} style={clockPos(i, minutes.length, 37)} onClick={() => setMinute(mm)} aria-label={`Menit ${pad(mm)}`} aria-pressed={Math.floor(minute / minuteStep) * minuteStep === mm}>{pad(mm)}</button>
              ))
            )}
          </div>
          {mode === 'minute' && (
            !freeOpen ? (
              <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={() => setFreeOpen(true)}>Menit bebas (0–59)</button>
            ) : (
              <div className="time-free">
                <label className="field" style={{ marginBottom: 0, flex: 1 }}><span>Menit bebas (0–59)</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    max="59"
                    inputMode="numeric"
                    value={minute}
                    onChange={(e) => setMinute(Math.min(59, Math.max(0, Number(e.target.value || 0))))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setFreeOpen(false); confirm(hour, minute); } }}
                  />
                </label>
                <button type="button" className="btn btn-primary" onClick={() => { setFreeOpen(false); confirm(hour, minute); }}>OK</button>
              </div>
            )
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setOpen(false)}>Batal</button>
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => confirm(hour, minute)}>Pilih</button>
          </div>
      </AnchoredPopover>
    </div>
  );
}

