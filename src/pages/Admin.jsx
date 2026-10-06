import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../lib/store.jsx';
import { supabase } from '../lib/supabaseClient.js';
import { idbGet, idbSet } from '../lib/idb.js';
import { DEFAULT_ABSENCE, DEFAULT_STATUS, DEFAULT_HADITH, DEFAULT_FREE, DEFAULT_SPEAKERS, DEFAULT_SPECIAL_TYPES, MEMBER_CATEGORIES } from '../lib/seed.js';
import { Modal, Empty, PlusIcon, TrashIcon, PencilIcon, ClockIcon, CustomSelect, UsersIcon, BookOpenIcon, LayersIcon, ArrowLeftIcon, StatusBadge } from '../components/ui.jsx';
import { formatDateShortID, formatID } from '../lib/dates.js';
import { DateField, TimeField } from '../components/fields.jsx';

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function timeRange(start, end) {
  const s = String(start || '').slice(0, 5);
  const e = String(end || '').slice(0, 5);
  return e && e !== s ? `${s} – ${e}` : s;
}

function useMaster(account, key, defaults, table) {
  const [items, setItems] = useState([]);
  const { isGuest, supabaseReady } = useApp();
  useEffect(() => {
    (async () => {
      if (!account) return;
      if (isGuest || !supabaseReady) {
        const local = await idbGet('guest-data', null);
        const map = { absence: local?.absenceTypes || [], status: local?.statuses || [], hadith: local?.hadith || [], free: local?.free || [], speaker: local?.speakers || [], special: local?.specialTypes || [] };
        setItems(map[key] || defaults.map((n, i) => ({ id: `${key}-${i}`, name: n })));
        return;
      }
      const { data } = await supabase.from(table).select('*').eq('account_id', account.id).order('name');
      setItems(data || []);
    })();
  }, [account?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return [items, setItems];
}

function Crud({ title, desc, items, onAdd, onEdit, onDelete, placeholder }) {
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null);
  const [val, setVal] = useState('');
  const filtered = items.filter((i) => (i.name || '').toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="admin-sub">
      <div className="admin-sub-head">
        <div><h3 className="card-title" style={{ fontSize: 15 }}>{title}</h3><p className="card-desc" style={{ marginBottom: 0 }}>{desc}</p></div>
        <button className="btn btn-primary" style={{ minHeight: 40, padding: '8px 12px', fontSize: 13 }} onClick={() => { setModal('add'); setVal(''); }}><PlusIcon /> Tambah</button>
      </div>
      <input className="input search" placeholder={placeholder || 'Cari...'} value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Cari ${title}`} />
      {filtered.length === 0 && <p className="hint">Belum ada data.</p>}
      {filtered.length > 0 && (
        <div className="master-rows">
          {filtered.map((it) => (
            <div className="master-row" key={it.id}>
              <span>{it.name}</span>
              <span className="master-actions">
                <button className="icon-btn edit" aria-label={`Edit ${it.name}`} onClick={() => { setModal(it.id); setVal(it.name); }}><PencilIcon /></button>
                <button className="icon-btn danger" aria-label={`Hapus ${it.name}`} onClick={() => onDelete(it)}><TrashIcon /></button>
              </span>
            </div>
          ))}
        </div>
      )}
      {modal && (
        <Modal title={modal === 'add' ? `Tambah ${title}` : `Edit ${title}`} onClose={() => setModal(null)}
          foot={<><button className="btn" onClick={() => setModal(null)}>Batal</button><button className="btn btn-primary" onClick={() => { if (!val.trim()) return; modal === 'add' ? onAdd(val.trim()) : onEdit(modal, val.trim()); setModal(null); }}>Simpan</button></>}>
          <label className="field"><span>Nama</span><input className="input" value={val} onChange={(e) => setVal(e.target.value)} /></label>
        </Modal>
      )}
    </div>
  );
}

function BackButton({ onBack }) {
  return (
    <button className="btn" style={{ marginBottom: 12 }} onClick={onBack}>
      <ArrowLeftIcon /> Kembali ke Admin
    </button>
  );
}

function ScheduleModal({ scheduleModal, scheduleForm, setScheduleForm, onClose, onSave }) {
  if (!scheduleModal) return null;
  const isAdd = scheduleModal === 'add';
  return (
    <Modal
      title={isAdd ? 'Tambah Jadwal Rutin' : 'Edit Jadwal Rutin'}
      onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Batal</button><button className="btn btn-primary" onClick={onSave}>Simpan</button></>}
    >
      <label className="field"><span>Hari</span>
        <CustomSelect
          value={scheduleForm.dow}
          ariaLabel="Hari jadwal"
          placeholder="Pilih hari"
          options={DAYS.map((d, i) => ({ value: i, label: d }))}
          onChange={(v) => setScheduleForm((p) => ({ ...p, dow: Number(v) }))}
        />
      </label>
      <div className="row cols-2">
        <label className="field"><span>Jam mulai</span><TimeField value={scheduleForm.start} onChange={(v) => setScheduleForm((p) => ({ ...p, start: v }))} ariaLabel="Jam mulai jadwal" /></label>
        <label className="field" style={{ marginBottom: 0 }}><span>Jam selesai</span><TimeField value={scheduleForm.end} onChange={(v) => setScheduleForm((p) => ({ ...p, end: v }))} ariaLabel="Jam selesai jadwal" /></label>
      </div>
    </Modal>
  );
}

function MemberModal({ memberModal, memberForm, setMemberForm, statuses, onClose, onSave, onRemoveQr }) {
  if (!memberModal) return null;
  return (
    <Modal title={memberModal === 'add' ? 'Tambah anggota' : 'Edit anggota'} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Batal</button><button className="btn btn-primary" onClick={onSave}>Simpan</button></>}>
      <label className="field"><span>Nama lengkap</span><input className="input" value={memberForm.full_name} onChange={(e) => setMemberForm({ ...memberForm, full_name: e.target.value })} /></label>
      <label className="field"><span>Nama panggilan (boleh kosong)</span><input className="input" value={memberForm.nickname} onChange={(e) => setMemberForm({ ...memberForm, nickname: e.target.value })} /></label>
      <div className="row cols-2">
        <label className="field"><span>Jenis kelamin</span>
          <CustomSelect value={memberForm.gender} ariaLabel="Jenis kelamin" placeholder="Pilih"
            options={[{ value: 'MALE', label: 'Laki-laki' }, { value: 'FEMALE', label: 'Perempuan' }]}
            onChange={(v) => setMemberForm({ ...memberForm, gender: v })} />
        </label>
        <label className="field"><span>Kategori</span>
          <CustomSelect value={memberForm.category} ariaLabel="Kategori anggota" placeholder="Pilih kategori"
            options={[{ value: '', label: 'Belum ditentukan' }, ...MEMBER_CATEGORIES.map((c) => ({ value: c, label: c }))]}
            onChange={(v) => setMemberForm({ ...memberForm, category: v })} />
        </label>
      </div>
      <div className="row cols-2">
        <label className="field"><span>Status</span>
          <CustomSelect value={memberForm.status} ariaLabel="Status anggota" placeholder="Belum ditentukan"
            options={[{ value: '', label: 'Belum ditentukan' }, ...statuses.map((s) => ({ value: s.name, label: s.name }))]}
            onChange={(v) => setMemberForm({ ...memberForm, status: v })} />
        </label>
        <label className="field"><span>Tanggal lahir</span><DateField value={memberForm.birth_date} onChange={(v) => setMemberForm({ ...memberForm, birth_date: v })} ariaLabel="Tanggal lahir anggota" placeholder="Pilih tanggal lahir" /></label>
      </div>
      <label className="field"><span>Status aktif</span>
        <CustomSelect value={memberForm.active ? '1' : '0'} ariaLabel="Status aktif" placeholder="Pilih"
          options={[{ value: '1', label: 'Aktif' }, { value: '0', label: 'Nonaktif' }]}
          onChange={(v) => setMemberForm({ ...memberForm, active: v === '1' })} />
      </label>
      <div className="field"><span>QR Anggota (ID kartu Generus)</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', flex: 1, minWidth: 0 }}
            value={memberForm.qr}
            onChange={(e) => setMemberForm({ ...memberForm, qr: e.target.value })}
            placeholder="Contoh: 4001001"
            autoComplete="off"
            aria-label="ID QR anggota"
          />
          {memberForm.qr ? (
            <button type="button" className="btn" style={{ minHeight: 44, flex: 'none' }} onClick={onRemoveQr}>Hapus</button>
          ) : null}
        </div>
        <p className="hint" style={{ marginTop: 6, marginBottom: 0 }}>
          {memberForm.qr
            ? 'ID tersimpan setelah tekan Simpan. Satu ID hanya boleh milik satu anggota.'
            : 'Kosong berarti tanpa QR. Isi sesuai ID yang terbaca di Google Lens.'}
        </p>
      </div>
    </Modal>
  );
}

export default function Admin() {
  const { account, isGuest, supabaseReady, toast, loadSnapshot, online } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const view = location.pathname.endsWith('/anggota')
    ? 'anggota'
    : location.pathname.endsWith('/pengajian')
      ? 'pengajian'
      : location.pathname.endsWith('/materi')
        ? 'materi'
        : 'menu';
  function go(v) {
    navigate(v === 'menu' ? '/admin' : `/admin/${v}`);
  }
  const [members, setMembers] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [lockHours, setLockHours] = useState(24);
  const [memberModal, setMemberModal] = useState(null);
  const [memberForm, setMemberForm] = useState({ full_name: '', nickname: '', gender: 'MALE', status: '', category: '', birth_date: '', active: true, qr: '' });
  const [q, setQ] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [fGender, setFGender] = useState('all');
  const [fCat, setFCat] = useState('all');
  const [fStatus, setFStatus] = useState('all');
  const [fActive, setFActive] = useState('all');
  const [fAge, setFAge] = useState('all');

  const [absence, setAbsence] = useMaster(account, 'absence', DEFAULT_ABSENCE, 'absence_types');
  const [statuses, setStatuses] = useMaster(account, 'status', DEFAULT_STATUS, 'member_statuses');
  const [hadith, setHadith] = useMaster(account, 'hadith', DEFAULT_HADITH, 'hadith_materials');
  const [free, setFree] = useMaster(account, 'free', DEFAULT_FREE, 'free_activity_types');
  const [speakers, setSpeakers] = useMaster(account, 'speaker', DEFAULT_SPEAKERS, 'speakers');
  const [specials, setSpecials] = useMaster(account, 'special', DEFAULT_SPECIAL_TYPES, 'special_event_types');
  const [specEvents, setSpecEvents] = useState([]);
  const [specLoading, setSpecLoading] = useState(false);
  const [scheduleModal, setScheduleModal] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({ dow: 3, start: '19:30', end: '21:30' });

  useEffect(() => {
    (async () => {
      if (!account) return;
      if (isGuest || !supabaseReady) {
        const local = await idbGet('guest-data', null);
        setMembers(local?.members || []);
        setSchedules(local?.schedules || []);
        setLockHours(local?.lockHours || 24);
        return;
      }
      const [m, s, st] = await Promise.all([
        supabase.from('members').select('*, member_statuses(name)').eq('account_id', account.id).order('nickname'),
        supabase.from('recurring_schedules').select('*').eq('account_id', account.id).order('day_of_week'),
        supabase.from('app_settings').select('*').eq('account_id', account.id).maybeSingle(),
      ]);
      setMembers(m.data || []);
      setSchedules((s.data || []).map((x) => ({ id: x.id, day_of_week: x.day_of_week, event_time: String(x.event_time).slice(0, 5), end_time: x.end_time ? String(x.end_time).slice(0, 5) : null, active: x.active })));
      if (st.data) setLockHours(st.data.lock_duration_hours);
    })();
  }, [account?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      if (view !== 'pengajian' || !account) return;
      setSpecLoading(true);
      try {
        if (isGuest || !supabaseReady || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
          const snap = await loadSnapshot(account.id).catch(() => null);
          const list = snap?.specials || [];
          const att = snap?.specialAtt || {};
          setSpecEvents(list.map((e) => ({ ...e, submitted: Boolean((att[e.id] || []).length), replaced_date: null })));
          setSpecLoading(false);
          return;
        }
        const { data: evs } = await supabase.from('special_events').select('*').eq('account_id', account.id).order('event_date', { ascending: false }).limit(50);
        const list = evs || [];
        const ids = list.map((e) => e.id);
        let filled = new Set();
        const replacedDates = {};
        if (ids.length) {
          const { data: att } = await supabase.from('special_attendance').select('special_event_id').in('special_event_id', ids);
          filled = new Set((att || []).map((a) => a.special_event_id));
        }
        const linked = list.map((e) => e.linked_holiday_occurrence_id).filter(Boolean);
        if (linked.length) {
          const { data: hols } = await supabase.from('holidays').select('occurrence_id,holiday_date').in('occurrence_id', linked);
          (hols || []).forEach((h) => { replacedDates[h.occurrence_id] = h.holiday_date; });
        }
        setSpecEvents(list.map((e) => ({ ...e, submitted: filled.has(e.id), replaced_date: e.linked_holiday_occurrence_id ? (replacedDates[e.linked_holiday_occurrence_id] || null) : null })));
      } catch { /* abaikan */ }
      setSpecLoading(false);
    })();
  }, [view, account?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function persistLocal(patch) {
    const local = (await idbGet('guest-data', null)) || {};
    await idbSet('guest-data', { ...local, ...patch });
  }

  async function addMaster(table, setter, name) {
    if (isGuest || !supabaseReady) {
      const item = { id: `x_${Date.now()}`, name };
      setter((p) => [...p, item]);
      return;
    }
    const { data, error } = await supabase.from(table).insert({ account_id: account.id, name }).select().single();
    if (error) { toast('Gagal menambah. Mungkin nama sudah ada.'); return; }
    setter((p) => [...p, data]);
  }
  async function editMaster(table, setter, id, name) {
    if (isGuest || !supabaseReady) { setter((p) => p.map((x) => x.id === id ? { ...x, name } : x)); return; }
    await supabase.from(table).update({ name }).eq('id', id);
    setter((p) => p.map((x) => x.id === id ? { ...x, name } : x));
  }
  async function delMaster(table, setter, it, warn) {
    if (!window.confirm(`${warn} "${it.name}" secara permanen? Data yang sudah tersimpan tetap ditampilkan memakai snapshot.`)) return;
    if (isGuest || !supabaseReady) { setter((p) => p.filter((x) => x.id !== it.id)); return; }
    await supabase.from(table).delete().eq('id', it.id);
    setter((p) => p.filter((x) => x.id !== it.id));
    toast(`"${it.name}" dihapus permanen.`);
  }

  async function addSchedule(dow, start, end) {
    if (!start || !end) { toast('Isi jam mulai dan jam selesai.'); return false; }
    if (end <= start) { toast('Jam selesai harus lebih besar dari jam mulai.'); return false; }
    if (isGuest || !supabaseReady) {
      const ns = [...schedules, { id: `sch_${Date.now()}`, day_of_week: dow, event_time: start, end_time: end, active: true }];
      setSchedules(ns); persistLocal({ schedules: ns });
    } else {
      const { data, error } = await supabase.from('recurring_schedules').insert({ account_id: account.id, day_of_week: dow, event_time: start, end_time: end }).select().single();
      if (error) { toast('Gagal menambah jadwal.'); return false; }
      setSchedules((p) => [...p, { id: data.id, day_of_week: data.day_of_week, event_time: String(data.event_time).slice(0, 5), end_time: data.end_time ? String(data.end_time).slice(0, 5) : null, active: true }]);
    }
    toast('Jadwal rutin ditambahkan. Berlaku untuk jadwal ke depan.');
    return true;
  }
  async function editSchedule(id, dow, start, end) {
    if (!start || !end) { toast('Isi jam mulai dan jam selesai.'); return false; }
    if (end <= start) { toast('Jam selesai harus lebih besar dari jam mulai.'); return false; }
    if (isGuest || !supabaseReady) {
      const ns = schedules.map((x) => x.id === id ? { ...x, day_of_week: dow, event_time: start, end_time: end } : x);
      setSchedules(ns); persistLocal({ schedules: ns });
    } else {
      const { error } = await supabase.from('recurring_schedules').update({ day_of_week: dow, event_time: start, end_time: end }).eq('id', id);
      if (error) { toast('Gagal menyimpan perubahan.'); return false; }
      setSchedules((p) => p.map((x) => x.id === id ? { ...x, day_of_week: dow, event_time: start, end_time: end } : x));
    }
    toast('Jadwal rutin diperbarui. Berlaku untuk jadwal ke depan.');
    return true;
  }
  function openAddSchedule() {
    setScheduleForm({ dow: 3, start: '19:30', end: '21:30' });
    setScheduleModal('add');
  }
  function openEditSchedule(s) {
    setScheduleForm({ dow: s.day_of_week, start: String(s.event_time).slice(0, 5), end: String(s.end_time || '').slice(0, 5) });
    setScheduleModal(s.id);
  }
  async function saveScheduleModal() {
    const ok = scheduleModal === 'add'
      ? await addSchedule(Number(scheduleForm.dow), scheduleForm.start, scheduleForm.end)
      : await editSchedule(scheduleModal, Number(scheduleForm.dow), scheduleForm.start, scheduleForm.end);
    if (ok) setScheduleModal(null);
  }
  async function delSchedule(s) {
    if (!window.confirm(`Hapus jadwal ${DAYS[s.day_of_week]} ${timeRange(s.event_time, s.end_time)}? Histori yang sudah tersimpan tidak ikut berubah.`)) return;
    if (isGuest || !supabaseReady) { const ns = schedules.filter((x) => x.id !== s.id); setSchedules(ns); persistLocal({ schedules: ns }); }
    else { await supabase.from('recurring_schedules').delete().eq('id', s.id); setSchedules((p) => p.filter((x) => x.id !== s.id)); }
  }
  async function saveLock(v) {
    setLockHours(v);
    if (isGuest || !supabaseReady) persistLocal({ lockHours: v });
    else await supabase.from('app_settings').upsert({ account_id: account.id, lock_duration_hours: v });
  }

  if (!account) return <div className="card"><Empty title="Perlu masuk" desc="Masuk untuk mengelola data." /></div>;

  const activeFilterCount = [fGender, fCat, fStatus, fActive, fAge].filter((v) => v !== 'all').length + (q.trim() ? 1 : 0);
  function resetFilters() {
    setQ('');
    setFGender('all');
    setFCat('all');
    setFStatus('all');
    setFActive('all');
    setFAge('all');
  }
  function ageOf(birth) {
    if (!birth) return null;
    const d = new Date(`${birth}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    let a = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a -= 1;
    return a;
  }
  const filteredMembers = members.filter((m) => {
    const needle = q.trim().toLowerCase();
    if (needle && !(`${m.full_name || ''} ${m.nickname || ''}`.toLowerCase().includes(needle))) return false;
    if (fGender !== 'all' && m.gender !== fGender) return false;
    if (fCat !== 'all' && (m.member_category || '') !== fCat) return false;
    const stName = m.member_statuses?.name || m.status || '';
    if (fStatus === '__none') { if (stName) return false; }
    else if (fStatus !== 'all' && stName !== fStatus) return false;
    if (fActive === 'active' && !m.active) return false;
    if (fActive === 'inactive' && m.active) return false;
    if (fAge === '__none') { if (m.birth_date) return false; }
    else if (fAge !== 'all') {
      const a = ageOf(m.birth_date);
      if (a === null) return false;
      if (fAge === 'lt13' && !(a < 13)) return false;
      if (fAge === 't13_17' && !(a >= 13 && a <= 17)) return false;
      if (fAge === 't18_25' && !(a >= 18 && a <= 25)) return false;
      if (fAge === 'gt25' && !(a > 25)) return false;
    }
    return true;
  });

  function devMember(...args) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug('[MEMBER FORM]', ...args);
    }
  }

  function qrMissingColumn(err) {
    if (err?.code === '42703') return true;
    const m = String(err?.message || err || '');
    return /qr_identifier/i.test(m) && /does not exist/i.test(m);
  }

  function qrDuplicateKey(err) {
    return err?.code === '23505' || /duplicate key value/i.test(String(err?.message || err || ''));
  }

  function qrRlsDenied(err) {
    return err?.code === '42501' || /row-level security|permission denied|not allowed/i.test(String(err?.message || err || ''));
  }

  async function checkQrDuplicate(qrVal) {
    if (!qrVal) return null;
    const currentId = memberModal !== 'add' ? memberModal : null;
    const localOwner = members.find((m) => (m.qr_identifier || '') !== '' && m.qr_identifier === qrVal && m.id !== currentId);
    if (localOwner) return localOwner.nickname || localOwner.full_name;
    if (!isGuest && supabaseReady && online) {
      try {
        const { data } = await supabase.from('members').select('id,nickname,full_name').eq('account_id', account.id).eq('qr_identifier', qrVal).maybeSingle();
        if (data && data.id !== currentId) return data.nickname || data.full_name;
      } catch { /* gunakan hasil lokal */ }
    }
    return null;
  }

  function removeQr() {
    if (!memberForm.qr) return;
    if (!window.confirm('Hapus QR dari anggota ini? Data absensi historis tidak ikut dihapus.')) return;
    setMemberForm((p) => ({ ...p, qr: '' }));
  }

  async function saveMember() {
    devMember('submit');
    if (!memberForm.full_name.trim()) { toast('Nama lengkap wajib diisi.'); return; }
    const qrVal = String(memberForm.qr || '').trim();
    devMember('qr_identifier:', JSON.stringify(qrVal));
    if (qrVal) {
      let ownerName = null;
      try {
        ownerName = await checkQrDuplicate(qrVal);
      } catch (e) {
        devMember('duplicate check error, lanjut dengan guard DB:', e);
      }
      if (ownerName) { toast(`QR sudah terdaftar pada anggota: ${ownerName}. Satu QR tidak boleh dipakai dua anggota.`); return; }
    }
    const statusId = memberForm.status ? (statuses.find((s) => s.name === memberForm.status)?.id || null) : null;
    const payloadBase = {
      full_name: memberForm.full_name.trim(),
      nickname: memberForm.nickname.trim(),
      gender: memberForm.gender,
      member_category: memberForm.category || null,
      birth_date: memberForm.birth_date || null,
      active: memberForm.active,
      qr_identifier: qrVal ? qrVal : null,
    };
    if (isGuest || !supabaseReady) {
      if (memberModal === 'add') {
        const item = { id: `m_${Date.now()}`, ...payloadBase, status: memberForm.status, joined_at: new Date().toISOString().slice(0, 10) };
        const ns = [...members, item]; setMembers(ns); persistLocal({ members: ns });
      } else {
        const ns = members.map((m) => m.id === memberModal ? { ...m, ...payloadBase, status: memberForm.status } : m); setMembers(ns); persistLocal({ members: ns });
      }
    } else {
      devMember('payload:', { ...payloadBase, status_id: statusId });
      try {
        if (memberModal === 'add') {
          const { data, error } = await supabase.from('members').insert({ account_id: account.id, ...payloadBase, status_id: statusId }).select().single();
          devMember('response:', data ? 'ok' : null, 'error:', error);
          if (error) throw error;
          if (data) setMembers((p) => [...p, { ...data, member_statuses: statusId ? { name: memberForm.status } : null }]);
        } else {
          const { error } = await supabase.from('members').update({ ...payloadBase, status_id: statusId }).eq('id', memberModal);
          devMember('response: ok, error:', error);
          if (error) throw error;
          setMembers((p) => p.map((m) => m.id === memberModal ? { ...m, ...payloadBase, status_id: statusId, member_statuses: statusId ? { name: memberForm.status } : null } : m));
        }
      } catch (e) {
        devMember('error:', e);
        if (qrMissingColumn(e)) { toast('Database belum memiliki kolom QR. Jalankan migration QR di SQL Editor lalu coba lagi.'); return; }
        if (qrDuplicateKey(e)) { toast('QR ini sudah terdaftar pada anggota lain. Gunakan ID yang berbeda.'); return; }
        if (qrRlsDenied(e)) { toast('Izin ditolak database. Periksa kembali hak akses akun ini.'); return; }
        toast('Gagal menyimpan. Periksa koneksi lalu coba lagi.');
        return;
      }
    }
    setMemberModal(null); toast('Data anggota tersimpan.');
  }

  if (view === 'anggota') {
    return (
      <div>
        <BackButton onBack={() => go('menu')} />
        <section className="admin-group" aria-label="Anggota" style={{ marginTop: 0 }}>
          <h3 className="admin-group-head">ANGGOTA</h3>
          <div className="admin-sub">
            <div className="admin-sub-head">
              <div><h3 className="card-title" style={{ fontSize: 15 }}>Data Anggota</h3><p className="card-desc" style={{ marginBottom: 0 }}>{members.filter((m) => m.active).length} aktif dari {members.length} anggota.</p></div>
              <button className="btn btn-primary" style={{ minHeight: 40, padding: '8px 12px', fontSize: 13 }} onClick={() => { setMemberForm({ full_name: '', nickname: '', gender: 'MALE', status: '', category: '', birth_date: '', active: true, qr: '' }); setMemberModal('add'); }}><PlusIcon /> Tambah</button>
            </div>
            <input className="input search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / nickname..." aria-label="Cari anggota" />
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn" style={{ minHeight: 40 }} onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
              Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
            <button type="button" className="btn" style={{ minHeight: 40 }} disabled={activeFilterCount === 0} onClick={resetFilters}>Reset Filter</button>
            <span className="hint" style={{ alignSelf: 'center' }}>{filteredMembers.length} dari {members.length} anggota</span>
          </div>
          {showFilters && (
            <div className="row cols-2" style={{ marginBottom: 10 }}>
              <div className="field" style={{ marginBottom: 0 }}><span>Gender</span>
                <CustomSelect value={fGender} ariaLabel="Filter gender" placeholder="Semua Gender"
                  options={[{ value: 'all', label: 'Semua Gender' }, { value: 'MALE', label: 'Laki-laki' }, { value: 'FEMALE', label: 'Perempuan' }]}
                  onChange={setFGender} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}><span>Kategori</span>
                <CustomSelect value={fCat} ariaLabel="Filter kategori" placeholder="Semua Kategori"
                  options={[{ value: 'all', label: 'Semua Kategori' }, ...MEMBER_CATEGORIES.map((c) => ({ value: c, label: c }))]}
                  onChange={setFCat} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}><span>Status</span>
                <CustomSelect value={fStatus} ariaLabel="Filter status" placeholder="Semua Status"
                  options={[{ value: 'all', label: 'Semua Status' }, { value: '__none', label: 'Belum ada status' }, ...statuses.map((s) => ({ value: s.name, label: s.name }))]}
                  onChange={setFStatus} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}><span>Keaktifan</span>
                <CustomSelect value={fActive} ariaLabel="Filter keaktifan" placeholder="Semua"
                  options={[{ value: 'all', label: 'Semua' }, { value: 'active', label: 'Aktif' }, { value: 'inactive', label: 'Tidak Aktif' }]}
                  onChange={setFActive} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}><span>Kelompok usia</span>
                <CustomSelect value={fAge} ariaLabel="Filter kelompok usia" placeholder="Semua Usia"
                  options={[
                    { value: 'all', label: 'Semua Usia' },
                    { value: 'lt13', label: 'Di bawah 13' },
                    { value: 't13_17', label: '13–17 tahun' },
                    { value: 't18_25', label: '18–25 tahun' },
                    { value: 'gt25', label: 'Di atas 25' },
                    { value: '__none', label: 'Tanpa tanggal lahir' },
                  ]}
                  onChange={setFAge} />
              </div>
            </div>
          )}
            {filteredMembers.length === 0 && <p className="hint">Belum ada anggota yang cocok.</p>}
            {filteredMembers.length > 0 && (
              <div className="table-wrap">
                <table className="att members-table">
                  <thead><tr><th>Nama lengkap</th><th>Panggilan</th><th>Kategori</th><th>Gender</th><th>Status</th><th>Tgl lahir</th><th>Aktif</th><th><span className="hint">Aksi</span></th></tr></thead>
                  <tbody>
                    {filteredMembers.map((m) => (
                      <tr key={m.id} className={m.active ? '' : 'row-inactive'}>
                        <td><strong>{m.full_name}</strong>{m.qr_identifier ? <span> <StatusBadge kind="info">QR</StatusBadge></span> : null}</td>
                        <td>{m.nickname || '-'}</td>
                        <td>{m.member_category || '-'}</td>
                        <td>{m.gender === 'MALE' ? 'Laki-laki' : 'Perempuan'}</td>
                        <td>{m.member_statuses?.name || m.status || <span className="hint">Belum ditentukan</span>}</td>
                        <td>{m.birth_date ? formatDateShortID(m.birth_date) : '-'}</td>
                        <td><StatusBadge kind={m.active ? 'aktif' : 'nonaktif'}>{m.active ? 'Aktif' : 'Nonaktif'}</StatusBadge></td>
                        <td><button className="icon-btn edit" aria-label={`Edit ${m.nickname || m.full_name}`} onClick={() => { setMemberForm({ full_name: m.full_name, nickname: m.nickname || '', gender: m.gender, status: m.member_statuses?.name || m.status || '', category: m.member_category || '', birth_date: m.birth_date || '', active: m.active, qr: m.qr_identifier || '', id: m.id }); setMemberModal(m.id); }}><PencilIcon /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="admin-grid" style={{ marginTop: 12 }}>
            <Crud title="Status Anggota" desc="Contoh: Sekolah, Kuliah, Bekerja." items={statuses}
              onAdd={(n) => addMaster('member_statuses', setStatuses, n)}
              onEdit={(id, n) => editMaster('member_statuses', setStatuses, id, n)}
              onDelete={(it) => delMaster('member_statuses', setStatuses, it, 'Hapus status')} />
          </div>
        </section>
        <MemberModal
          memberModal={memberModal}
          memberForm={memberForm}
          setMemberForm={setMemberForm}
          statuses={statuses}
          onClose={() => setMemberModal(null)}
          onSave={saveMember}
          onRemoveQr={removeQr}
        />
      </div>
    );
  }

  if (view === 'pengajian') {
    return (
      <div>
        <BackButton onBack={() => go('menu')} />
        <section className="admin-group" aria-label="Pengajian" style={{ marginTop: 0 }}>
          <h3 className="admin-group-head">PENGAJIAN</h3>
          <div className="admin-grid cols-2">
            <div className="admin-sub">
              <div className="admin-sub-head">
                <div><h3 className="card-title" style={{ fontSize: 15 }}>Jadwal Rutin</h3><p className="card-desc" style={{ marginBottom: 0 }}>Hari dan jam boleh berbeda tiap jadwal.</p></div>
                <button className="btn btn-primary" style={{ minHeight: 40, padding: '8px 12px', fontSize: 13 }} onClick={openAddSchedule}><PlusIcon /> Tambah</button>
              </div>
              {schedules.length === 0 && <p className="hint">Belum ada jadwal rutin.</p>}
              {schedules.map((s) => (
                <div className="schedule-row" key={s.id}>
                  <div>
                    <div className="schedule-day">{DAYS[s.day_of_week]}</div>
                    <div className="schedule-time"><ClockIcon size={14} /> {timeRange(s.event_time, s.end_time)}</div>
                  </div>
                  <span className="master-actions">
                    <button className="icon-btn edit" aria-label={`Edit jadwal ${DAYS[s.day_of_week]}`} onClick={() => openEditSchedule(s)}><PencilIcon /></button>
                    <button className="icon-btn danger" aria-label={`Hapus jadwal ${DAYS[s.day_of_week]}`} onClick={() => delSchedule(s)}><TrashIcon /></button>
                  </span>
                </div>
              ))}
              <label className="field" style={{ marginTop: 12, marginBottom: 0 }}>
                <span>Batas perubahan absensi (jam, dihitung dari jam mulai jadwal)</span>
                <input className="input" type="number" min="1" max="168" value={lockHours} onChange={(e) => saveLock(Number(e.target.value))} />
              </label>
            </div>
            <Crud title="Jenis Izin" desc="Dipakai pada dropdown izin form absensi." items={absence}
              onAdd={(n) => addMaster('absence_types', setAbsence, n)}
              onEdit={(id, n) => editMaster('absence_types', setAbsence, id, n)}
              onDelete={(it) => delMaster('absence_types', setAbsence, it, 'Hapus jenis izin')} />
          </div>
          <div className="admin-grid" style={{ marginTop: 12 }}>
            <Crud title="Pengajian Khusus" desc="Master jenis kegiatan khusus." items={specials}
              onAdd={(n) => addMaster('special_event_types', setSpecials, n)}
              onEdit={(id, n) => editMaster('special_event_types', setSpecials, id, n)}
              onDelete={(it) => delMaster('special_event_types', setSpecials, it, 'Hapus jenis khusus')} />
          </div>
          <div className="admin-sub" style={{ marginTop: 12 }}>
            <div className="admin-sub-head">
              <div><h3 className="card-title" style={{ fontSize: 15 }}>Daftar Pengajian Khusus</h3><p className="card-desc" style={{ marginBottom: 0 }}>Buka detail untuk melihat atau mengisi absensi.</p></div>
              <button className="btn btn-primary" style={{ minHeight: 40, padding: '8px 12px', fontSize: 13 }} onClick={() => navigate('/?newSpecial=1')}><PlusIcon /> Buat</button>
            </div>
            {specLoading && <p className="hint">Memuat daftar...</p>}
            {!specLoading && specEvents.length === 0 && <p className="hint">Belum ada pengajian khusus. Buat yang pertama lewat tombol di atas.</p>}
            {specEvents.length > 0 && (
              <div className="master-rows">
                {specEvents.map((e) => (
                  <div className="master-row" key={e.id} style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div><strong>{e.event_type_snapshot || 'Pengajian Khusus'}</strong></div>
                      <div className="hint">{e.event_date ? formatID(e.event_date) : ''} • {timeRange(e.event_time, e.end_time)}</div>
                      <div className="hint">{e.linked_holiday_occurrence_id ? `Menggantikan: ${e.replaced_date ? formatID(e.replaced_date) : 'jadwal rutin (libur)'}` : 'Tidak menggantikan jadwal rutin'}</div>
                      <div style={{ marginTop: 6 }}><StatusBadge kind={e.submitted ? 'hadir' : 'info'}>{e.submitted ? 'Sudah diisi' : 'Belum diisi'}</StatusBadge></div>
                    </div>
                    <span className="master-actions">
                      <button className="btn" style={{ minHeight: 38 }} onClick={() => navigate(`/?special=${e.id}`)}>Lihat</button>
                      <button className="btn btn-primary" style={{ minHeight: 38 }} onClick={() => navigate(`/?special=${e.id}`)}>Isi Absensi</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
        <ScheduleModal
          scheduleModal={scheduleModal}
          scheduleForm={scheduleForm}
          setScheduleForm={setScheduleForm}
          onClose={() => setScheduleModal(null)}
          onSave={saveScheduleModal}
        />
      </div>
    );
  }

  if (view === 'materi') {
    return (
      <div>
        <BackButton onBack={() => go('menu')} />
        <section className="admin-group" aria-label="Materi" style={{ marginTop: 0 }}>
          <h3 className="admin-group-head">MATERI</h3>
          <div className="admin-grid cols-2">
            <Crud title="Hadist" desc="Master data hadist untuk form materi." items={hadith}
              onAdd={(n) => addMaster('hadith_materials', setHadith, n)}
              onEdit={(id, n) => editMaster('hadith_materials', setHadith, id, n)}
              onDelete={(it) => delMaster('hadith_materials', setHadith, it, 'Hapus hadist')} />
            <Crud title="Kegiatan Bebas" desc="Olahraga, ASAD, keakraban, dan lainnya." items={free}
              onAdd={(n) => addMaster('free_activity_types', setFree, n)}
              onEdit={(id, n) => editMaster('free_activity_types', setFree, id, n)}
              onDelete={(it) => delMaster('free_activity_types', setFree, it, 'Hapus kegiatan')} />
          </div>
          <div className="admin-grid" style={{ marginTop: 12 }}>
            <Crud title="Pemateri" desc="Dipakai untuk Quran, Hadist, Nasehat, dan kegiatan." items={speakers}
              onAdd={(n) => addMaster('speakers', setSpeakers, n)}
              onEdit={(id, n) => editMaster('speakers', setSpeakers, id, n)}
              onDelete={(it) => delMaster('speakers', setSpeakers, it, 'Hapus pemateri')} />
          </div>
        </section>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <h2 className="card-title">Admin</h2>
        <p className="card-desc">Kelola konfigurasi aplikasi. Pilih kategori untuk mengatur.</p>
      </div>
      <div className="menu-grid">
        <div className="menu-card">
          <div className="menu-icon" aria-hidden="true"><UsersIcon /></div>
          <h3 className="card-title" style={{ fontSize: 17 }}>Anggota</h3>
          <p className="card-desc">Kelola data anggota dan status anggota.</p>
          <ul className="menu-list">
            <li>Data anggota</li>
            <li>Status anggota</li>
          </ul>
          <button className="btn btn-primary btn-block" onClick={() => go('anggota')}>Kelola Anggota</button>
        </div>
        <div className="menu-card">
          <div className="menu-icon" aria-hidden="true"><BookOpenIcon /></div>
          <h3 className="card-title" style={{ fontSize: 17 }}>Pengajian</h3>
          <p className="card-desc">Kelola jadwal pengajian dan pengaturan absensi.</p>
          <ul className="menu-list">
            <li>Jadwal rutin</li>
            <li>Jenis izin</li>
            <li>Pengajian khusus</li>
          </ul>
          <button className="btn btn-primary btn-block" onClick={() => go('pengajian')}>Kelola Pengajian</button>
        </div>
        <div className="menu-card">
          <div className="menu-icon" aria-hidden="true"><LayersIcon /></div>
          <h3 className="card-title" style={{ fontSize: 17 }}>Materi</h3>
          <p className="card-desc">Kelola sumber materi dan kegiatan pengajian.</p>
          <ul className="menu-list">
            <li>Kegiatan bebas</li>
            <li>Materi</li>
            <li>Pemateri</li>
          </ul>
          <button className="btn btn-primary btn-block" onClick={() => go('materi')}>Kelola Materi</button>
        </div>
      </div>
    </div>
  );
}
