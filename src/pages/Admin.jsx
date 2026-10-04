import React, { useEffect, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { supabase } from '../lib/supabaseClient.js';
import { idbGet, idbSet } from '../lib/idb.js';
import { DEFAULT_ABSENCE, DEFAULT_STATUS, DEFAULT_HADITH, DEFAULT_FREE, DEFAULT_SPEAKERS, DEFAULT_SPECIAL_TYPES, MEMBER_CATEGORIES } from '../lib/seed.js';
import { Modal, Empty, PlusIcon, TrashIcon, PencilIcon, ClockIcon, CustomSelect, UsersIcon, BookOpenIcon, LayersIcon, ArrowLeftIcon } from '../components/ui.jsx';
import { formatDateShortID } from '../lib/dates.js';

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

export default function Admin() {
  const { account, isGuest, supabaseReady, toast } = useApp();
  const [view, setView] = useState('menu');
  const [members, setMembers] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [lockHours, setLockHours] = useState(24);
  const [memberModal, setMemberModal] = useState(null);
  const [memberForm, setMemberForm] = useState({ full_name: '', nickname: '', gender: 'MALE', status: '', category: '', birth_date: '', active: true });
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
      setSchedules((s.data || []).map((x) => ({ id: x.id, day_of_week: x.day_of_week, event_time: String(x.event_time).slice(0, 5), end_time: x.end_time ? String(x.end_time).slice(0, 5) : null, active: x.active })));
      if (st.data) setLockHours(st.data.lock_duration_hours);
    })();
  }, [account?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!start || !end) { toast('Isi jam mulai dan jam selesai.'); return; }
    if (end <= start) { toast('Jam selesai harus lebih besar dari jam mulai.'); return; }
    if (isGuest || !supabaseReady) {
      const ns = [...schedules, { id: `sch_${Date.now()}`, day_of_week: dow, event_time: start, end_time: end, active: true }];
      setSchedules(ns); persistLocal({ schedules: ns });
    } else {
      const { data, error } = await supabase.from('recurring_schedules').insert({ account_id: account.id, day_of_week: dow, event_time: start, end_time: end }).select().single();
      if (error) { toast('Gagal menambah jadwal.'); return; }
      setSchedules((p) => [...p, { id: data.id, day_of_week: data.day_of_week, event_time: String(data.event_time).slice(0, 5), end_time: data.end_time ? String(data.end_time).slice(0, 5) : null, active: true }]);
    }
    toast('Jadwal rutin ditambahkan. Berlaku untuk jadwal ke depan.');
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

  const filteredMembers = members.filter((m) => (`${m.full_name} ${m.nickname}`).toLowerCase().includes(q.toLowerCase()));

  async function saveMember() {
    if (!memberForm.full_name.trim()) { toast('Nama lengkap wajib diisi.'); return; }
    const statusId = memberForm.status ? (statuses.find((s) => s.name === memberForm.status)?.id || null) : null;
    const payloadBase = {
      full_name: memberForm.full_name.trim(),
      nickname: memberForm.nickname.trim(),
      gender: memberForm.gender,
      member_category: memberForm.category || null,
      birth_date: memberForm.birth_date || null,
      active: memberForm.active,
    };
    if (isGuest || !supabaseReady) {
      if (memberModal === 'add') {
        const item = { id: `m_${Date.now()}`, ...payloadBase, status: memberForm.status, joined_at: new Date().toISOString().slice(0, 10) };
        const ns = [...members, item]; setMembers(ns); persistLocal({ members: ns });
      } else {
        const ns = members.map((m) => m.id === memberModal ? { ...m, ...payloadBase, status: memberForm.status } : m); setMembers(ns); persistLocal({ members: ns });
      }
    } else {
      if (memberModal === 'add') {
        const { data } = await supabase.from('members').insert({ account_id: account.id, ...payloadBase, status_id: statusId }).select().single();
        if (data) setMembers((p) => [...p, { ...data, member_statuses: statusId ? { name: memberForm.status } : null }]);
      } else {
        await supabase.from('members').update({ ...payloadBase, status_id: statusId }).eq('id', memberModal);
        setMembers((p) => p.map((m) => m.id === memberModal ? { ...m, ...payloadBase, status_id: statusId, member_statuses: statusId ? { name: memberForm.status } : null } : m));
      }
    }
    setMemberModal(null); toast('Data anggota tersimpan.');
  }

  function BackButton() {
    return (
      <button className="btn" style={{ marginBottom: 12 }} onClick={() => setView('menu')}>
        <ArrowLeftIcon /> Kembali ke Admin
      </button>
    );
  }

  function MemberModal() {
    if (!memberModal) return null;
    return (
      <Modal title={memberModal === 'add' ? 'Tambah anggota' : 'Edit anggota'} onClose={() => setMemberModal(null)}
        foot={<><button className="btn" onClick={() => setMemberModal(null)}>Batal</button><button className="btn btn-primary" onClick={saveMember}>Simpan</button></>}>
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
          <label className="field"><span>Tanggal lahir</span><input className="input" type="date" value={memberForm.birth_date} onChange={(e) => setMemberForm({ ...memberForm, birth_date: e.target.value })} /></label>
        </div>
        <label className="field"><span>Status aktif</span>
          <CustomSelect value={memberForm.active ? '1' : '0'} ariaLabel="Status aktif" placeholder="Pilih"
            options={[{ value: '1', label: 'Aktif' }, { value: '0', label: 'Nonaktif' }]}
            onChange={(v) => setMemberForm({ ...memberForm, active: v === '1' })} />
        </label>
      </Modal>
    );
  }

  if (view === 'anggota') {
    return (
      <div>
        <BackButton />
        <section className="admin-group" aria-label="Anggota" style={{ marginTop: 0 }}>
          <h3 className="admin-group-head">ANGGOTA</h3>
          <div className="admin-sub">
            <div className="admin-sub-head">
              <div><h3 className="card-title" style={{ fontSize: 15 }}>Data Anggota</h3><p className="card-desc" style={{ marginBottom: 0 }}>{members.filter((m) => m.active).length} aktif dari {members.length} anggota.</p></div>
              <button className="btn btn-primary" style={{ minHeight: 40, padding: '8px 12px', fontSize: 13 }} onClick={() => { setMemberForm({ full_name: '', nickname: '', gender: 'MALE', status: '', category: '', birth_date: '', active: true }); setMemberModal('add'); }}><PlusIcon /> Tambah</button>
            </div>
            <input className="input search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari anggota..." aria-label="Cari anggota" />
            {filteredMembers.length === 0 && <p className="hint">Belum ada anggota yang cocok.</p>}
            {filteredMembers.length > 0 && (
              <div className="table-wrap">
                <table className="att members-table">
                  <thead><tr><th>Nama lengkap</th><th>Panggilan</th><th>Kategori</th><th>Gender</th><th>Status</th><th>Tgl lahir</th><th>Aktif</th><th><span className="hint">Aksi</span></th></tr></thead>
                  <tbody>
                    {filteredMembers.map((m) => (
                      <tr key={m.id} className={m.active ? '' : 'row-inactive'}>
                        <td><strong>{m.full_name}</strong></td>
                        <td>{m.nickname || '-'}</td>
                        <td>{m.member_category || '-'}</td>
                        <td>{m.gender === 'MALE' ? 'Laki-laki' : 'Perempuan'}</td>
                        <td>{m.member_statuses?.name || m.status || <span className="hint">Belum ditentukan</span>}</td>
                        <td>{m.birth_date ? formatDateShortID(m.birth_date) : '-'}</td>
                        <td><span className={`badge ${m.active ? 'green' : 'gray'}`}>{m.active ? 'Aktif' : 'Nonaktif'}</span></td>
                        <td><button className="icon-btn edit" aria-label={`Edit ${m.nickname || m.full_name}`} onClick={() => { setMemberForm({ full_name: m.full_name, nickname: m.nickname || '', gender: m.gender, status: m.member_statuses?.name || m.status || '', category: m.member_category || '', birth_date: m.birth_date || '', active: m.active, id: m.id }); setMemberModal(m.id); }}><PencilIcon /></button></td>
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
        <MemberModal />
      </div>
    );
  }

  if (view === 'pengajian') {
    return (
      <div>
        <BackButton />
        <section className="admin-group" aria-label="Pengajian" style={{ marginTop: 0 }}>
          <h3 className="admin-group-head">PENGAJIAN</h3>
          <div className="admin-grid cols-2">
            <div className="admin-sub">
              <div className="admin-sub-head">
                <div><h3 className="card-title" style={{ fontSize: 15 }}>Jadwal Rutin</h3><p className="card-desc" style={{ marginBottom: 0 }}>Hari dan jam boleh berbeda tiap jadwal.</p></div>
              </div>
              {schedules.length === 0 && <p className="hint">Belum ada jadwal rutin.</p>}
              {schedules.map((s) => (
                <div className="schedule-row" key={s.id}>
                  <div>
                    <div className="schedule-day">{DAYS[s.day_of_week]}</div>
                    <div className="schedule-time"><ClockIcon size={14} /> {timeRange(s.event_time, s.end_time)}</div>
                  </div>
                  <button className="icon-btn danger" aria-label={`Hapus jadwal ${DAYS[s.day_of_week]}`} onClick={() => delSchedule(s)}><TrashIcon /></button>
                </div>
              ))}
              <AddSchedule onAdd={addSchedule} />
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
        </section>
      </div>
    );
  }

  if (view === 'materi') {
    return (
      <div>
        <BackButton />
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
          <button className="btn btn-primary btn-block" onClick={() => setView('anggota')}>Kelola Anggota</button>
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
          <button className="btn btn-primary btn-block" onClick={() => setView('pengajian')}>Kelola Pengajian</button>
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
          <button className="btn btn-primary btn-block" onClick={() => setView('materi')}>Kelola Materi</button>
        </div>
      </div>
    </div>
  );
}

function AddSchedule({ onAdd }) {
  const [dow, setDow] = useState(3);
  const [start, setStart] = useState('19:30');
  const [end, setEnd] = useState('21:30');
  return (
    <div style={{ marginTop: 10, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
      <div className="row cols-3">
        <div className="field"><span>Hari</span>
          <CustomSelect value={dow} ariaLabel="Hari jadwal" placeholder="Pilih hari"
            options={DAYS.map((d, i) => ({ value: i, label: d }))}
            onChange={(v) => setDow(Number(v))} />
        </div>
        <label className="field"><span>Jam mulai</span><input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="field"><span>Jam selesai</span><input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      <button className="btn btn-primary btn-block" onClick={() => onAdd(dow, start, end)}><PlusIcon /> Tambah Jadwal</button>
    </div>
  );
}
