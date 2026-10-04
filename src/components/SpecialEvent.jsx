import React from 'react';
import { useApp } from '../lib/store.jsx';
import { supabase } from '../lib/supabaseClient.js';
import { withTimeout, isNetworkError } from '../lib/net.js';
import { Modal, CustomSelect, PlusIcon, Empty } from './ui.jsx';
import { DateField, TimeField, formatLongID } from './fields.jsx';
import MemberRow from './MemberRow.jsx';
import { dayName, dayOfWeek, formatID, toISODate, todayJakarta } from '../lib/dates.js';
import { loadMastersCache, saveMastersCache } from '../lib/masters.js';
import { newOpId, createSpecialEventOp, createSpecialAttendanceOp } from '../services/sync/syncQueue.js';
import { idbGet, idbSet } from '../lib/idb.js';

function timeRange(start, end) {
  const s = String(start || '').slice(0, 5);
  const e = String(end || '').slice(0, 5);
  return e && e !== s ? `${s} – ${e}` : s;
}

export function suggestReplacements(schedules, dateISO) {
  if (!dateISO) return [];
  const dow = dayOfWeek(dateISO);
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return (schedules || [])
    .filter((s) => s.active !== false && s.day_of_week === dow)
    .map((s) => ({
      value: s.id,
      label: `${days[dow]} — ${timeRange(s.event_time, s.end_time)}`,
      schedule: s,
    }));
}

export function SpecialEventModal({ schedules = [], onClose, onCreated }) {
  const { account, isGuest, online, toast, enqueue, supabaseReady, saveSnapshot, loadSnapshot } = useApp();
  const [types, setTypes] = React.useState([]);
  const [typeId, setTypeId] = React.useState('');
  const [date, setDate] = React.useState(() => toISODate(todayJakarta()));
  const [start, setStart] = React.useState('19:30');
  const [end, setEnd] = React.useState('21:30');
  const [replaced, setReplaced] = React.useState('');
  const [touchedReplace, setTouchedReplace] = React.useState(false);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [created, setCreated] = React.useState(null);
  const [holidayError, setHolidayError] = React.useState('');
  const [pendingHoliday, setPendingHoliday] = React.useState(null);

  React.useEffect(() => {
    (async () => {
      if (!account) return;
      if (isGuest) {
        const local = await idbGet('guest-data', null);
        if (local?.specialTypes?.length) {
          setTypes(local.specialTypes);
          return;
        }
      } else if (supabaseReady) {
        const cached = await loadMastersCache(account.id);
        if ((cached.specialTypes || []).length) {
          setTypes(cached.specialTypes);
          return;
        }
      } else {
        return;
      }
      if (!online || !supabaseReady) return;
      try {
        const { data } = await withTimeout(supabase.from('special_event_types').select('*').eq('account_id', account.id).order('name'), 15000);
        const list = data || [];
        setTypes(list);
        if (!isGuest) await saveMastersCache(account.id, { specialTypes: list });
      } catch { /* abaikan */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const options = React.useMemo(() => suggestReplacements(schedules, date), [schedules, date]);

  React.useEffect(() => {
    if (touchedReplace) {
      if (replaced && !options.some((o) => String(o.value) === String(replaced))) setReplaced('');
      return;
    }
    setReplaced(options.length ? String(options[0].value) : '');
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  async function persistLocalEvent(ev) {
    try {
      const snap = (await loadSnapshot(account.id)) || {};
      const specials = [...(snap.specials || []).filter((e) => e.id !== ev.id), { ...ev, offline: true }];
      await saveSnapshot(account.id, { ...snap, specials });
    } catch { /* abaikan */ }
  }

  async function doHoliday(eventId, rep) {
    const sch = (schedules || []).find((s) => String(s.id) === String(rep.recurring_schedule_id));
    const occPayload = {
      account_id: account.id,
      recurring_schedule_id: rep.recurring_schedule_id,
      occurrence_date: rep.occurrence_date,
      occurrence_time: rep.occurrence_time || sch?.event_time || '19:30',
      occurrence_end_time: rep.occurrence_end_time || sch?.end_time || null,
      day_name: rep.day_name || dayName(rep.occurrence_date),
    };
    const { data: dbOcc, error: occErr } = await withTimeout(supabase.from('schedule_occurrences').upsert(occPayload, { onConflict: 'account_id,recurring_schedule_id,occurrence_date' }).select().single(), 20000);
    if (occErr) throw occErr;
    await withTimeout(supabase.from('schedule_occurrences').update({ is_holiday: true }).eq('id', dbOcc.id), 15000);
    const { error: holErr } = await withTimeout(supabase.from('holidays').upsert({
      account_id: account.id,
      occurrence_id: dbOcc.id,
      holiday_date: rep.occurrence_date,
      day_name: rep.day_name || dayName(rep.occurrence_date),
      reason: rep.reason || 'Digantikan pengajian khusus',
    }, { onConflict: 'occurrence_id' }), 15000);
    if (holErr) throw holErr;
    const { data: verify } = await withTimeout(supabase.from('holidays').select('id').eq('occurrence_id', dbOcc.id).maybeSingle(), 15000);
    if (!verify) throw new Error('Status libur belum tercatat.');
    await withTimeout(supabase.from('special_events').update({ linked_holiday_occurrence_id: dbOcc.id }).eq('id', eventId), 15000);
    return dbOcc.id;
  }

  async function onSubmit() {
    setError('');
    setHolidayError('');
    if (!typeId) { setError('Pilih jenis pengajian terlebih dahulu.'); return; }
    if (!date) { setError('Pilih tanggal pengajian.'); return; }
    if (!start || !end) { setError('Isi jam mulai dan jam selesai.'); return; }
    if (end <= start) { setError('Jam selesai harus lebih dari jam mulai.'); return; }
    const typeRow = types.find((t) => String(t.id) === String(typeId));
    const sch = (schedules || []).find((s) => String(s.id) === String(replaced));
    const ev = {
      id: newOpId('se'),
      account_id: account.id,
      event_type_id: typeId || null,
      event_type_snapshot: typeRow?.name || '',
      event_date: date,
      day_name: dayName(date),
      event_time: start,
      end_time: end,
    };
    const rep = sch ? {
      recurring_schedule_id: sch.id,
      occurrence_date: date,
      occurrence_time: sch.event_time,
      occurrence_end_time: sch.end_time || null,
      day_name: dayName(date),
      reason: `Digantikan: ${typeRow?.name || 'pengajian khusus'}`,
    } : null;
    setBusy(true);
    try {
      if (!online || !supabaseReady) {
        await enqueue(createSpecialEventOp(account.id, ev, rep));
        await persistLocalEvent(ev);
        setCreated(ev);
        toast('Pengajian khusus tersimpan di perangkat. Akan dikirim saat koneksi kembali.');
      } else {
        const { data: saved, error: evErr } = await withTimeout(supabase.from('special_events').insert(ev).select().single(), 20000);
        if (evErr) throw evErr;
        if (rep) {
          try {
            await doHoliday(saved.id, rep);
          } catch (he) {
            setPendingHoliday({ eventId: saved.id, rep });
            setHolidayError(isNetworkError(he) ? 'Koneksi terputus. Event tersimpan, status libur belum tercatat.' : 'Event tersimpan, tetapi status libur belum tercatat.');
            setCreated({ ...saved });
            setBusy(false);
            return;
          }
        }
        setCreated({ ...saved });
        toast('Pengajian khusus berhasil dibuat.');
      }
    } catch (e) {
      if (isNetworkError(e)) {
        try {
          await enqueue(createSpecialEventOp(account.id, ev, rep));
          await persistLocalEvent(ev);
          setCreated(ev);
          toast('Koneksi terputus. Pengajian khusus tersimpan di perangkat.');
        } catch {
          setError('Gagal menyimpan. Periksa koneksi lalu coba lagi.');
        }
      } else {
        setError('Gagal menyimpan. Periksa data lalu coba lagi.');
      }
    }
    setBusy(false);
  }

  async function retryHoliday() {
    if (!pendingHoliday) return;
    setBusy(true);
    setHolidayError('');
    try {
      await doHoliday(pendingHoliday.eventId, pendingHoliday.rep);
      setPendingHoliday(null);
      toast('Status libur tercatat.');
    } catch {
      setHolidayError('Masih gagal mencatat libur. Coba lagi saat koneksi stabil.');
    }
    setBusy(false);
  }

  if (created) {
    return (
      <Modal title="Pengajian khusus dibuat" onClose={onClose} foot={<><button className="btn" onClick={onClose}>Nanti</button><button className="btn btn-primary" onClick={() => onCreated(created.id)}>Isi Absensi Sekarang</button></>}>
        <p><strong>{created.event_type_snapshot}</strong></p>
        <p className="card-desc">{formatLongID(created.event_date)} • {timeRange(created.event_time, created.end_time)}</p>
        {holidayError && (
          <div className="banner warn">
            <span>{holidayError}</span>
            <span style={{ marginLeft: 'auto' }}><button className="btn" style={{ minHeight: 36 }} onClick={retryHoliday} disabled={busy}>Coba lagi</button></span>
          </div>
        )}
      </Modal>
    );
  }

  return (
    <Modal title="Pengajian khusus baru" onClose={onClose} foot={<><button className="btn" onClick={onClose}>Batal</button><button className="btn btn-primary" disabled={busy} onClick={onSubmit}>{busy ? 'Menyimpan...' : 'Simpan'}</button></>}>
      <label className="field"><span>Jenis pengajian</span>
        <CustomSelect value={typeId} ariaLabel="Jenis pengajian khusus" placeholder="Pilih jenis kegiatan"
          options={types.map((t) => ({ value: String(t.id), label: t.name }))}
          onChange={setTypeId} />
      </label>
      <label className="field"><span>Tanggal</span>
        <DateField value={date} onChange={setDate} ariaLabel="Tanggal pengajian khusus" />
      </label>
      <div className="row cols-2">
        <div className="field"><span>Jam mulai</span>
          <TimeField value={start} onChange={setStart} ariaLabel="Jam mulai" />
        </div>
        <div className="field"><span>Jam selesai</span>
          <TimeField value={end} onChange={setEnd} ariaLabel="Jam selesai" />
        </div>
      </div>
      <label className="field"><span>Jadwal rutin yang digantikan (opsional)</span>
        <CustomSelect value={replaced} ariaLabel="Jadwal rutin yang digantikan" placeholder="Tidak menggantikan jadwal rutin"
          options={[{ value: '', label: 'Tidak menggantikan jadwal rutin' }, ...options.map((o) => ({ value: String(o.value), label: o.label }))]}
          onChange={(v) => { setReplaced(v); setTouchedReplace(true); }} />
      </label>
      {replaced ? (
        <div className="banner info"><span>Jadwal rutin pada tanggal tersebut otomatis ditandai libur setelah tersimpan. Jadwal master tidak dihapus.</span></div>
      ) : (
        <div className="banner warn"><span>Tanggal ini bertepatan dengan jadwal rutin? Pilih jadwal yang digantikan bila perlu. Dibiarkan kosong berarti tidak ada libur otomatis.</span></div>
      )}
      {error && <p className="field-error">{error}</p>}
    </Modal>
  );
}

export function SpecialDetail({ eventId, localEvent, members, absenceTypes, onBack, onChanged }) {
  const { account, online, toast, enqueue, supabaseReady, saveSnapshot, loadSnapshot } = useApp();
  const [event, setEvent] = React.useState(localEvent || null);
  const [eventMissing, setEventMissing] = React.useState(false);
  const [answers, setAnswers] = React.useState({});
  const [rows, setRows] = React.useState(null);
  const [editing, setEditing] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const eligible = React.useMemo(() => {
    if (!event) return [];
    return (members || []).filter((m) => m.active && (!m.joined_at || m.joined_at <= event.event_date));
  }, [members, event]);

  React.useEffect(() => {
    setEvent(localEvent || null);
    setEventMissing(false);
    setRows(null);
    setAnswers({});
    setEditing(true);
  }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    (async () => {
      if (!eventId) return;
      if (online && supabaseReady) {
        try {
          const { data } = await withTimeout(supabase.from('special_events').select('*').eq('id', eventId).maybeSingle(), 15000);
          if (data) {
            setEvent(data);
            setEventMissing(false);
            return;
          }
        } catch { /* fallback lokal */ }
      }
      if (localEvent && localEvent.id === eventId) {
        setEvent(localEvent);
        return;
      }
      try {
        const snap = await loadSnapshot(account.id);
        const found = (snap?.specials || []).find((e) => e.id === eventId);
        if (found) setEvent(found);
        else setEventMissing(true);
      } catch {
        setEventMissing(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, online]);

  React.useEffect(() => {
    (async () => {
      if (!event) return;
      if (!online || !supabaseReady) {
        const snap = await loadSnapshot(account.id);
        const saved = snap?.specialAtt?.[event.id];
        if (saved?.length) {
          setRows(saved);
          const map = {};
          saved.forEach((a) => { map[a.member_id] = a.status === 'PRESENT' ? { hadir: true } : a.status === 'PERMITTED' ? { izin: a.absence_name_snapshot || '' } : { alpha: true }; });
          setAnswers(map);
          setEditing(false);
        }
        return;
      }
      try {
        const { data } = await withTimeout(supabase.from('special_attendance').select('*').eq('special_event_id', event.id), 20000);
        if ((data || []).length) {
          setRows(data);
          const map = {};
          data.forEach((a) => { map[a.member_id] = a.status === 'PRESENT' ? { hadir: true } : a.status === 'PERMITTED' ? { izin: a.absence_name_snapshot || '' } : { alpha: true }; });
          setAnswers(map);
          setEditing(false);
        }
      } catch { /* abaikan */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  function setHadir(id, v) { setAnswers((p) => ({ ...p, [id]: v ? { hadir: true } : {} })); }
  function setIzin(id, v) { setAnswers((p) => ({ ...p, [id]: v ? { izin: v } : {} })); }
  function toggleAlpha(id) { setAnswers((p) => ({ ...p, [id]: p[id]?.alpha ? {} : { alpha: true } })); }

  async function onSave() {
    if (!event) return;
    setSaving(true);
    try {
      const list = eligible.map((m) => {
        const a = answers[m.id] || {};
        return { member_id: m.id, member_name: m.nickname || m.full_name, status: a.hadir ? 'PRESENT' : a.izin ? 'PERMITTED' : 'ALPHA', absence: a.izin || null };
      });
      if (!online || !supabaseReady) {
        await enqueue(createSpecialAttendanceOp(account.id, event, list));
        const recs = list.map((r) => ({ member_id: r.member_id, member_name_snapshot: r.member_name, status: r.status, absence_name_snapshot: r.absence }));
        try {
          const snap = (await loadSnapshot(account.id)) || {};
          await saveSnapshot(account.id, { ...snap, specialAtt: { ...(snap.specialAtt || {}), [event.id]: recs } });
        } catch { /* abaikan */ }
        setRows(recs);
        setEditing(false);
        toast('Tersimpan di perangkat. Akan dikirim otomatis saat koneksi kembali.');
        onChanged?.();
      } else {
        try {
          await withTimeout((async () => {
            for (const r of list) {
              const { error } = await supabase.from('special_attendance').upsert({
                account_id: account.id, special_event_id: event.id, member_id: r.member_id,
                status: r.status, absence_name_snapshot: r.absence, member_name_snapshot: r.member_name,
              }, { onConflict: 'account_id,special_event_id,member_id' });
              if (error) throw error;
            }
          })(), 30000);
          try {
            await supabase.from('audit_logs').insert({ account_id: account.id, action: 'SAVE_SPECIAL_ATTENDANCE', entity_type: 'special_attendance', entity_id: event.id, new_data: { count: list.length } });
          } catch { /* audit best-effort */ }
          const recs = list.map((r) => ({ member_id: r.member_id, member_name_snapshot: r.member_name, status: r.status, absence_name_snapshot: r.absence }));
          setRows(recs);
          setEditing(false);
          toast('Absensi pengajian khusus berhasil disimpan.');
          try {
            const snap = (await loadSnapshot(account.id)) || {};
            await saveSnapshot(account.id, { ...snap, specialAtt: { ...(snap.specialAtt || {}), [event.id]: recs } });
          } catch { /* abaikan */ }
          onChanged?.();
        } catch (e) {
          if (isNetworkError(e)) {
            await enqueue(createSpecialAttendanceOp(account.id, event, list));
            toast('Koneksi terputus. Data tersimpan di perangkat.');
          } else {
            throw e;
          }
        }
      }
    } catch {
      toast('Data gagal disimpan. Periksa koneksi lalu coba lagi.');
    }
    setSaving(false);
  }

  if (!event) {
    return (
      <div className="card">
        <button className="btn" style={{ marginBottom: 12 }} onClick={onBack}><span aria-hidden="true">←</span> Kembali</button>
        {eventMissing ? (
          <Empty title="Data belum tersedia" desc="Detail pengajian khusus belum tersimpan di perangkat. Hubungkan internet untuk memuatnya." />
        ) : (
          <p className="hint">Memuat detail pengajian khusus...</p>
        )}
      </div>
    );
  }
  const males = eligible.filter((m) => m.gender === 'MALE');  const females = eligible.filter((m) => m.gender === 'FEMALE');

  return (
    <div className="card">
      <button className="btn" style={{ marginBottom: 12 }} onClick={onBack}><span aria-hidden="true">←</span> Kembali</button>
      <h2 className="card-title">{event.event_type_snapshot || 'Pengajian Khusus'}</h2>
      <p className="card-desc">{formatLongID(event.event_date)} • {timeRange(event.event_time, event.end_time)}</p>
      {event.linked_holiday_occurrence_id && <div className="banner info"><span>Menggantikan jadwal rutin (ditandai libur). Absensi ini terpisah dari absensi rutin.</span></div>}
      {rows && !editing ? (
        <div className="banner success">
          <span>Absensi tersimpan ({rows.filter((r) => r.status === 'PRESENT').length} hadir).</span>
          <span style={{ marginLeft: 'auto' }}><button className="btn" onClick={() => setEditing(true)}>Edit Absensi</button></span>
        </div>
      ) : (
        <>
          <div className="legend" aria-label="Keterangan">
            <span className="lg"><span className="mark hadir">✓</span> Centang = Hadir</span>
            <span className="lg"><span className="mark izin">I</span> Dropdown izin = Izin</span>
            <span className="lg"><span className="mark alpha">A</span> Tombol A = Alpha</span>
          </div>
          <div className="member-groups">
            {[{ t: 'LAKI-LAKI', list: males }, { t: 'PEREMPUAN', list: females }].map((g) => (
              <section className="member-group" key={g.t} aria-label={g.t}>
                <div className="member-group-head">
                  <h3 className="member-group-title">{g.t}</h3>
                  <span className="member-count">{g.list.length} orang</span>
                </div>
                {g.list.length === 0 && <p className="hint">Belum ada anggota.</p>}
                {g.list.length > 0 && (
                  <div className="member-rows">
                    {g.list.map((m) => (
                      <MemberRow key={m.id} m={m} val={answers[m.id] || {}} absenceOptions={absenceTypes} onHadir={setHadir} onIzin={setIzin} onAlpha={toggleAlpha} />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
          <div className="actions">
            <button className="btn btn-primary btn-block" disabled={saving} onClick={onSave}>{saving ? 'Menyimpan...' : rows ? 'Simpan Perubahan' : 'Simpan Absensi Khusus'}</button>
          </div>
        </>
      )}
    </div>
  );
}
