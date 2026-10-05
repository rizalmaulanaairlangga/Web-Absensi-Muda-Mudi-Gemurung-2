import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../lib/store.jsx';
import { supabase } from '../lib/supabaseClient.js';
import { idbGet } from '../lib/idb.js';
import { todayJakarta, monthLabel, formatID } from '../lib/dates.js';
import { ScheduleChart, Empty, CustomSelect, MonthPicker, StatusBadge, Modal, FilterIcon, DownloadIcon, EyeIcon } from '../components/ui.jsx';
import { exportWorkbook } from '../lib/exportExcel.js';

const EXPORT_OPTS = [
  { key: 'kehadiran', label: 'Kehadiran' },
  { key: 'izin', label: 'Izin / Ketidakhadiran' },
  { key: 'alpha', label: 'Alpha' },
  { key: 'materi', label: 'Materi' },
  { key: 'libur', label: 'Jadwal Libur' },
  { key: 'khusus', label: 'Pengajian Khusus' },
];

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function dowOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(d.getTime()) ? -1 : d.getDay();
}

function timeOf(o) {
  const s = String(o.occurrence_time || o.event_time || '').slice(0, 5);
  const e = String(o.occurrence_end_time || o.end_time || '').slice(0, 5);
  return e && e !== s ? `${s}–${e}` : s;
}

export default function Laporan() {
  const { account, isGuest, toast, supabaseReady, online } = useApp();
  const navigate = useNavigate();
  const now = todayJakarta();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const [jenis, setJenis] = useState('semua');
  const [jadwal, setJadwal] = useState('semua');
  const [eventId, setEventId] = useState('semua');
  const [anggota, setAnggota] = useState('semua');
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [draft, setDraft] = useState(null);
  const [exportSel, setExportSel] = useState({ kehadiran: true, izin: true, alpha: true, materi: true, libur: true, khusus: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!account) return;
      setLoadError('');
      try {
        if (isGuest || !supabaseReady) {
          const local = await idbGet('guest-data', null);
          if (!local) { if (!cancelled) { setData(null); setLoadError('offline'); } return; }
          const occ = (local.occurrences || []).filter((o) => o.occurrence_date.startsWith(`${ym.y}-${String(ym.m).padStart(2, '0')}`));
          if (!cancelled) setData({ members: local.members.filter((m) => m.active), occurrences: occ, attendance: local.attendance || {}, holidays: local.holidays || {}, mats: [], specials: [], specialAtt: {} });
          return;
        }
        const first = `${ym.y}-${String(ym.m).padStart(2, '0')}-01`;
        const last = `${ym.y}-${String(ym.m).padStart(2, '0')}-31`;
        const occDb = await supabase.from('schedule_occurrences').select('*').eq('account_id', account.id).gte('occurrence_date', first).lte('occurrence_date', last).order('occurrence_date');
        const occRows = occDb.data || [];
        const ids = occRows.map((o) => o.id);
        const [mem, attDb, holDb, matsDb, specDb] = await Promise.all([
          supabase.from('members').select('*').eq('account_id', account.id).eq('active', true),
          ids.length ? supabase.from('attendance').select('*').in('occurrence_id', ids) : Promise.resolve({ data: [] }),
          supabase.from('holidays').select('*').eq('account_id', account.id).gte('holiday_date', first).lte('holiday_date', last),
          ids.length ? supabase.from('materials').select('*').in('occurrence_id', ids) : Promise.resolve({ data: [] }),
          supabase.from('special_events').select('*').eq('account_id', account.id).gte('event_date', first).lte('event_date', last).order('event_date'),
        ]);
        const evIds = (specDb.data || []).map((e) => e.id);
        const specAttDb = evIds.length
          ? await supabase.from('special_attendance').select('*').in('special_event_id', evIds)
          : { data: [] };
        const attMap = {};
        (attDb.data || []).forEach((a) => { (attMap[a.occurrence_id] ||= []).push(a); });
        const specAttMap = {};
        (specAttDb.data || []).forEach((a) => { (specAttMap[a.special_event_id] ||= []).push(a); });
        if (!cancelled) {
          setData({
            members: mem.data || [],
            occurrences: occRows,
            attendance: attMap,
            holidays: Object.fromEntries((holDb.data || []).map((h) => [h.occurrence_id, h])),
            mats: matsDb.data || [],
            specials: specDb.data || [],
            specialAtt: specAttMap,
          });
        }
      } catch {
        if (!cancelled) { setData(null); setLoadError('error'); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id, ym.y, ym.m, reloadKey]);

  const jadwalDays = useMemo(() => {
    if (!data) return [];
    const set = new Set();
    data.occurrences.forEach((o) => { const d = dowOf(o.occurrence_date); if (d >= 0) set.add(d); });
    return [...set].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  }, [data]);

  const calc = useMemo(() => {
    if (!data) return null;
    const khususOnly = jenis === 'khusus';
    const rutinBase = khususOnly
      ? []
      : data.occurrences.filter((o) => jadwal === 'semua' || dowOf(o.occurrence_date) === Number(jadwal));
    const occActive = rutinBase.filter((o) => !data.holidays?.[o.id || o.occurrence_id]);
    const filled = occActive.filter((o) => (data.attendance?.[o.id]?.length || 0) > 0);
    const perMember = data.members.filter((m) => anggota === 'semua' || m.id === anggota).map((m) => {
      let hadir = 0, izin = 0, alpha = 0;
      filled.forEach((o) => {
        const rec = (data.attendance[o.id] || []).find((a) => a.member_id === m.id);
        if (!rec) return;
        if (rec.status === 'PRESENT') hadir++;
        else if (rec.status === 'PERMITTED') izin++;
        else alpha++;
      });
      return { ...m, hadir, izin, alpha, persen: filled.length ? Math.round((hadir / filled.length) * 1000) / 10 : 0 };
    });
    const khususEvs = (data.specials || []).filter((e) => eventId === 'semua' || e.id === eventId);
    const khususFilled = khususEvs.filter((e) => (data.specialAtt?.[e.id]?.length || 0) > 0);
    const khususPerMember = data.members.filter((m) => anggota === 'semua' || m.id === anggota).map((m) => {
      let hadir = 0, izin = 0, alpha = 0;
      khususEvs.forEach((e) => {
        const rec = (data.specialAtt?.[e.id] || []).find((a) => a.member_id === m.id);
        if (!rec) return;
        if (rec.status === 'PRESENT') hadir++;
        else if (rec.status === 'PERMITTED') izin++;
        else alpha++;
      });
      return { ...m, hadir, izin, alpha, persen: khususEvs.length ? Math.round((hadir / khususEvs.length) * 1000) / 10 : 0 };
    });
    const scopeMembers = khususOnly ? khususPerMember : perMember;
    const perJadwal = filled.map((o) => {
      const rows = data.attendance[o.id] || [];
      const hadir = rows.filter((r) => r.status === 'PRESENT').length;
      const izin = rows.filter((r) => r.status === 'PERMITTED').length;
      const alpha = rows.filter((r) => r.status === 'ALPHA').length;
      return {
        key: o.id, dateISO: o.occurrence_date, label: formatID(o.occurrence_date), sub: timeOf(o),
        hadir, izin, alpha,
        tip: `${formatID(o.occurrence_date)} • ${timeOf(o)} | Hadir ${hadir}, Izin ${izin}, Alpha ${alpha}`,
      };
    });
    const unfilledRows = occActive.filter((o) => !(data.attendance?.[o.id]?.length)).map((o) => ({
      key: `${o.id}-kosong`, dateISO: o.occurrence_date, label: formatID(o.occurrence_date), sub: timeOf(o),
      hadir: 0, izin: 0, alpha: 0, muted: true, mutedLabel: 'Belum diisi', mutedKind: 'kosong',
      tip: `${formatID(o.occurrence_date)} • ${timeOf(o)} | Belum diisi`,
    }));
    const liburSchedRows = rutinBase.filter((o) => data.holidays?.[o.id || o.occurrence_id]).map((o) => ({
      key: `${o.id}-libur`, dateISO: o.occurrence_date, label: formatID(o.occurrence_date), sub: timeOf(o),
      hadir: 0, izin: 0, alpha: 0, muted: true, mutedLabel: 'Libur', mutedKind: 'libur',
      tip: `${formatID(o.occurrence_date)} • ${timeOf(o)} | Libur: ${data.holidays[o.id || o.occurrence_id]?.reason || 'Libur'}`,
    }));
    const scheduleRows = [...perJadwal, ...unfilledRows, ...liburSchedRows].sort((a, b) => String(a.dateISO).localeCompare(String(b.dateISO)));
    const khususPerEvent = khususEvs.map((e) => {
      const rows = data.specialAtt?.[e.id] || [];
      const hadir = rows.filter((r) => r.status === 'PRESENT').length;
      const izin = rows.filter((r) => r.status === 'PERMITTED').length;
      const alpha = rows.filter((r) => r.status === 'ALPHA').length;
      return {
        key: e.id, dateISO: e.event_date, label: e.event_type_snapshot || 'Pengajian Khusus', sub: `${formatID(e.event_date)} • ${timeOf(e)}`,
        hadir, izin, alpha, muted: !rows.length, mutedLabel: rows.length ? null : 'Belum diisi', mutedKind: 'kosong',
        tip: `${e.event_type_snapshot || 'Pengajian Khusus'} • ${formatID(e.event_date)} | Hadir ${hadir}, Izin ${izin}, Alpha ${alpha}`,
      };
    });
    const libur = rutinBase.length - occActive.length;
    const belum = occActive.length - filled.length;
    const freqAlpha = [...scopeMembers].sort((a, b) => b.alpha - a.alpha).slice(0, 5).filter((x) => x.alpha > 0);
    const freqIzin = [...scopeMembers].sort((a, b) => b.izin - a.izin).slice(0, 5).filter((x) => x.izin > 0);
    const detailIzin = [];
    filled.forEach((o) => {
      (data.attendance[o.id] || []).filter((r) => r.status === 'PERMITTED').forEach((r) => {
        const m = data.members.find((x) => x.id === r.member_id);
        detailIzin.push([m?.nickname || m?.full_name || r.member_name_snapshot || '-', formatID(o.occurrence_date), r.absence_name_snapshot || '-']);
      });
    });
    const alphaRows = [];
    filled.forEach((o) => {
      (data.attendance[o.id] || []).filter((r) => r.status === 'ALPHA').forEach((r) => {
        const m = data.members.find((x) => x.id === r.member_id);
        alphaRows.push([m?.nickname || m?.full_name || r.member_name_snapshot || '-', formatID(o.occurrence_date)]);
      });
    });
    const materiRows = (data.mats || [])
      .filter((mt) => filled.some((o) => o.id === mt.occurrence_id))
      .map((mt) => {
        const o = filled.find((x) => x.id === mt.occurrence_id);
        const isi = mt.kind === 'QURAN'
          ? `QS ${mt.quran_surah_number} ${mt.quran_surah_name_snapshot || ''} ayat ${mt.ayat_range || ''}`
          : mt.kind === 'HADITH' ? `${mt.hadith_name_snapshot || ''} hal ${mt.hadith_page || ''}`
          : mt.kind === 'FREE' ? (mt.free_activity_name_snapshot || '') : 'Nasehat';
        return [o ? formatID(o.occurrence_date) : '-', mt.kind, isi.trim(), mt.speaker_name_snapshot || '-'];
      });
    const liburRows = rutinBase.filter((o) => data.holidays?.[o.id || o.occurrence_id]).map((o) => [formatID(o.occurrence_date), o.day_name || '-', data.holidays[o.id || o.occurrence_id]?.reason || 'Libur']);
    const khususRows = khususEvs.map((ev) => {
      const rows = data.specialAtt?.[ev.id] || [];
      return [ev.event_type_snapshot || '-', formatID(ev.event_date), rows.filter((r) => r.status === 'PRESENT').length, rows.filter((r) => r.status === 'PERMITTED').length, rows.filter((r) => r.status === 'ALPHA').length];
    });
    const summary = khususOnly
      ? {
          total: khususEvs.length, filled: khususFilled.length, unfilled: khususEvs.length - khususFilled.length,
          hadirSum: khususPerEvent.reduce((s, r) => s + r.hadir, 0),
        }
      : { total: rutinBase.length, active: occActive.length, libur, belum };
    const rekapCols = khususOnly
      ? ['Nama', ...khususEvs.map((e) => formatID(e.event_date)), 'Hadir', 'Izin', 'Alpha', 'Persen']
      : ['Nama', ...filled.map((o) => o.occurrence_date.slice(8, 10)), 'Hadir', 'Izin', 'Alpha', 'Persen'];
    const rekapRows = scopeMembers.map((m) => {
      const cells = (khususOnly ? khususEvs : filled).map((o) => {
        const bucket = khususOnly ? (data.specialAtt?.[o.id] || []) : (data.attendance?.[o.id] || []);
        const rec = bucket.find((a) => a.member_id === m.id);
        return !rec ? '-' : rec.status === 'PRESENT' ? '✓' : rec.status === 'PERMITTED' ? 'I' : 'A';
      });
      return [m.nickname || m.full_name, ...cells, m.hadir, m.izin, m.alpha, `${m.persen}%`];
    });
    const avgBase = khususOnly ? khususPerEvent : perJadwal;
    const avgHadirSum = avgBase.reduce((s, r) => s + (r.hadir || 0), 0);
    const avgIzinSum = avgBase.reduce((s, r) => s + (r.izin || 0), 0);
    const avgAlphaSum = avgBase.reduce((s, r) => s + (r.alpha || 0), 0);
    const avgDenom = avgHadirSum + avgIzinSum + avgAlphaSum;
    const avg = avgDenom > 0
      ? {
          hadir: Math.round((avgHadirSum / avgDenom) * 1000) / 10,
          izin: Math.round((avgIzinSum / avgDenom) * 1000) / 10,
          alpha: Math.round((avgAlphaSum / avgDenom) * 1000) / 10,
        }
      : null;
    return {
      occActive, filled, perMember: scopeMembers, perJadwal, scheduleRows,
      khususEvs, khususFilled, khususPerEvent,
      libur, belum, freqAlpha, freqIzin, detailIzin, alphaRows, materiRows, liburRows, khususRows,
      summary, avg,
      exportRekap: { columns: rekapCols, rows: rekapRows },
      exportJadwal: khususOnly
        ? khususPerEvent.map((r) => [`${r.label} • ${r.sub}`, r.hadir, r.izin, r.alpha])
        : perJadwal.map((r) => [`${r.label} • ${r.sub}`, r.hadir, r.izin, r.alpha]),
      exportAnggota: scopeMembers.map((m) => [m.nickname || m.full_name, m.hadir, m.izin, m.alpha, `${m.persen}%`]),
    };
  }, [data, anggota, jenis, jadwal, eventId]);

  const activeFilterCount = (jenis !== 'semua' ? 1 : 0) + (jadwal !== 'semua' ? 1 : 0) + (eventId !== 'semua' ? 1 : 0) + (anggota !== 'semua' ? 1 : 0);
  function openFilter() {
    setDraft({ ym: { ...ym }, jenis, jadwal, eventId, anggota });
    setShowFilter(true);
  }
  function resetDraft() {
    setDraft((d) => ({ ym: d ? { ...d.ym } : { ...ym }, jenis: 'semua', jadwal: 'semua', eventId: 'semua', anggota: 'semua' }));
  }
  function applyFilter() {
    if (!draft) return;
    setYm({ ...draft.ym });
    setJenis(draft.jenis);
    setJadwal(draft.jadwal);
    setEventId(draft.eventId);
    setAnggota(draft.anggota);
    setShowFilter(false);
  }
  function jenisLabel() {
    return jenis === 'umum' ? 'Pengajian Rutin' : jenis === 'khusus' ? 'Pengajian Khusus' : 'Semua';
  }
  function anggotaLabel() {
    if (anggota === 'semua' || !calc) return 'Semua anggota';
    const m = calc.perMember.find((x) => x.id === anggota);
    return m ? (m.nickname || m.full_name) : 'Semua anggota';
  }
  function jadwalLabel() {
    if (jadwal === 'semua' || jenis === 'khusus') return null;
    return DAY_NAMES[Number(jadwal)] || null;
  }

  async function onExport() {
    if (!calc) return;
    if (!Object.values(exportSel).some(Boolean)) { toast('Pilih minimal satu jenis data untuk diekspor.'); return; }
    const khususOnly = jenis === 'khusus';
    setExporting(true);
    try {
      const ml = monthLabel(ym.y, ym.m);
      await exportWorkbook({
        monthLabel: ml,
        rekap: exportSel.kehadiran ? calc.exportRekap : null,
        statsJadwal: exportSel.kehadiran ? calc.exportJadwal : null,
        statsAnggota: exportSel.kehadiran ? calc.exportAnggota : null,
        detailIzin: !khususOnly && exportSel.izin ? calc.detailIzin : null,
        statistikIzin: null,
        alphaRows: !khususOnly && exportSel.alpha ? calc.alphaRows : null,
        materiRows: !khususOnly && exportSel.materi ? calc.materiRows : null,
        liburRows: !khususOnly && exportSel.libur ? calc.liburRows : null,
        khususRows: (jenis !== 'umum') && exportSel.khusus ? calc.khususRows : null,
      });
      toast(`Export ${ml} dibuat dari ${online ? 'data tersinkron' : 'data lokal yang belum sepenuhnya tersinkron'}.`);
      setShowExport(false);
    } catch {
      toast('Gagal membuat file export. Coba lagi.');
    }
    setExporting(false);
  }

  if (!account) return <div className="card"><Empty title="Perlu masuk" desc="Masuk untuk melihat laporan." /></div>;
  if (!calc && loadError === 'offline') {
    return <div className="card"><Empty title="Belum tersedia offline" desc="Data laporan ini belum tersimpan di perangkat. Hubungkan ke internet sekali untuk memuatnya, setelah itu laporan dapat dibuka offline." /></div>;
  }
  if (!calc && loadError === 'error') {
    return <div className="card"><Empty title="Gagal memuat laporan" desc="Periksa koneksi lalu coba lagi." action={<button className="btn btn-primary" onClick={() => setReloadKey((k) => k + 1)}>Coba lagi</button>} /></div>;
  }
  if (!calc) return <div className="card"><p className="hint">Memuat laporan...</p></div>;

  const khususOnly = jenis === 'khusus';

  function openOccurrenceDetail(item, kind) {
    if (!item) return;
    if (kind === 'khusus' || khususOnly) {
      navigate(`/laporan/detail/khusus/${item.key || item}`);
      return;
    }
    const id = String(item.key || item).replace(/-(kosong|libur)$/, '');
    navigate(`/laporan/detail/rutin/${id}`);
  }

  return (
    <div>
      <div className="card">
        <div className="report-head">
          <div>
            <h2 className="card-title">Laporan</h2>
            <p className="card-desc" style={{ marginBottom: 0 }}>{monthLabel(ym.y, ym.m)} • {jenisLabel()}{jadwalLabel() ? ` • ${jadwalLabel()}` : ''} • {anggotaLabel()}</p>
          </div>
          <div className="report-head-actions">
            <button type="button" className="btn" onClick={() => navigate('/laporan/detail')} aria-label="Buka detail absensi per pengajian">
              <EyeIcon /> Detail Absensi
            </button>
            <button type="button" className="btn" onClick={openFilter} aria-haspopup="dialog">
              <FilterIcon /> Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setShowExport(true)} aria-haspopup="dialog">
              <DownloadIcon /> Export Laporan
            </button>
          </div>
        </div>
        {!online && <p className="hint" style={{ marginTop: 8, marginBottom: 0 }}>Offline: menampilkan data lokal yang tersimpan.</p>}
      </div>

      <div className="card">
        <h3 className="card-title">Ringkasan Kehadiran</h3>
        <p className="card-desc" style={{ marginBottom: 0 }}>Berdasarkan jadwal yang sudah diisi</p>
        <div className="avg-grid avg-grid-4">
          <div className="avg-card blue">
            <span className="avg-label">Total Anggota</span>
            <span className="avg-num">{calc.perMember.length}</span>
          </div>
          <div className="avg-card green">
            <span className="avg-label">Rata-rata Kehadiran</span>
            <span className="avg-num">{calc.avg ? `${calc.avg.hadir}%` : '—'}</span>
          </div>
          <div className="avg-card amber">
            <span className="avg-label">Rata-rata Izin</span>
            <span className="avg-num">{calc.avg ? `${calc.avg.izin}%` : '—'}</span>
          </div>
          <div className="avg-card red">
            <span className="avg-label">Rata-rata Alpha</span>
            <span className="avg-num">{calc.avg ? `${calc.avg.alpha}%` : '—'}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Rekap anggota</h3>
        <p className="card-desc">{khususOnly ? 'Berdasarkan pengajian khusus yang difilter.' : 'Berdasarkan jadwal rutin yang difilter.'}</p>
        <div className="table-wrap">
          <table className="att">
            <thead><tr><th>Nama</th><th>Hadir</th><th>Izin</th><th>Alpha</th><th>Kehadiran</th></tr></thead>
            <tbody>
              {calc.perMember.map((m) => (
                <tr key={m.id}><td>{m.nickname || m.full_name}</td><td className="cell-hadir">{m.hadir}</td><td className="cell-izin">{m.izin}</td><td className="cell-alpha">{m.alpha}</td><td>{m.persen}%</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">{khususOnly ? 'Kehadiran per acara' : 'Kehadiran per jadwal'}</h3>
        <p className="card-desc">{khususOnly ? 'Rincian hadir, izin, dan alpha tiap acara khusus. Pilih bar untuk membuka detail.' : 'Rincian hadir, izin, dan alpha tiap jadwal, termasuk yang belum diisi dan libur. Pilih bar untuk membuka detail.'}</p>
        <ScheduleChart items={khususOnly ? calc.khususPerEvent : calc.scheduleRows} onSelect={(it) => openOccurrenceDetail(it, khususOnly ? 'khusus' : 'rutin')} />
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 className="card-title">Sering Alpha</h3>
          {calc.freqAlpha.length ? calc.freqAlpha.map((m) => <div className="admin-item" key={m.id}><span>{m.nickname}</span><StatusBadge kind="alpha">{m.alpha} Alpha</StatusBadge></div>) : <p className="hint">Tidak ada.</p>}
        </div>
        <div className="card">
          <h3 className="card-title">Sering Izin</h3>
          {calc.freqIzin.length ? calc.freqIzin.map((m) => <div className="admin-item" key={m.id}><span>{m.nickname}</span><StatusBadge kind="izin">{m.izin} Izin</StatusBadge></div>) : <p className="hint">Tidak ada.</p>}
        </div>
      </div>

      {jenis !== 'umum' && (
        <div className="card">
          <h3 className="card-title">Pengajian Khusus</h3>
          <p className="card-desc">Statistik kegiatan khusus terpisah dari pengajian rutin.</p>
          {calc.khususRows.length ? (
            <div className="table-wrap">
              <table className="att">
                <thead><tr><th>Kegiatan</th><th>Hadir</th><th>Izin</th><th>Alpha</th></tr></thead>
                <tbody>
                  {calc.khususRows.map((r, i) => {
                    const ev = calc.khususPerEvent[i];
                    return (
                      <tr
                        key={i}
                        onClick={() => ev && navigate(`/laporan/detail/khusus/${ev.key}`)}
                        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && ev) { e.preventDefault(); navigate(`/laporan/detail/khusus/${ev.key}`); } }}
                        tabIndex={0}
                        style={{ cursor: 'pointer' }}
                        title="Buka detail pengajian khusus"
                      ><td>{r[0]} • {r[1]}</td><td className="cell-hadir">{r[2]}</td><td className="cell-izin">{r[3]}</td><td className="cell-alpha">{r[4]}</td></tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <Empty title="Belum ada kegiatan khusus" desc="Kegiatan khusus yang tersimpan akan tampil di sini." />}
        </div>
      )}

      {showFilter && draft && (
        <Modal
          title="Filter Laporan"
          onClose={() => setShowFilter(false)}
          foot={<>
            <button className="btn" onClick={resetDraft}>Reset</button>
            <button className="btn btn-primary" onClick={applyFilter}>Terapkan</button>
          </>}
        >
          <div className="field"><span>Bulan</span><MonthPicker y={draft.ym.y} m={draft.ym.m} onChange={(v) => setDraft((d) => ({ ...d, ym: v }))} ariaLabel="Pilih bulan laporan" /></div>
          <label className="field"><span>Jenis kegiatan</span>
            <CustomSelect value={draft.jenis} ariaLabel="Jenis kegiatan" placeholder="Pilih jenis"
              options={[{ value: 'semua', label: 'Semua' }, { value: 'umum', label: 'Pengajian Rutin' }, { value: 'khusus', label: 'Pengajian Khusus' }]}
              onChange={(v) => setDraft((d) => ({ ...d, jenis: v, jadwal: 'semua', eventId: 'semua' }))} />
          </label>
          {draft.jenis !== 'khusus' && (
            <label className="field"><span>Jadwal</span>
              <CustomSelect value={draft.jadwal} ariaLabel="Filter jadwal" placeholder="Semua jadwal"
                options={[{ value: 'semua', label: 'Semua jadwal' }, ...jadwalDays.map((d) => ({ value: String(d), label: DAY_NAMES[d] }))]}
                onChange={(v) => setDraft((d) => ({ ...d, jadwal: v }))} />
            </label>
          )}
          {draft.jenis === 'khusus' && (
            <label className="field"><span>Acara khusus</span>
              <CustomSelect value={draft.eventId} ariaLabel="Filter acara khusus" placeholder="Semua acara"
                options={[{ value: 'semua', label: 'Semua acara' }, ...(data.specials || []).map((e) => ({ value: e.id, label: `${e.event_type_snapshot || 'Pengajian Khusus'} • ${formatID(e.event_date)}` }))]}
                onChange={(v) => setDraft((d) => ({ ...d, eventId: v }))} />
            </label>
          )}
          <label className="field" style={{ marginBottom: 0 }}><span>Anggota</span>
            <CustomSelect value={draft.anggota} ariaLabel="Filter anggota" placeholder="Semua anggota"
              options={[{ value: 'semua', label: 'Semua anggota' }, ...(data.members || []).map((m) => ({ value: m.id, label: m.nickname || m.full_name }))]}
              onChange={(v) => setDraft((d) => ({ ...d, anggota: v }))} />
          </label>
        </Modal>
      )}

      {showExport && (
        <Modal
          title="Export Laporan"
          onClose={() => { if (!exporting) setShowExport(false); }}
          foot={<>
            <button className="btn" disabled={exporting} onClick={() => setShowExport(false)}>Batal</button>
            <button className="btn btn-primary" disabled={exporting} onClick={onExport}>{exporting ? 'Membuat file...' : `Export ${monthLabel(ym.y, ym.m)}`}</button>
          </>}
        >
          <p className="card-desc">Mengekspor: {monthLabel(ym.y, ym.m)} • {jenisLabel()}{jadwalLabel() ? ` • ${jadwalLabel()}` : ''} • {anggotaLabel()}{!online ? ' • dari data lokal' : ''}</p>
          <span className="field"><span>Pilih data yang ingin diekspor</span></span>
          <div className="export-checks">
            {EXPORT_OPTS.map((o) => (
              <label className="export-check" key={o.key}>
                <input type="checkbox" checked={!!exportSel[o.key]} onChange={(e) => setExportSel((p) => ({ ...p, [o.key]: e.target.checked }))} />
                {o.label}
              </label>
            ))}
          </div>
          <div className="row cols-2">
            <div className="field"><span>Periode</span><MonthPicker y={ym.y} m={ym.m} onChange={setYm} ariaLabel="Pilih periode export" /></div>
            <label className="field"><span>Format</span><input className="input" value="XLSX (beberapa sheet)" readOnly /></label>
          </div>
        </Modal>
      )}
    </div>
  );
}
