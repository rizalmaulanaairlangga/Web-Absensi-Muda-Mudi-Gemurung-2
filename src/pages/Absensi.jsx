import React, { useEffect, useMemo, useState } from 'react';
import { useApp, clientId } from '../lib/store.jsx';
import { supabase } from '../lib/supabaseClient.js';
import { idbGet, idbSet } from '../lib/idb.js';
import { todayJakarta, toISODate, formatID, dayName, dayOfWeek, isWithinWindow, windowOpenAt, canEdit, monthLabel } from '../lib/dates.js';
import { surahName } from '../lib/quran.js';
import { DEFAULT_ABSENCE, DEFAULT_STATUS, DEFAULT_HADITH, DEFAULT_FREE, DEFAULT_SPECIAL_TYPES, DEFAULT_SPEAKERS, guestSeed } from '../lib/seed.js';
import { Modal, Empty, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, ChevronDownIcon, ClockIcon, PlusIcon, CustomSelect, EyeIcon, RefreshIcon } from '../components/ui.jsx';

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
        localKey: `${s.id}|${iso}`,
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
        localKey: `${s.id}|${iso}`,
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

function occKeyOf(occ) {
  if (!occ) return null;
  if (occ.id && !String(occ.id).startsWith('virt-')) return occ.id;
  return occ.localKey || occ.id;
}

export default function Absensi() {
  const {
    account, isGuest, online, toast, enqueue, supabaseReady,
    saveSnapshot, loadSnapshot, conflicts, resolveConflict, pendingCount, lastSyncAt,
  } = useApp();
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
  const [maleOpen, setMaleOpen] = useState(true);
  const [femaleOpen, setFemaleOpen] = useState(true);
  const [materialsOpen, setMaterialsOpen] = useState(true);
  const [tableVisible, setTableVisible] = useState(false);
  const [tableData, setTableData] = useState(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);
  const [mat, setMat] = useState({ quran: true, hadith: false, nasehat: true, free: false, surah: '36', ayat: '1-10', pemateriQ: '', hadithId: '', halaman: '', pemateriH: '', nasehatBy: '', freeId: '', freeBy: '' });
  const [specialType, setSpecialType] = useState('');

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
      await loadFormData();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);

  async function loadFormData() {
    const aid = account.id;
    try {
      const [mem, abs, sch, sett, hd, fr, sp, ktp] = await Promise.all([
        supabase.from('members').select('*').eq('account_id', aid).order('nickname'),
        supabase.from('absence_types').select('*').eq('account_id', aid),
        supabase.from('recurring_schedules').select('*').eq('account_id', aid).eq('active', true),
        supabase.from('app_settings').select('*').eq('account_id', aid).maybeSingle(),
        supabase.from('hadith_materials').select('*').eq('account_id', aid),
        supabase.from('free_activity_types').select('*').eq('account_id', aid),
        supabase.from('speakers').select('*').eq('account_id', aid),
        supabase.from('special_event_types').select('*').eq('account_id', aid),
      ]);
      let schedules = (sch.data || []).map((s) => ({
        id: s.id,
        day_of_week: s.day_of_week,
        event_time: String(s.event_time || '19:30').slice(0, 5),
        end_time: s.end_time ? String(s.end_time).slice(0, 5) : null,
        active: s.active,
      }));
      let absenceTypes = abs.data || [];
      let speakers = sp.data || [];
      let hadith = hd.data || [];
      let free = fr.data || [];
      let specialTypes = ktp.data || [];
      let reseeded = false;
      if (schedules.length === 0) {
        reseeded = true;
        const seed = [
          { day_of_week: 3, event_time: '19:30', end_time: '21:30' },
          { day_of_week: 5, event_time: '19:30', end_time: '21:30' },
        ];
        for (const s of seed) {
          const { data } = await supabase.from('recurring_schedules').insert({ account_id: aid, day_of_week: s.day_of_week, event_time: s.event_time, end_time: s.end_time }).select().single();
          if (data) schedules.push({ id: data.id, day_of_week: data.day_of_week, event_time: String(data.event_time).slice(0, 5), end_time: data.end_time ? String(data.end_time).slice(0, 5) : null, active: true });
        }
        if ((abs.data || []).length === 0) for (const n of DEFAULT_ABSENCE) await supabase.from('absence_types').insert({ account_id: aid, name: n });
        for (const n of DEFAULT_STATUS) {
          const { data: ex } = await supabase.from('member_statuses').select('id').eq('account_id', aid).eq('name', n).maybeSingle();
          if (!ex) await supabase.from('member_statuses').insert({ account_id: aid, name: n });
        }
        if ((hd.data || []).length === 0) for (const n of DEFAULT_HADITH) await supabase.from('hadith_materials').insert({ account_id: aid, name: n });
        if ((fr.data || []).length === 0) for (const n of DEFAULT_FREE) await supabase.from('free_activity_types').insert({ account_id: aid, name: n });
        if ((sp.data || []).length === 0) for (const n of DEFAULT_SPEAKERS) await supabase.from('speakers').insert({ account_id: aid, name: n });
        if ((ktp.data || []).length === 0) for (const n of DEFAULT_SPECIAL_TYPES) await supabase.from('special_event_types').insert({ account_id: aid, name: n });
      }
      const cands = formCandidates(schedules);
      const months = [...new Set(cands.map((c) => c.occurrence_date.slice(0, 7)))];
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
      const minDate = cands.length ? cands[0].occurrence_date : toISODate(todayJakarta());
      const maxDate = cands.length ? cands[cands.length - 1].occurrence_date : toISODate(todayJakarta());
      const occDb = await supabase.from('schedule_occurrences').select('*').eq('account_id', aid).gte('occurrence_date', minDate).lte('occurrence_date', maxDate).order('occurrence_date');
      const dbRows = (occDb.data || []).map((o) => ({
        id: o.id,
        localKey: `${o.recurring_schedule_id}|${o.occurrence_date}`,
        recurring_schedule_id: o.recurring_schedule_id,
        occurrence_date: o.occurrence_date,
        occurrence_time: String(o.occurrence_time).slice(0, 5),
        occurrence_end_time: o.occurrence_end_time ? String(o.occurrence_end_time).slice(0, 5) : null,
        day_name: o.day_name,
        is_holiday: o.is_holiday,
      }));
      const byKey = new Map(dbRows.map((o) => [o.localKey, o]));
      const formList = cands.map((c) => byKey.get(c.key) || { id: `virt-${c.key}`, ...c, virtual: true });
      const dbIds = dbRows.map((o) => o.id);
      let attMap = {};
      let holMap = {};
      if (dbIds.length > 0) {
        const attDb = await supabase.from('attendance').select('*').in('occurrence_id', dbIds);
        (attDb.data || []).forEach((a) => { (attMap[a.occurrence_id] ||= []).push(a); });
        const holDb = await supabase.from('holidays').select('*').gte('holiday_date', minDate).lte('holiday_date', maxDate);
        holMap = Object.fromEntries((holDb.data || []).filter((h) => h.account_id === aid).map((h) => [h.occurrence_id, h]));
      }
      if (!absenceTypes.length) absenceTypes = DEFAULT_ABSENCE.map((n) => ({ name: n }));
      if (reseeded) {
        try {
          const [rAbs, rSp, rHd, rFr, rKt] = await Promise.all([
            supabase.from('absence_types').select('*').eq('account_id', aid),
            supabase.from('speakers').select('*').eq('account_id', aid),
            supabase.from('hadith_materials').select('*').eq('account_id', aid),
            supabase.from('free_activity_types').select('*').eq('account_id', aid),
            supabase.from('special_event_types').select('*').eq('account_id', aid),
          ]);
          if (rAbs.data?.length) absenceTypes = rAbs.data;
          if (rSp.data?.length) speakers = rSp.data;
          if (rHd.data?.length) hadith = rHd.data;
          if (rFr.data?.length) free = rFr.data;
          if (rKt.data?.length) specialTypes = rKt.data;
        } catch { /* gunakan data awal */ }
      }
      const s = {
        accountId: aid,
        members: (mem.data || []).map((m) => ({ id: m.id, full_name: m.full_name, nickname: m.nickname, gender: m.gender, joined_at: m.joined_at, active: m.active })),
        absenceTypes,
        schedules,
        lockHours: sett.data?.lock_duration_hours ?? 24,
        occurrences: [],
        attendance: attMap,
        holidays: holMap,
        speakers,
        hadith,
        free,
        specialTypes,
      };
      setStore(s);
      setFormOccs(formList);
      if (!selectedKey && formList.length) {
        const today = toISODate(todayJakarta());
        const up = formList.find((o) => o.occurrence_date >= today) || formList[formList.length - 1];
        setSelectedKey(up.id);
      }
      await saveSnapshot(aid, {
        members: s.members, absenceTypes: s.absenceTypes, schedules: s.schedules,
        lockHours: s.lockHours, speakers: s.speakers, hadith: s.hadith, free: s.free,
        specialTypes: s.specialTypes, occurrences: dbRows, attendance: attMap, holidays: holMap,
      });
    } catch (e) {
      const netErr = !navigator.onLine || /failed to fetch|network|timeout/i.test(String(e?.message || e || ''));
      if (netErr) {
        const snap = await loadSnapshot(account.id);
        if (snap && snap.members) {
          const cands = formCandidates(snap.schedules || []);
          const byKey = new Map((snap.occurrences || []).map((o) => [o.localKey || `${o.recurring_schedule_id}|${o.occurrence_date}`, o]));
          const formList = cands.map((c) => byKey.get(c.key) || { id: `virt-${c.key}`, ...c, virtual: true });
          setStore({
            accountId: account.id,
            members: snap.members, absenceTypes: snap.absenceTypes || [], schedules: snap.schedules || [],
            lockHours: snap.lockHours ?? 24, occurrences: [], attendance: snap.attendance || {}, holidays: snap.holidays || {},
            speakers: snap.speakers || [], hadith: snap.hadith || [], free: snap.free || [], specialTypes: snap.specialTypes || [],
            offline: true,
          });
          setFormOccs(formList);
          if (!selectedKey && formList.length) {
            const today = toISODate(todayJakarta());
            const up = formList.find((o) => o.occurrence_date >= today) || formList[formList.length - 1];
            setSelectedKey(up.id);
          }
          toast('Anda sedang offline. Menampilkan data terakhir yang tersimpan di perangkat.');
          return;
        }
        setStore({
          accountId: account.id, members: [], absenceTypes: [], schedules: [], lockHours: 24,
          occurrences: [], attendance: {}, holidays: {}, speakers: [], hadith: [], free: [], specialTypes: [], offline: true, empty: true,
        });
        toast('Anda sedang offline dan belum ada data tersimpan. Hubungkan internet sekali untuk memuat awal.');
      } else {
        toast('Gagal memuat data. Periksa koneksi lalu coba lagi.');
      }
    }
  }

  async function loadTable(ymOverride) {
    const ym = ymOverride || tableYm;
    if (!store || !account) return;
    if (isGuest || !supabaseReady) {
      const local = await idbGet('guest-data', null);
      const occ = occurrencesForMonth(local?.schedules || store.schedules, ym.y, ym.m);
      setTableData({ occurrences: occ, attendance: local?.attendance || store.attendance || {}, holidays: local?.holidays || {} });
      return;
    }
    setTableLoading(true);
    try {
      const aid = account.id;
      const virt = occurrencesForMonth(store.schedules, ym.y, ym.m);
      for (const o of virt) {
        await supabase.from('schedule_occurrences').upsert({
          account_id: aid, recurring_schedule_id: o.recurring_schedule_id, occurrence_date: o.occurrence_date,
          occurrence_time: o.occurrence_time, occurrence_end_time: o.occurrence_end_time, day_name: o.day_name,
        }, { onConflict: 'account_id,recurring_schedule_id,occurrence_date', ignoreDuplicates: true });
      }
      const first = `${ym.y}-${String(ym.m).padStart(2, '0')}-01`;
      const last = `${ym.y}-${String(ym.m).padStart(2, '0')}-31`;
      const occDb = await supabase.from('schedule_occurrences').select('*').eq('account_id', aid).gte('occurrence_date', first).lte('occurrence_date', last).order('occurrence_date');
      const rows = (occDb.data || []).map((o) => ({
        id: o.id, localKey: `${o.recurring_schedule_id}|${o.occurrence_date}`,
        recurring_schedule_id: o.recurring_schedule_id, occurrence_date: o.occurrence_date,
        occurrence_time: String(o.occurrence_time).slice(0, 5),
        occurrence_end_time: o.occurrence_end_time ? String(o.occurrence_end_time).slice(0, 5) : null,
        day_name: o.day_name, is_holiday: o.is_holiday,
      }));
      const ids = rows.map((o) => o.id);
      let attMap = {};
      let holMap = {};
      if (ids.length > 0) {
        const attDb = await supabase.from('attendance').select('*').in('occurrence_id', ids);
        (attDb.data || []).forEach((a) => { (attMap[a.occurrence_id] ||= []).push(a); });
        const holDb = await supabase.from('holidays').select('*').eq('account_id', aid).gte('holiday_date', first).lte('holiday_date', last);
        holMap = Object.fromEntries((holDb.data || []).map((h) => [h.occurrence_id, h]));
      }
      setTableData({ occurrences: rows, attendance: attMap, holidays: holMap });
    } catch {
      toast('Gagal memuat tabel. Periksa koneksi lalu coba lagi.');
    }
    setTableLoading(false);
  }

  useEffect(() => {
    if (tableVisible && store && !tableData) loadTable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableVisible]);

  useEffect(() => {
    if (tableVisible && tableData) loadTable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableYm.m, tableYm.y]);

  useEffect(() => {
    if (lastSyncAt > 0 && store && account && !isGuest && supabaseReady && online) {
      loadFormData();
      if (tableVisible) loadTable();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSyncAt]);

  const occ = useMemo(() => {
    if (!store) return null;
    const inForm = formOccs.find((o) => o.id === selectedKey);
    if (inForm) return inForm;
    return formOccs[0] || null;
  }, [store, formOccs, selectedKey]);

  const attendanceKey = occKeyOf(occ);
  const submitted = useMemo(() => {
    if (!occ || !store) return false;
    const keys = [occ.id, occ.localKey].filter(Boolean);
    return keys.some((k) => (store.attendance?.[k] || []).length > 0);
  }, [store, occ]);
  const eligible = useMemo(() => {
    if (!store || !occ) return [];
    return store.members.filter((m) => m.active && (!m.joined_at || m.joined_at <= occ.occurrence_date));
  }, [store, occ]);
  const males = eligible.filter((m) => m.gender === 'MALE');
  const females = eligible.filter((m) => m.gender === 'FEMALE');

  const myConflicts = useMemo(() => {
    if (!occ || !conflicts.length) return [];
    return conflicts.filter((op) => {
      if (!op.occurrence) return false;
      return op.occurrence.recurring_schedule_id === occ.recurring_schedule_id
        && op.occurrence.occurrence_date === occ.occurrence_date;
    });
  }, [conflicts, occ]);

  useEffect(() => {
    if (!occ || !store || !account) return;
    const key = attendanceKey;
    (async () => {
      if (editing) {
        const saved = key ? store.attendance?.[key] : null;
        if (saved?.length) {
          const map = {};
          saved.forEach((a) => { map[a.member_id] = a.status === 'PRESENT' ? { hadir: true } : a.status === 'PERMITTED' ? { izin: a.absence_name_snapshot || '' } : {}; });
          setAnswers(map);
        } else if (!isGuest && supabaseReady && online && occ.id && !String(occ.id).startsWith('virt-')) {
          try {
            const attDb = await supabase.from('attendance').select('*').eq('occurrence_id', occ.id);
            if ((attDb.data || []).length > 0) {
              const map = {};
              attDb.data.forEach((a) => { map[a.member_id] = a.status === 'PRESENT' ? { hadir: true } : a.status === 'PERMITTED' ? { izin: a.absence_name_snapshot || '' } : {}; });
              setAnswers(map);
              setStore((p) => ({ ...p, attendance: { ...p.attendance, [occ.id]: attDb.data } }));
            }
            const matDb = await supabase.from('materials').select('*').eq('occurrence_id', occ.id);
            if ((matDb.data || []).length > 0) {
              const byKind = {};
              matDb.data.forEach((r) => { byKind[r.kind] = r; });
              setMat((p) => ({
                ...p,
                quran: Boolean(byKind.QURAN) || p.quran,
                surah: byKind.QURAN?.quran_surah_number ? String(byKind.QURAN.quran_surah_number) : p.surah,
                ayat: byKind.QURAN?.ayat_range || p.ayat,
                pemateriQ: byKind.QURAN?.speaker_name_snapshot || p.pemateriQ,
                hadith: Boolean(byKind.HADITH),
                hadithId: byKind.HADITH?.hadith_name_snapshot || '',
                halaman: byKind.HADITH?.hadith_page || '',
                pemateriH: byKind.HADITH?.speaker_name_snapshot || '',
                nasehat: Boolean(byKind.NASEHAT),
                nasehatBy: byKind.NASEHAT?.speaker_name_snapshot || '',
                free: Boolean(byKind.FREE),
                freeId: byKind.FREE?.free_activity_name_snapshot || '',
                freeBy: byKind.FREE?.speaker_name_snapshot || '',
              }));
            }
          } catch { /* abaikan, gunakan state lokal */ }
        }
      } else if (!submitted && key) {
        idbGet(`draft-${account.id}-${key}`, null).then((d) => { if (d?.answers) setAnswers(d.answers); });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occ?.id, editing]);

  useEffect(() => {
    if (!occ || !account || !attendanceKey) return;
    if (!submitted && !editing) idbSet(`draft-${account.id}-${attendanceKey}`, { answers, mat });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, mat]);

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

  function buildMats() {
    const arr = [];
    if (mat.quran && surah) arr.push({ clientId: clientId('m'), kind: 'QURAN', surah: Number(mat.surah), surahName: surah, ayat: mat.ayat, speaker: mat.pemateriQ || null });
    if (mat.hadith && mat.hadithId) arr.push({ clientId: clientId('m'), kind: 'HADITH', hadith: mat.hadithId, halaman: mat.halaman || null, speaker: mat.pemateriH || null });
    if (mat.nasehat && mat.nasehatBy) arr.push({ clientId: clientId('m'), kind: 'NASEHAT', speaker: mat.nasehatBy });
    if (mat.free && mat.freeId) arr.push({ clientId: clientId('m'), kind: 'FREE', activity: mat.freeId, speaker: mat.freeBy || null });
    return arr;
  }

  function occDescriptor() {
    return {
      recurring_schedule_id: occ.recurring_schedule_id,
      occurrence_date: occ.occurrence_date,
      occurrence_time: occ.occurrence_time,
      occurrence_end_time: occ.occurrence_end_time || null,
      day_name: occ.day_name,
    };
  }

  async function persistLocalOverlay(key, recs) {
    setStore((p) => {
      const next = { ...p, attendance: { ...p.attendance, [key]: recs } };
      saveSnapshot(account.id, {
        members: next.members, absenceTypes: next.absenceTypes, schedules: next.schedules,
        lockHours: next.lockHours, speakers: next.speakers, hadith: next.hadith, free: next.free,
        specialTypes: next.specialTypes, occurrences: [], attendance: next.attendance, holidays: next.holidays,
      });
      return next;
    });
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
        return { member_id: m.id, member_name: m.nickname || m.full_name, status, absence: a.izin || null };
      });
      const mats = buildMats();
      if (isGuest || !supabaseReady) {
        const key = occ.id;
        const recs = rows.map((r) => ({ member_id: r.member_id, member_name_snapshot: r.member_name, status: r.status, absence_name_snapshot: r.absence }));
        setStore((p) => ({ ...p, attendance: { ...p.attendance, [key]: recs } }));
        const local = await idbGet('guest-data', null);
        if (local) await idbSet('guest-data', { ...local, attendance: { ...(local.attendance || {}), [key]: recs } });
      } else if (!online) {
        const key = occKeyOf(occ);
        const recs = rows.map((r) => ({ member_id: r.member_id, member_name_snapshot: r.member_name, status: r.status, absence_name_snapshot: r.absence }));
        await enqueue({ type: 'SAVE_ATTENDANCE', accountId: account.id, occurrence: occDescriptor(), rows, mats });
        await persistLocalOverlay(key, recs);
        toast('Tersimpan di perangkat. Akan dikirim otomatis saat koneksi kembali.');
      } else {
        try {
          const { data: dbOcc, error: occErr } = await supabase.from('schedule_occurrences').upsert({
            account_id: account.id,
            recurring_schedule_id: occ.recurring_schedule_id,
            occurrence_date: occ.occurrence_date,
            occurrence_time: occ.occurrence_time,
            occurrence_end_time: occ.occurrence_end_time || null,
            day_name: occ.day_name,
          }, { onConflict: 'account_id,recurring_schedule_id,occurrence_date' }).select().single();
          if (occErr) throw occErr;
          for (const r of rows) {
            const { error } = await supabase.from('attendance').upsert({ account_id: account.id, occurrence_id: dbOcc.id, member_id: r.member_id, status: r.status, absence_name_snapshot: r.absence, member_name_snapshot: r.member_name }, { onConflict: 'account_id,occurrence_id,member_id' });
            if (error) throw error;
          }
          for (const mm of mats) {
            const payload = { id: mm.clientId, account_id: account.id, occurrence_id: dbOcc.id, kind: mm.kind };
            if (mm.kind === 'QURAN') { payload.quran_surah_number = mm.surah; payload.quran_surah_name_snapshot = mm.surahName; payload.ayat_range = mm.ayat; payload.speaker_name_snapshot = mm.speaker; }
            if (mm.kind === 'HADITH') { payload.hadith_name_snapshot = mm.hadith; payload.hadith_page = mm.halaman; payload.speaker_name_snapshot = mm.speaker; }
            if (mm.kind === 'NASEHAT') { payload.speaker_name_snapshot = mm.speaker; }
            if (mm.kind === 'FREE') { payload.free_activity_name_snapshot = mm.activity; payload.speaker_name_snapshot = mm.speaker; }
            const { error } = await supabase.from('materials').upsert(payload, { onConflict: 'id' });
            if (error) throw error;
          }
          try {
            await supabase.from('audit_logs').insert({ account_id: account.id, action: submitted ? 'UPDATE_ATTENDANCE' : 'CREATE_ATTENDANCE', entity_type: 'attendance', entity_id: dbOcc.id, new_data: { count: rows.length } });
          } catch { /* audit best-effort */ }
          const recs = rows.map((r) => ({ member_id: r.member_id, member_name_snapshot: r.member_name, status: r.status, absence_name_snapshot: r.absence }));
          setStore((p) => ({ ...p, attendance: { ...p.attendance, [dbOcc.id]: recs } }));
          if (tableVisible) await loadTable();
          toast(`Absensi ${formatID(occ.occurrence_date)} berhasil disimpan.`);
        } catch (e) {
          const netErr = !navigator.onLine || /failed to fetch|network|timeout/i.test(String(e?.message || e || ''));
          if (netErr) {
            const key = occKeyOf(occ);
            const recs = rows.map((r) => ({ member_id: r.member_id, member_name_snapshot: r.member_name, status: r.status, absence_name_snapshot: r.absence }));
            await enqueue({ type: 'SAVE_ATTENDANCE', accountId: account.id, occurrence: occDescriptor(), rows, mats });
            await persistLocalOverlay(key, recs);
            toast('Koneksi terputus. Data tersimpan di perangkat dan akan dikirim otomatis.');
          } else {
            throw e;
          }
        }
      }
      if (isGuest || !supabaseReady) toast(`Absensi ${formatID(occ.occurrence_date)} berhasil disimpan.`);
      setEditing(false);
    } catch { toast('Data gagal disimpan. Periksa koneksi internet dan coba lagi.'); }
    setSaving(false);
  }

  if (!account) return <div className="card"><Empty title="Perlu masuk" desc="Masuk atau lanjut sebagai tamu untuk mengisi absensi." /></div>;
  if (!store) return <div className="card"><div className="skeleton" style={{ height: 120 }} /><p className="hint">Memuat data...</p></div>;
  if (store.empty) {
    return (
      <div>
        {!online && <div className="banner warn"><span>Anda sedang offline. Perubahan akan disimpan di perangkat dan dikirim saat koneksi kembali.</span></div>}
        <div className="card"><Empty title="Belum ada data offline" desc="Hubungkan internet sekali untuk memuat anggota dan jadwal, setelah itu form dapat digunakan offline." /></div>
      </div>
    );
  }

  const todayStr = toISODate(todayJakarta());
  const todayDow = todayJakarta().getDay();
  const hasScheduleToday = store.schedules.some((s) => s.day_of_week === todayDow);
  const recentPool = formOccs.length ? formOccs : [];
  const prevUnfilled = recentPool.find((o) => {
    const key = occKeyOf(o);
    return o.occurrence_date < todayStr && !(store.attendance?.[key]?.length) && !store.holidays?.[key];
  });

  function renderGroup(title, kind, list, open, setOpen) {
    return (
      <section className={`member-group ${kind}`} aria-label={title}>
        <div className="member-group-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 className="member-group-title">{title}</h3>
            <span className="member-count">{list.length} orang</span>
          </div>
          <button
            type="button"
            className="collapse-btn"
            aria-expanded={open}
            aria-label={open ? `Sembunyikan ${title}` : `Tampilkan ${title}`}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <ChevronUpIcon /> : <ChevronDownIcon />}
            <span>{open ? 'Sembunyikan' : 'Tampilkan'}</span>
          </button>
        </div>
        {!open && <p className="hint" style={{ margin: 0 }}>Bagian disembunyikan. Data yang sudah diisi tetap tersimpan.</p>}
        {open && list.length === 0 && <p className="hint">Belum ada anggota.</p>}
        {open && list.length > 0 && (
          <div className="member-rows">
            {list.map((m) => {
              const a = answers[m.id] || {};
              const izinVal = a.izin || '';
              return (
                <div className="member-row" key={m.id}>
                  <input type="checkbox" checked={!!a.hadir} disabled={!!izinVal} onChange={(e) => setHadir(m.id, e.target.checked)} aria-label={`Hadir ${m.nickname || m.full_name}`} />
                  <span className="member-name">{m.nickname || m.full_name}</span>
                  <CustomSelect
                    value={izinVal}
                    ariaLabel={`Izin ${m.nickname || m.full_name}`}
                    placeholder="Tidak ada izin"
                    disabled={!!a.hadir}
                    options={[{ value: '', label: 'Tidak ada izin' }, ...(store.absenceTypes || []).map((t) => ({ value: t.name, label: t.name }))]}
                    onChange={(v) => setIzin(m.id, v)}
                  />
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
      {!online && <div className="banner warn"><span>Anda sedang offline. Perubahan akan disimpan di perangkat dan dikirim saat koneksi kembali.{pendingCount > 0 ? ` ${pendingCount} perubahan menunggu sinkron.` : ''}</span></div>}
      {conflicts.length > 0 && (
        <div className="banner warn">
          <span>Ada {conflicts.length} data yang berbeda dengan server dan perlu keputusan Anda.</span>
          <button className="btn" style={{ marginLeft: 'auto', minHeight: 36 }} onClick={() => setShowConflicts(true)}>Lihat</button>
        </div>
      )}

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
          <CustomSelect
            value={selectedKey || ''}
            ariaLabel="Pilih jadwal"
            placeholder="Pilih jadwal"
            options={(formOccs.length ? formOccs : []).map((o) => {
              const key = occKeyOf(o);
              return {
                value: o.id,
                label: `${formatID(o.occurrence_date)} • ${timeRange(o.occurrence_time, o.occurrence_end_time)}${store.attendance?.[key]?.length ? ' • Sudah diisi' : ''}${store.holidays?.[key] ? ' • Libur' : ''}`,
              };
            })}
            onChange={(v) => { setSelectedKey(v); setEditing(false); setAnswers({}); }}
          />
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
              {renderGroup('LAKI-LAKI', 'male', males, maleOpen, setMaleOpen)}
              {renderGroup('PEREMPUAN', 'female', females, femaleOpen, setFemaleOpen)}
            </div>

            <div className="material-group">
              <div className="material-group-head">
                <h3 style={{ margin: 0 }}>Materi Pengajian</h3>
                <button
                  type="button"
                  className="collapse-btn"
                  aria-expanded={materialsOpen}
                  aria-label={materialsOpen ? 'Sembunyikan materi pengajian' : 'Tampilkan materi pengajian'}
                  onClick={() => setMaterialsOpen((v) => !v)}
                >
                  {materialsOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                  <span>{materialsOpen ? 'Sembunyikan' : 'Tampilkan'}</span>
                </button>
              </div>
              {!materialsOpen && <p className="hint" style={{ margin: '8px 0 0' }}>Materi disembunyikan. Isian tetap tersimpan.</p>}
              {materialsOpen && (
                <>
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
                          <CustomSelect value={mat.pemateriQ} ariaLabel="Pemateri Al-Quran" placeholder="Pilih pemateri"
                            options={[{ value: '', label: 'Pilih pemateri' }, ...(store.speakers || []).map((s) => ({ value: s.name, label: s.name }))]}
                            onChange={(v) => setMat({ ...mat, pemateriQ: v })} />
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
                            <CustomSelect value={mat.hadithId} ariaLabel="Pilih hadist" placeholder="Pilih hadist"
                              options={[{ value: '', label: 'Pilih hadist' }, ...(store.hadith || []).map((h) => ({ value: h.name, label: h.name }))]}
                              onChange={(v) => setMat({ ...mat, hadithId: v })} />
                          </label>
                          <label className="field"><span>Halaman</span><input className="input" value={mat.halaman} onChange={(e) => setMat({ ...mat, halaman: e.target.value })} /></label>
                        </div>
                        <label className="field"><span>Pemateri</span>
                          <CustomSelect value={mat.pemateriH} ariaLabel="Pemateri Hadist" placeholder="Pilih pemateri"
                            options={[{ value: '', label: 'Pilih pemateri' }, ...(store.speakers || []).map((s) => ({ value: s.name, label: s.name }))]}
                            onChange={(v) => setMat({ ...mat, pemateriH: v })} />
                        </label>
                      </div>
                    )}
                  </div>
                  <div className={`material-card${mat.nasehat ? '' : ' off'}`}>
                    <div className="material-toggle"><span>Nasehat</span><label className="switch"><input type="checkbox" checked={mat.nasehat} onChange={(e) => setMat({ ...mat, nasehat: e.target.checked })} aria-label="Aktifkan materi Nasehat" /><span className="track" /></label></div>
                    {mat.nasehat && (
                      <div className="material-card-body">
                        <label className="field"><span>Penyampai nasehat</span>
                          <CustomSelect value={mat.nasehatBy} ariaLabel="Penyampai nasehat" placeholder="Pilih penyampai"
                            options={[{ value: '', label: 'Pilih penyampai' }, ...(store.speakers || []).map((s) => ({ value: s.name, label: s.name }))]}
                            onChange={(v) => setMat({ ...mat, nasehatBy: v })} />
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
                            <CustomSelect value={mat.freeId} ariaLabel="Pilih kegiatan" placeholder="Pilih kegiatan"
                              options={[{ value: '', label: 'Pilih kegiatan' }, ...(store.free || []).map((f) => ({ value: f.name, label: f.name }))]}
                              onChange={(v) => setMat({ ...mat, freeId: v })} />
                          </label>
                          <label className="field"><span>Penanggung jawab</span>
                            <CustomSelect value={mat.freeBy} ariaLabel="Pilih penanggung jawab" placeholder="Pilih penanggung jawab"
                              options={[{ value: '', label: 'Pilih penanggung jawab' }, ...(store.speakers || []).map((s) => ({ value: s.name, label: s.name }))]}
                              onChange={(v) => setMat({ ...mat, freeBy: v })} />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </>
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
        {!tableVisible ? (
          <div className="table-placeholder">
            <p className="card-desc" style={{ marginBottom: 12 }}>Data absensi belum ditampilkan.</p>
            <button className="btn btn-primary" onClick={() => setTableVisible(true)}><EyeIcon /> Tampilkan Data Absensi</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <button className="btn" style={{ minHeight: 40 }} disabled={tableLoading} onClick={() => loadTable()}><RefreshIcon /> {tableLoading ? 'Memuat...' : 'Refresh'}</button>
            </div>
            {!tableData ? (
              <p className="hint">{tableLoading ? 'Memuat data absensi...' : 'Menyiapkan tabel...'}</p>
            ) : (
              <div className="table-wrap">
                <table className="att">
                  <thead><tr><th>Nama</th>{tableData.occurrences.map((o) => <th key={o.id}>{o.occurrence_date.slice(8, 10)}<br />{String(o.occurrence_time).slice(0, 5)}</th>)}</tr></thead>
                  <tbody>
                    {(store.members || []).filter((m) => m.active).map((m) => (
                      <tr key={m.id}>
                        <td>{m.nickname || m.full_name}</td>
                        {tableData.occurrences.map((o) => {
                          if (tableData.holidays?.[o.id]) return <td key={o.id} className="cell-libur">LIBUR</td>;
                          const rec = (tableData.attendance?.[o.id] || []).find((a) => (a.member_id || a.memberId) === m.id);
                          if (!rec) return <td key={o.id} className="cell-kosong">-</td>;
                          const st = rec.status;
                          return <td key={o.id} className={st === 'PRESENT' ? 'cell-hadir' : st === 'PERMITTED' ? 'cell-izin' : 'cell-alpha'}>{st === 'PRESENT' ? '✓' : st === 'PERMITTED' ? 'I' : 'A'}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {showHoliday && (
        <Modal title="Tandai libur" onClose={() => setShowHoliday(false)} foot={<><button className="btn" onClick={() => setShowHoliday(false)}>Batal</button><button className="btn btn-primary" onClick={async () => {
          if (!occ) return;
          if (isGuest || !supabaseReady) {
            const key = occ.id;
            setStore((p) => ({ ...p, holidays: { ...p.holidays, [key]: { reason: 'Libur' } } }));
          } else if (!online) {
            toast('Anda sedang offline. Tandai libur akan tersedia saat koneksi kembali.');
          } else {
            const reason = window.prompt('Alasan libur:') || 'Libur';
            const { data: dbOcc } = await supabase.from('schedule_occurrences').upsert({
              account_id: account.id, recurring_schedule_id: occ.recurring_schedule_id, occurrence_date: occ.occurrence_date,
              occurrence_time: occ.occurrence_time, occurrence_end_time: occ.occurrence_end_time || null, day_name: occ.day_name,
            }, { onConflict: 'account_id,recurring_schedule_id,occurrence_date' }).select().single();
            if (dbOcc) {
              await supabase.from('schedule_occurrences').update({ is_holiday: true }).eq('id', dbOcc.id);
              await supabase.from('holidays').insert({ account_id: account.id, occurrence_id: dbOcc.id, holiday_date: occ.occurrence_date, day_name: occ.day_name, reason });
              await loadFormData();
              if (tableVisible) await loadTable();
            }
          }
          setShowHoliday(false); toast('Jadwal ditandai libur.');
        }}>Simpan</button></>}>
          <p>Jadwal <strong>{occ ? formatID(occ.occurrence_date) : ''}</strong> akan ditandai libur. Absensi tidak dapat diisi dan tidak dihitung dalam persentase.</p>
        </Modal>
      )}
      {showSpecial && (
        <Modal title="Pengajian khusus" onClose={() => setShowSpecial(false)} foot={<><button className="btn" onClick={() => setShowSpecial(false)}>Batal</button><button className="btn btn-primary" onClick={() => { setShowSpecial(false); toast('Pengajian khusus tersimpan sebagai draf lokal. Lengkapi lewat menu Admin bila perlu.'); }}>Simpan</button></>}>
          <label className="field"><span>Jenis kegiatan</span>
            <CustomSelect value={specialType} ariaLabel="Jenis kegiatan khusus" placeholder="Pilih jenis kegiatan"
              options={(store.specialTypes || []).map((t) => ({ value: t.name, label: t.name }))}
              onChange={setSpecialType} />
          </label>
          <div className="row cols-2">
            <label className="field"><span>Tanggal</span><input className="input" type="date" defaultValue={toISODate(todayJakarta())} /></label>
            <label className="field"><span>Waktu</span><input className="input" type="time" defaultValue="19:30" /></label>
          </div>
          <div className="banner warn"><span>Peringatan: jika tanggal bertepatan dengan jadwal pengajian umum, Anda dapat memilih jadwal umum tersebut sebagai libur. Tidak otomatis.</span></div>
        </Modal>
      )}
      {showConflicts && (
        <Modal title="Perbedaan data dengan server" onClose={() => setShowConflicts(false)} foot={<button className="btn" onClick={() => setShowConflicts(false)}>Tutup</button>}>
          <p className="card-desc">Data di perangkat berbeda dengan data server. Pilih data yang dipertahankan untuk setiap jadwal.</p>
          {(myConflicts.length ? myConflicts : conflicts).map((op) => (
            <div className="conflict-row" key={op.id}>
              <div>
                <strong>{op.occurrence?.occurrence_date ? formatID(op.occurrence.occurrence_date) : 'Jadwal'}</strong>
                <p className="hint">Server sudah memiliki data yang berbeda, dibuat setelah perubahan lokal.</p>
              </div>
              <div className="conflict-actions">
                <button className="btn" onClick={async () => { await resolveConflict(op.id, 'server'); await loadFormData(); if (tableVisible) await loadTable(); }}>Gunakan Data Server</button>
                <button className="btn btn-primary" onClick={async () => { await resolveConflict(op.id, 'local'); await loadFormData(); if (tableVisible) await loadTable(); }}>Gunakan Data Lokal</button>
              </div>
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}
