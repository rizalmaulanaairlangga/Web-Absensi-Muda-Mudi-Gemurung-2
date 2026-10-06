-- QR identifier anggota untuk kartu fisik Generus (opaque string, nullable).
--
-- CARA PAKAI: salin seluruh isi file ini ke Dashboard Supabase > SQL Editor,
-- lalu jalankan (Run). Aman dijalankan ulang.
--
-- SIFAT MIGRATION INI:
-- - Kondisional semua: tidak membuat duplikat bila kolom/index sudah ada.
-- - Tidak menghapus data, tidak mengubah data existing.
-- - Tidak menyentuh historical attendance.
-- - Tidak mengubah RLS/policy yang sudah ada (policy bersifat per-baris,
--   kolom baru otomatis ikut tercakup policy existing).
-- - Kolom qr_identifier NULLABLE: anggota lama tanpa QR tetap valid.
-- - Unique partial index: satu QR hanya boleh milik satu anggota
--   dalam account yang sama; NULL tidak dihitung duplikat.
-- - Bukan primary key: primary key members tetap id internal.
-- - Nilai QR diperlakukan opaque: aplikasi menyimpan raw decoded string
--   tanpa parsing isi QR Generus.
-- - Tidak berisi secret apa pun.

-- 1. Kolom QR identifier (TEXT, nullable).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'members'
      AND column_name = 'qr_identifier'
  ) THEN
    ALTER TABLE public.members ADD COLUMN qr_identifier TEXT;
  END IF;
END $$;

-- 2. Unique index per account (partial: hanya baris yang punya QR).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'members'
      AND indexname = 'members_account_qr_identifier_unique'
  ) THEN
    CREATE UNIQUE INDEX members_account_qr_identifier_unique
      ON public.members (account_id, qr_identifier)
      WHERE qr_identifier IS NOT NULL;
  END IF;
END $$;

-- 3. Verifikasi setelah Run (jalankan terpisah, hanya membaca):
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'members'
--    AND column_name = 'qr_identifier';
-- SELECT indexname, indexdef
--   FROM pg_indexes
--  WHERE schemaname = 'public' AND tablename = 'members'
--    AND indexname = 'members_account_qr_identifier_unique';
