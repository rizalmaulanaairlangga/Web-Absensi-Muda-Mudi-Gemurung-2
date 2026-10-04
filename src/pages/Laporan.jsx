import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { supabase } from '../lib/supabaseClient.js';
import { idbGet } from '../lib/idb.js';
import { todayJakarta, monthLabel, formatID } from '../lib/dates.js';
import { BarChart, Empty, CustomSelect, MonthPicker, StatusBadge } from '../components/ui.jsx';
import { exportWorkbook } from '../lib/exportExcel.js';

const EXPORT_OPTS = [
  { key: 'kehadiran', label: 'Kehadiran' },
  { key: 'izin', label: 'Izin / Ketidakhadiran' },
  { key: 'alpha', label: 'Alpha' },
  { key: 'materi', label: 'Materi' },
  { key: 'libur', label: 'Jadwal Libur' },
  { key: 'khusus', label: 'Pengajian Khusus' },
];

export default function Laporan() {
  const { account, isGuest, toast, supabaseReady, online } = useApp();
  const now = todayJakarta();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const [jenis, setJenis] = useState('umum');
  const [anggota, setAnggota] = useState('semua');
  const [data, setData] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportSel, setExportSel] = useState({ kehadiran: true, izin: true, alpha: true, materi: true, libur: true, khusus: true });

  useEffect(() => {
    (async () => {
      if (!account) return;
      if (isGuest || !supabaseReady) {
        const local = await idbGet('guest-data', null);
        if (!local) { setData(null); return; }
        const occ = (local.occurrences || []).filter((o) => o.occurrence_date.startsWith(`${ym.y}-${String(ym.m).padStart(2, '0')}`));
        setData({ members: local.members.filter((m) => m.active), occurrences: occ, attendance: local.attendance || {}, holidays: local.holidays || {}, mats: [], specials: [], specialAtt: {} });
        return;
      }
      const first = `${ym.y}-${String(ym.m).padStart(2, '0')}-01`;
      const last = `${ym.y}-${String(ym.m).padStart(2, '0')}-31`;
      const [mem, occ, att, hol, mats, spec, specAtt] = await Promise.all([
        supabase.from('members').select('*').eq('account_id', account.id).eq('active', true),
        supabase.from('schedule_occurrences').select('*').eq('account_id', account.id).gte('occurrence_date', first).lte('occurrence_date', last).order('occurrence_date'),
        supabase.from('attendance').select('*').eq('account_id', account.id),
        supabase.from('holidays').select('*').eq('account_id', account.id),
        supabase.from('materials').select('*').eq('account_id', account.id),
        supabase.from('special_events').select('*').eq('account_id', account.id).gte('event_date', first).lte('event_date', last).order('event_date'),
        supabase.from('special_attendance').select('*').eq('account_id', account.id),
      ]);
      const attMap = {};
      (att.data || []).forEach((a) => { (attMap[a.occurrence_id] ||= []).push(a); });
      const specAttMap = {};
      (specAtt.data || []).forEach((a) => { (specAttMap[a.special_event_id] ||= []).push(a); });
      setData({
        members: mem.data || [],
        occurrences: occ.data || [],
        attendance: attMap,
        holidays: Object.fromEntries((hol.data || []).map((h) => [h.occurrence_id, h])),
        mats: mats.data || [],
        specials: spec.data || [],
        specialAtt: specAttMap,
      });
    })();
  }, [account?.id, ym.y, ym.m]); // eslint-disable-line react-hooks/exhaustive-deps

  const calc = useMemo(() => {
    if (!data) return null;
    const occActive = data.occurrences.filter((o) => !data.holidays?.[o.id || o.occurrence_id]);
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
      const total = hadir + izin + alpha;
      return { ...m, hadir, izin, alpha, persen: filled.length ? Math.round((hadir / filled.length) * 1000) / 10 : 0 };
    });
    const perJadwal = filled.map((o) => {
      const rows = data.attendance[o.id] || [];
      return { label: o.occurrence_date.slice(8, 10), hadir: rows.filter((r) => r.status === 'PRESENT').length, izin: rows.filter((r) => r.status === 'PERMITTED').length, alpha: rows.filter((r) => r.status === 'ALPHA').length };
    });
    const libur = data.occurrences.length - occActive.length;
    const belum = occActive.length - filled.length;
    const freqAlpha = [...perMember].sort((a, b) => b.alpha - a.alpha).slice(0, 5).filter((x) => x.alpha > 0);
    const freqIzin = [...perMember].sort((a, b) => b.izin - a.izin).slice(0, 5).filter((x) => x.izin > 0);
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
    const liburRows = data.occurrences.filter((o) => data.holidays?.[o.id]).map((o) => [formatID(o.occurrence_date), o.day_name || '-', data.holidays[o.id]?.reason || 'Libur']);
    const khususRows = (data.specials || []).map((ev) => {
      const rows = data.specialAtt?.[ev.id] || [];
      return [ev.event_type_snapshot || '-', formatID(ev.event_date), rows.filter((r) => r.status === 'PRESENT').length, rows.filter((r) => r.status === 'PERMITTED').length, rows.filter((r) => r.status === 'ALPHA').length];
    });
    return { occActive, filled, perMember, perJadwal, libur, belum, freqAlpha, freqIzin, detailIzin, alphaRows, materiRows, liburRows, khususRows };
  }, [data, anggota]);

  async function onExport() {
    if (!calc) return;
    if (!Object.values(exportSel).some(Boolean)) { toast('Pilih minimal satu jenis data untuk diekspor.'); return; }
    setExporting(true);
    try {
      const ml = monthLabel(ym.y, ym.m);
      const rekapCols = ['Nama', ...calc.filled.map((o) => o.occurrence_date.slice(8, 10)), 'Hadir', 'Izin', 'Alpha', 'Persen'];
      const rowsAsArrays = calc.perMember.map((m) => {
        const cells = calc.filled.map((o) => {
          const rec = (data.attendance[o.id] || []).find((a) => a.member_id === m.id);
          return !rec ? '-' : rec.status === 'PRESENT' ? '✓' : rec.status === 'PERMITTED' ? 'I' : 'A';
        });
        return [m.nickname || m.full_name, ...cells, m.hadir, m.izin, m.alpha, `${m.persen}%`];
      });
      await exportWorkbook({
        monthLabel: ml,
        rekap: exportSel.kehadiran ? { columns: rekapCols, rows: rowsAsArrays } : null,
        statsJadwal: exportSel.kehadiran ? calc.perJadwal.map((r) => [r.label, r.hadir, r.izin, r.alpha]) : null,
        statsAnggota: exportSel.kehadiran ? calc.perMember.map((m) => [m.nickname || m.full_name, m.hadir, m.izin, m.alpha, `${m.persen}%`]) : null,
        detailIzin: exportSel.izin ? calc.detailIzin : null,
        statistikIzin: null,
        alphaRows: exportSel.alpha ? calc.alphaRows : null,
        materiRows: exportSel.materi ? calc.materiRows : null,
        liburRows: exportSel.libur ? calc.liburRows : null,
        khususRows: exportSel.khusus ? calc.khususRows : null,
      });
      toast(`Export ${ml} dibuat dari ${online ? 'data tersinkron' : 'data lokal yang belum sepenuhnya tersinkron'}.`);
    } catch {
      toast('Gagal membuat file export. Coba lagi.');
    }
    setExporting(false);
  }

  if (!account) return <div className="card"><Empty title="Perlu masuk" desc="Masuk untuk melihat laporan." /></div>;
  if (!calc) return <div className="card"><p className="hint">Memuat laporan...</p></div>;

  return (
    <div>
      <div className="card">
        <h2 className="card-title">Laporan</h2>
        <p className="card-desc">{monthLabel(ym.y, ym.m)} • Pengajian {jenis === 'umum' ? 'Umum' : jenis === 'khusus' ? 'Khusus' : 'Semua'}</p>
        <div className="row cols-3">
          <div className="field"><span>Bulan</span><MonthPicker y={ym.y} m={ym.m} onChange={setYm} ariaLabel="Pilih bulan laporan" /></div>
          <label className="field"><span>Jenis kegiatan</span>
            <CustomSelect value={jenis} ariaLabel="Jenis kegiatan" placeholder="Pilih jenis"
              options={[{ value: 'semua', label: 'Semua' }, { value: 'umum', label: 'Pengajian Umum' }, { value: 'khusus', label: 'Pengajian Khusus' }]}
              onChange={setJenis} />
          </label>
          <label className="field"><span>Anggota</span>
            <CustomSelect value={anggota} ariaLabel="Filter anggota" placeholder="Semua anggota"
              options={[{ value: 'semua', label: 'Semua anggota' }, ...calc.perMember.map((m) => ({ value: m.id, label: m.nickname || m.full_name }))]}
              onChange={setAnggota} />
          </label>
        </div>
      </div>

      <div className="card">
        <div className="grid-4">
          <div><div className="stat-num">{data.occurrences.length}</div><div className="stat-label">Total jadwal</div></div>
          <div><div className="stat-num">{calc.occActive.length}</div><div className="stat-label">Aktif</div></div>
          <div><div className="stat-num">{calc.libur}</div><div className="stat-label">Libur</div></div>
          <div><div className="stat-num">{calc.belum}</div><div className="stat-label">Belum diisi</div></div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Rekap anggota</h3>
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

      <div className="grid-2">
        <div className="card">
          <h3 className="card-title">Kehadiran per jadwal</h3>
          {calc.perJadwal.length ? <BarChart rows={calc.perJadwal} /> : <Empty title="Belum ada data" desc="Belum ada absensi terisi pada bulan ini." />}
        </div>
        <div className="card">
          <h3 className="card-title">Kehadiran per anggota</h3>
          <BarChart rows={calc.perMember.slice(0, 8).map((m) => ({ label: (m.nickname || m.full_name).slice(0, 10), hadir: m.hadir, izin: m.izin, alpha: m.alpha }))} />
        </div>
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

      <div className="card">
        <h3 className="card-title">Pengajian Khusus</h3>
        <p className="card-desc">Statistik kegiatan khusus terpisah dari pengajian umum.</p>
        {calc.khususRows.length ? (
          <div className="table-wrap">
            <table className="att">
              <thead><tr><th>Kegiatan</th><th>Hadir</th><th>Izin</th><th>Alpha</th></tr></thead>
              <tbody>
                {calc.khususRows.map((r, i) => <tr key={i}><td>{r[0]} • {r[1]}</td><td className="cell-hadir">{r[2]}</td><td className="cell-izin">{r[3]}</td><td className="cell-alpha">{r[4]}</td></tr>)}
              </tbody>
            </table>
          </div>
        ) : <Empty title="Belum ada kegiatan khusus" desc="Kegiatan khusus yang tersimpan akan tampil di sini." />}
      </div>

      <div className="card">
        <h3 className="card-title">Export Laporan</h3>
        <p className="card-desc">File Excel berisi rekap kehadiran, izin, alpha, materi, jadwal libur, dan pengajian khusus sesuai pilihan.</p>
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
        <button className="btn btn-primary btn-block" disabled={exporting} onClick={onExport}>{exporting ? 'Membuat file...' : `Export ${monthLabel(ym.y, ym.m)}`}</button>
      </div>
    </div>
  );
}
