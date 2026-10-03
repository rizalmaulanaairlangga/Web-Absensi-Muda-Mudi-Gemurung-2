import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { supabase } from '../lib/supabaseClient.js';
import { idbGet, idbSet } from '../lib/idb.js';
import { todayJakarta, toISODate, formatID, dayName, dayOfWeek, isWithinWindow, windowOpenAt, canEdit, monthLabel } from '../lib/dates.js';
import { surahName } from '../lib/quran.js';
import { DEFAULT_ABSENCE, DEFAULT_STATUS, DEFAULT_HADITH, DEFAULT_FREE, DEFAULT_SPECIAL_TYPES, DEFAULT_SPEAKERS, guestSeed } from '../lib/seed.js';
import { Modal, Empty, ChevronLeftIcon, ChevronRightIcon, ClockIcon, PlusIcon } from '../components/ui.jsx';

function timeRange(start, end) {
  const s = String(start || '').slice(0, 5);
  const e = String(end || '').slice(0, 5);
  return e && e !== s ? `${s} – ${e}` : s;
}

function blankStore(accountId) {
  return {
    accountId,
    members: guestSeed().map((m, i) => ({ id: `seed-${i}`, account_id: accountId, full_name: m.full_name, nickname: m.nickname, gender: m.gender, status: i % 3 === 0 ? 'Sekolah' : i % 3 === 1 ? 'Kuliah' : 'Bekerja', joined_at: '2025-01-05', active: true })),
    absenceTypes: DEFAULT_ABSENCE.map((n, i) => ({ id: `iz-${i}`, name: n })),
    statuses: DEFAULT_STATUS.map((n, i) => ({ id: `st-${i}`, name: n })),
    hadith: DEFAULT_HADITH.map((n, i) => ({ id: `hd-${i}`, name: n })),
    free: DEFAULT_FREE.map((n, i) => ({ id: `fr-${i}`, name: n })),
    speakers: DEFAULT_SPEAKERS.map((n, i) => ({ id: `sp-${i}`, name: n })),
    specialTypes: DEFAULT_SPECIAL_TYPES.map((n, i) => ({ id: `kt-${i}`, name: n })),
    schedules: [
      { id: 'sch-rabu', day_of_week: 3, event_time: '19:30', end_time: '21:30', active: true },
      { id: 'sch-jumat', day_of_week: 5, event_time: '19:30', end_time: '21:30', active: true },
    ],
    lockHours: 24,
    occurrences: [],
    attendance: {},
    materials: {},
    holidays: {},
    specialEvents: [],
    specialAttendance: {},
  };
}

function occurrencesForMonth(schedules, y, m) {
  const out = [];
  const days = new Date(y, m, 0).getDate();
  for (let d = 1; d <= days; d++) {
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dow = dayOfWeek(iso);
    schedules.filter((s) => s.active && s.day_of_week === dow).forEach((s) => {
      out.push({
        id: `occ-${iso}-${s.id}`,
        recurring_schedule_id: s.id,
        occurrence_date: iso,
        occurrence_time: String(s.event_time || '19:30').slice(0, 5),
        occurrence_end_time: s.end_time ? String(s.end_time).slice(0, 5) : null,
        day_name: dayName(iso),
      });
    });
  }
  return out.sort((a, b) => a.occurrence_date.localeCompare(b.occurrence_date));
}

function windowDays(offsetStart, offsetEnd) {
  const base = todayJakarta();
  const days = [];
  for (let i = offsetStart; i <= offsetEnd; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

function formCandidates(schedules) {
  const out = [];
  windowDays(-21, 45).forEach((d) => {
    const iso = toISODate(d);
    const dow = d.getDay();
    schedules.filter((s) => s.active && s.day_of_week === dow).forEach((s) => {
      out.push({
        key: `${s.id}|${iso}`,
        recurring_schedule_id: s.id,
        occurrence_date: iso,
        occurrence_time: String(s.event_time || '19:30').slice(0, 5),
        occurrence_end_time: s.end_time ? String(s.end_time).slice(0, 5) : null,
        day_name: dayName(iso),
      });
    });
  });
  return out.sort((a, b) => (a.occurrence_date + a.occurrence_time).localeCompare(b.occurrence_date + b.occurrence_time));
}

export default function Absensi() {
  const { account, isGuest, online, toast, enqueue, supabaseReady } = useApp();
  const now = todayJakarta();
  const [tableYm, setTableYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const [store, setStore] = useState(null);
  const [formOccs, setFormOccs] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [answers, setAnswers] = useState({});
  const [showHoliday, setShowHoliday] = useState(false);
  const [showSpecial, setShowSpecial] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mat, setMat] = useState({ quran: true, hadith: false, nasehat: true, free: false, surah: '36', ayat: '1-10', pemateriQ: '', hadithId: '', halaman: '', pemateriH: '', nasehatBy: '', freeId: '', freeBy: '' });

  useEffect(() => {
    (async () => {
      if (!account) return;
      if (isGuest || !supabaseReady) {
        let local = await idbGet('guest-data', null);
        if (!local || local.accountId !== account.id) {
          local = blankStore(account.id);
          local.occurrences = occurrencesForMonth(local.schedules, tableYm.y, tableYm.m);
          await idbSet('guest-data', local);
        } else {
          local.occurrences = occurrencesForMonth(local.schedules, tableYm.y, tableYm.m);
        }
        setStore(local);
        const cands = formCandidates(local.schedules).map((c) => ({ ...c, id: `occ-${c.occurrence_date}-${c.recurring_schedule_id}` }));
        setFormOccs(cands);
        if (!selectedKey) {
          const today = toISODate(todayJakarta());
          const upcoming = cands.find((o) => o.occurrence_date >= today) || cands[cands.length - 1];
          if (upcoming) setSelectedKey(upcoming.id);
        }
        return;
      }
      await loadSupabase();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id, tableYm.y, tableYm.m]);

  async function loadSupabase() {
    try {
      const aid = account.id;
      const [mem, abs, st, hd, fr, sp, ktp, sch, sett] = await Promise.all([
        supabase.from('members').select('*').eq('account_id', aid).order('nickname'),
        supabase.from('absence_types').select('*').eq('account_id', aid),
        supabase.from('member_statuses').select('*').eq('account_id', aid),
        supabase.from('hadith_materials').select('*').eq('account_id', aid),
        supabase.from('free_activity_types').select('*').eq('account_id', aid),
        supabase.from('speakers').select('*').eq('account_id', aid),
        supabase.from('special_event_types').select('*').eq('account_id', aid),
        supabase.from('recurring_schedules').select('*').eq('account_id', aid).eq('active', true),
        supabase.from('app_settings').select('*').eq('account_id', aid).maybeSingle(),
      ]);
      let schedules = (sch.data || []).map((s) => ({
        id: s.id,
        day_of_week: s.day_of_week,
        event_time: String(s.event_time || '19:30').slice(0, 5),
        end_time: s.end_time ? String(s.end_time).slice(0, 5) : null,
        active: s.active,
      }));
      if (schedules.length === 0) {
        const seed = [
          { day_of_week: 3, event_time: '19:30', end_time: '21:30' },
          { day_of_week: 5, event_time: '19:30', end_time: '21:30' },
        ];
        for (const s of seed) {
          const { data } = await supabase.from('recurring_schedules').insert({ account_id: aid, day_of_week: s.day_of_week, event_time: s.event_time, end_time: s.end_time }).select().single();
          if (data) schedules.push({ id: data.id, day_of_week: data.day_of_week, event_time: String(data.event_time).slice(0, 5), end_time: data.end_time ? String(data.end_time).slice(0, 5) : null, active: true });
        }
        if (abs.data?.length === 0) for (const n of DEFAULT_ABSENCE) await supabase.from('absence_types').insert({ account_id: aid, name: n });
        if (st.data?.length === 0) for (const n of DEFAULT_STATUS) await supabase.from('member_statuses').insert({ account_id: aid, name: n });
        if (hd.data?.length === 0) for (const n of DEFAULT_HADITH) await supabase.from('hadith_materials').insert({ account_id: aid, name: n });
        if (fr.data?.length === 0) for (const n of DEFAULT_FREE) await supabase.from('free_activity_types').insert({ account_id: aid, name: n });
        if (sp.data?.length === 0) for (const n of DEFAULT_SPEAKERS) await supabase.from('speakers').insert({ account_id: aid, name: n });
        if (ktp.data?.length === 0) for (const n of DEFAULT_SPECIAL_TYPES) await supabase.from('special_event_types').insert({ account_id: aid, name: n });
      }
      const cands = formCandidates(schedules);
      const months = [...new Set(cands.map((c) => c.occurrence_date.slice(0, 7)))];
      if (!months.includes(`${tableYm.y}-${String(tableYm.m).padStart(2, '0')}`)) months.push(`${tableYm.y}-${String(tableYm.m).padStart(2, '0')}`);
      for (const ymStr of months) {
        const [yy, mm] = ymStr.split('-').map(Number);
        const virt = occurrencesForMonth(schedules, yy, mm);
        for (const o of virt) {
          await supabase.from('schedule_occurrences').upsert({
            account_id: aid,
            recurring_schedule_id: o.recurring_schedule_id,
            occurrence_date: o.occurrence_date,
            occurrence_time: o.occurrence_time,
            occurrence_end_time: o.occurrence_end_time,
            day_name: o.day_name,
          }, { onConflict: 'account_id,recurring_schedule_id,occurrence_date', ignoreDuplicates: true });
        }
      }
      const minDate = cands.length ? cands[0].occurrence_date : `${tableYm.y}-${String(tableYm.m).padStart(2, '0')}-01`;
      const maxDate = cands.length ? cands[cands.length - 1].occurrence_date : `${tableYm.y}-${String(tableYm.m).padStart(2, '0')}-31`;
      const tableFirst = `${tableYm.y}-${String(tableYm.m).padStart(2, '0')}-01`;
      const tableLast = `${tableYm.y}-${String(tableYm.m).padStart(2, '0')}-31`;
      const [occDb, attDb, holDb, matDb] = await Promise.all([
        supabase.from('schedule_occurrences').select('*').eq('account_id', aid).gte('occurrence_date', minDate < tableFirst ? minDate : tableFirst).lte('occurrence_date', maxDate > tableLast ? maxDate : tableLast).order('occurrence_date'),
        supabase.from('attendance').select('*').eq('account_id', aid),
        supabase.from('holidays').select('*').eq('account_id', aid),
        supabase.from('materials').select('*').eq('account_id', aid),
      ]);
      const dbRows = (occDb.data || []).map((o) => ({
        id: o.id,
        recurring_schedule_id: o.recurring_schedule_id,
        occurrence_date: o.occurrence_date,
        occurrence_time: String(o.occurrence_time).slice(0, 5),
        occurrence_end_time: o.occurrence_end_time ? String(o.occurrence_end_time).slice(0, 5) : null,
        day_name: o.day_name,
        is_holiday: o.is_holiday,
      }));
      const byKey = new Map(dbRows.map((o) => [`${o.recurring_schedule_id}|${o.occurrence_date}`, o]));
      const formList = cands.map((c) => byKey.get(c.key) || { id: `virt-${c.key}`, ...c, virtual: true });
      const tableList = dbRows.filter((o) => o.occurrence_date.startsWith(`${tableYm.y}-${String(tableYm.m).padStart(2, '0')}`));
      const attMap = {};
      (attDb.data || []).forEach((a) => { (attMap[a.occurrence_id] ||= []).push(a); });
      const s = {
        accountId: aid,
        members: (mem.data || []).map((m) => ({ id: m.id, full_name: m.full_name, nickname: m.nickname, gender: m.gender, joined_at: m.joined_at, active: m.active })),
        absenceTypes: (abs.data?.length ? abs.data : DEFAULT_ABSENCE.map((n) => ({ name: n }))),
        schedules,
        lockHours: sett.data?.lock_duration_hours ?? 24,
        occurrences: tableList,
        attendance: attMap,
        holidays: Object.fromEntries((holDb.data || []).map((h) => [h.occurrence_id, h])),
        speakers: sp.data || [],
        hadith: hd.data || [],
        free: fr.data || [],
        specialTypes: ktp.data || [],
        mats: matDb.data || [],
      };
      setStore(s);
      setFormOccs(formList);
      if (!selectedKey && formList.length) {
        const today = toISODate(todayJakarta());
        const up = formList.find((o) => o.occurrence_date >= today) || formList[formList.length - 1];
        setSelectedKey(up.id);
      }
    } catch (e) { toast('Gagal memuat data. Periksa koneksi lalu coba lagi.'); }
  }

  const occ = useMemo(() => {
    if (!store) return null;
    const inForm = formOccs.find((o) => o.id === selectedKey);
    if (inForm) return inForm;
    return store.occurrences.find((o) => o.id === selectedKey) || formOccs[0] || store.occurrences[0];
  }, [store, formOccs, selectedKey]);

  const occDbId = occ && !String(occ.id).startsWith('virt-') ? occ.id : null;
  const submitted = useMemo(() => (occDbId && store?.attendance?.[occDbId]?.length > 0) || (!occDbId && occ && store?.attendance?.[occ.id]?.length > 0) || false, [store, occ, occDbId]);
  const attendanceKey = occDbId || occ?.id;
  const eligible = useMemo(() => {
    if (!store || !occ) return [];
    return store.members.filter((m) => m.active && (!m.joined_at || m.joined_at <= occ.occurrence_date));
  }, [store, occ]);
  const males = eligible.filter((m) => m.gender === 'MALE');
  const females = eligible.filter((m) => m.gender === 'FEMALE');

  useEffect(() => {
    if (!occ || !store) return;
    const key = occDbId || occ.id;
    const saved = store.attendance?.[key];
    if (saved?.length && editing) {
      const map = {};
      saved.forEach((a) => { map[a.member_id] = a.status === 'PRESENT' ? { hadir: true } : a.status === 'PERMITTED' ? { izin: a.absence_name_snapshot || '' } : {}; });
      setAnswers(map);
    } else if (!submitted) {
      idbGet(`draft-${account?.id}-${key}`, null).then((d) => { if (d?.answers) setAnswers(d.answers); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occ?.id, editing]);

  useEffect(() => {
    if (!occ || !account) return;
    const key = occDbId || occ.id;
    if (!submitted && !editing) idbSet(`draft-${account.id}-${key}`, { answers, mat });
  }, [answers, mat]); // eslint-disable-line react-hooks/exhaustive-deps

  function setHadir(id, v) {
    setAnswers((p) => ({ ...p, [id]: v ? { hadir: true } : {} }));
  }
  function setIzin(id, v) {
    setAnswers((p) => ({ ...p, [id]: v ? { izin: v } : {} }));
  }

  const windowOpen = occ ? isWithinWindow(occ.occurrence_date, occ.occurrence_time) : false;
  const editable = occ ? canEdit(occ.occurrence_date, occ.occurrence_time, store?.lockHours ?? 24) : true;
  const surah = surahName(mat.surah);
  const matEmpty = !mat.quran && !mat.hadith && !mat.nasehat && !mat.free;

  async function resolveDbOccurrence() {
    if (occDbId) return occDbId;
    const { data, error } = await supabase.from('schedule_occurrences').upsert({
      account_id: account.id,
      recurring_schedule_id: occ.recurring_schedule_id,
      occurrence_date: occ.occurrence_date,
      occurrence_time: occ.occurrence_time,
      occurrence_end_time: occ.occurrence_end_time,
      day_name: occ.day_name,
    }, { onConflict: 'account_id,recurring_schedule_id,occurrence_date' }).select().single();
    if (error) throw error;
    return data.id;
  }

  async function onSave() {
    if (!occ) return;
    if (!windowOpen) { toast(`Absensi belum dapat diisi. Baru dapat diisi mulai pukul ${windowOpenAt(occ.occurrence_time)}, yaitu 30 menit sebelum acara dimulai.`); return; }
    if (!editable) { toast('Absensi ini tidak dapat diubah lagi. Batas waktu perubahan telah berakhir.'); return; }
    if (matEmpty && !window.confirm('Materi pengajian belum diisi. Absensi tetap dapat disimpan tanpa materi. Lanjutkan menyimpan?')) return;
    if (mat.quran && (!mat.surah || Number(mat.surah) < 1 || Number(mat.surah) > 114 || !mat.ayat)) { toast('Isi nomor surat 1-114 dan ayat jika Al-Quran aktif.'); return; }
    setSaving(true);
    try {
      const rows = eligible.map((m) => {
        const a = answers[m.id] || {};
        const status = a.hadir ? 'PRESENT' : a.izin ? 'PERMITTED' : 'ALPHA';
        return { member_id: m.id, member_name: m.nickname, status, absence: a.izin || null };
      });
      if (isGuest || !supabaseReady) {
        const key = occ.id;
        const recs = rows.map((r) => ({ member_id: r.member_id, member_name_snapshot: r.member_name, status: r.status, absence_name_snapshot: r.absence }));
        setStore((p) => ({ ...p, attendance: { ...p.attendance, [key]: recs } }));
        await idbSet('guest-data', { ...store, attendance: { ...store.attendance, [key]: recs } });
      } else {
        const dbId = await resolveDbOccurrence();
        for (const r of rows) {
          await supabase.from('attendance').upsert({ account_id: account.id, occurrence_id: dbId, member_id: r.member_id, status: r.status, absence_name_snapshot: r.absence, member_name_snapshot: r.member_name }, { onConflict: 'account_id,occurrence_id,member_id' });
        }
        const mats = [];
        if (mat.quran) mats.push({ account_id: account.id, occurrence_id: dbId, kind: 'QURAN', quran_surah_number: Number(mat.surah), quran_surah_name_snapshot: surah, ayat_range: mat.ayat, speaker_name_snapshot: mat.pemateriQ });
        if (mat.hadith && mat.hadithId) mats.push({ account_id: account.id, occurrence_id: dbId, kind: 'HADITH', hadith_name_snapshot: mat.hadithId, hadith_page: mat.halaman, speaker_name_snapshot: mat.pemateriH });
        if (mat.nasehat && mat.nasehatBy) mats.push({ account_id: account.id, occurrence_id: dbId, kind: 'NASEHAT', speaker_name_snapshot: mat.nasehatBy });
        if (mat.free && mat.freeId) mats.push({ account_id: account.id, occurrence_id: dbId, kind: 'FREE', free_activity_name_snapshot: mat.freeId, speaker_name_snapshot: mat.freeBy });
        for (const mm of mats) await supabase.from('materials').insert(mm);
        await supabase.from('audit_logs').insert({ account_id: account.id, action: submitted ? 'UPDATE_ATTENDANCE' : 'CREATE_ATTENDANCE', entity_type: 'attendance', entity_id: dbId, new_data: { count: rows.length } });
        await loadSupabase();
      }
      if (!online) await enqueue({ operation: 'SAVE_ATTENDANCE', occurrenceId: attendanceKey, payload: rows });
      toast(`Absensi ${formatID(occ.occurrence_date)} berhasil disimpan.`);
      setEditing(false);
    } catch { toast('Data gagal disimpan. Periksa koneksi internet dan coba lagi.'); }
    setSaving(false);
  }

  if (!account) return <div className="card"><Empty title="Perlu masuk" desc="Masuk atau lanjut sebagai tamu untuk mengisi absensi." /></div>;
  if (!store) return <div className="card"><div className="skeleton" style={{ height: 120 }} /><p className="hint">Memuat data...</p></div>;

  const todayStr = toISODate(todayJakarta());
  const todayDow = todayJakarta().getDay();
  const hasScheduleToday = store.schedules.some((s) => s.day_of_week === todayDow);
  const recentPool = formOccs.length ? formOccs : store.occurrences;
  const prevUnfilled = recentPool.find((o) => {
    const key = (!String(o.id).startsWith('virt-')) ? o.id : o.id;
    return o.occurrence_date < todayStr && !(store.attendance?.[key]?.length) && !store.holidays?.[key];
  });

  function renderGroup(title, kind, list) {
    return (
      <section className={`member-group ${kind}`} aria-label={title}>
        <div className="member-group-head">
          <h3 className="member-group-title">{title}</h3>
          <span className="member-count">{list.length} orang</span>
        </div>
        {list.length === 0 && <p className="hint">Belum ada anggota.</p>}
        {list.length > 0 && (
          <div className="member-rows">
            {list.map((m) => {
              const a = answers[m.id] || {};
              const izinVal = a.izin || '';
              return (
                <div className="member-row" key={m.id}>
                  <input type="checkbox" checked={!!a.hadir} disabled={!!izinVal} onChange={(e) => setHadir(m.id, e.target.checked)} aria-label={`Hadir ${m.nickname}`} />
                  <span className="member-name">{m.nickname}</span>
                  <select value={izinVal} disabled={!!a.hadir} onChange={(e) => setIzin(m.id, e.target.value)} aria-label={`Izin ${m.nickname}`}>
                    <option value="">Tidak ada izin</option>
                    {(store.absenceTypes || []).map((t) => <option key={t.id || t.name} value={t.name}>{t.name}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  return (
    <div>
      {isGuest && <div className="banner info"><span>Mode Tamu. Data yang digunakan adalah data demo dan akan dihapus otomatis.</span></div>}
      {!online && <div className="banner warn"><span>Anda sedang offline. Perubahan akan disimpan di perangkat dan dikirim saat koneksi kembali.</span></div>}

      <div className="card">
        <div>
          <h2 className="card-title">Absensi Pengajian</h2>
          <p className="card-desc">Jadwal: {occ ? formatID(occ.occurrence_date) : '-'} • Jam: {occ ? timeRange(occ.occurrence_time, occ.occurrence_end_time) : '-'}</p>
        </div>

        <div className="form-quick-actions" aria-label="Aksi cepat jadwal">
          <button type="button" className="btn-quick btn-libur" onClick={() => setShowHoliday(true)}>
            <ClockIcon /> Tandai Libur
          </button>
          <button type="button" className="btn-quick btn-khusus" onClick={() => setShowSpecial(true)}>
            <PlusIcon /> Pengajian Khusus
          </button>
        </div>

        <label className="field"><span>Pilih jadwal</span>
          <select className="input" value={selectedKey || ''} onChange={(e) => { setSelectedKey(e.target.value); setEditing(false); setAnswers({}); }}>
            {(formOccs.length ? formOccs : store.occurrences).map((o) => {
              const key = (!String(o.id).startsWith('virt-')) ? o.id : o.id;
              return (
                <option key={o.id} value={o.id}>{formatID(o.occurrence_date)} • {timeRange(o.occurrence_time, o.occurrence_end_time)}{store.attendance?.[key]?.length ? ' • Sudah diisi' : ''}{store.holidays?.[key] ? ' • Libur' : ''}</option>
              );
            })}
          </select>
        </label>

        {!hasScheduleToday && <div className="banner warn"><span>Hari ini masih hari {['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][todayDow]}. Pengajian berikutnya mengikuti jadwal rutin yang tersedia.</span></div>}
        {prevUnfilled && <div className="banner warn"><span>Jadwal pengajian {formatID(prevUnfilled.occurrence_date)} belum diisi absensinya.</span></div>}
        {occ && !windowOpen && <div className="banner warn"><span>Absensi tersedia mulai {windowOpenAt(occ.occurrence_time)}. Absensi untuk jadwal ini baru dapat diisi mulai 30 menit sebelum acara dimulai.</span></div>}
        {occ && windowOpen && <div className="banner success"><span>Absensi tersedia.</span></div>}

        {submitted && !editing ? (
          <div className="banner success"><span>Absensi berhasil disimpan.</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {editable && <button className="btn" onClick={() => setEditing(true)}>Edit Absensi Ini</button>}
            </span>
          </div>
        ) : (
          <>
            <div className="legend" aria-label="Keterangan">
              <span className="lg"><span className="mark hadir">✓</span> Centang = Hadir</span>
              <span className="lg"><span className="mark alpha">☐</span> Kosong + tidak memilih izin = Alpha</span>
              <span className="lg"><span className="mark izin">I</span> Dropdown izin = Izin</span>
            </div>
            <div className="member-groups">
              {renderGroup('LAKI-LAKI', 'male', males)}
              {renderGroup('PEREMPUAN', 'female', females)}
            </div>

            <h3 style={{ marginTop: 18 }}>Materi Pengajian</h3>
            <div className={`material-card${mat.quran ? '' : ' off'}`}>
              <div className="material-toggle"><span>Al-Quran</span><label className="switch"><input type="checkbox" checked={mat.quran} onChange={(e) => setMat({ ...mat, quran: e.target.checked })} aria-label="Aktifkan materi Al-Quran" /><span className="track" /></label></div>
              {mat.quran && (
                <div className="material-card-body">
                  <div className="row cols-3">
                    <label className="field"><span>Nomor Surat</span><input className="input" inputMode="numeric" value={mat.surah} onChange={(e) => setMat({ ...mat, surah: e.target.value })} /></label>
                    <label className="field"><span>Surat</span><input className="input" value={surah || ''} readOnly placeholder="Nama surat muncul otomatis" /></label>
                    <label className="field"><span>Ayat</span><input className="input" value={mat.ayat} onChange={(e) => setMat({ ...mat, ayat: e.target.value })} placeholder="1-10" /></label>
                  </div>
                  {mat.surah && !surah && <p className="field-error">Nomor surat harus berada di antara 1-114.</p>}
                  <label className="field"><span>Pemateri</span>
                    <select className="input" value={mat.pemateriQ} onChange={(e) => setMat({ ...mat, pemateriQ: e.target.value })}>
                      <option value="">Pilih pemateri</option>
                      {(store.speakers || []).map((s) => <option key={s.id || s.name} value={s.name}>{s.name}</option>)}
                    </select>
                  </label>
                </div>
              )}
            </div>
            <div className={`material-card${mat.hadith ? '' : ' off'}`}>
              <div className="material-toggle"><span>Hadist</span><label className="switch"><input type="checkbox" checked={mat.hadith} onChange={(e) => setMat({ ...mat, hadith: e.target.checked })} aria-label="Aktifkan materi Hadist" /><span className="track" /></label></div>
              {mat.hadith && (
                <div className="material-card-body">
                  <div className="row cols-2">
                    <label className="field"><span>Hadist</span>
                      <select className="input" value={mat.hadithId} onChange={(e) => setMat({ ...mat, hadithId: e.target.value })}>
                        <option value="">Pilih hadist</option>
                        {(store.hadith || []).map((h) => <option key={h.id || h.name} value={h.name}>{h.name}</option>)}
                      </select>
                    </label>
                    <label className="field"><span>Halaman</span><input className="input" value={mat.halaman} onChange={(e) => setMat({ ...mat, halaman: e.target.value })} /></label>
                  </div>
                  <label className="field"><span>Pemateri</span>
                    <select className="input" value={mat.pemateriH} onChange={(e) => setMat({ ...mat, pemateriH: e.target.value })}>
                      <option value="">Pilih pemateri</option>
                      {(store.speakers || []).map((s) => <option key={s.id || s.name} value={s.name}>{s.name}</option>)}
                    </select>
                  </label>
                </div>
              )}
            </div>
            <div className={`material-card${mat.nasehat ? '' : ' off'}`}>
              <div className="material-toggle"><span>Nasehat</span><label className="switch"><input type="checkbox" checked={mat.nasehat} onChange={(e) => setMat({ ...mat, nasehat: e.target.checked })} aria-label="Aktifkan materi Nasehat" /><span className="track" /></label></div>
              {mat.nasehat && (
                <div className="material-card-body">
                  <label className="field"><span>Penyampai nasehat</span>
                    <select className="input" value={mat.nasehatBy} onChange={(e) => setMat({ ...mat, nasehatBy: e.target.value })}>
                      <option value="">Pilih penyampai</option>
                      {(store.speakers || []).map((s) => <option key={s.id || s.name} value={s.name}>{s.name}</option>)}
                    </select>
                  </label>
                </div>
              )}
            </div>
            <div className={`material-card${mat.free ? '' : ' off'}`}>
              <div className="material-toggle"><span>Materi / Kegiatan Bebas</span><label className="switch"><input type="checkbox" checked={mat.free} onChange={(e) => setMat({ ...mat, free: e.target.checked })} aria-label="Aktifkan materi bebas" /><span className="track" /></label></div>
              {mat.free && (
                <div className="material-card-body">
                  <div className="row cols-2">
                    <label className="field"><span>Kegiatan</span>
                      <select className="input" value={mat.freeId} onChange={(e) => setMat({ ...mat, freeId: e.target.value })}>
                        <option value="">Pilih kegiatan</option>
                        {(store.free || []).map((f) => <option key={f.id || f.name} value={f.name}>{f.name}</option>)}
                      </select>
                    </label>
                    <label className="field"><span>Penanggung jawab</span>
                      <select className="input" value={mat.freeBy} onChange={(e) => setMat({ ...mat, freeBy: e.target.value })}>
                        <option value="">Pilih penanggung jawab</option>
                        {(store.speakers || []).map((s) => <option key={s.id || s.name} value={s.name}>{s.name}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="actions">
              <button className="btn btn-danger" onClick={() => { if (window.confirm('Hapus draf absensi ini? Semua jawaban sementara pada form jadwal ini akan dihapus dan tidak bisa dikembalikan.')) { setAnswers({}); } }}>Reset Form</button>
              <button className="btn btn-primary" disabled={saving || !windowOpen} onClick={onSave}>{saving ? 'Menyimpan...' : editing ? 'Simpan Perubahan' : 'Simpan Absensi'}</button>
            </div>
            {editing && <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="btn" onClick={() => setEditing(false)}>Batal</button></div>}
          </>
        )}
      </div>

      <div className="card">
        <div className="table-card-head">
          <div>
            <h3 className="card-title">Rekap Absensi</h3>
            <p className="card-desc">Tabel hanya untuk melihat. Perubahan lewat form Edit Kehadiran.</p>
          </div>
          <div className="month-nav" aria-label="Navigasi bulan tabel">
            <button className="icon-btn" onClick={() => setTableYm((p) => (p.m === 1 ? { y: p.y - 1, m: 12 } : { y: p.y, m: p.m - 1 }))} aria-label="Bulan sebelumnya"><ChevronLeftIcon /></button>
            <strong>{monthLabel(tableYm.y, tableYm.m)}</strong>
            <button className="icon-btn" onClick={() => setTableYm((p) => (p.m === 12 ? { y: p.y + 1, m: 1 } : { y: p.y, m: p.m + 1 }))} aria-label="Bulan berikutnya"><ChevronRightIcon /></button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="att">
            <thead><tr><th>Nama</th>{store.occurrences.map((o) => <th key={o.id}>{o.occurrence_date.slice(8, 10)}<br />{String(o.occurrence_time).slice(0, 5)}</th>)}</tr></thead>
            <tbody>
              {store.members.filter((m) => m.active).map((m) => (
                <tr key={m.id}>
                  <td>{m.nickname}</td>
                  {store.occurrences.map((o) => {
                    if (store.holidays?.[o.id]) return <td key={o.id} className="cell-libur">LIBUR</td>;
                    const rec = (store.attendance?.[o.id] || []).find((a) => (a.member_id || a.memberId) === m.id);
                    if (!rec) return <td key={o.id} className="cell-kosong">-</td>;
                    const st = rec.status;
                    return <td key={o.id} className={st === 'PRESENT' ? 'cell-hadir' : st === 'PERMITTED' ? 'cell-izin' : 'cell-alpha'}>{st === 'PRESENT' ? '✓' : st === 'PERMITTED' ? 'I' : 'A'}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showHoliday && (
        <Modal title="Tandai libur" onClose={() => setShowHoliday(false)} foot={<><button className="btn" onClick={() => setShowHoliday(false)}>Batal</button><button className="btn btn-primary" onClick={async () => {
          if (!occ) return;
          if (isGuest || !supabaseReady) {
            const key = occ.id;
            setStore((p) => ({ ...p, holidays: { ...p.holidays, [key]: { reason: 'Libur' } } }));
          } else {
            const reason = window.prompt('Alasan libur:') || 'Libur';
            const dbId = occDbId || await resolveDbOccurrence();
            await supabase.from('schedule_occurrences').update({ is_holiday: true }).eq('id', dbId);
            await supabase.from('holidays').insert({ account_id: account.id, occurrence_id: dbId, holiday_date: occ.occurrence_date, day_name: occ.day_name, reason });
            await loadSupabase();
          }
          setShowHoliday(false); toast('Jadwal ditandai libur.');
        }}>Simpan</button></>}>
          <p>Jadwal <strong>{occ ? formatID(occ.occurrence_date) : ''}</strong> akan ditandai libur. Absensi tidak dapat diisi dan tidak dihitung dalam persentase.</p>
        </Modal>
      )}
      {showSpecial && (
        <Modal title="Pengajian khusus" onClose={() => setShowSpecial(false)} foot={<><button className="btn" onClick={() => setShowSpecial(false)}>Batal</button><button className="btn btn-primary" onClick={() => { setShowSpecial(false); toast('Pengajian khusus tersimpan sebagai draf lokal. Lengkapi lewat menu Admin bila perlu.'); }}>Simpan</button></>}>
          <label className="field"><span>Jenis kegiatan</span>
            <select className="input">{(store.specialTypes || []).map((t) => <option key={t.id || t.name}>{t.name}</option>)}</select>
          </label>
          <div className="row cols-2">
            <label className="field"><span>Tanggal</span><input className="input" type="date" defaultValue={toISODate(todayJakarta())} /></label>
            <label className="field"><span>Waktu</span><input className="input" type="time" defaultValue="19:30" /></label>
          </div>
          <div className="banner warn"><span>Peringatan: jika tanggal bertepatan dengan jadwal pengajian umum, Anda dapat memilih jadwal umum tersebut sebagai libur. Tidak otomatis.</span></div>
        </Modal>
      )}
    </div>
  );
}
