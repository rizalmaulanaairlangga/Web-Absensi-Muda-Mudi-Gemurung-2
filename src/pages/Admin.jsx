import React, { useEffect, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { supabase } from '../lib/supabaseClient.js';
import { idbGet, idbSet } from '../lib/idb.js';
import { DEFAULT_ABSENCE, DEFAULT_STATUS, DEFAULT_HADITH, DEFAULT_FREE, DEFAULT_SPEAKERS, DEFAULT_SPECIAL_TYPES } from '../lib/seed.js';
import { Modal, Empty } from '../components/ui.jsx';

function useMaster(account, key, defaults, table) {
  const [items, setItems] = useState([]);
  const { isGuest, supabaseReady, toast } = useApp();
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
  }, [account?.id]);
  return [items, setItems];
}

function Crud({ title, desc, items, onAdd, onEdit, onDelete, placeholder }) {
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null);
  const [val, setVal] = useState('');
  const filtered = items.filter((i) => (i.name || '').toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div><h3 className="card-title">{title}</h3><p className="card-desc">{desc}</p></div>
        <button className="btn btn-primary" onClick={() => { setModal('add'); setVal(''); }}>+ Tambah</button>
      </div>
      <input className="input search" placeholder={placeholder || 'Cari...'} value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Cari ${title}`} />
      <div className="admin-list">
        {filtered.length === 0 && <Empty title="Belum ada data" desc="Tambah data pertama." />}
        {filtered.map((it) => (
          <div className="admin-item" key={it.id}>
            <span>{it.name}</span>
            <span style={{ display: 'flex', gap: 6 }}>
              <button className="icon-btn" aria-label={`Edit ${it.name}`} onClick={() => { setModal(it.id); setVal(it.name); }}>✎</button>
              <button className="icon-btn" aria-label={`Hapus ${it.name}`} onClick={() => onDelete(it)}>🗑</button>
            </span>
          </div>
        ))}
      </div>
      {modal && (
        <Modal title={modal === 'add' ? `Tambah ${title}` : `Edit ${title}`} onClose={() => setModal(null)}
          foot={<><button className="btn" onClick={() => setModal(null)}>Batal</button><button className="btn btn-primary" onClick={() => { if (!val.trim()) return; modal === 'add' ? onAdd(val.trim()) : onEdit(modal, val.trim()); setModal(null); }}>Simpan</button></>}>
          <label className="field"><span>Nama</span><input className="input" value={val} onChange={(e) => setVal(e.target.value)} /></label>
        </Modal>
      )}
    </div>
  );
}

export default function Admin() {
  const { account, isGuest, supabaseReady, toast } = useApp();
  const [members, setMembers] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [lockHours, setLockHours] = useState(24);
  const [memberModal, setMemberModal] = useState(null);
  const [memberForm, setMemberForm] = useState({ full_name: '', nickname: '', gender: 'MALE', status: '', active: true });
  const [q, setQ] = useState('');

  const [absence, setAbsence] = useMaster(account, 'absence', DEFAULT_ABSENCE, 'absence_types');
  const [statuses, setStatuses] = useMaster(account, 'status', DEFAULT_STATUS, 'member_statuses');
  const [hadith, setHadith] = useMaster(account, 'hadith', DEFAULT_HADITH, 'hadith_materials');
  const [free, setFree] = useMaster(account, 'free', DEFAULT_FREE, 'free_activity_types');
  const [speakers, setSpeakers] = useMaster(account, 'speaker', DEFAULT_SPEAKERS, 'speakers');
  const [specials, setSpecials] = useMaster(account, 'special', DEFAULT_SPECIAL_TYPES, 'special_event_types');

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
      setSchedules((s.data || []).map((x) => ({ id: x.id, day_of_week: x.day_of_week, event_time: String(x.event_time).slice(0, 5), active: x.active })));
      if (st.data) setLockHours(st.data.lock_duration_hours);
    })();
  }, [account?.id]);

  async function persistLocal(patch) {
    const local = (await idbGet('guest-data', null)) || {};
    const next = { ...local, ...patch };
    await idbSet('guest-data', next);
  }

  async function addMaster(table, setter, name, localKey) {
    if (isGuest || !supabaseReady) {
      const item = { id: `x_${Date.now()}`, name };
      setter((p) => [...p, item]);
      const local = await idbGet('guest-data', null);
      if (local) {
        const map = { absenceTypes: 'absence', statuses: 'status', hadith: 'hadith', free: 'free', speakers: 'speaker', specialTypes: 'special' };
        const inv = Object.entries(map).find(([, v]) => v === localKey)?.[0];
        if (inv) { local[inv] = [...(local[inv] || []), item]; await idbSet('guest-data', local); }
      }
      return;
    }
    const { data, error } = await supabase.from(table).insert({ account_id: account.id, name }).select().single();
    if (error) { toast('Gagal menambah. Mungkin nama sudah ada.'); return; }
    setter((p) => [...p, data]);
  }
  async function delMaster(table, setter, it, warn) {
    if (!confirm(`${warn} "${it.name}" secara permanen? Data historis tetap ditampilkan memakai snapshot.`)) return;
    if (isGuest || !supabaseReady) { setter((p) => p.filter((x) => x.id !== it.id)); return; }
    await supabase.from(table).delete().eq('id', it.id);
    setter((p) => p.filter((x) => x.id !== it.id));
  }

  if (!account) return <div className="card"><Empty title="Perlu masuk" desc="Masuk untuk mengelola data." /></div>;

  const dayOpts = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  return (
    <div>
      <div className="card">
        <h2 className="card-title">Admin</h2>
        <p className="card-desc">Kelola anggota, jadwal, dan data master. Perubahan jadwal hanya berlaku ke depan.</p>
        <div className="row cols-2">
          <label className="field"><span>Batas perubahan (jam)</span>
            <input className="input" type="number" min="1" max="168" value={lockHours} onChange={async (e) => {
              const v = Number(e.target.value); setLockHours(v);
              if (isGuest || !supabaseReady) persistLocal({ lockHours: v });
              else await supabase.from('app_settings').upsert({ account_id: account.id, lock_duration_hours: v });
            }} />
          </label>
          <label className="field"><span>Cari anggota</span><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari anggota..." /></label>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="card-title">Anggota</h3>
          <button className="btn btn-primary" onClick={() => { setMemberForm({ full_name: '', nickname: '', gender: 'MALE', status: '', active: true }); setMemberModal('add'); }}>+ Tambah</button>
        </div>
        <div className="admin-list" style={{ marginTop: 10 }}>
          {members.filter((m) => (m.full_name + m.nickname).toLowerCase().includes(q.toLowerCase())).map((m) => (
            <div className="admin-item" key={m.id}>
              <div>
                <div><strong>{m.full_name}</strong> <span className="hint">({m.nickname})</span></div>
                <div className="hint">{m.gender === 'MALE' ? 'Laki-laki' : 'Perempuan'} • {m.member_statuses?.name || m.status || '-'}</div>
              </div>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span className={`badge ${m.active ? 'green' : 'gray'}`}>{m.active ? 'Aktif' : 'Nonaktif'}</span>
                <button className="icon-btn" aria-label={`Edit ${m.nickname}`} onClick={() => { setMemberForm({ full_name: m.full_name, nickname: m.nickname, gender: m.gender, status: m.member_statuses?.name || m.status || '', active: m.active, id: m.id }); setMemberModal(m.id); }}>✎</button>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Jadwal Rutin</h3>
        <p className="card-desc">Contoh: Rabu 19:30, Jumat 19:30. Jam tiap hari boleh berbeda.</p>
        {schedules.map((s) => (
          <div className="admin-item" key={s.id}>
            <span>{dayOpts[s.day_of_week]} • {s.event_time}</span>
            <button className="icon-btn" aria-label="Hapus jadwal" onClick={async () => {
              if (!confirm('Hapus jadwal rutin ini? Histori occurrence lama tidak ikut berubah.')) return;
              if (isGuest || !supabaseReady) { const ns = schedules.filter((x) => x.id !== s.id); setSchedules(ns); persistLocal({ schedules: ns }); }
              else { await supabase.from('recurring_schedules').delete().eq('id', s.id); setSchedules((p) => p.filter((x) => x.id !== s.id)); }
            }}>🗑</button>
          </div>
        ))}
        <AddSchedule onAdd={async (dow, time) => {
          if (isGuest || !supabaseReady) { const ns = [...schedules, { id: `sch_${Date.now()}`, day_of_week: dow, event_time: time, active: true }]; setSchedules(ns); persistLocal({ schedules: ns }); }
          else { const { data } = await supabase.from('recurring_schedules').insert({ account_id: account.id, day_of_week: dow, event_time: time }).select().single(); if (data) setSchedules((p) => [...p, { id: data.id, day_of_week: data.day_of_week, event_time: String(data.event_time).slice(0, 5), active: true }]); }
        }} />
      </div>

      <Crud title="Jenis Izin" desc="Dipakai pada dropdown izin form absensi." items={absence}
        onAdd={(n) => addMaster('absence_types', setAbsence, n, 'absence')}
        onEdit={async (id, n) => { if (isGuest || !supabaseReady) setAbsence((p) => p.map((x) => x.id === id ? { ...x, name: n } : x)); else { await supabase.from('absence_types').update({ name: n }).eq('id', id); setAbsence((p) => p.map((x) => x.id === id ? { ...x, name: n } : x)); } }}
        onDelete={(it) => delMaster('absence_types', setAbsence, it, 'Hapus jenis izin')} />
      <Crud title="Status Anggota" desc="Contoh: Sekolah, Kuliah, Bekerja." items={statuses}
        onAdd={(n) => addMaster('member_statuses', setStatuses, n, 'status')}
        onEdit={async (id, n) => { if (isGuest || !supabaseReady) setStatuses((p) => p.map((x) => x.id === id ? { ...x, name: n } : x)); else { await supabase.from('member_statuses').update({ name: n }).eq('id', id); setStatuses((p) => p.map((x) => x.id === id ? { ...x, name: n } : x)); } }}
        onDelete={(it) => delMaster('member_statuses', setStatuses, it, 'Hapus status')} />
      <Crud title="Materi Hadist" desc="Master hadist untuk form materi." items={hadith}
        onAdd={(n) => addMaster('hadith_materials', setHadith, n, 'hadith')}
        onEdit={async (id, n) => { if (isGuest || !supabaseReady) setHadith((p) => p.map((x) => x.id === id ? { ...x, name: n } : x)); else { await supabase.from('hadith_materials').update({ name: n }).eq('id', id); setHadith((p) => p.map((x) => x.id === id ? { ...x, name: n } : x)); } }}
        onDelete={(it) => delMaster('hadith_materials', setHadith, it, 'Hapus hadist')} />
      <Crud title="Kegiatan Bebas" desc="Olahraga, ASAD, keakraban, dan lainnya." items={free}
        onAdd={(n) => addMaster('free_activity_types', setFree, n, 'free')}
        onEdit={async (id, n) => { if (isGuest || !supabaseReady) setFree((p) => p.map((x) => x.id === id ? { ...x, name: n } : x)); else { await supabase.from('free_activity_types').update({ name: n }).eq('id', id); setFree((p) => p.map((x) => x.id === id ? { ...x, name: n } : x)); } }}
        onDelete={(it) => delMaster('free_activity_types', setFree, it, 'Hapus kegiatan')} />
      <Crud title="Pemateri" desc="Dipakai untuk Quran, Hadist, Nasehat, dan kegiatan." items={speakers}
        onAdd={(n) => addMaster('speakers', setSpeakers, n, 'speaker')}
        onEdit={async (id, n) => { if (isGuest || !supabaseReady) setSpeakers((p) => p.map((x) => x.id === id ? { ...x, name: n } : x)); else { await supabase.from('speakers').update({ name: n }).eq('id', id); setSpeakers((p) => p.map((x) => x.id === id ? { ...x, name: n } : x)); } }}
        onDelete={(it) => delMaster('speakers', setSpeakers, it, 'Hapus pemateri')} />
      <Crud title="Jenis Pengajian Khusus" desc="Master kegiatan khusus." items={specials}
        onAdd={(n) => addMaster('special_event_types', setSpecials, n, 'special')}
        onEdit={async (id, n) => { if (isGuest || !supabaseReady) setSpecials((p) => p.map((x) => x.id === id ? { ...x, name: n } : x)); else { await supabase.from('special_event_types').update({ name: n }).eq('id', id); setSpecials((p) => p.map((x) => x.id === id ? { ...x, name: n } : x)); } }}
        onDelete={(it) => delMaster('special_event_types', setSpecials, it, 'Hapus jenis khusus')} />

      {memberModal && (
        <Modal title={memberModal === 'add' ? 'Tambah anggota' : 'Edit anggota'} onClose={() => setMemberModal(null)}
          foot={<><button className="btn" onClick={() => setMemberModal(null)}>Batal</button><button className="btn btn-primary" onClick={async () => {
            if (!memberForm.full_name.trim() || !memberForm.nickname.trim()) { toast('Nama lengkap dan panggilan wajib diisi.'); return; }
            if (isGuest || !supabaseReady) {
              const local = await idbGet('guest-data', null);
              if (memberModal === 'add') {
                const item = { id: `m_${Date.now()}`, full_name: memberForm.full_name, nickname: memberForm.nickname, gender: memberForm.gender, status: memberForm.status, active: memberForm.active, joined_at: new Date().toISOString().slice(0, 10) };
                const ns = [...members, item]; setMembers(ns); persistLocal({ members: ns });
              } else {
                const ns = members.map((m) => m.id === memberModal ? { ...m, ...memberForm } : m); setMembers(ns); persistLocal({ members: ns });
              }
            } else {
              if (memberModal === 'add') {
                const { data } = await supabase.from('members').insert({ account_id: account.id, full_name: memberForm.full_name, nickname: memberForm.nickname, gender: memberForm.gender, active: memberForm.active }).select().single();
                if (data) setMembers((p) => [...p, data]);
              } else {
                await supabase.from('members').update({ full_name: memberForm.full_name, nickname: memberForm.nickname, gender: memberForm.gender, active: memberForm.active }).eq('id', memberModal);
                setMembers((p) => p.map((m) => m.id === memberModal ? { ...m, ...memberForm } : m));
              }
            }
            setMemberModal(null); toast('Data anggota tersimpan.');
          }}>Simpan</button></>}>
          <label className="field"><span>Nama lengkap</span><input className="input" value={memberForm.full_name} onChange={(e) => setMemberForm({ ...memberForm, full_name: e.target.value })} /></label>
          <label className="field"><span>Nama panggilan</span><input className="input" value={memberForm.nickname} onChange={(e) => setMemberForm({ ...memberForm, nickname: e.target.value })} /></label>
          <div className="row cols-2">
            <label className="field"><span>Jenis kelamin</span>
              <select className="input" value={memberForm.gender} onChange={(e) => setMemberForm({ ...memberForm, gender: e.target.value })}><option value="MALE">Laki-laki</option><option value="FEMALE">Perempuan</option></select>
            </label>
            <label className="field"><span>Status</span>
              <select className="input" value={memberForm.status} onChange={(e) => setMemberForm({ ...memberForm, status: e.target.value })}>
                <option value="">Pilih status</option>{statuses.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </label>
          </div>
          <label className="field"><span>Status aktif</span>
            <select className="input" value={memberForm.active ? '1' : '0'} onChange={(e) => setMemberForm({ ...memberForm, active: e.target.value === '1' })}><option value="1">Aktif</option><option value="0">Nonaktif</option></select>
          </label>
        </Modal>
      )}
    </div>
  );
}

function AddSchedule({ onAdd }) {
  const [dow, setDow] = useState(3);
  const [time, setTime] = useState('19:30');
  return (
    <div className="row cols-3" style={{ marginTop: 10 }}>
      <label className="field"><span>Hari</span>
        <select className="input" value={dow} onChange={(e) => setDow(Number(e.target.value))}>
          {['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'].map((d, i) => <option key={d} value={i}>{d}</option>)}
        </select>
      </label>
      <label className="field"><span>Jam</span><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      <div style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn" onClick={() => onAdd(dow, time)}>Tambah jadwal</button></div>
    </div>
  );
}
