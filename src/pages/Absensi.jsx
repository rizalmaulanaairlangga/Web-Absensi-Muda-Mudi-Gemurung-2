import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useApp, clientId, withTimeout } from '../lib/store.jsx';
import { createAttendanceOp, createHolidayOp, createCancelHolidayOp } from '../services/sync/syncQueue.js';
import { loadMastersCache, saveMastersCache, ensureMasterLists } from '../lib/masters.js';
import { SpecialEventModal, SpecialDetail } from '../components/SpecialEvent.jsx';
import { supabase } from '../lib/supabaseClient.js';
import { idbGet, idbSet } from '../lib/idb.js';
import { todayJakarta, toISODate, formatID, dayName, dayOfWeek, isWithinWindow, windowOpenAt, canEdit, monthLabel, scheduleStatus } from '../lib/dates.js';
import { surahName } from '../lib/quran.js';
import { DEFAULT_ABSENCE, DEFAULT_STATUS, DEFAULT_HADITH, DEFAULT_FREE, DEFAULT_SPECIAL_TYPES, DEFAULT_SPEAKERS, guestSeed } from '../lib/seed.js';
import { Modal, Empty, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, ChevronDownIcon, ClockIcon, PlusIcon, CustomSelect, EyeIcon, RefreshIcon, TrashIcon, PencilIcon, MonthPicker, StatusBadge } from '../components/ui.jsx';
import QrScanner, { shortQr } from '../components/QrScanner.jsx';
import MemberRow from '../components/MemberRow.jsx';

function timeRange(start, end) {
  const s = String(start || '').slice(0, 5);
  const e = String(end || '').slice(0, 5);
  return e && e !== s ? `${s} – ${e}` : s;
}

function blankStore(accountId) {
  return {
    accountId,
    members: guestSeed().map((m, i) => ({ id: `seed-${i}`, account_id: accountId, full_name: m.full_name, nickname: m.nickname, gender: m.gender, status: i % 3 === 0 ? 'Sekolah' : i % 3 === 1 ? 'Kuliah' : 'Bekerja', joined_at: '2025-01-05', active: true, qr_identifier: null })),
    absenceTypes: DEFAULT_ABSENCE.map((n, i) => ({ id: `iz-${i}`, name: n })),
    statuses: DEFAULT_STATUS.map((n, i) => ({ id: `st-${i}`, name: n })),
    hadith: DEFAULT_HADITH.map((n, i) => ({ id: `hd-${i}`, name: n })),
    free: DEFAULT_FREE.map((n, i) => ({ id: `fr-${i}`, name: n })),
    speakers: DEFAULT_SPEAKERS.map((n, i) => ({ id: `sp-${i}`, name: n })),
    specialTypes: DEFAULT_SPECIAL_TYPES.map((n, i) => ({ id: `kt-${i}`, name: n })),
    schedules: [
      { id: 'sch-rabu', day_of_week: 3, event_time: '19:30', end_time: '21:00', active: true },
      { id: 'sch-jumat', day_of_week: 5, event_time: '19:30', end_time: '21:00', active: true },
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

const MAT_OFF = { quran: false, hadith: false, nasehat: false, free: false };

function MAT_EMPTY() {
  return { ...MAT_OFF, surah: '', ayat: '', pemateriQ: '', hadithId: '', halaman: '', pemateriH: '', nasehatBy: '', freeId: '', freeBy: '' };
}

function serverMatsToForm(rows) {
  const byKind = {};
  (rows || []).forEach((r) => { byKind[r.kind] = r; });
  return {
    quran: Boolean(byKind.QURAN),
    surah: byKind.QURAN?.quran_surah_number ? String(byKind.QURAN.quran_surah_number) : '',
    ayat: byKind.QURAN?.ayat_range || '',
    pemateriQ: byKind.QURAN?.speaker_name_snapshot || '',
    hadith: Boolean(byKind.HADITH),
    hadithId: byKind.HADITH?.hadith_name_snapshot || '',
    halaman: byKind.HADITH?.hadith_page || '',
    pemateriH: byKind.HADITH?.speaker_name_snapshot || '',
    nasehat: Boolean(byKind.NASEHAT),
    nasehatBy: byKind.NASEHAT?.speaker_name_snapshot || '',
    free: Boolean(byKind.FREE),
    freeId: byKind.FREE?.free_activity_name_snapshot || '',
    freeBy: byKind.FREE?.speaker_name_snapshot || '',
  };
}

function devEdit(...args) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[EDIT]', ...args);
  }
}

function clientMatsToServer(mats, occurrenceId) {
  return (mats || []).map((mm) => {
    const r = { kind: mm.kind, occurrence_id: occurrenceId };
    if (mm.kind === 'QURAN') { r.quran_surah_number = mm.surah ?? null; r.quran_surah_name_snapshot = mm.surahName || null; r.ayat_range = mm.ayat || null; r.speaker_name_snapshot = mm.speaker || null; }
    if (mm.kind === 'HADITH') { r.hadith_name_snapshot = mm.hadith || null; r.hadith_page = mm.halaman || null; r.speaker_name_snapshot = mm.speaker || null; }
    if (mm.kind === 'NASEHAT') { r.speaker_name_snapshot = mm.speaker || null; }
    if (mm.kind === 'FREE') { r.free_activity_name_snapshot = mm.activity || null; r.speaker_name_snapshot = mm.speaker || null; }
    return r;
  });
}

function QrResultPanel({ result, onScanAgain, onDone, onConfirmIzin, onRegister, onRetry, saving }) {
  if (!result) return null;
  const name = result.member ? (result.member.nickname || result.member.full_name) : '';
  if (result.kind === 'marked') {
    return (
      <div className="qr-result" role="status" style={{ marginBottom: 12 }}>
        <strong>✓ {name} — Hadir</strong>
        <span className="hint">Absensi langsung tersimpan. Tetap tekan Kirim Absensi setelah semua terisi.</span>
        <div className="qr-actions">
          <button type="button" className="btn btn-primary" onClick={onScanAgain}>Scan Anggota Berikutnya</button>
          <button type="button" className="btn" onClick={onDone}>Selesai</button>
        </div>
      </div>
    );
  }
  if (result.kind === 'already') {
    return (
      <div className="qr-result" role="status" style={{ marginBottom: 12 }}>
        <strong>{name} ✓ Sudah ditandai hadir</strong>
        <div className="qr-actions">
          <button type="button" className="btn btn-primary" onClick={onScanAgain}>Scan Anggota Berikutnya</button>
          <button type="button" className="btn" onClick={onDone}>Selesai</button>
        </div>
      </div>
    );
  }
  if (result.kind === 'confirm-izin') {
    return (
      <div className="qr-result warn" role="alert" style={{ marginBottom: 12 }}>
        <strong>{name} saat ini Izin — {result.izinName}</strong>
        <span className="hint">Apakah ingin mengubah menjadi Hadir?</span>
        <div className="qr-actions">
          <button type="button" className="btn" disabled={saving} onClick={onDone}>Batal</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={onConfirmIzin}>{saving ? 'Menyimpan...' : 'Ubah menjadi Hadir'}</button>
        </div>
      </div>
    );
  }
  if (result.kind === 'unknown') {
    return (
      <div className="qr-result bad" role="alert" style={{ marginBottom: 12 }}>
        <strong>QR belum terdaftar</strong>
        <span className="qr-id">{shortQr(result.raw, 24, 12)}</span>
        <span className="hint">QR ini belum dikaitkan dengan anggota di aplikasi.</span>
        <div className="qr-actions">
          <button type="button" className="btn" onClick={onDone}>Tutup</button>
          <button type="button" className="btn btn-primary" onClick={onRegister}>Daftarkan QR</button>
        </div>
      </div>
    );
  }
  if (result.kind === 'nodata') {
    return (
      <div className="qr-result bad" role="alert" style={{ marginBottom: 12 }}>
        <strong>Data anggota belum tersedia offline</strong>
        <span className="hint">Sambungkan ke internet untuk memperbarui data anggota, lalu scan ulang.</span>
        <div className="qr-actions">
          <button type="button" className="btn" onClick={onDone}>Tutup</button>
        </div>
      </div>
    );
  }
  if (result.kind === 'inactive') {
    return (
      <div className="qr-result warn" role="status" style={{ marginBottom: 12 }}>
        <strong>{name} tidak eligible pada jadwal ini</strong>
        <span className="hint">Anggota nonaktif atau belum bergabung saat jadwal berlangsung.</span>
        <div className="qr-actions">
          <button type="button" className="btn" onClick={onDone}>Tutup</button>
        </div>
      </div>
    );
  }
  if (result.kind === 'dberror') {
    return (
      <div className="qr-result bad" role="alert" style={{ marginBottom: 12 }}>
        <strong>Gagal menyimpan absensi{name ? ` ${name}` : ''}. Coba lagi.</strong>
        <span className="hint">Data tidak berubah.</span>
        <div className="qr-actions">
          <button type="button" className="btn" disabled={saving} onClick={onDone}>Tutup</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={onRetry}>{saving ? 'Menyimpan...' : 'Coba Lagi'}</button>
        </div>
      </div>
    );
  }
  return (
    <div className="qr-result bad" role="alert" style={{ marginBottom: 12 }}>
      <strong>QR tidak dapat dibaca</strong>
      <span className="hint">Arahkan kamera lebih dekat, pastikan QR terlihat penuh dan pencahayaan cukup.</span>
      <div className="qr-actions">
        <button type="button" className="btn" onClick={onDone}>Tutup</button>
        <button type="button" className="btn btn-primary" onClick={onScanAgain}>Coba Lagi</button>
      </div>
    </div>
  );
}
export default function Absensi() {
  const {
    account, isGuest, online, toast, enqueue, supabaseReady,
    saveSnapshot, loadSnapshot, conflicts, resolveConflict, pendingCount, lastSyncAt,
  } = useApp();
  const now = todayJakarta();
  const [tableYm, setTableYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const [store, setStore] = useState(null);
  const storeRef = React.useRef(null);
  storeRef.current = store;
  const [formOccs, setFormOccs] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [answers, setAnswers] = useState({});
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const specialId = params.get('special');
  const showCreateSpecial = params.get('newSpecial') === '1';
  const [localSpecials, setLocalSpecials] = useState({});
  const [editOcc, setEditOcc] = useState(null);
  const [showEditPicker, setShowEditPicker] = useState(false);
  const [editTab, setEditTab] = useState('rutin');
  const [editYm, setEditYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const [editRutin, setEditRutin] = useState([]);
  const [editSpecials, setEditSpecials] = useState([]);
  const [editLoading, setEditLoading] = useState(false);
  const [showHoliday, setShowHoliday] = useState(false);
  const [holidayReason, setHolidayReason] = useState('');
  const [holidayAck, setHolidayAck] = useState(false);
  const [holidayBusy, setHolidayBusy] = useState(false);
  const [holidayEdit, setHolidayEdit] = useState(null);
  const [holidayEditBusy, setHolidayEditBusy] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [maleOpen, setMaleOpen] = useState(true);
  const [femaleOpen, setFemaleOpen] = useState(true);
  const [tableVisible, setTableVisible] = useState(false);
  const [tableData, setTableData] = useState(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState('');
  const [showConflicts, setShowConflicts] = useState(false);
  const [qrScanOpen, setQrScanOpen] = useState(false);
  const [qrScanKey, setQrScanKey] = useState(0);
  const [qrResult, setQrResult] = useState(null);
  const [qrSaving, setQrSaving] = useState(false);
  const skipEditLoadRef = React.useRef(false);
  const [mat, setMat] = useState(() => MAT_EMPTY());

  async function ensureMasters(keys) {
    if (!account || isGuest || !supabaseReady) return;
    try {
      const fetched = await ensureMasterLists(account.id, keys, storeRef.current, { online });
      if (Object.keys(fetched).length) {
        setStore((p) => (p ? { ...p, ...fetched } : p));
      }
    } catch { /* abaikan, dropdown menampilkan status kosong */ }
  }

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

  function applySnapshot(snap, mcached) {
    if (!snap?.members?.length) return false;
    const cands = formCandidates(snap.schedules || []);
    const byKey = new Map((snap.occurrences || []).map((o) => [o.localKey || `${o.recurring_schedule_id}|${o.occurrence_date}`, o]));
    const formList = cands.map((c) => byKey.get(c.key) || { id: `virt-${c.key}`, ...c, virtual: true });
    setStore({
      accountId: account.id,
      members: snap.members, absenceTypes: snap.absenceTypes || [], schedules: snap.schedules || [],
      lockHours: snap.lockHours ?? 24, occurrences: [], attendance: snap.attendance || {}, holidays: snap.holidays || {},
      speakers: mcached?.speakers?.length ? mcached.speakers : (snap.speakers || []),
      hadith: mcached?.hadith?.length ? mcached.hadith : (snap.hadith || []),
      free: mcached?.free?.length ? mcached.free : (snap.free || []),
      specialTypes: mcached?.specialTypes?.length ? mcached.specialTypes : (snap.specialTypes || []),
      specials: snap.specials || [],
      specialAtt: snap.specialAtt || {},
      offline: typeof navigator !== 'undefined' && navigator.onLine === false,
    });
    setFormOccs(formList);
    if (!selectedKey && formList.length) {
      const today = toISODate(todayJakarta());
      const up = formList.find((o) => o.occurrence_date >= today) || formList[formList.length - 1];
      setSelectedKey(up.id);
    }
    return true;
  }

  async function loadFormData() {
    const aid = account.id;
    let hydrated = false;
    try {
      const [snap, mcached] = await Promise.all([loadSnapshot(aid), loadMastersCache(aid)]);
      hydrated = applySnapshot(snap, mcached);
    } catch { /* lanjut ke network */ }
    try {
      const [mem, abs, sch, sett] = await withTimeout(Promise.all([
        supabase.from('members').select('*').eq('account_id', aid).order('nickname'),
        supabase.from('absence_types').select('*').eq('account_id', aid),
        supabase.from('recurring_schedules').select('*').eq('account_id', aid).eq('active', true),
        supabase.from('app_settings').select('*').eq('account_id', aid).maybeSingle(),
      ]), 20000);
      let schedules = (sch.data || []).map((s) => ({
        id: s.id,
        day_of_week: s.day_of_week,
        event_time: String(s.event_time || '19:30').slice(0, 5),
        end_time: s.end_time ? String(s.end_time).slice(0, 5) : null,
        active: s.active,
      }));
      let absenceTypes = abs.data || [];
      if (schedules.length === 0) {
        const seed = [
          { day_of_week: 3, event_time: '19:30', end_time: '21:00' },
          { day_of_week: 5, event_time: '19:30', end_time: '21:00' },
        ];
        for (const s of seed) {
          const { data } = await supabase.from('recurring_schedules').insert({ account_id: aid, day_of_week: s.day_of_week, event_time: s.event_time, end_time: s.end_time }).select().single();
          if (data) schedules.push({ id: data.id, day_of_week: data.day_of_week, event_time: String(data.event_time).slice(0, 5), end_time: data.end_time ? String(data.end_time).slice(0, 5) : null, active: true });
        }
        if ((abs.data || []).length === 0) {
          for (const n of DEFAULT_ABSENCE) await supabase.from('absence_types').insert({ account_id: aid, name: n });
          const { data: absFresh } = await supabase.from('absence_types').select('*').eq('account_id', aid);
          if (absFresh?.length) absenceTypes = absFresh;
        }
        for (const n of DEFAULT_STATUS) {
          const { data: ex } = await supabase.from('member_statuses').select('id').eq('account_id', aid).eq('name', n).maybeSingle();
          if (!ex) await supabase.from('member_statuses').insert({ account_id: aid, name: n });
        }
        for (const n of DEFAULT_HADITH) {
          const { data: ex } = await supabase.from('hadith_materials').select('id').eq('account_id', aid).eq('name', n).maybeSingle();
          if (!ex) await supabase.from('hadith_materials').insert({ account_id: aid, name: n });
        }
        for (const n of DEFAULT_FREE) {
          const { data: ex } = await supabase.from('free_activity_types').select('id').eq('account_id', aid).eq('name', n).maybeSingle();
          if (!ex) await supabase.from('free_activity_types').insert({ account_id: aid, name: n });
        }
        for (const n of DEFAULT_SPEAKERS) {
          const { data: ex } = await supabase.from('speakers').select('id').eq('account_id', aid).eq('name', n).maybeSingle();
          if (!ex) await supabase.from('speakers').insert({ account_id: aid, name: n });
        }
        for (const n of DEFAULT_SPECIAL_TYPES) {
          const { data: ex } = await supabase.from('special_event_types').select('id').eq('account_id', aid).eq('name', n).maybeSingle();
          if (!ex) await supabase.from('special_event_types').insert({ account_id: aid, name: n });
        }
      }
      const cands = formCandidates(schedules);
      const months = [...new Set(cands.map((c) => c.occurrence_date.slice(0, 7)))];
      await withTimeout(Promise.all(months.map(async (ymStr) => {
        const [yy, mm] = ymStr.split('-').map(Number);
        const virt = occurrencesForMonth(schedules, yy, mm).filter((o) => o.recurring_schedule_id);
        await Promise.all(virt.map((o) => supabase.from('schedule_occurrences').upsert({
          account_id: aid,
          recurring_schedule_id: o.recurring_schedule_id,
          occurrence_date: o.occurrence_date,
          occurrence_time: o.occurrence_time,
          occurrence_end_time: o.occurrence_end_time,
          day_name: o.day_name,
        }, { onConflict: 'account_id,recurring_schedule_id,occurrence_date', ignoreDuplicates: true })));
      })), 30000);
      const minDate = cands.length ? cands[0].occurrence_date : toISODate(todayJakarta());
      const maxDate = cands.length ? cands[cands.length - 1].occurrence_date : toISODate(todayJakarta());
      const occDb = await withTimeout(supabase.from('schedule_occurrences').select('*').eq('account_id', aid).gte('occurrence_date', minDate).lte('occurrence_date', maxDate).order('occurrence_date'), 20000);
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
        const [attDb, holDb] = await withTimeout(Promise.all([
          supabase.from('attendance').select('*').in('occurrence_id', dbIds),
          supabase.from('holidays').select('*').gte('holiday_date', minDate).lte('holiday_date', maxDate),
        ]), 20000);
        (attDb.data || []).forEach((a) => { (attMap[a.occurrence_id] ||= []).push(a); });
        holMap = Object.fromEntries((holDb.data || []).filter((h) => h.account_id === aid).map((h) => [h.occurrence_id, h]));
      }
      if (!absenceTypes.length) absenceTypes = DEFAULT_ABSENCE.map((n) => ({ name: n }));
      const cachedMasters = await loadMastersCache(aid);
      const s = {
        accountId: aid,
        members: (mem.data || []).map((m) => ({ id: m.id, full_name: m.full_name, nickname: m.nickname, gender: m.gender, joined_at: m.joined_at, active: m.active, qr_identifier: m.qr_identifier || null })),
        absenceTypes,
        schedules,
        lockHours: sett.data?.lock_duration_hours ?? 24,
        occurrences: [],
        attendance: attMap,
        holidays: holMap,
        speakers: cachedMasters.speakers || [],
        hadith: cachedMasters.hadith || [],
        free: cachedMasters.free || [],
        specialTypes: cachedMasters.specialTypes || [],
      };
      setStore(s);
      setFormOccs(formList);
      if (!selectedKey && formList.length) {
        const today = toISODate(todayJakarta());
        const up = formList.find((o) => o.occurrence_date >= today) || formList[formList.length - 1];
        setSelectedKey(up.id);
      }
      const prevSnap = await loadSnapshot(aid).catch(() => null);
      await saveSnapshot(aid, {
        members: s.members, absenceTypes: s.absenceTypes, schedules: s.schedules,
        lockHours: s.lockHours, speakers: s.speakers, hadith: s.hadith, free: s.free,
        specialTypes: s.specialTypes, occurrences: dbRows, attendance: attMap, holidays: holMap,
        specials: prevSnap?.specials || [], specialAtt: prevSnap?.specialAtt || {},
      });
    } catch (e) {
      const netErr = !navigator.onLine || /failed to fetch|network|timeout/i.test(String(e?.message || e || ''));
      if (hydrated) {
        toast(netErr
          ? 'Anda sedang offline. Menampilkan data terakhir yang tersimpan di perangkat.'
          : 'Gagal memperbarui data. Menampilkan data tersimpan.');
        return;
      }
      if (netErr) {
        const [snap, mcached] = await Promise.all([loadSnapshot(account.id), loadMastersCache(account.id)]);
        if (applySnapshot(snap, mcached)) {
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
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      toast('Anda sedang offline. Tabel membutuhkan koneksi untuk memuat bulan lain.');
      return;
    }
    setTableLoading(true);
    setTableError('');
    try {
      const aid = account.id;
      const virt = occurrencesForMonth(store.schedules, ym.y, ym.m).filter((o) => o.recurring_schedule_id);
      await withTimeout(Promise.all(virt.map((o) => supabase.from('schedule_occurrences').upsert({
        account_id: aid, recurring_schedule_id: o.recurring_schedule_id, occurrence_date: o.occurrence_date,
        occurrence_time: o.occurrence_time, occurrence_end_time: o.occurrence_end_time, day_name: o.day_name,
      }, { onConflict: 'account_id,recurring_schedule_id,occurrence_date', ignoreDuplicates: true }))), 25000);
      const first = `${ym.y}-${String(ym.m).padStart(2, '0')}-01`;
      const last = `${ym.y}-${String(ym.m).padStart(2, '0')}-31`;
      const occDb = await withTimeout(supabase.from('schedule_occurrences').select('*').eq('account_id', aid).gte('occurrence_date', first).lte('occurrence_date', last).order('occurrence_date'), 20000);
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
        const [attDb, holDb] = await withTimeout(Promise.all([
          supabase.from('attendance').select('*').in('occurrence_id', ids),
          supabase.from('holidays').select('*').eq('account_id', aid).gte('holiday_date', first).lte('holiday_date', last),
        ]), 20000);
        (attDb.data || []).forEach((a) => { (attMap[a.occurrence_id] ||= []).push(a); });
        holMap = Object.fromEntries((holDb.data || []).map((h) => [h.occurrence_id, h]));
      }
      setTableData({ occurrences: rows, attendance: attMap, holidays: holMap });
    } catch {
      setTableError('Gagal memuat tabel. Periksa koneksi lalu tekan Refresh.');
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
    if (editOcc) return editOcc;
    const inForm = formOccs.find((o) => o.id === selectedKey);
    if (inForm) return inForm;
    return formOccs[0] || null;
  }, [store, formOccs, selectedKey, editOcc]);

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
      const o = op.payload?.occurrence;
      if (!o) return false;
      return o.recurring_schedule_id === occ.recurring_schedule_id
        && o.occurrence_date === occ.occurrence_date;
    });
  }, [conflicts, occ]);

  async function readCachedMats(keys) {
    for (const k of (keys || []).filter(Boolean)) {
      if (isGuest || !supabaseReady) {
        const local = await idbGet('guest-data', null);
        if (local?.mats?.[k]) return local.mats[k];
      } else {
        const rows = await idbGet(`mats-${account.id}-${k}`, null);
        if (rows) return rows;
      }
    }
    return null;
  }

  async function hydrateEditMats(o) {
    if (!o || !account) return;
    devEdit('occurrenceId:', o.id, o.occurrence_date);
    devEdit('attendance records:', ((storeRef.current?.attendance || {})[o.id] || (storeRef.current?.attendance || {})[o.localKey] || []).length);
    if (!isGuest && supabaseReady && online && o.id && !String(o.id).startsWith('virt-')) {
      try {
        const matDb = await withTimeout(supabase.from('materials').select('*').eq('occurrence_id', o.id), 15000);
        const rows = matDb.data || [];
        devEdit('quran records:', rows.some((r) => r.kind === 'QURAN') ? 'ada' : 'kosong');
        devEdit('hadist records:', rows.some((r) => r.kind === 'HADITH') ? 'ada' : 'kosong');
        devEdit('nasehat records:', rows.some((r) => r.kind === 'NASEHAT') ? 'ada' : 'kosong');
        devEdit('free activity records:', rows.some((r) => r.kind === 'FREE') ? 'ada' : 'kosong');
        setMat(rows.length ? serverMatsToForm(rows) : MAT_EMPTY());
        await idbSet(`mats-${account.id}-${o.id}`, rows);
      } catch {
        const cached = await readCachedMats([o.id, o.localKey]);
        devEdit('materials (cache offline):', cached ? `${cached.length} baris` : 'kosong');
        setMat(cached ? serverMatsToForm(cached) : MAT_EMPTY());
      }
    } else {
      const cached = await readCachedMats([o.id, o.localKey, occKeyOf(o)]);
      devEdit('materials (cache lokal):', cached ? `${cached.length} baris` : 'kosong');
      setMat(cached ? serverMatsToForm(cached) : MAT_EMPTY());
    }
  }

  useEffect(() => {
    if (!occ || !store || !account) return;
    const key = attendanceKey;
    (async () => {
      if (editing) {
        if (!skipEditLoadRef.current) {
          const saved = key ? store.attendance?.[key] : null;
          if (saved?.length) {
            const map = {};
            saved.forEach((a) => { map[a.member_id] = a.status === 'PRESENT' ? { hadir: true } : a.status === 'PERMITTED' ? { izin: a.absence_name_snapshot || '' } : { alpha: true }; });
            setAnswers(map);
          } else if (!isGuest && supabaseReady && online && occ.id && !String(occ.id).startsWith('virt-')) {
            try {
              const attDb = await withTimeout(supabase.from('attendance').select('*').eq('occurrence_id', occ.id), 15000);
              if ((attDb.data || []).length > 0) {
                const map = {};
                attDb.data.forEach((a) => { map[a.member_id] = a.status === 'PRESENT' ? { hadir: true } : a.status === 'PERMITTED' ? { izin: a.absence_name_snapshot || '' } : { alpha: true }; });
                setAnswers(map);
                setStore((p) => ({ ...p, attendance: { ...p.attendance, [occ.id]: attDb.data } }));
              }
            } catch { /* abaikan, gunakan state lokal */ }
          }
          await hydrateEditMats(occ);
        } else {
          skipEditLoadRef.current = false;
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

  useEffect(() => {
    if (showEditPicker) loadEditLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEditPicker, editTab, editYm.m, editYm.y]);

  function setHadir(id, v) {
    setAnswers((p) => ({ ...p, [id]: v ? { hadir: true } : {} }));
  }
  function setIzin(id, v) {
    setAnswers((p) => ({ ...p, [id]: v ? { izin: v } : {} }));
  }
  function toggleAlpha(id) {
    setAnswers((p) => ({ ...p, [id]: p[id]?.alpha ? {} : { alpha: true } }));
  }

  function displayNameOf(m) {
    return m.nickname || m.full_name;
  }

  function openQrScan() {
    if (!occ) return;
    if (submitted && !editing) { toast('Tekan Edit Absensi Ini untuk mengubah kehadiran.'); return; }
    if (!windowOpen) { toast(`Absensi belum dapat diisi. Baru dapat diisi mulai pukul ${windowOpenAt(occ.occurrence_time)}, yaitu 30 menit sebelum acara dimulai.`); return; }
    if (!editable) { toast('Absensi ini tidak dapat diubah lagi. Batas waktu perubahan telah berakhir.'); return; }
    setQrResult(null);
    setQrScanKey((k) => k + 1);
    setQrScanOpen(true);
  }

  function mergeAttendanceRec(key, rec) {
    if (!key) return;
    setStore((p) => {
      const cur = ((p.attendance || {})[key] || []).filter((r) => r.member_id !== rec.member_id);
      const next = { ...p, attendance: { ...p.attendance, [key]: [...cur, rec] } };
      saveSnapshot(account.id, {
        members: next.members, absenceTypes: next.absenceTypes, schedules: next.schedules,
        lockHours: next.lockHours, speakers: next.speakers, hadith: next.hadith, free: next.free,
        specialTypes: next.specialTypes, occurrences: [], attendance: next.attendance, holidays: next.holidays,
      });
      return next;
    });
  }

  function existingQrStatus(memberId) {
    const a = answers[memberId] || {};
    if (a.hadir) return { st: 'PRESENT', src: 'form' };
    if (a.izin) return { st: 'PERMITTED', absence: a.izin, src: 'form' };
    if (a.alpha) return { st: 'ALPHA', src: 'form' };
    const keys = [occ?.id, occ?.localKey].filter(Boolean);
    for (const k of keys) {
      const rec = ((storeRef.current?.attendance || {})[k] || []).find((r) => r.member_id === memberId);
      if (rec) return { st: rec.status, absence: rec.absence_name_snapshot, src: 'saved' };
    }
    return null;
  }

  async function qrDirectSave(member) {
    if (!occ) return 'dberror';
    const row = { member_id: member.id, member_name: displayNameOf(member), status: 'PRESENT', absence: null };
    const key = occKeyOf(occ);
    const rec = { member_id: row.member_id, member_name_snapshot: row.member_name, status: row.status, absence_name_snapshot: row.absence };
    try {
      if (isGuest || !supabaseReady) {
        mergeAttendanceRec(occ.id, rec);
        const local = await idbGet('guest-data', null);
        if (local) {
          const cur = ((local.attendance || {})[occ.id] || []).filter((r) => r.member_id !== rec.member_id);
          await idbSet('guest-data', { ...local, attendance: { ...(local.attendance || {}), [occ.id]: [...cur, rec] } });
        }
      } else if (!online) {
        await enqueue(createAttendanceOp(account.id, occDescriptor(), [row], buildMats()));
        mergeAttendanceRec(key, rec);
        toast('Tersimpan di perangkat. Akan dikirim otomatis saat koneksi kembali.');
      } else {
        try {
          const { data: dbOcc, error: occErr } = await withTimeout(supabase.from('schedule_occurrences').upsert({
            account_id: account.id,
            recurring_schedule_id: occ.recurring_schedule_id,
            occurrence_date: occ.occurrence_date,
            occurrence_time: occ.occurrence_time,
            occurrence_end_time: occ.occurrence_end_time || null,
            day_name: occ.day_name,
          }, { onConflict: 'account_id,recurring_schedule_id,occurrence_date' }).select().single(), 20000);
          if (occErr) throw occErr;
          const { error } = await withTimeout(supabase.from('attendance').upsert({ account_id: account.id, occurrence_id: dbOcc.id, member_id: row.member_id, status: row.status, absence_name_snapshot: row.absence, member_name_snapshot: row.member_name }, { onConflict: 'account_id,occurrence_id,member_id' }), 30000);
          if (error) throw error;
          mergeAttendanceRec(dbOcc.id, rec);
          if (tableVisible) await loadTable();
        } catch (e) {
          if (isNetErr(e)) {
            await enqueue(createAttendanceOp(account.id, occDescriptor(), [row], buildMats()));
            mergeAttendanceRec(key, rec);
            toast('Koneksi terputus. Data tersimpan di perangkat dan akan dikirim otomatis.');
          } else throw e;
        }
      }
      setHadir(member.id, true);
      if (!editing) { skipEditLoadRef.current = true; setEditing(true); }
      return 'saved';
    } catch {
      return 'dberror';
    }
  }

  async function saveQrPresent(member) {
    if (!member || qrSaving) return;
    setQrSaving(true);
    const res = await qrDirectSave(member);
    setQrSaving(false);
    if (res === 'saved') {
      setQrResult({ kind: 'marked', member });
      toast(`✓ ${displayNameOf(member)} berhasil diabsen`);
    } else {
      setQrResult({ kind: 'dberror', member });
    }
  }

  async function onQrDecoded(rawText) {
    const raw = String(rawText || '').trim();
    setQrScanOpen(false);
    if (!raw) { setQrResult({ kind: 'invalid' }); return; }
    if (qrSaving) return;
    const list = storeRef.current?.members || [];
    const found = list.find((m) => (m.qr_identifier || '') !== '' && m.qr_identifier === raw);
    if (!found) {
      const hasAnyQr = list.some((m) => (m.qr_identifier || '') !== '');
      setQrResult({ kind: hasAnyQr || online ? 'unknown' : 'nodata', raw });
      return;
    }
    if (!found.active || (found.joined_at && occ && found.joined_at > occ.occurrence_date)) {
      setQrResult({ kind: 'inactive', member: found });
      return;
    }
    const ex = existingQrStatus(found.id);
    if (!ex) { await saveQrPresent(found); return; }
    if (ex.st === 'PRESENT') { setQrResult({ kind: 'already', member: found }); return; }
    if (ex.st === 'PERMITTED') { setQrResult({ kind: 'confirm-izin', member: found, izinName: ex.absence || '-' }); return; }
    await saveQrPresent(found);
  }

  function confirmQrIzinToHadir() {
    if (qrResult?.member) saveQrPresent(qrResult.member);
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

  async function persistHolidayOverlay(key, record) {
    setStore((p) => {
      const holidays = { ...(p.holidays || {}) };
      if (record) holidays[key] = record;
      else delete holidays[key];
      const next = { ...p, holidays };
      saveSnapshot(account.id, {
        members: next.members, absenceTypes: next.absenceTypes, schedules: next.schedules,
        lockHours: next.lockHours, speakers: next.speakers, hadith: next.hadith, free: next.free,
        specialTypes: next.specialTypes, occurrences: [], attendance: next.attendance, holidays: next.holidays,
      });
      return next;
    });
  }

  async function refreshAfterHoliday() {
    if (!isGuest && supabaseReady && online) {
      await loadFormData();
      if (tableVisible) await loadTable();
    }
    if (showEditPicker) await loadEditLists();
  }

  function openHolidayCreate() {
    setHolidayReason('');
    setHolidayAck(false);
    setHolidayBusy(false);
    setShowHoliday(true);
  }

  function isNetErr(e) {
    return (typeof navigator !== 'undefined' && navigator.onLine === false) || /failed to fetch|network|timeout/i.test(String(e?.message || e || ''));
  }

  async function submitHoliday() {
    if (!occ || holidayBusy) return;
    const clean = holidayReason.trim() || null;
    const desc = occDescriptor();
    if (submitted && !holidayAck) { setHolidayAck(true); return; }
    setHolidayBusy(true);
    try {
      if (isGuest || !supabaseReady) {
        const key = occ.id;
        const rec = { reason: clean || 'Libur' };
        setStore((p) => ({ ...p, holidays: { ...p.holidays, [key]: rec } }));
        const local = await idbGet('guest-data', null);
        if (local) await idbSet('guest-data', { ...local, holidays: { ...(local.holidays || {}), [key]: rec } });
        toast('Jadwal ditandai libur.');
      } else if (!online) {
        await enqueue(createHolidayOp(account.id, desc, clean, null));
        await persistHolidayOverlay(occKeyOf(occ), { reason: clean || 'Libur' });
        toast('Tersimpan di perangkat. Status libur akan dikirim saat koneksi kembali.');
      } else {
        try {
          const { data: dbOcc, error: occErr } = await withTimeout(supabase.from('schedule_occurrences').upsert({
            account_id: account.id, recurring_schedule_id: occ.recurring_schedule_id, occurrence_date: occ.occurrence_date,
            occurrence_time: occ.occurrence_time, occurrence_end_time: occ.occurrence_end_time || null, day_name: occ.day_name,
          }, { onConflict: 'account_id,recurring_schedule_id,occurrence_date' }).select().single(), 20000);
          if (occErr) throw occErr;
          if (dbOcc) {
            await withTimeout(supabase.from('schedule_occurrences').update({ is_holiday: true }).eq('id', dbOcc.id), 15000);
            await withTimeout(supabase.from('holidays').upsert({ account_id: account.id, occurrence_id: dbOcc.id, holiday_date: occ.occurrence_date, day_name: occ.day_name, reason: clean }, { onConflict: 'occurrence_id' }), 15000);
          }
          toast('Jadwal ditandai libur.');
        } catch (e) {
          if (isNetErr(e)) {
            await enqueue(createHolidayOp(account.id, desc, clean, null));
            await persistHolidayOverlay(occKeyOf(occ), { reason: clean || 'Libur' });
            toast('Koneksi terputus. Status libur tersimpan di perangkat dan akan dikirim otomatis.');
          } else {
            throw e;
          }
        }
        await loadFormData();
        if (tableVisible) await loadTable();
      }
      setShowHoliday(false);
    } catch {
      toast('Gagal menandai libur. Periksa koneksi lalu coba lagi.');
    }
    setHolidayBusy(false);
  }

  async function openHolidayEditor(o) {
    setCancelConfirm(false);
    setHolidayEditBusy(false);
    const base = { occ: o, reason: o.holidayReason || '', loadedReason: o.holidayReason ?? null, linkedSpecial: null, occurrenceId: null };
    setHolidayEdit(base);
    if (!isGuest && supabaseReady && online) {
      try {
        const aid = account.id;
        const { data: dbOcc } = await withTimeout(supabase.from('schedule_occurrences').select('id').eq('account_id', aid).eq('recurring_schedule_id', o.recurring_schedule_id).eq('occurrence_date', o.occurrence_date).maybeSingle(), 15000);
        if (!dbOcc) return;
        const { data: hol } = await withTimeout(supabase.from('holidays').select('reason').eq('occurrence_id', dbOcc.id).maybeSingle(), 15000);
        const { data: sp } = await withTimeout(supabase.from('special_events').select('id,event_type_snapshot,event_date').eq('account_id', aid).eq('linked_holiday_occurrence_id', dbOcc.id).maybeSingle(), 15000);
        setHolidayEdit({ occ: o, reason: hol?.reason || '', loadedReason: hol ? (hol.reason ?? null) : null, linkedSpecial: sp || null, occurrenceId: dbOcc.id });
      } catch { /* gunakan data lokal yang sudah ada */ }
    }
  }

  async function saveHolidayReason() {
    if (!holidayEdit || holidayEditBusy) return;
    const clean = holidayEdit.reason.trim() || null;
    const { occ, loadedReason, occurrenceId } = holidayEdit;
    const desc = {
      recurring_schedule_id: occ.recurring_schedule_id, occurrence_date: occ.occurrence_date,
      occurrence_time: occ.occurrence_time, occurrence_end_time: occ.occurrence_end_time || null, day_name: occ.day_name,
    };
    setHolidayEditBusy(true);
    try {
      if (isGuest || !supabaseReady) {
        const key = occKeyOf(occ);
        const rec = { reason: clean || 'Libur' };
        setStore((p) => ({ ...p, holidays: { ...p.holidays, [key]: rec } }));
        const local = await idbGet('guest-data', null);
        if (local) await idbSet('guest-data', { ...local, holidays: { ...(local.holidays || {}), [key]: rec } });
        toast('Alasan libur diperbarui.');
      } else if (!online) {
        await enqueue(createHolidayOp(account.id, desc, clean, loadedReason ?? undefined));
        await persistHolidayOverlay(occKeyOf(occ), { reason: clean || 'Libur' });
        toast('Tersimpan di perangkat. Perubahan alasan akan dikirim saat koneksi kembali.');
      } else {
        try {
          const { data: cur } = await withTimeout(supabase.from('holidays').select('reason').eq('occurrence_id', occurrenceId).maybeSingle(), 15000);
          if (!cur) {
            toast('Data libur sudah tidak ada di server. Memuat ulang daftar.');
            setHolidayEdit(null);
            await refreshAfterHoliday();
            return;
          }
          if ((cur.reason ?? null) !== (loadedReason ?? null) && !window.confirm('Alasan di server sudah berubah. Timpa dengan alasan Anda?')) {
            setHolidayEditBusy(false);
            return;
          }
          const { error } = await withTimeout(supabase.from('holidays').update({ reason: clean }).eq('account_id', account.id).eq('occurrence_id', occurrenceId), 15000);
          if (error) throw error;
          toast('Alasan libur diperbarui.');
        } catch (e) {
          if (isNetErr(e)) {
            await enqueue(createHolidayOp(account.id, desc, clean, loadedReason ?? undefined));
            await persistHolidayOverlay(occKeyOf(occ), { reason: clean || 'Libur' });
            toast('Koneksi terputus. Perubahan tersimpan di perangkat dan akan dikirim otomatis.');
          } else {
            throw e;
          }
        }
      }
      setHolidayEdit(null);
      setCancelConfirm(false);
      await refreshAfterHoliday();
    } catch {
      toast('Gagal menyimpan alasan. Periksa koneksi lalu coba lagi.');
    }
    setHolidayEditBusy(false);
  }

  async function cancelHoliday() {
    if (!holidayEdit || holidayEditBusy) return;
    const { occ, loadedReason, occurrenceId } = holidayEdit;
    const desc = {
      recurring_schedule_id: occ.recurring_schedule_id, occurrence_date: occ.occurrence_date,
      occurrence_time: occ.occurrence_time, occurrence_end_time: occ.occurrence_end_time || null, day_name: occ.day_name,
    };
    setHolidayEditBusy(true);
    try {
      if (isGuest || !supabaseReady) {
        const key = occKeyOf(occ);
        setStore((p) => {
          const holidays = { ...(p.holidays || {}) };
          delete holidays[key];
          return { ...p, holidays };
        });
        const local = await idbGet('guest-data', null);
        if (local) {
          const holidays = { ...(local.holidays || {}) };
          delete holidays[key];
          await idbSet('guest-data', { ...local, holidays });
        }
        toast('Status libur dibatalkan. Jadwal kembali dapat diisi.');
      } else if (!online) {
        await enqueue(createCancelHolidayOp(account.id, desc, loadedReason ?? undefined));
        await persistHolidayOverlay(occKeyOf(occ), null);
        toast('Tersimpan di perangkat. Pembatalan libur akan dikirim saat koneksi kembali.');
      } else {
        if (!occurrenceId) throw new Error('Occurrence belum tercatat di server.');
        const { error: delErr } = await withTimeout(supabase.from('holidays').delete().eq('account_id', account.id).eq('occurrence_id', occurrenceId), 15000);
        if (delErr) throw delErr;
        await withTimeout(supabase.from('schedule_occurrences').update({ is_holiday: false }).eq('id', occurrenceId), 15000);
        await withTimeout(supabase.from('special_events').update({ linked_holiday_occurrence_id: null }).eq('account_id', account.id).eq('linked_holiday_occurrence_id', occurrenceId), 15000);
        toast('Status libur dibatalkan. Jadwal kembali dapat diisi.');
      }
      setHolidayEdit(null);
      setCancelConfirm(false);
      await refreshAfterHoliday();
    } catch {
      toast('Gagal membatalkan libur. Periksa koneksi lalu coba lagi.');
    }
    setHolidayEditBusy(false);
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
        if (local) await idbSet('guest-data', { ...local, attendance: { ...(local.attendance || {}), [key]: recs }, mats: { ...(local.mats || {}), [key]: clientMatsToServer(mats, key) } });
      } else if (!online) {
        const key = occKeyOf(occ);
        const recs = rows.map((r) => ({ member_id: r.member_id, member_name_snapshot: r.member_name, status: r.status, absence_name_snapshot: r.absence }));
        await enqueue(createAttendanceOp(account.id, occDescriptor(), rows, mats));
        await persistLocalOverlay(key, recs);
        await idbSet(`mats-${account.id}-${key}`, clientMatsToServer(mats, key));
        toast('Tersimpan di perangkat. Akan dikirim otomatis saat koneksi kembali.');
      } else {
        try {
          const { data: dbOcc, error: occErr } = await withTimeout(supabase.from('schedule_occurrences').upsert({
            account_id: account.id,
            recurring_schedule_id: occ.recurring_schedule_id,
            occurrence_date: occ.occurrence_date,
            occurrence_time: occ.occurrence_time,
            occurrence_end_time: occ.occurrence_end_time || null,
            day_name: occ.day_name,
          }, { onConflict: 'account_id,recurring_schedule_id,occurrence_date' }).select().single(), 20000);
          if (occErr) throw occErr;
          await withTimeout((async () => {
            for (const r of rows) {
              const { error } = await supabase.from('attendance').upsert({ account_id: account.id, occurrence_id: dbOcc.id, member_id: r.member_id, status: r.status, absence_name_snapshot: r.absence, member_name_snapshot: r.member_name }, { onConflict: 'account_id,occurrence_id,member_id' });
              if (error) throw error;
            }
          })(), 30000);
          const activeKinds = mats.map((m) => m.kind);
          const { data: existingMats } = await withTimeout(supabase.from('materials').select('id,kind').eq('occurrence_id', dbOcc.id), 15000);
          const staleIds = (existingMats || []).filter((r) => !activeKinds.includes(r.kind)).map((r) => r.id);
          if (staleIds.length) {
            const { error: delErr } = await withTimeout(supabase.from('materials').delete().in('id', staleIds), 15000);
            if (delErr) throw delErr;
          }
          const savedMatRows = [];
          await withTimeout((async () => {
            for (const mm of mats) {
              const payload = { id: mm.clientId, account_id: account.id, occurrence_id: dbOcc.id, kind: mm.kind };
            if (mm.kind === 'QURAN') { payload.quran_surah_number = mm.surah; payload.quran_surah_name_snapshot = mm.surahName; payload.ayat_range = mm.ayat; payload.speaker_name_snapshot = mm.speaker; }
            if (mm.kind === 'HADITH') { payload.hadith_name_snapshot = mm.hadith; payload.hadith_page = mm.halaman; payload.speaker_name_snapshot = mm.speaker; }
            if (mm.kind === 'NASEHAT') { payload.speaker_name_snapshot = mm.speaker; }
            if (mm.kind === 'FREE') { payload.free_activity_name_snapshot = mm.activity; payload.speaker_name_snapshot = mm.speaker; }
            const { error } = await supabase.from('materials').upsert(payload, { onConflict: 'id' });
            if (error) throw error;
            savedMatRows.push(payload);
            }
          })(), 30000);
          await idbSet(`mats-${account.id}-${dbOcc.id}`, savedMatRows);
          if (occKeyOf(occ) !== dbOcc.id) await idbSet(`mats-${account.id}-${occKeyOf(occ)}`, savedMatRows);
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
            await enqueue(createAttendanceOp(account.id, occDescriptor(), rows, mats));
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
        <div className="card">
          <Empty title="Belum ada data offline" desc="Hubungkan internet sekali untuk memuat anggota dan jadwal, setelah itu form dapat digunakan offline." action={<button className="btn btn-primary" onClick={() => loadFormData()}>Coba lagi</button>} />
        </div>
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
            {list.map((m) => (
              <MemberRow
                key={m.id}
                m={m}
                val={answers[m.id] || {}}
                absenceOptions={store.absenceTypes || []}
                onHadir={setHadir}
                onIzin={setIzin}
                onAlpha={toggleAlpha}
              />
            ))}
          </div>
        )}
      </section>
    );
  }

  const MAT_DEFS = [
    { key: 'quran', title: 'Al-Quran', desc: 'Surat, ayat, dan pemateri', masters: ['speakers'] },
    { key: 'hadith', title: 'Hadist', desc: 'Kitab, halaman, dan pemateri', masters: ['hadith', 'speakers'] },
    { key: 'nasehat', title: 'Nasehat', desc: 'Penyampai nasehat', masters: ['speakers'] },
    { key: 'free', title: 'Materi / Kegiatan Bebas', desc: 'Kegiatan dan penanggung jawab', masters: ['free', 'speakers'] },
  ];
  const activeMatCount = MAT_DEFS.filter((d) => mat[d.key]).length;

  function sectionHasData(key) {
    if (key === 'quran') return Boolean(mat.surah || mat.ayat || mat.pemateriQ);
    if (key === 'hadith') return Boolean(mat.hadithId || mat.halaman || mat.pemateriH);
    if (key === 'nasehat') return Boolean(mat.nasehatBy);
    if (key === 'free') return Boolean(mat.freeId || mat.freeBy);
    return false;
  }

  function matSummary(key) {
    if (key === 'quran') {
      if (!mat.surah && !mat.ayat) return 'Belum diisi';
      return `QS ${mat.surah || '-'}${surah ? ` • ${surah}` : ''}${mat.ayat ? ` • ${mat.ayat}` : ''}`;
    }
    if (key === 'hadith') return mat.hadithId ? `${mat.hadithId}${mat.halaman ? ` • hal ${mat.halaman}` : ''}` : 'Belum diisi';
    if (key === 'nasehat') return mat.nasehatBy || 'Belum diisi';
    if (key === 'free') return mat.freeId || 'Belum diisi';
    return '';
  }

  function enableSection(key) {
    const def = MAT_DEFS.find((d) => d.key === key);
    setMat((p) => ({ ...p, [key]: true }));
    if (def) ensureMasters(def.masters);
  }

  function matFields(key) {
    if (key === 'quran') {
      return (
        <>
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
        </>
      );
    }
    if (key === 'hadith') {
      return (
        <>
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
        </>
      );
    }
    if (key === 'nasehat') {
      return (
        <label className="field"><span>Penyampai nasehat</span>
          <CustomSelect value={mat.nasehatBy} ariaLabel="Penyampai nasehat" placeholder="Pilih penyampai"
            options={[{ value: '', label: 'Pilih penyampai' }, ...(store.speakers || []).map((s) => ({ value: s.name, label: s.name }))]}
            onChange={(v) => setMat({ ...mat, nasehatBy: v })} />
        </label>
      );
    }
    return (
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
    );
  }

  function deactivateSection(key, title) {
    if (sectionHasData(key) && !window.confirm(`Hapus materi ${title} dari pengajian ini? Isian yang sudah ada akan dibuang.`)) return;
    const clear = { quran: { surah: '', ayat: '', pemateriQ: '' }, hadith: { hadithId: '', halaman: '', pemateriH: '' }, nasehat: { nasehatBy: '' }, free: { freeId: '', freeBy: '' } }[key] || {};
    setMat((p) => ({ ...p, [key]: false, ...clear }));
  }

  function resetMaterials() {
    setMat(MAT_EMPTY());
  }

  async function onSpecialCreated(id, localEv) {
    if (localEv && account) {
      setLocalSpecials((p) => ({ ...p, [id]: localEv }));
      try {
        const snap = (await loadSnapshot(account.id)) || {};
        if (snap.members) {
          await saveSnapshot(account.id, { ...snap, specials: [...(snap.specials || []).filter((e) => e.id !== id), { ...localEv }] });
        }
      } catch { /* abaikan */ }
    }
    setParams({ special: id });
  }

  async function loadEditLists() {
    if (!account) return;
    setEditLoading(true);
    try {
      if (isGuest || !supabaseReady) {
        const local = await idbGet('guest-data', null);
        const occ = occurrencesForMonth(local?.schedules || store?.schedules || [], editYm.y, editYm.m);
        setEditRutin(occ.map((o) => ({ ...o, submitted: Boolean((local?.attendance || {})[o.id]?.length), holiday: Boolean((local?.holidays || {})[o.id]), holidayReason: (local?.holidays || {})[o.id]?.reason || '' })));
        setEditSpecials([]);
      } else if (online) {
        const aid = account.id;
        const first = `${editYm.y}-${String(editYm.m).padStart(2, '0')}-01`;
        const last = `${editYm.y}-${String(editYm.m).padStart(2, '0')}-31`;
        const occDb = await withTimeout(supabase.from('schedule_occurrences').select('*').eq('account_id', aid).gte('occurrence_date', first).lte('occurrence_date', last).order('occurrence_date'), 20000);
        const rows = (occDb.data || []).map((o) => ({
          id: o.id, localKey: `${o.recurring_schedule_id}|${o.occurrence_date}`,
          recurring_schedule_id: o.recurring_schedule_id, occurrence_date: o.occurrence_date,
          occurrence_time: String(o.occurrence_time).slice(0, 5),
          occurrence_end_time: o.occurrence_end_time ? String(o.occurrence_end_time).slice(0, 5) : null,
          day_name: o.day_name, is_holiday: o.is_holiday,
        }));
        const ids = rows.map((o) => o.id);
        let filled = new Set();
        let holMap = {};
        let holReason = {};
        if (ids.length) {
          const attDb = await withTimeout(supabase.from('attendance').select('occurrence_id').in('occurrence_id', ids), 20000);
          filled = new Set((attDb.data || []).map((a) => a.occurrence_id));
          const holDb = await withTimeout(supabase.from('holidays').select('occurrence_id,reason').eq('account_id', aid).gte('holiday_date', first).lte('holiday_date', last), 20000);
          holMap = Object.fromEntries((holDb.data || []).map((h) => [h.occurrence_id, true]));
          holReason = Object.fromEntries((holDb.data || []).map((h) => [h.occurrence_id, h.reason || '']));
        }
        setEditRutin(rows.map((o) => ({ ...o, submitted: filled.has(o.id), holiday: Boolean(holMap[o.id] || o.is_holiday), holidayReason: holReason[o.id] || '' })));
        const specDb = await withTimeout(supabase.from('special_events').select('*').eq('account_id', aid).gte('event_date', first).lte('event_date', last).order('event_date'), 20000);
        const evs = specDb.data || [];
        const evIds = evs.map((e) => e.id);
        let evFilled = new Set();
        if (evIds.length) {
          const saDb = await withTimeout(supabase.from('special_attendance').select('special_event_id').in('special_event_id', evIds), 20000);
          evFilled = new Set((saDb.data || []).map((a) => a.special_event_id));
        }
        setEditSpecials(evs.map((e) => ({ ...e, submitted: evFilled.has(e.id) })));
        try {
          const snap = (await loadSnapshot(account.id)) || {};
          const map = new Map((snap.specials || []).map((x) => [x.id, x]));
          evs.forEach((e) => map.set(e.id, e));
          await saveSnapshot(account.id, { ...snap, specials: [...map.values()] });
        } catch { /* abaikan */ }
      } else {
        const snap = await loadSnapshot(account.id);
        const occ = (snap?.occurrences || []).filter((o) => (o.occurrence_date || '').startsWith(`${editYm.y}-${String(editYm.m).padStart(2, '0')}`));
        setEditRutin(occ.map((o) => {
          const hol = (snap?.holidays || {})[o.id] ?? (snap?.holidays || {})[o.localKey];
          return { ...o, submitted: Boolean((snap?.attendance || {})[o.id]?.length), holiday: Boolean(hol), holidayReason: hol?.reason || '' };
        }));
        setEditSpecials((snap?.specials || []).filter((e) => (e.event_date || '').startsWith(`${editYm.y}-${String(editYm.m).padStart(2, '0')}`)).map((e) => ({ ...e, submitted: Boolean((snap?.specialAtt || {})[e.id]?.length) })));
      }
    } catch {
      toast('Gagal memuat daftar. Periksa koneksi lalu coba lagi.');
    }
    setEditLoading(false);
  }

  function openEditPicker() {
    setEditYm({ ...tableYm });
    setShowEditPicker(true);
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

      {specialId ? (
        <SpecialDetail
          eventId={specialId}
          localEvent={localSpecials[specialId]}
          members={store.members}
          absenceTypes={store.absenceTypes}
          onBack={() => setParams({})}
          onChanged={() => {}}
        />
      ) : (
      <div className="card">
        <div>
          <h2 className="card-title">Absensi Pengajian</h2>
          <p className="card-desc">Jadwal: {occ ? formatID(occ.occurrence_date) : '-'} • Jam: {occ ? timeRange(occ.occurrence_time, occ.occurrence_end_time) : '-'}</p>
        </div>

        <div className="form-quick-actions" aria-label="Aksi cepat jadwal">
          <button type="button" className="btn-quick btn-qr" onClick={openQrScan}>
            <EyeIcon /> Scan QR
          </button>
          <button type="button" className="btn-quick btn-libur" onClick={openHolidayCreate}>
            <ClockIcon /> Tandai Libur
          </button>
          <button type="button" className="btn-quick btn-khusus" onClick={() => setParams({ newSpecial: '1' })}>
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
            onChange={(v) => { setSelectedKey(v); setEditOcc(null); setEditing(false); setAnswers({}); }}
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
              <span className="lg"><span className="mark izin">I</span> Dropdown izin = Izin</span>
              <span className="lg"><span className="mark alpha">A</span> Tombol A = Alpha</span>
              <span className="lg">Kosong = belum diisi, dihitung Alpha saat simpan</span>
            </div>
            {qrScanOpen && (
              <QrScanner
                key={qrScanKey}
                title="Scan QR Kehadiran"
                hint="Arahkan kamera ke QR kartu fisik anggota."
                onResult={onQrDecoded}
                onClose={() => setQrScanOpen(false)}
              />
            )}
            {qrResult && <QrResultPanel result={qrResult} onScanAgain={openQrScan} onDone={() => setQrResult(null)} onConfirmIzin={confirmQrIzinToHadir} onRegister={() => navigate('/admin/anggota')} onRetry={() => qrResult?.member && saveQrPresent(qrResult.member)} saving={qrSaving} />}
            <div className="member-groups">
              {renderGroup('LAKI-LAKI', 'male', males, maleOpen, setMaleOpen)}
              {renderGroup('PEREMPUAN', 'female', females, femaleOpen, setFemaleOpen)}
            </div>

            <div className="material-group">
              <div className="material-group-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0 }}>Materi Pengajian</h3>
                  {activeMatCount > 0 && <span className="member-count">{activeMatCount} aktif</span>}
                </div>
              </div>
              {MAT_DEFS.map((d) => (
                <section className="material-card" key={d.key} aria-label={d.title}>
                  <div className="material-sec-head">
                    <div>
                      <strong>{d.title}</strong>
                      <div className="hint">{mat[d.key] ? matSummary(d.key) : d.desc}</div>
                    </div>
                    {mat[d.key] ? (
                      <button type="button" className="collapse-btn" onClick={() => deactivateSection(d.key, d.title)} aria-label={`Nonaktifkan ${d.title}`}>
                        <span>− Nonaktif</span>
                      </button>
                    ) : (
                      <button type="button" className="btn" style={{ minHeight: 40 }} onClick={() => enableSection(d.key)} aria-label={`Tambah ${d.title}`}>
                        <PlusIcon /> Tambah
                      </button>
                    )}
                  </div>
                  {mat[d.key] && (
                    <div className="material-card-body">
                      {matFields(d.key)}
                    </div>
                  )}
                </section>
              ))}
            </div>


            <div className="actions">
              <button className="btn btn-danger" onClick={() => { if (window.confirm('Hapus draf absensi ini? Semua jawaban sementara dan isian materi pada form jadwal ini akan dihapus dan tidak bisa dikembalikan.')) { setAnswers({}); resetMaterials(); } }}>Reset Form</button>
              <button className="btn btn-primary" disabled={saving || !windowOpen} onClick={onSave}>{saving ? 'Menyimpan...' : editing ? 'Simpan Perubahan' : 'Simpan Absensi'}</button>
            </div>
            {editing && <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="btn" onClick={() => setEditing(false)}>Batal</button></div>}
          </>
        )}
      </div>

      )}
      <div className="card">
        <div className="table-card-head">
          <div>
            <h3 className="card-title">Rekap Absensi</h3>
            <p className="card-desc">Tabel hanya untuk melihat. Perubahan lewat form Edit Kehadiran.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn" style={{ minHeight: 40 }} onClick={openEditPicker}><PencilIcon /> Edit Absensi</button>
            <div className="month-nav" aria-label="Navigasi bulan tabel">
            <button className="icon-btn" onClick={() => setTableYm((p) => (p.m === 1 ? { y: p.y - 1, m: 12 } : { y: p.y, m: p.m - 1 }))} aria-label="Bulan sebelumnya"><ChevronLeftIcon /></button>
            <strong>{monthLabel(tableYm.y, tableYm.m)}</strong>
            <button className="icon-btn" onClick={() => setTableYm((p) => (p.m === 12 ? { y: p.y + 1, m: 1 } : { y: p.y, m: p.m + 1 }))} aria-label="Bulan berikutnya"><ChevronRightIcon /></button>
          </div>
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
            {tableError && <p className="field-error" style={{ marginBottom: 10 }}>{tableError}</p>}
            {!tableData ? (
              <p className="hint">{tableLoading ? 'Memuat data absensi...' : 'Menyiapkan tabel...'}</p>
            ) : (
              <div className="table-wrap">
                <table className="att">
                  <thead><tr><th>Nama</th>{tableData.occurrences.map((o) => {
                    const st = scheduleStatus({ dateISO: o.occurrence_date, submitted: (tableData.attendance?.[o.id] || []).length > 0, holiday: Boolean(tableData.holidays?.[o.id]), todayISO: toISODate(todayJakarta()) });
                    return <th key={o.id} className={`sched-${st}`}>{o.occurrence_date.slice(8, 10)}<br />{String(o.occurrence_time).slice(0, 5)}</th>;
                  })}</tr></thead>
                  <tbody>
                    {(store.members || []).filter((m) => m.active).map((m) => (
                      <tr key={m.id}>
                        <td>{m.nickname || m.full_name}</td>
                        {tableData.occurrences.map((o) => {
                          if (tableData.holidays?.[o.id]) return <td key={o.id} className="cell-libur">LIBUR</td>;
                          const rec = (tableData.attendance?.[o.id] || []).find((a) => (a.member_id || a.memberId) === m.id);
                          if (!rec) {
                            const st = scheduleStatus({ dateISO: o.occurrence_date, submitted: (tableData.attendance?.[o.id] || []).length > 0, holiday: false, todayISO: toISODate(todayJakarta()) });
                            if (st === 'missing') return <td key={o.id} className="cell-missing" title="Jadwal lampau, absensi belum diisi">-</td>;
                            if (st === 'future' || st === 'today') return <td key={o.id} className="cell-future">-</td>;
                            return <td key={o.id} className="cell-kosong">-</td>;
                          }
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
        <Modal title="Tandai libur" onClose={() => setShowHoliday(false)} foot={<><button className="btn" onClick={() => setShowHoliday(false)}>Batal</button><button className="btn btn-primary" disabled={holidayBusy} onClick={submitHoliday}>{holidayBusy ? 'Menyimpan...' : 'Simpan'}</button></>}>
          <p>Jadwal <strong>{occ ? formatID(occ.occurrence_date) : ''}</strong> akan ditandai libur. Absensi tidak dapat diisi dan tidak dihitung dalam persentase.</p>
          {submitted && !holidayAck && (
            <div className="banner warn"><span>Jadwal ini sudah memiliki data absensi. Menandai libur tidak menghapus absensi yang sudah tersimpan.</span></div>
          )}
          {submitted && holidayAck && (
            <div className="banner warn"><span>Anda mengonfirmasi bahwa jadwal berabsensi ini akan ditandai libur. Absensi yang sudah ada tetap tersimpan dan tidak dihapus.</span></div>
          )}
          <label className="field"><span>Alasan</span>
            <textarea
              className="input"
              rows={3}
              value={holidayReason}
              onChange={(e) => setHolidayReason(e.target.value)}
              placeholder="Contoh: Pengajian khusus menggantikan jadwal rutin"
            />
          </label>
        </Modal>
      )}
      {showCreateSpecial && (
        <SpecialEventModal
          schedules={store.schedules}
          onClose={() => setParams({})}
          onCreated={(id, localEv) => onSpecialCreated(id, localEv)}
        />
      )}
      {showEditPicker && (
        <Modal title="Edit Absensi" onClose={() => setShowEditPicker(false)} foot={<button className="btn" onClick={() => setShowEditPicker(false)}>Tutup</button>}>
          <div className="row cols-2">
            <div className="field"><span>Jenis jadwal</span>
              <CustomSelect value={editTab} ariaLabel="Jenis jadwal" placeholder="Pilih jenis"
                options={[{ value: 'rutin', label: 'Pengajian Rutin' }, { value: 'khusus', label: 'Pengajian Khusus' }]}
                onChange={setEditTab} />
            </div>
            <div className="field"><span>Bulan</span>
              <MonthPicker y={editYm.y} m={editYm.m} onChange={setEditYm} ariaLabel="Bulan daftar edit" />
            </div>
          </div>
          {editLoading && <p className="hint">Memuat daftar jadwal...</p>}
          {!editLoading && editTab === 'rutin' && (
            <div className="master-rows rows-loose">
              {editRutin.length === 0 && <p className="hint">Tidak ada jadwal rutin pada bulan ini.</p>}
              {editRutin.map((o) => {
                const st = scheduleStatus({ dateISO: o.occurrence_date, submitted: o.submitted, holiday: o.holiday, todayISO: toISODate(todayJakarta()) });
                const badge = o.holiday ? <StatusBadge kind="libur">Libur</StatusBadge>
                  : o.submitted ? <StatusBadge kind="hadir">Sudah diisi</StatusBadge>
                  : st === 'missing' ? <StatusBadge kind="alpha">Belum diisi</StatusBadge>
                  : st === 'today' ? <StatusBadge kind="info">Hari ini</StatusBadge>
                  : <StatusBadge kind="info">Mendatang</StatusBadge>;
                return (
                  <div className={`master-row sched sched-${st}`} key={o.id}>
                    <span>{formatID(o.occurrence_date)} • {String(o.occurrence_time).slice(0, 5)} {badge}</span>
                    <button
                      type="button"
                      className="btn"
                      style={{ minHeight: 38 }}
                      onClick={() => {
                        if (o.holiday) { openHolidayEditor(o); return; }
                        setSelectedKey(o.id);
                        setEditOcc(o);
                        setEditing(true);
                        setShowEditPicker(false);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      Edit
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {!editLoading && editTab === 'khusus' && (
            <div className="master-rows rows-loose">
              {editSpecials.length === 0 && <p className="hint">Tidak ada pengajian khusus pada bulan ini.</p>}
              {editSpecials.map((e) => (
                <div className="master-row" key={e.id}>
                  <span>{e.event_type_snapshot || 'Pengajian Khusus'} • {formatID(e.event_date)} {e.submitted ? <StatusBadge kind="hadir">Sudah diisi</StatusBadge> : <StatusBadge kind="info">Belum diisi</StatusBadge>}</span>
                  <button
                    type="button"
                    className="btn"
                    style={{ minHeight: 38 }}
                    onClick={() => { setShowEditPicker(false); setParams({ special: e.id }); }}
                  >
                    Buka
                  </button>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
      {holidayEdit && (
        <Modal
          title="Edit Jadwal Libur"
          onClose={() => { setHolidayEdit(null); setCancelConfirm(false); }}
          foot={<>
            <button className="btn" onClick={() => { setHolidayEdit(null); setCancelConfirm(false); }}>Batal</button>
            <button className="btn btn-danger" disabled={holidayEditBusy} onClick={() => setCancelConfirm(true)}>Batalkan Libur</button>
            <button className="btn btn-primary" disabled={holidayEditBusy} onClick={saveHolidayReason}>{holidayEditBusy ? 'Menyimpan...' : 'Simpan Perubahan'}</button>
          </>}
        >
          <p style={{ marginTop: 0 }}>Tanggal: <strong>{formatID(holidayEdit.occ.occurrence_date)}</strong> • {String(holidayEdit.occ.occurrence_time).slice(0, 5)}</p>
          <p><StatusBadge kind="libur">Libur</StatusBadge></p>
          <label className="field"><span>Alasan</span>
            <textarea
              className="input"
              rows={3}
              value={holidayEdit.reason}
              onChange={(e) => setHolidayEdit((p) => (p ? { ...p, reason: e.target.value } : p))}
              placeholder="Contoh: Pengajian khusus menggantikan jadwal rutin"
            />
          </label>
          {holidayEdit.linkedSpecial && (
            <div className="banner warn"><span>Jadwal ini masih ditandai sebagai jadwal yang digantikan oleh {holidayEdit.linkedSpecial.event_type_snapshot || 'pengajian khusus'} ({holidayEdit.linkedSpecial.event_date ? formatID(holidayEdit.linkedSpecial.event_date) : ''}). Membatalkan libur akan membuat jadwal rutin dapat diisi kembali.</span></div>
          )}
          {cancelConfirm && (
            <div className="banner danger">
              <span>Batalkan status libur? Alasan ikut terhapus dan jadwal kembali dapat diisi. Jadwal rutin induk tidak ikut terhapus.</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button className="btn" style={{ minHeight: 38 }} onClick={() => setCancelConfirm(false)}>Kembali</button>
                <button className="btn btn-danger" style={{ minHeight: 38 }} disabled={holidayEditBusy} onClick={cancelHoliday}>{holidayEditBusy ? 'Memproses...' : 'Ya, batalkan'}</button>
              </span>
            </div>
          )}
        </Modal>
      )}
      {showConflicts && (
        <Modal title="Perbedaan data dengan server" onClose={() => setShowConflicts(false)} foot={<button className="btn" onClick={() => setShowConflicts(false)}>Tutup</button>}>
          <p className="card-desc">Data di perangkat berbeda dengan data server. Pilih data yang dipertahankan untuk setiap jadwal.</p>
          {(myConflicts.length ? myConflicts : conflicts).map((op) => (
            <div className="conflict-row" key={op.id}>
              <div>
                <strong>{op.payload?.label || (op.payload?.occurrence?.occurrence_date ? formatID(op.payload.occurrence.occurrence_date) : 'Jadwal')}</strong>
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
