import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/store.jsx';
import { supabase } from '../lib/supabaseClient.js';
import { idbGet } from '../lib/idb.js';
import { todayJakarta, toISODate, formatID, dayName, monthLabel, MONTHS } from '../lib/dates.js';
import { MEMBER_CATEGORIES } from '../lib/seed.js';
import { Empty, CustomSelect, StatusBadge, Modal, FilterIcon, DownloadIcon, ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, ChevronDownIcon } from '../components/ui.jsx';
import { exportOccurrenceWorkbook } from '../lib/exportExcel.js';

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const WEEKDAYS_MIN = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const CAT_ORDER = ['PRA REMAJA', 'REMAJA', 'PRA NIKAH', 'DEWASA'];
const CAT_COLORS = ['#4EA8DE', '#8B7CF6', '#2F76A5', '#94A3B8'];
const GENDER_ORDER = ['MALE', 'FEMALE'];
const GENDER_LABEL = { MALE: 'Laki-laki', FEMALE: 'Perempuan' };
const GENDER_COLORS = ['#4EA8DE', '#8B7CF6'];
const DOT_GREEN = '#22C55E';
const DOT_RED = '#EF4444';
const DOT_BLUE = '#3B82F6';
const DOT_PURPLE = '#8B7CF6';
const DOT_GRAY = '#94A3B8';

function niceMax(v) {
  const steps = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50];
  for (const s of steps) if (s >= v) return s;
  return Math.ceil(v / 50) * 50;
}

function occDotColor(it, todayISO) {
  if (it.kind === 'libur') return DOT_GRAY;
  if (it.kind === 'khusus') return DOT_PURPLE;
  if (it.filled) return DOT_GREEN;
  if (it.date < todayISO) return DOT_RED;
  return DOT_BLUE;
}

function Donut({ segments, total, unit = 'anggota', ariaLabel }) {
  const [tip, setTip] = React.useState(null);
  const [active, setActive] = React.useState(null);
  const boxRef = React.useRef(null);
  const R = 62;
  const C = 2 * Math.PI * R;
  const visible = segments.filter((s) => s.value > 0);
  const single = visible.length === 1;
  let acc = 0;
  const summary = segments.map((s) => `${s.label}: ${s.value}`).join('; ');
  function pos(e) {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function clear() { setTip(null); setActive(null); }
  return (
    <div className="donut-box" ref={boxRef}>
      <svg width="188" height="188" viewBox="0 0 160 160" role="img" aria-label={`${ariaLabel}. ${summary}`} onClick={clear}>
        <circle cx="80" cy="80" r={R} fill="none" strokeWidth="26" stroke="var(--bg-surface-tertiary)" />
        {visible.map((s, idx) => {
          const frac = total > 0 ? s.value / total : 0;
          const len = single ? C : Math.max(frac * C - 30, 2);
          const isActive = active === idx;
          const dimmed = active !== null && !isActive;
          const el = (
            <circle
              key={s.label}
              cx="80" cy="80" r={R} fill="none"
              stroke={s.color}
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-acc * C}
              transform="rotate(-90 80 80)"
              strokeLinecap={single ? 'butt' : 'round'}
              tabIndex={0}
              role="img"
              aria-label={`${s.label}, ${s.value} ${unit}, ${s.pct}%`}
              className="donut-seg"
              opacity={dimmed ? 0.75 : 1}
              style={{
                cursor: 'pointer',
                strokeWidth: isActive ? 32 : 26,
                ...(isActive ? { filter: `drop-shadow(0 2px 6px ${s.color}80)` } : null),
              }}
              onMouseEnter={(e) => { setActive(idx); setTip({ ...pos(e), s }); }}
              onMouseMove={(e) => setTip((t) => (t ? { ...t, ...pos(e) } : t))}
              onMouseLeave={clear}
              onFocus={() => { setActive(idx); setTip({ x: 94, y: 20, s }); }}
              onBlur={clear}
              onClick={(e) => { e.stopPropagation(); setActive(idx); setTip({ ...pos(e), s }); }}
            />
          );
          acc += frac;
          return el;
        })}
      </svg>
      {tip && (
        <div className="ctip" style={{ left: Math.min(tip.x + 12, 180), top: Math.max(tip.y - 10, 0) }} role="status">
          <strong>{tip.s.label}</strong>
          <span>{tip.s.value} {unit}</span><br />
          <span className="hint">{tip.s.pct}%</span>
        </div>
      )}
      <div className="donut-legend">
        {segments.map((s) => (
          <span className="lg" key={s.label}>
            <span className="swatch" style={{ background: s.color }} aria-hidden="true" />
            {s.label}
            <strong>{s.value} ({s.pct}%)</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function GroupedBar({ groups, ariaLabel }) {
  const [tip, setTip] = React.useState(null);
  const [active, setActive] = React.useState(null);
  const boxRef = React.useRef(null);
  const max = niceMax(Math.max(1, ...groups.flatMap((g) => [g.hadir, g.izin, g.alpha])));
  const H = 240, PADL = 32, PADR = 10, PADT = 16, PADB = 52;
  const slot = 104;
  const W = PADL + groups.length * slot + PADR;
  const plotH = H - PADT - PADB;
  const y = (v) => PADT + plotH - (v / max) * plotH;
  const ticks = [0, 1, 2, 3, 4].map((i) => Math.round((max * i) / 4)).filter((t, i, a) => i === 0 || t !== a[i - 1]);
  const bw = 20;
  const series = [
    { k: 'hadir', label: 'Hadir', cls: 'sb-hadir', hex: '#22C55E' },
    { k: 'izin', label: 'Izin', cls: 'sb-izin', hex: '#F59E0B' },
    { k: 'alpha', label: 'Alpha', cls: 'sb-alpha', hex: '#EF4444' },
  ];
  function pos(e) {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function clear() { setTip(null); setActive(null); }
  return (
    <div className="donut-box" ref={boxRef}>
      <div className="bar-scroll" style={{ width: '100%' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: W, width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={ariaLabel}>
          <rect x={PADL} y={PADT} width={W - PADL - PADR} height={plotH} fill="transparent" onClick={clear} />
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PADL} x2={W - PADR} y1={y(t)} y2={y(t)} className="gb-grid" />
              <text x={PADL - 6} y={y(t) + 4} textAnchor="end" className="gb-tick">{t}</text>
            </g>
          ))}
          {groups.map((g, gi) => {
            const gx = PADL + gi * slot;
            return (
              <g key={g.label}>
                {series.map((s, si) => {
                  const v = g[s.k] || 0;
                  const h = (v / max) * plotH;
                  const x = gx + 8 + si * (bw + 6);
                  const pct = g.total > 0 ? Math.round((v / g.total) * 1000) / 10 : 0;
                  const key = `${gi}-${si}`;
                  const isActive = active === key;
                  const dimmed = active !== null && !isActive;
                  return (
                    <rect
                      key={s.k}
                      x={x} y={y(0) - Math.max(h, v > 0 ? 2 : 0)} width={bw} height={Math.max(h, v > 0 ? 2 : 0)} rx={3}
                      className={`${s.cls} gb-bar`}
                      tabIndex={0}
                      role="img"
                      aria-label={`${g.label}, ${s.label}, ${v} anggota, ${pct} persen`}
                      opacity={dimmed ? 0.75 : 1}
                      style={{
                        cursor: 'pointer',
                        ...(isActive ? { transform: 'translateY(-3px)', filter: `brightness(1.15) drop-shadow(0 2px 6px ${s.hex}90)`, stroke: s.hex, strokeWidth: 1.5 } : null),
                      }}
                      onMouseEnter={(e) => { setActive(key); setTip({ ...pos(e), g, s, v, pct }); }}
                      onMouseMove={(e) => setTip((t) => (t ? { ...t, ...pos(e) } : t))}
                      onMouseLeave={clear}
                      onFocus={() => { setActive(key); setTip({ x: gx + 20, y: 30, g, s, v, pct }); }}
                      onBlur={clear}
                      onClick={(e) => { e.stopPropagation(); setActive(key); setTip({ ...pos(e), g, s, v, pct }); }}
                    >
                      <title>{`${g.label} ${s.label}: ${v}`}</title>
                    </rect>
                  );
                })}
                {String(g.label).split(' ').slice(0, 2).map((w, wi) => (
                  <text key={wi} x={gx + slot / 2} y={H - 34 + wi * 13} textAnchor="middle" className="gb-x">{w}</text>
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      {tip && (
        <div className="ctip" style={{ left: Math.min(tip.x + 12, 220), top: Math.max(tip.y - 10, 0) }} role="status">
          <strong>{tip.g.label}</strong>
          <span>{tip.s.label}: {tip.v} anggota</span><br />
          <span className="hint">{tip.pct}% dari kategori</span>
        </div>
      )}
      <div className="legend" aria-label="Keterangan">
        <span className="lg"><span className="mark hadir">✓</span> Hadir</span>
        <span className="lg"><span className="mark izin">I</span> Izin</span>
        <span className="lg"><span className="mark alpha">A</span> Alpha</span>
      </div>
    </div>
  );
}

function timeRange(start, end) {
  const s = String(start || '').slice(0, 5);
  const e = String(end || '').slice(0, 5);
  return e && e !== s ? `${s}–${e}` : s;
}

function shiftMonth(ym, delta) {
  const d = new Date(ym.y, ym.m - 1 + delta, 1);
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

function eligibleOn(members, dateISO) {
  return (members || []).filter((m) => m.active && (!m.joined_at || m.joined_at <= dateISO));
}

function PickerCalendar({ ym, setYm, items, todayISO, selDate, selected, onPickDate, onPickItem, loading, error }) {
  const byDate = React.useMemo(() => {
    const map = new Map();
    items.forEach((it) => {
      if (!map.has(it.date)) map.set(it.date, []);
      map.get(it.date).push(it);
    });
    return map;
  }, [items]);
  const firstDow = new Date(ym.y, ym.m - 1, 1).getDay();
  const lead = (firstDow + 6) % 7;
  const days = new Date(ym.y, ym.m, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const dateOccs = selDate ? (byDate.get(selDate) || []) : [];

  function dayClass(dateISO, occs) {
    let cls = 'cal-day has-occ';
    if (occs.some((o) => o.kind === 'libur') && !occs.some((o) => o.kind !== 'libur')) cls += ' st-libur';
    else if (occs.some((o) => o.filled)) cls += ' st-filled';
    else if (dateISO < todayISO) cls += ' st-missed';
    else cls += ' st-future';
    if (occs.some((o) => o.kind === 'khusus')) cls += ' has-khusus';
    if (selDate === dateISO) cls += ' selected';
    return cls;
  }

  return (
    <>
      <div className="cal-legend" aria-label="Keterangan status">
        <span className="lg"><span className="cdot" style={{ background: DOT_GREEN }} /> Sudah diisi</span>
        <span className="lg"><span className="cdot" style={{ background: DOT_RED }} /> Terlewat</span>
        <span className="lg"><span className="cdot" style={{ background: DOT_BLUE }} /> Terjadwal</span>
        <span className="lg"><span className="cdot" style={{ background: DOT_PURPLE }} /> Pengajian khusus</span>
        <span className="lg"><span className="cdot" style={{ background: DOT_GRAY }} /> Libur</span>
      </div>
      <div className="month-nav detail-month">
        <button type="button" className="icon-btn" aria-label="Bulan sebelumnya" onClick={() => setYm((v) => shiftMonth(v, -1))}><ChevronLeftIcon /></button>
        <strong>{MONTHS[ym.m - 1]} {ym.y}</strong>
        <button type="button" className="icon-btn" aria-label="Bulan berikutnya" onClick={() => setYm((v) => shiftMonth(v, 1))}><ChevronRightIcon /></button>
      </div>
      {loading && <p className="hint">Memuat daftar pengajian...</p>}
      {error && <div className="banner danger"><span>{error}</span></div>}
      {!loading && !error && items.length === 0 && (
        <Empty title="Tidak ada pengajian" desc={`Tidak ada jadwal rutin, khusus, atau libur pada ${monthLabel(ym.y, ym.m)}.`} />
      )}
      {!loading && (
        <div className="cal-grid" role="grid" aria-label={`Kalender ${monthLabel(ym.y, ym.m)}`}>
          {WEEKDAYS_MIN.map((w) => <span className="cal-dow" key={w}>{w}</span>)}
          {cells.map((d, i) => {
            if (d === null) return <span key={`b${i}`} />;
            const iso = `${ym.y}-${String(ym.m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const occs = byDate.get(iso) || [];
            if (!occs.length) return <span key={iso} className="cal-day" aria-hidden="true"><span className="dnum">{d}</span></span>;
            const dots = occs.slice(0, 4);
            return (
              <button
                key={iso}
                type="button"
                className={dayClass(iso, occs)}
                onClick={() => onPickDate(iso, occs)}
                aria-label={`${formatID(iso)}, ${occs.length} pengajian`}
                aria-pressed={selDate === iso}
              >
                <span className="dnum">{d}</span>
                <span className="cal-dots" aria-hidden="true">
                  {dots.map((o) => <span key={o.kind + o.id} className="cdot" style={{ background: occDotColor(o, todayISO) }} />)}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {selDate && dateOccs.length > 0 && (
        <div className="date-occ-list">
          <p className="date-occ-head">{formatID(selDate)}</p>
          {dateOccs.map((it) => {
            const isSel = selected && (it.kind === 'khusus' ? 'khusus' : 'rutin') === selected.type && String(it.id) === String(selected.id);
            const st = it.kind === 'libur'
              ? { kind: 'libur', label: `Libur${it.holidayReason ? `: ${it.holidayReason}` : ''}` }
              : it.filled
                ? { kind: 'hadir', label: 'Sudah diisi' }
                : it.date < todayISO
                  ? { kind: 'alpha', label: 'Belum diisi' }
                  : { kind: 'info', label: 'Belum terjadi' };
            return (
              <button key={it.kind + it.id} type="button" className={`date-occ${isSel ? ' selected' : ''}`} onClick={() => onPickItem(it)} aria-pressed={!!isSel}>
                <span>
                  <strong>{it.sub}</strong><br />
                  <span className="hint">{it.kind === 'khusus' ? `${it.label} • Pengajian Khusus` : it.kind === 'libur' ? 'Pengajian Rutin • Libur' : 'Pengajian Rutin'}</span>
                </span>
                <StatusBadge kind={st.kind}>{st.label}</StatusBadge>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function LaporanDetail() {
  const { account, isGuest, toast, supabaseReady, online, loadSnapshot } = useApp();
  const navigate = useNavigate();
  const params = useParams();
  const [search] = useSearchParams();
  const now = todayJakarta();
  const todayISO = toISODate(now);

  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const [pickerOpen, setPickerOpen] = useState(true);
  const [selDate, setSelDate] = useState(null);
  const [items, setItems] = useState([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState('');

  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [offlineCache, setOfflineCache] = useState(false);

  const [tab, setTab] = useState('info');
  const [q, setQ] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [draft, setDraft] = useState(null);
  const [fStatus, setFStatus] = useState('all');
  const [fGender, setFGender] = useState('all');
  const [fCat, setFCat] = useState('all');
  const [fIzin, setFIzin] = useState('all');
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportSel, setExportSel] = useState({ ringkas: true, detail: true, izin: true, alpha: true, materi: true });

  const urlType = params.type || null;
  const urlId = params.id || search.get('occurrence') || null;

  async function loadPicker(month) {
    if (!account) return;
    setPickerLoading(true);
    setPickerError('');
    try {
      const first = `${month.y}-${String(month.m).padStart(2, '0')}-01`;
      const last = `${month.y}-${String(month.m).padStart(2, '0')}-31`;
      let occRows = [];
      let specials = [];
      let holidays = {};
      let filledOcc = new Set();
      let filledSpec = new Set();
      if (isGuest || !supabaseReady) {
        const local = await idbGet('guest-data', null);
        occRows = (local?.occurrences || []).filter((o) => o.occurrence_date >= first && o.occurrence_date <= last);
        const att = local?.attendance || {};
        Object.keys(att).forEach((k) => { if ((att[k] || []).length) filledOcc.add(k); });
        specials = [];
        holidays = local?.holidays || {};
      } else if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const snap = await loadSnapshot(account.id).catch(() => null);
        occRows = (snap?.occurrences || []).filter((o) => o.occurrence_date >= first && o.occurrence_date <= last);
        Object.keys(snap?.attendance || {}).forEach((k) => { if ((snap.attendance[k] || []).length) filledOcc.add(k); });
        specials = (snap?.specials || []).filter((e) => e.event_date >= first && e.event_date <= last);
        Object.keys(snap?.specialAtt || {}).forEach((k) => { if ((snap.specialAtt[k] || []).length) filledSpec.add(k); });
        holidays = snap?.holidays || {};
      } else {
        const occDb = await supabase.from('schedule_occurrences').select('id,occurrence_date,occurrence_time,occurrence_end_time,day_name,is_holiday,recurring_schedule_id').eq('account_id', account.id).gte('occurrence_date', first).lte('occurrence_date', last).order('occurrence_date');
        occRows = occDb.data || [];
        const ids = occRows.map((o) => o.id);
        const [attDb, holDb, specDb] = await Promise.all([
          ids.length ? supabase.from('attendance').select('occurrence_id').in('occurrence_id', ids) : Promise.resolve({ data: [] }),
          supabase.from('holidays').select('occurrence_id,reason,holiday_date').eq('account_id', account.id).gte('holiday_date', first).lte('holiday_date', last),
          supabase.from('special_events').select('id,event_type_snapshot,event_date,day_name,event_time,end_time,linked_holiday_occurrence_id').eq('account_id', account.id).gte('event_date', first).lte('event_date', last).order('event_date'),
        ]);
        (attDb.data || []).forEach((a) => filledOcc.add(a.occurrence_id));
        holidays = Object.fromEntries((holDb.data || []).map((h) => [h.occurrence_id, h]));
        specials = specDb.data || [];
        const evIds = specials.map((e) => e.id);
        if (evIds.length) {
          const saDb = await supabase.from('special_attendance').select('special_event_id').in('special_event_id', evIds);
          (saDb.data || []).forEach((a) => filledSpec.add(a.special_event_id));
        }
      }
      const list = [];
      occRows.forEach((o) => {
        const isHol = Boolean(holidays[o.id]);
        list.push({
          kind: isHol ? 'libur' : 'rutin',
          id: o.id,
          date: o.occurrence_date,
          start: String(o.occurrence_time || '').slice(0, 5),
          end: o.occurrence_end_time ? String(o.occurrence_end_time).slice(0, 5) : null,
          label: o.day_name || dayName(o.occurrence_date),
          sub: timeRange(o.occurrence_time, o.occurrence_end_time),
          filled: filledOcc.has(o.id),
          holidayReason: holidays[o.id]?.reason || '',
        });
      });
      specials.forEach((e) => {
        list.push({
          kind: 'khusus',
          id: e.id,
          date: e.event_date,
          start: String(e.event_time || '').slice(0, 5),
          end: e.end_time ? String(e.end_time).slice(0, 5) : null,
          label: e.event_type_snapshot || 'Pengajian Khusus',
          sub: timeRange(e.event_time, e.end_time),
          filled: filledSpec.has(e.id),
          linked: e.linked_holiday_occurrence_id || null,
        });
      });
      list.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.start).localeCompare(String(b.start)));
      setItems(list);
    } catch {
      setPickerError('Gagal memuat daftar pengajian. Periksa koneksi lalu coba lagi.');
    }
    setPickerLoading(false);
  }

  useEffect(() => {
    loadPicker(ym);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id, ym.y, ym.m]);

  useEffect(() => {
    if (!items.length) return;
    if (urlType && urlId) {
      const found = items.find((it) => it.kind === urlType && String(it.id) === String(urlId));
      if (found) {
        setSelected({ type: urlType, id: found.id });
        return;
      }
    }
    if (!selected) {
      const past = items.filter((it) => it.date <= todayISO);
      const pick = [...past].reverse().find((it) => it.filled)
        || [...past].reverse()[0]
        || items.find((it) => it.date >= todayISO)
        || items[0];
      if (pick) setSelected({ type: pick.kind === 'khusus' ? 'khusus' : 'rutin', id: pick.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, urlType, urlId]);

  useEffect(() => {
    if (urlType && urlId && (!selected || String(selected.id) !== String(urlId))) {
      setSelected({ type: urlType, id: urlId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlType, urlId]);

  function pickItem(it) {
    const type = it.kind === 'khusus' ? 'khusus' : 'rutin';
    setSelDate(it.date);
    setSelected({ type, id: it.id });
    navigate(`/laporan/detail/${type}/${it.id}`, { replace: false });
  }

  function pickDate(dateISO, occs) {
    setSelDate(dateISO);
    if (occs.length === 1) pickItem(occs[0]);
  }

  useEffect(() => {
    if (!selected || !account) return;
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      setDetailError('');
      setOfflineCache(false);
      try {
        if (isGuest || !supabaseReady) {
          const local = await idbGet('guest-data', null);
          if (selected.type === 'khusus') {
            if (!cancelled) { setDetail(null); setDetailError('offline'); }
          } else {
            const occ = (local?.occurrences || []).find((o) => String(o.id) === String(selected.id));
            const rows = (local?.attendance?.[selected.id] || []);
            if (!cancelled) {
              setDetail({
                type: 'rutin',
                occ: occ || null,
                rows,
                mats: [],
                holiday: (local?.holidays || {})[selected.id] || null,
                members: (local?.members || []).filter((m) => m.active),
                absence: (local?.absenceTypes || []).map((t) => t.name),
                replacedBy: null,
              });
            }
          }
          return;
        }
        const membersRes = await supabase.from('members').select('*').eq('account_id', account.id).order('nickname');
        const members = membersRes.data || [];
        const absenceRes = await supabase.from('absence_types').select('*').eq('account_id', account.id);
        const absence = (absenceRes.data || []).map((t) => t.name);
        if (selected.type === 'khusus') {
          const { data: ev } = await supabase.from('special_events').select('*').eq('id', selected.id).maybeSingle();
          if (!ev) {
            const snap = await loadSnapshot(account.id).catch(() => null);
            const found = (snap?.specials || []).find((e) => String(e.id) === String(selected.id));
            if (found) {
              if (!cancelled) {
                setOfflineCache(true);
                setDetail({
                  type: 'khusus', occ: found, rows: snap?.specialAtt?.[found.id] || [],
                  mats: [], holiday: null, members, absence, replaced: null,
                });
              }
              return;
            }
            if (!cancelled) { setDetail(null); setDetailError('missing'); }
            return;
          }
          const attDb = await supabase.from('special_attendance').select('*').eq('special_event_id', ev.id);
          let replaced = null;
          if (ev.linked_holiday_occurrence_id) {
            const occDb = await supabase.from('schedule_occurrences').select('occurrence_date,day_name').eq('id', ev.linked_holiday_occurrence_id).maybeSingle();
            if (occDb.data) replaced = occDb.data;
          }
          if (!cancelled) setDetail({ type: 'khusus', occ: ev, rows: attDb.data || [], mats: [], holiday: null, members, absence, replaced });
        } else {
          const { data: occ } = await supabase.from('schedule_occurrences').select('*').eq('id', selected.id).maybeSingle();
          if (!occ) {
            if (!cancelled) { setDetail(null); setDetailError('missing'); }
            return;
          }
          const [attDb, matDb, holDb] = await Promise.all([
            supabase.from('attendance').select('*').eq('occurrence_id', occ.id),
            supabase.from('materials').select('*').eq('occurrence_id', occ.id),
            supabase.from('holidays').select('*').eq('occurrence_id', occ.id).maybeSingle(),
          ]);
          let replacedBy = null;
          if (holDb.data) {
            const spDb = await supabase.from('special_events').select('id,event_type_snapshot,event_date').eq('linked_holiday_occurrence_id', occ.id).maybeSingle();
            if (spDb.data) replacedBy = spDb.data;
          }
          if (!cancelled) {
            setDetail({
              type: 'rutin', occ, rows: attDb.data || [], mats: matDb.data || [],
              holiday: holDb.data || null, members, absence, replacedBy,
            });
          }
        }
      } catch {
        try {
          const snap = await loadSnapshot(account.id).catch(() => null);
          if (!cancelled && snap) {
            setOfflineCache(true);
            if (selected.type === 'khusus') {
              const found = (snap.specials || []).find((e) => String(e.id) === String(selected.id));
              if (found) {
                setDetail({ type: 'khusus', occ: found, rows: snap.specialAtt?.[found.id] || [], mats: [], holiday: null, members: snap.members || [], absence: [], replaced: null });
                return;
              }
            } else {
              const found = (snap.occurrences || []).find((o) => String(o.id) === String(selected.id));
              if (found || (snap.attendance || {})[selected.id]) {
                setDetail({
                  type: 'rutin', occ: found || null, rows: (snap.attendance || {})[selected.id] || [],
                  mats: [], holiday: (snap.holidays || {})[selected.id] || null,
                  members: snap.members || [], absence: [], replacedBy: null,
                });
                return;
              }
            }
          }
        } catch { /* abaikan */ }
        if (!cancelled) { setDetail(null); setDetailError('offline'); }
      }
      if (!cancelled) setDetailLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.type, selected?.id, account?.id]);

  const stats = useMemo(() => {
    if (!detail) return null;
    const dateISO = detail.type === 'khusus' ? detail.occ?.event_date : detail.occ?.occurrence_date;
    const filled = (detail.rows || []).length > 0;
    const list = eligibleOn(detail.members, dateISO);
    const byId = new Map((detail.rows || []).map((r) => [r.member_id, r]));
    let hadir = 0, izin = 0, alpha = 0;
    const izinBy = {};
    const table = list.map((m) => {
      const rec = byId.get(m.id);
      if (!filled) return { m, st: 'NONE', izinName: '-' };
      let st = 'ALPHA';
      let izinName = '-';
      if (rec?.status === 'PRESENT') { st = 'HADIR'; hadir++; }
      else if (rec?.status === 'PERMITTED') { st = 'IZIN'; izin++; izinName = rec.absence_name_snapshot || '-'; izinBy[izinName] = (izinBy[izinName] || 0) + 1; }
      else { alpha++; }
      return { m, st, izinName };
    });
    const orphans = (detail.rows || [])
      .filter((r) => !list.some((m) => m.id === r.member_id))
      .map((r) => ({ m: { id: r.member_id, full_name: r.member_name_snapshot || '-', nickname: r.member_name_snapshot || '-', gender: '-', member_category: '-' }, st: r.status === 'PRESENT' ? 'HADIR' : r.status === 'PERMITTED' ? 'IZIN' : 'ALPHA', izinName: r.absence_name_snapshot || '-', orphan: true }));
    const total = list.length;
    const pct = (v) => (total > 0 ? Math.round((v / total) * 1000) / 10 : 0);
    const catStats = CAT_ORDER.map((c, ci) => {
      const rows = table.filter((t) => (t.m.member_category || '') === c);
      const h = rows.filter((t) => t.st === 'HADIR').length;
      const iz = rows.filter((t) => t.st === 'IZIN').length;
      const al = filled ? rows.filter((t) => t.st === 'ALPHA').length : 0;
      const n = rows.length;
      const p = (v) => (n > 0 ? Math.round((v / n) * 1000) / 10 : 0);
      return { label: c, value: n, pct: pct(n), color: CAT_COLORS[ci % CAT_COLORS.length], hadir: h, izin: iz, alpha: al, total: n, pctHadir: p(h), pctIzin: p(iz), pctAlpha: p(al) };
    });
    const genderStats = GENDER_ORDER.map((g, gi) => {
      const rows = table.filter((t) => t.m.gender === g);
      const h = rows.filter((t) => t.st === 'HADIR').length;
      const iz = rows.filter((t) => t.st === 'IZIN').length;
      const al = filled ? rows.filter((t) => t.st === 'ALPHA').length : 0;
      const n = rows.length;
      const p = (v) => (n > 0 ? Math.round((v / n) * 1000) / 10 : 0);
      return { label: GENDER_LABEL[g], value: n, pct: pct(n), color: GENDER_COLORS[gi % GENDER_COLORS.length], hadir: h, izin: iz, alpha: al, total: n, pctHadir: p(h), pctIzin: p(iz), pctAlpha: p(al) };
    });
    return { total, hadir, izin, alpha, pctHadir: pct(hadir), pctIzin: pct(izin), pctAlpha: pct(alpha), izinBy, table, orphans, catStats, genderStats, dateISO, filled };
  }, [detail]);

  const filteredTable = useMemo(() => {
    if (!stats) return [];
    const needle = q.trim().toLowerCase();
    return stats.table.filter((t) => {
      if (needle && !(`${t.m.full_name || ''} ${t.m.nickname || ''}`.toLowerCase().includes(needle))) return false;
      if (fStatus !== 'all') {
        const want = fStatus === 'hadir' ? 'HADIR' : fStatus === 'izin' ? 'IZIN' : 'ALPHA';
        if (t.st !== want) return false;
      }
      if (fGender !== 'all' && t.m.gender !== fGender) return false;
      if (fCat !== 'all' && (t.m.member_category || '') !== fCat) return false;
      if (fIzin !== 'all' && (t.izinName || '-') !== fIzin) return false;
      return true;
    });
  }, [stats, q, fStatus, fGender, fCat, fIzin]);

  const selectedItem = items.find((it) => selected && (it.kind === 'khusus' ? 'khusus' : 'rutin') === selected.type && String(it.id) === String(selected.id)) || null;

  function openFilterModal() {
    setDraft({ fStatus, fGender, fCat, fIzin });
    setShowFilter(true);
  }

  async function onExport() {
    if (!detail || !stats) return;
    setExporting(true);
    try {
      const isKhusus = detail.type === 'khusus';
      const title = isKhusus
        ? `${detail.occ?.event_type_snapshot || 'Khusus'}-${detail.occ?.event_date || ''}`
        : `Rutin-${detail.occ?.occurrence_date || ''}`;
      const info = isKhusus
        ? [
            ['Jenis', 'Pengajian Khusus'],
            ['Kegiatan', detail.occ?.event_type_snapshot || '-'],
            ['Tanggal', detail.occ?.event_date ? formatID(detail.occ.event_date) : '-'],
            ['Jam', timeRange(detail.occ?.event_time, detail.occ?.end_time)],
            ['Menggantikan', detail.replaced ? formatID(detail.replaced.occurrence_date) : 'Tidak menggantikan jadwal rutin'],
          ]
        : [
            ['Jenis', 'Pengajian Rutin'],
            ['Tanggal', detail.occ?.occurrence_date ? formatID(detail.occ.occurrence_date) : '-'],
            ['Jam mulai', String(detail.occ?.occurrence_time || '').slice(0, 5)],
            ['Jam selesai', String(detail.occ?.occurrence_end_time || '').slice(0, 5)],
            ['Status', detail.holiday ? `Libur (${detail.holiday.reason || ''})` : (detail.rows?.length ? 'Sudah diisi' : 'Belum diisi')],
          ];
      const want = (k) => exportSel[k];
      await exportOccurrenceWorkbook({
        title: `Detail-${title}`.replace(/\s+/g, '-'),
        info,
        summary: want('ringkas') ? [stats.total, stats.hadir, `${stats.pctHadir}%`, stats.izin, `${stats.pctIzin}%`, stats.alpha, `${stats.pctAlpha}%`] : null,
        detail: want('detail') ? stats.table.map((t) => [t.m.full_name, t.m.nickname, t.m.gender === 'MALE' ? 'Laki-laki' : t.m.gender === 'FEMALE' ? 'Perempuan' : '-', t.m.member_category || '-', t.st, t.izinName]) : null,
        izinRows: want('izin') ? stats.table.filter((t) => t.st === 'IZIN').map((t) => [t.m.nickname || t.m.full_name, t.izinName]) : null,
        materiRows: want('materi') && !isKhusus ? (detail.mats || []).map((mt) => {
          if (mt.kind === 'QURAN') return ['Al-Quran', `Surat ${mt.quran_surah_number || ''} ${mt.quran_surah_name_snapshot || ''} ayat ${mt.ayat_range || ''}`.trim(), mt.speaker_name_snapshot || '-'];
          if (mt.kind === 'HADITH') return ['Hadist', `${mt.hadith_name_snapshot || ''} hal ${mt.hadith_page || ''}`.trim(), mt.speaker_name_snapshot || '-'];
          if (mt.kind === 'FREE') return ['Kegiatan', mt.free_activity_name_snapshot || '-', mt.speaker_name_snapshot || '-'];
          return ['Nasehat', '-', mt.speaker_name_snapshot || '-'];
        }) : null,
      });
      toast('File export pengajian dibuat.');
      setShowExport(false);
    } catch {
      toast('Gagal membuat file export.');
    }
    setExporting(false);
  }

  if (!account) return <div className="card"><Empty title="Perlu masuk" desc="Masuk untuk melihat detail absensi." /></div>;

  const izinOpts = detail?.absence?.length ? detail.absence : Object.keys(stats?.izinBy || {});

  return (
    <div className="detail-stack">
      <div className="card">
        <div className="report-head">
          <div>
            <h2 className="card-title">Detail Absensi</h2>
            <p className="card-desc" style={{ marginBottom: 0 }}>Pilih pengajian untuk melihat rincian kehadiran.</p>
          </div>
          <div className="report-head-actions">
            <button type="button" className="btn" onClick={() => navigate('/laporan')}><ArrowLeftIcon /> Laporan</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="picker-head">
          <div>
            <h3 className="card-title" style={{ fontSize: 15 }}>Pilih Pengajian</h3>
            {!pickerOpen && selectedItem && (
              <p className="card-desc" style={{ marginBottom: 0 }}>{formatID(selectedItem.date)} • {selectedItem.kind === 'khusus' ? 'Pengajian Khusus' : selectedItem.kind === 'libur' ? 'Libur' : 'Pengajian Rutin'} • {selectedItem.sub}</p>
            )}
            {!pickerOpen && !selectedItem && detail?.occ && (
              <p className="card-desc" style={{ marginBottom: 0 }}>{formatID(stats?.dateISO || '')}</p>
            )}
          </div>
          <button type="button" className="btn" onClick={() => setPickerOpen((v) => !v)} aria-expanded={pickerOpen}>
            {pickerOpen ? <ChevronUpIcon /> : <ChevronDownIcon />} {pickerOpen ? 'Sembunyikan' : 'Ganti Pengajian'}
          </button>
        </div>
        {pickerOpen && (
          <PickerCalendar
            ym={ym}
            setYm={setYm}
            items={items}
            todayISO={todayISO}
            selDate={selDate || selectedItem?.date || stats?.dateISO || null}
            selected={selected}
            onPickDate={pickDate}
            onPickItem={pickItem}
            loading={pickerLoading}
            error={pickerError}
          />
        )}
      </div>

      {selectedItem && (
        <div className="card sel-summary">
          <div>
            <strong>{formatID(selectedItem.date)} • {selectedItem.kind === 'khusus' ? 'Pengajian Khusus' : selectedItem.kind === 'libur' ? 'Libur' : 'Pengajian Rutin'}</strong>
            <p className="card-desc" style={{ marginBottom: 0 }}>{selectedItem.kind === 'khusus' ? selectedItem.label : selectedItem.sub}</p>
          </div>
        </div>
      )}

      {detailLoading && <div className="card"><p className="hint">Memuat detail pengajian...</p></div>}
      {detailError === 'offline' && (
        <div className="card"><Empty title="Belum tersedia offline" desc="Detail pengajian ini belum tersedia secara offline. Hubungkan internet untuk memuatnya sekali." /></div>
      )}
      {detailError === 'missing' && (
        <div className="card"><Empty title="Data tidak ditemukan" desc="Pengajian yang diminta tidak tersedia." /></div>
      )}

      {detail && stats && (
        <>
          {offlineCache && <div className="banner warn"><span>Menampilkan data tersimpan di perangkat (offline).</span></div>}
          <div className="tabs" role="tablist" aria-label="Detail pengajian">
            {[{ k: 'info', l: 'Detail Pengajian' }, { k: 'stat', l: 'Statistik Kehadiran' }, { k: 'detail', l: 'Detail Kehadiran' }].map((t) => (
              <button
                key={t.k}
                type="button"
                role="tab"
                aria-selected={tab === t.k}
                className={`tab${tab === t.k ? ' active' : ''}`}
                onClick={() => setTab(t.k)}
              >{t.l}</button>
            ))}
          </div>

          {tab === 'info' && (
            <div className="card">
              <h3 className="card-title" style={{ fontSize: 15 }}>Detail Pengajian</h3>
              <div className="kv-grid">
                <div><span>Jenis</span><strong>{detail.type === 'khusus' ? 'Pengajian Khusus' : 'Pengajian Rutin'}</strong></div>
                <div><span>Hari / Tanggal</span><strong>{formatID(stats.dateISO)}</strong></div>
                <div><span>Jam</span><strong>{detail.type === 'khusus' ? timeRange(detail.occ?.event_time, detail.occ?.end_time) : timeRange(detail.occ?.occurrence_time, detail.occ?.occurrence_end_time)}</strong></div>
                <div><span>Status</span><strong>{detail.holiday ? `Libur (${detail.holiday.reason || 'Libur'})` : detail.rows?.length ? 'Sudah diisi' : 'Belum diisi'}</strong></div>
                <div><span>Jumlah Anggota</span><strong>{stats.total} anggota</strong></div>
                {detail.type === 'khusus' && (
                  <>
                    <div><span>Jenis Pengajian Khusus</span><strong>{detail.occ?.event_type_snapshot || '-'}</strong></div>
                    <div><span>Menggantikan Jadwal Rutin</span><strong>{detail.replaced ? formatID(detail.replaced.occurrence_date) : 'Pengajian ini tidak menggantikan jadwal rutin.'}</strong></div>
                  </>
                )}
                {detail.type === 'rutin' && detail.replacedBy && (
                  <div><span>Digantikan Oleh</span><strong>{detail.replacedBy.event_type_snapshot || 'Pengajian Khusus'} • {formatID(detail.replacedBy.event_date)}</strong></div>
                )}
              </div>
              <h3 className="card-title" style={{ fontSize: 15, marginTop: 16 }}>Materi Pengajian</h3>
              {detail.type === 'khusus' || !(detail.mats || []).length ? (
                <p className="hint" style={{ marginBottom: 0 }}>Belum ada data materi.</p>
              ) : (
                <div className="kv-grid">
                  {(detail.mats || []).map((mt) => (
                    <div key={mt.id}>
                      <span>{mt.kind === 'QURAN' ? "Al-Qur'an" : mt.kind === 'HADITH' ? 'Hadist' : mt.kind === 'FREE' ? 'Kegiatan Bebas' : 'Nasehat'}</span>
                      <strong>
                        {mt.kind === 'QURAN' && `Surat ${mt.quran_surah_number || ''} ${mt.quran_surah_name_snapshot || ''} ayat ${mt.ayat_range || ''}`}
                        {mt.kind === 'HADITH' && `${mt.hadith_name_snapshot || ''} hal ${mt.hadith_page || ''}`}
                        {mt.kind === 'FREE' && (mt.free_activity_name_snapshot || '-')}
                        {mt.kind === 'NASEHAT' && 'Nasehat'}
                      </strong>
                      <span className="hint">Pemateri: {mt.speaker_name_snapshot || '-'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'stat' && (
            <div className="card">
              <h3 className="card-title" style={{ fontSize: 15 }}>Statistik Kehadiran</h3>
              <p className="card-desc">Hanya untuk pengajian yang dipilih.</p>
              <div className="avg-grid avg-grid-4">
                <div className="avg-card blue"><span className="avg-label">Total Anggota</span><span className="avg-num">{stats.total}</span></div>
                {stats.filled ? (
                  <>
                    <div className="avg-card green"><span className="avg-label">Kehadiran</span><span className="avg-num">{stats.hadir}</span><span className="avg-sub">{stats.pctHadir}%</span></div>
                    <div className="avg-card amber"><span className="avg-label">Izin</span><span className="avg-num">{stats.izin}</span><span className="avg-sub">{stats.pctIzin}%</span></div>
                    <div className="avg-card red"><span className="avg-label">Alpha</span><span className="avg-num">{stats.alpha}</span><span className="avg-sub">{stats.pctAlpha}%</span></div>
                  </>
                ) : null}
              </div>
              {!stats.filled ? (
                <Empty title={stats.dateISO >= todayISO ? 'Belum terjadi' : 'Belum diisi'} desc="Data kehadiran belum tersedia untuk pengajian ini." />
              ) : (
                <>
                  <div className="grid-2" style={{ marginTop: 16 }}>
                    <div className="card">
                      <h3 className="card-title" style={{ fontSize: 15 }}>Populasi Anggota Berdasarkan Usia</h3>
                      <p className="card-desc">Total: {stats.total} Anggota</p>
                      <Donut segments={stats.catStats} total={stats.total} ariaLabel="Populasi anggota berdasarkan usia" />
                    </div>
                    <div className="card">
                      <h3 className="card-title" style={{ fontSize: 15 }}>Kehadiran Berdasarkan Usia</h3>
                      <p className="card-desc">Rincian hadir, izin, dan alpha berdasarkan kategori usia.</p>
                      <GroupedBar groups={stats.catStats} ariaLabel="Kehadiran berdasarkan kategori usia" />
                    </div>
                    <div className="card">
                      <h3 className="card-title" style={{ fontSize: 15 }}>Populasi Anggota Berdasarkan Gender</h3>
                      <p className="card-desc">Total: {stats.total} Anggota</p>
                      <Donut segments={stats.genderStats} total={stats.total} ariaLabel="Populasi anggota berdasarkan gender" />
                    </div>
                    <div className="card">
                      <h3 className="card-title" style={{ fontSize: 15 }}>Kehadiran Berdasarkan Gender</h3>
                      <p className="card-desc">Rincian hadir, izin, dan alpha berdasarkan gender.</p>
                      <GroupedBar groups={stats.genderStats} ariaLabel="Kehadiran berdasarkan gender" />
                    </div>
                  </div>
                  <h3 className="card-title" style={{ fontSize: 15, marginTop: 16 }}>Rincian Izin</h3>
                  {Object.keys(stats.izinBy).length ? (
                    <div className="table-wrap">
                      <table className="att">
                        <thead><tr><th>Jenis Izin</th><th>Jumlah</th></tr></thead>
                        <tbody>
                          {Object.entries(stats.izinBy).map(([k, v]) => <tr key={k}><td>{k}</td><td className="cell-izin">{v}</td></tr>)}
                        </tbody>
                      </table>
                    </div>
                  ) : <p className="hint" style={{ marginBottom: 0 }}>Tidak ada izin pada pengajian ini.</p>}
                </>
              )}
            </div>
          )}

          {tab === 'detail' && (
            <div className="card">
              <div className="table-card-head">
                <div>
                  <h3 className="card-title" style={{ fontSize: 15, marginBottom: 2 }}>Detail Kehadiran</h3>
                  <p className="card-desc" style={{ marginBottom: 0 }}>{filteredTable.length} dari {stats.table.length} anggota</p>
                </div>
                <div className="report-head-actions">
                  <button type="button" className="btn" onClick={openFilterModal} aria-haspopup="dialog"><FilterIcon /> Filter{(fStatus !== 'all' || fGender !== 'all' || fCat !== 'all' || fIzin !== 'all' || q.trim() ? '*' : '')}</button>
                  <button type="button" className="btn btn-primary" onClick={() => setShowExport(true)} aria-haspopup="dialog"><DownloadIcon /> Export Laporan</button>
                </div>
              </div>
              <input className="input search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari anggota..." aria-label="Cari anggota" />
              <div className="table-wrap">
                <table className="att">
                  <thead><tr><th>Nama</th><th>Gender</th><th>Kategori</th><th>Status</th><th>Izin</th></tr></thead>
                  <tbody>
                    {filteredTable.map((t) => (
                      <tr key={t.m.id}>
                        <td><strong>{t.m.nickname || t.m.full_name}</strong><br /><span className="hint">{t.m.full_name}</span></td>
                        <td>{t.m.gender === 'MALE' ? 'Laki-laki' : t.m.gender === 'FEMALE' ? 'Perempuan' : '-'}</td>
                        <td>{t.m.member_category || '-'}</td>
                        <td><StatusBadge kind={t.st === 'HADIR' ? 'hadir' : t.st === 'IZIN' ? 'izin' : t.st === 'NONE' ? 'info' : 'alpha'}>{t.st === 'NONE' ? 'Belum diisi' : t.st}</StatusBadge></td>
                        <td>{t.izinName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {stats.orphans.length > 0 && (
                <>
                  <h3 className="card-title" style={{ fontSize: 14, marginTop: 16 }}>Riwayat Non-Aktif</h3>
                  <p className="card-desc">Absensi tersimpan untuk anggota yang kini tidak eligible. Tidak ikut denominator.</p>
                  <div className="table-wrap">
                    <table className="att">
                      <thead><tr><th>Nama</th><th>Status</th><th>Izin</th></tr></thead>
                      <tbody>
                        {stats.orphans.map((t) => (
                          <tr key={t.m.id}><td>{t.m.nickname}</td><td><StatusBadge kind={t.st === 'HADIR' ? 'hadir' : t.st === 'IZIN' ? 'izin' : 'alpha'}>{t.st}</StatusBadge></td><td>{t.izinName}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {showFilter && (
        <Modal
          title="Filter Detail"
          onClose={() => setShowFilter(false)}
          foot={<><button className="btn" onClick={() => { setFStatus('all'); setFGender('all'); setFCat('all'); setFIzin('all'); setQ(''); }}>Reset</button><button className="btn btn-primary" onClick={() => { if (draft) { setFStatus(draft.fStatus); setFGender(draft.fGender); setFCat(draft.fCat); setFIzin(draft.fIzin); } setShowFilter(false); }}>Terapkan</button></>}
        >
          <label className="field"><span>Status</span>
            <CustomSelect value={draft?.fStatus || 'all'} ariaLabel="Filter status" placeholder="Semua"
              options={[{ value: 'all', label: 'Semua' }, { value: 'hadir', label: 'Hadir' }, { value: 'izin', label: 'Izin' }, { value: 'alpha', label: 'Alpha' }]}
              onChange={(v) => setDraft((d) => ({ ...d, fStatus: v }))} />
          </label>
          <label className="field"><span>Gender</span>
            <CustomSelect value={draft?.fGender || 'all'} ariaLabel="Filter gender" placeholder="Semua"
              options={[{ value: 'all', label: 'Semua' }, { value: 'MALE', label: 'Laki-laki' }, { value: 'FEMALE', label: 'Perempuan' }]}
              onChange={(v) => setDraft((d) => ({ ...d, fGender: v }))} />
          </label>
          <label className="field"><span>Kategori</span>
            <CustomSelect value={draft?.fCat || 'all'} ariaLabel="Filter kategori" placeholder="Semua"
              options={[{ value: 'all', label: 'Semua' }, ...MEMBER_CATEGORIES.map((c) => ({ value: c, label: c }))]}
              onChange={(v) => setDraft((d) => ({ ...d, fCat: v }))} />
          </label>
          <label className="field" style={{ marginBottom: 0 }}><span>Jenis Izin</span>
            <CustomSelect value={draft?.fIzin || 'all'} ariaLabel="Filter jenis izin" placeholder="Semua"
              options={[{ value: 'all', label: 'Semua' }, ...izinOpts.map((n) => ({ value: n, label: n }))]}
              onChange={(v) => setDraft((d) => ({ ...d, fIzin: v }))} />
          </label>
        </Modal>
      )}

      {showExport && detail && stats && (
        <Modal
          title="Export Laporan Pengajian"
          onClose={() => { if (!exporting) setShowExport(false); }}
          foot={<><button className="btn" disabled={exporting} onClick={() => setShowExport(false)}>Batal</button><button className="btn btn-primary" disabled={exporting} onClick={onExport}>{exporting ? 'Membuat file...' : 'Export'}</button></>}
        >
          <p className="card-desc">{formatID(stats.dateISO)} • {detail.type === 'khusus' ? (detail.occ?.event_type_snapshot || 'Pengajian Khusus') : 'Pengajian Rutin'}</p>
          <span className="field"><span>Data yang diekspor</span></span>
          <div className="export-checks">
            {[{ key: 'ringkas', label: 'Ringkasan Kehadiran' }, { key: 'detail', label: 'Detail Kehadiran' }, { key: 'izin', label: 'Detail Izin' }, { key: 'alpha', label: 'Alpha' }, { key: 'materi', label: 'Materi Pengajian' }].map((o) => (
              <label className="export-check" key={o.key}>
                <input type="checkbox" checked={!!exportSel[o.key]} onChange={(e) => setExportSel((p) => ({ ...p, [o.key]: e.target.checked }))} />
                {o.label}
              </label>
            ))}
          </div>
          <label className="field" style={{ marginBottom: 0 }}><span>Format</span><input className="input" value="XLSX" readOnly /></label>
        </Modal>
      )}
    </div>
  );
}
