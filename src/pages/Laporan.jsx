import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { supabase } from '../lib/supabaseClient.js';
import { idbGet } from '../lib/idb.js';
import { todayJakarta, monthLabel } from '../lib/dates.js';
import { BarChart, Empty } from '../components/ui.jsx';
import { exportWorkbook } from '../lib/exportExcel.js';

export default function Laporan() {
  const { account, isGuest, toast, supabaseReady, online } = useApp();
  const now = todayJakarta();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const [jenis, setJenis] = useState('umum');
  const [anggota, setAnggota] = useState('semua');
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      if (!account) return;
      if (isGuest || !supabaseReady) {
        const local = await idbGet('guest-data', null);
        if (!local) { setData(null); return; }
        const occ = (local.occurrences || []).filter((o) => o.occurrence_date.startsWith(`${ym.y}-${String(ym.m).padStart(2, '0')}`));
        setData({ members: local.members.filter((m) => m.active), occurrences: occ, attendance: local.attendance || {}, holidays: local.holidays || {} });
        return;
      }
      const first = `${ym.y}-${String(ym.m).padStart(2, '0')}-01`;
      const last = `${ym.y}-${String(ym.m).padStart(2, '0')}-31`;
      const [mem, occ, att, hol] = await Promise.all([
        supabase.from('members').select('*').eq('account_id', account.id).eq('active', true),
        supabase.from('schedule_occurrences').select('*').eq('account_id', account.id).gte('occurrence_date', first).lte('occurrence_date', last).order('occurrence_date'),
        supabase.from('attendance').select('*').eq('account_id', account.id),
        supabase.from('holidays').select('*').eq('account_id', account.id),
      ]);
      const attMap = {};
      (att.data || []).forEach((a) => { (attMap[a.occurrence_id] ||= []).push(a); });
      setData({ members: mem.data || [], occurrences: occ.data || [], attendance: attMap, holidays: Object.fromEntries((hol.data || []).map((h) => [h.occurrence_id, h])) });
    })();
  }, [account?.id, ym.y, ym.m]);

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
      return { ...m, hadir, izin, alpha, persen: total ? Math.round((hadir / filled.length) * 1000) / 10 : 0 };
    });
    const perJadwal = filled.map((o) => {
      const rows = data.attendance[o.id] || [];
      return { label: o.occurrence_date.slice(8, 10), hadir: rows.filter((r) => r.status === 'PRESENT').length, izin: rows.filter((r) => r.status === 'PERMITTED').length, alpha: rows.filter((r) => r.status === 'ALPHA').length };
    });
    const libur = data.occurrences.length - occActive.length;
    const belum = occActive.length - filled.length;
    const freqAlpha = [...perMember].sort((a, b) => b.alpha - a.alpha).slice(0, 5).filter((x) => x.alpha > 0);
    const freqIzin = [...perMember].sort((a, b) => b.izin - a.izin).slice(0, 5).filter((x) => x.izin > 0);
    return { occActive, filled, perMember, perJadwal, libur, belum, freqAlpha, freqIzin };
  }, [data, anggota]);

  async function onExport(kind) {
    if (!calc) return;
    const ml = monthLabel(ym.y, ym.m);
    const rekapCols = ['Nama', ...calc.filled.map((o) => o.occurrence_date.slice(8, 10)), 'Hadir', 'Izin', 'Alpha', 'Persen'];
    const rekapRows = calc.perMember.map((m) => {
      const cells = calc.filled.map((o) => {
        const rec = (data.attendance[o.id] || []).find((a) => a.member_id === m.id);
        return !rec ? '-' : rec.status === 'PRESENT' ? '✓' : rec.status === 'PERMITTED' ? 'I' : 'A';
      });
      return ['Nama' in {} ? '' : m.nickname || m.full_name, ...cells, m.hadir, m.izin, m.alpha, `${m.persen}%`].slice(0);
    });
    const fixedRows = calc.perMember.map((m) => {
      const cells = calc.filled.map((o) => {
        const rec = (data.attendance[o.id] || []).find((a) => a.member_id === m.id);
        return !rec ? '-' : rec.status === 'PRESENT' ? '✓' : rec.status === 'PERMITTED' ? 'I' : 'A';
      });
      return { Nama: m.nickname || m.full_name, ...Object.fromEntries(cells.map((c, i) => [rekapCols[i + 1], c])), Hadir: m.hadir, Izin: m.izin, Alpha: m.alpha, Persen: `${m.persen}%` };
    });
    const rowsAsArrays = calc.perMember.map((m) => {
      const cells = calc.filled.map((o) => {
        const rec = (data.attendance[o.id] || []).find((a) => a.member_id === m.id);
        return !rec ? '-' : rec.status === 'PRESENT' ? '✓' : rec.status === 'PERMITTED' ? 'I' : 'A';
      });
      return [m.nickname || m.full_name, ...cells, m.hadir, m.izin, m.alpha, `${m.persen}%`];
    });
    await exportWorkbook({
      monthLabel: ml,
      rekap: { columns: rekapCols, rows: rowsAsArrays },
      statsJadwal: calc.perJadwal.map((r) => [r.label, r.hadir, r.izin, r.alpha]),
      statsAnggota: calc.perMember.map((m) => [m.nickname || m.full_name, m.hadir, m.izin, m.alpha, `${m.persen}%`]),
      detailIzin: [],
      statistikIzin: null,
      alphaRows: [],
      materiRows: [],
      liburRows: [],
      khususRows: [],
    });
    toast(`Export ${ml} dibuat dari ${online ? 'data tersinkron' : 'data lokal yang belum sepenuhnya tersinkron'}.`);
  }

  if (!account) return <div className="card"><Empty title="Perlu masuk" desc="Masuk untuk melihat laporan." /></div>;
  if (!calc) return <div className="card"><p className="hint">Memuat laporan...</p></div>;

  return (
    <div>
      <div className="card">
        <h2 className="card-title">Laporan</h2>
        <p className="card-desc">{monthLabel(ym.y, ym.m)} • Pengajian {jenis === 'umum' ? 'Umum' : jenis === 'khusus' ? 'Khusus' : 'Semua'}</p>
        <div className="row cols-3">
          <label className="field"><span>Bulan</span><input className="input" type="month" value={`${ym.y}-${String(ym.m).padStart(2, '0')}`} onChange={(e) => { const [y, m] = e.target.value.split('-').map(Number); setYm({ y, m }); }} /></label>
          <label className="field"><span>Jenis kegiatan</span>
            <select className="input" value={jenis} onChange={(e) => setJenis(e.target.value)}>
              <option value="semua">Semua</option><option value="umum">Pengajian Umum</option><option value="khusus">Pengajian Khusus</option>
            </select>
          </label>
          <label className="field"><span>Anggota</span>
            <select className="input" value={anggota} onChange={(e) => setAnggota(e.target.value)}>
              <option value="semua">Semua anggota</option>
              {calc.perMember.map((m) => <option key={m.id} value={m.id}>{m.nickname || m.full_name}</option>)}
            </select>
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
          {calc.freqAlpha.length ? calc.freqAlpha.map((m) => <div className="admin-item" key={m.id}><span>{m.nickname}</span><span className="badge red">{m.alpha} Alpha</span></div>) : <p className="hint">Tidak ada.</p>}
        </div>
        <div className="card">
          <h3 className="card-title">Sering Izin</h3>
          {calc.freqIzin.length ? calc.freqIzin.map((m) => <div className="admin-item" key={m.id}><span>{m.nickname}</span><span className="badge amber">{m.izin} Izin</span></div>) : <p className="hint">Tidak ada.</p>}
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Pengajian Khusus</h3>
        <p className="card-desc">Statistik kegiatan khusus terpisah dari pengajian umum.</p>
        <Empty title="Belum ada kegiatan khusus" desc="Kegiatan khusus yang tersimpan akan tampil di sini." />
      </div>

      <div className="card">
        <h3 className="card-title">Export</h3>
        <p className="card-desc">File dibuat saat diminta. Format .xlsx dengan beberapa lembar.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => onExport('semua')}>Export Semua</button>
          <button className="btn" onClick={() => onExport('hadir')}>Export Kehadiran</button>
        </div>
      </div>
    </div>
  );
}
