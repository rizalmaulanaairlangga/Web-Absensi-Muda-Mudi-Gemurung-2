const DAYS = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

export function todayJakarta() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  return now;
}
export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
export function formatID(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export function dayName(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return DAYS[d.getDay()];
}
export function dayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.getDay();
}
export function monthLabel(y, m) {
  return `${MONTHS[m-1]} ${y}`;
}
export function isWithinWindow(occDate, occTime) {
  const now = todayJakarta();
  const [h, mi] = String(occTime).slice(0,5).split(':').map(Number);
  const occ = new Date(occDate + 'T00:00:00');
  occ.setHours(h || 0, mi || 0, 0, 0);
  const open = new Date(occ.getTime() - 30*60*1000);
  return now >= open;
}
export function windowOpenAt(occTime) {
  const [h, mi] = String(occTime).slice(0,5).split(':').map(Number);
  const d = new Date(); d.setHours(h||0, mi||0, 0, 0);
  const open = new Date(d.getTime() - 30*60*1000);
  return `${String(open.getHours()).padStart(2,'0')}:${String(open.getMinutes()).padStart(2,'0')}`;
}
export function canEdit(occDate, occTime, lockHours) {
  const now = todayJakarta();
  const [h, mi] = String(occTime).slice(0,5).split(':').map(Number);
  const occ = new Date(occDate + 'T00:00:00');
  occ.setHours(h||0, mi||0, 0, 0);
  const limit = new Date(occ.getTime() + (lockHours ?? 24)*60*60*1000);
  return now <= limit;
}
