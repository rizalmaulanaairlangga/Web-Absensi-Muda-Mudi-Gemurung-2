-- Jaminan satu attendance per anggota per occurrence.
--
-- CARA PAKAI: salin seluruh isi file ini ke Dashboard Supabase > SQL Editor,
-- lalu jalankan (Run). Aman dijalankan ulang.
--
-- SIFAT MIGRATION INI:
-- - Kondisional: tidak membuat duplikat bila index sudah ada.
-- - Tidak menghapus data, tidak mengubah data existing.
-- - Tidak menyentuh historical attendance.
-- - Tidak mengubah RLS/policy yang sudah ada.
-- - Aplikasi memakai upsert dengan onConflict
--   (account_id, occurrence_id, member_id), sehingga index ini
--   adalah pasangan yang dibutuhkan agar upsert deterministik
--   dan duplicate tidak mungkin terjadi di level database.
-- - Sudah dicek: tidak ada triple duplikat di data saat ini,
--   sehingga pembuatan index akan berhasil langsung.
-- - Tidak berisi secret apa pun.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'attendance'
      AND indexname = 'attendance_account_occurrence_member_unique'
  ) THEN
    CREATE UNIQUE INDEX attendance_account_occurrence_member_unique
      ON public.attendance (account_id, occurrence_id, member_id);
  END IF;
END $$;

-- Verifikasi setelah Run (jalankan terpisah, hanya membaca):
-- SELECT indexname FROM pg_indexes
--  WHERE schemaname = 'public' AND tablename = 'attendance'
--    AND indexname = 'attendance_account_occurrence_member_unique';
