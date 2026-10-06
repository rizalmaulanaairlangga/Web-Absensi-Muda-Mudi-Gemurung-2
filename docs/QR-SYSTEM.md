# QR SYSTEM — Scan QR Kartu Generus

QR kartu fisik Generus diperlakukan sebagai **opaque identifier**.
Aplikasi hanya decode raw payload, menyimpan string utuh ke
`members.qr_identifier`, lalu mencocokkan exact match saat absensi.
Tidak ada request ke generus.site, tidak ada parsing isi QR.

## 1. Cara mendaftarkan QR anggota

1. Buka Admin → Anggota → Edit anggota (atau Tambah).
2. Bagian QR Anggota → Scan QR, arahkan kamera ke kartu fisik.
3. Konfirmasi QR berhasil dibaca → Gunakan QR Ini.
4. Tekan Simpan. Jika QR sudah milik anggota lain dalam account
   yang sama, pendaftaran ditolak.
5. Kolom `qr_identifier` wajib sudah ada di database
   (jalankan migration `supabase/migrations/*_members_qr_identifier.sql`
   sekali di Dashboard > SQL Editor bila kolom belum ada).

## 2. Cara scan QR saat absensi

1. Buka Absensi, pilih jadwal yang jendelanya sudah terbuka.
2. Tekan Scan QR di aksi cepat form.
3. Scan kartu → anggota otomatis tercentang Hadir.
4. Jika anggota sudah Hadir: tampil info tanpa duplikat.
5. Jika anggota berstatus Izin: muncul konfirmasi sebelum diubah
   menjadi Hadir, tidak diubah diam-diam.
6. QR tak dikenal: tampil pesan + tombol Daftarkan QR.
7. Scan hanya mengubah state form. Submit tetap via Kirim Absensi.

## 3. Cara mengganti QR

Edit anggota → Scan Ulang → konfirmasi → Simpan.
QR lama diganti, history absensi tidak berubah.

## 4. Cara menghapus QR

Edit anggota → Hapus (dengan konfirmasi).
Hanya field QR yang dikosongkan, history tetap.
Kartu tersebut lalu bebas didaftarkan ke anggota lain.

## 5. Scanner di laptop

Buka `http://localhost:5173/`, izinkan kamera saat diminta.
Webcam default dipakai otomatis bila kamera belakang
tidak tersedia.

## 6. Scanner di HP

1. Jalankan `npm run dev` (Vite listen di LAN via `host 0.0.0.0`).
2. Lihat baris Network di terminal, misal
   `http://192.168.1.10:5173/`, buka di browser HP
   (satu WiFi dengan laptop).
3. Bila kamera ditolak di HTTP LAN, jalankan mode HTTPS:
   isi `VITE_DEV_HTTPS=1` di file `.env` lokal (jangan commit),
   restart dev server, buka `https://<ip-lan>:5173/`,
   terima peringatan sertifikat lokal di browser HP.
4. Scanner otomatis memakai kamera belakang
   (`facingMode environment`) bila tersedia.
5. Jika Windows Firewall memblokir: izinkan Node.js
   di Windows Defender Firewall > Allow an app
   (jangan matikan firewall).

## 7. Dev server LAN

`vite.config.js` sudah `host: '0.0.0.0'`, sehingga
`http://localhost:5173/` tetap jalan dan Vite mencetak
alamat Network untuk HP. Tidak ada IP yang di-hardcode.

## 8. HTTPS LAN

Aktif hanya bila `VITE_DEV_HTTPS=1` (memakai sertifikat lokal
milik `@vitejs/plugin-basic-ssl`, khusus development).
Tanpa flag tersebut server tetap HTTP biasa.

## 9. Offline QR lookup

- `qr_identifier` ikut tersimpan di IndexedDB bersama data member
  setiap sinkronisasi, jadi scan offline memakai data lokal.
- Hasil scan offline menandai Hadir di form dan ikut antrean
  sync existing, terkirim otomatis saat online tanpa duplikat.
- Bila data lokal belum punya QR sama sekali saat offline,
  aplikasi menampilkan pesan data-belum-tersedia (bukan
  menganggap QR tidak valid).
