# Absensi Muda-Mudi Gemurung 2

Aplikasi web internal untuk absensi pengajian rutin dan khusus Muda-Mudi Gemurung 2. Mobile-first, PWA, offline-first, Bahasa Indonesia.

- Live: https://absensi-muda-mudi-gemurung-2.vercel.app
- Backend: Supabase `https://fmnvwaehskqyznnpbnbs.supabase.co` (org `nzmbjhgqjyzllyrnvafl`, project `absensi-muda-mudi-gemurung-2`, region `ap-southeast-1`)
- Frontend: React + Vite, CSS biasa tanpa framework

## Akun

- Tidak ada pendaftaran publik.
- Akun internal (Supabase Auth). Contoh: `admin@gemurung2.local`
- Mode tamu: `Masuk > Coba sebagai Tamu`. Data demo lokal, terisolasi, kedaluwarsa 24 jam, dihapus saat keluar.

## Jalankan lokal

```sh
npm install
cp .env.example .env
# isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY dari Supabase Dashboard
npm run dev
```

## Struktur

- `src/pages/Absensi.jsx` form absensi + materi + tabel bulanan
- `src/pages/Laporan.jsx` rekap, grafik, export XLSX
- `src/pages/Admin.jsx` anggota, jadwal rutin, master izin/status/hadist/kegiatan/pemateri/jenis khusus
- `src/lib/` supabase client, IndexedDB, tanggal Asia/Jakarta, seed, export
- `supabase/` lihat skema di Dashboard > SQL Editor (tabel accounts, members, schedules, occurrences, attendance, materials, holidays, special_events, audit_logs, RLS per account_id)

## Aturan penting

- Checkbox centang = Hadir, kosong tanpa izin = Alpha, dropdown izin = Izin. Saling eksklusif.
- Form hanya bisa dikirim mulai 30 menit sebelum jadwal.
- Libur harus dibuat eksplisit, tidak dihitung dalam persentase.
- Jadwal belum diisi bukan Alpha dan bukan libur.
- Izin tidak dihitung sebagai hadir.
- Guest tidak pernah membaca data akun asli (isolasi RLS + penyimpanan lokal terpisah).
