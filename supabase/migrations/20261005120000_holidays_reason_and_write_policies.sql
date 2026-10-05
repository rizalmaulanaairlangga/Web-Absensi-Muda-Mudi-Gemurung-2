-- Libur jadwal rutin: kolom alasan dan policy tulis pada tabel holidays.
--
-- CARA PAKAI: salin seluruh isi file ini ke Dashboard Supabase > SQL Editor,
-- lalu jalankan (Run). Aman dijalankan ulang.
--
-- SIFAT MIGRATION INI:
-- - Kondisional semua: tidak membuat duplikat bila kolom/policy sudah ada.
-- - Tidak menghapus data, tidak mengubah policy yang sudah ada.
-- - Kolom reason NULLABLE: holiday lama tanpa alasan tetap valid.
-- - Tidak berisi secret apa pun.

-- 1. Kolom alasan libur (TEXT, nullable).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'holidays'
      AND column_name = 'reason'
  ) THEN
    ALTER TABLE public.holidays ADD COLUMN reason TEXT;
  END IF;
END $$;

-- 2. Policy UPDATE dan DELETE untuk holidays, scoped per akun.
--    Mengikuti konvensi aplikasi: setiap baris membawa account_id yang
--    terhubung ke user login lewat public.accounts(auth_user_id).
--    Hanya dibuat bila policy dengan nama tersebut belum ada.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'holidays'
      AND policyname = 'holidays_update_own_account'
  ) THEN
    CREATE POLICY holidays_update_own_account ON public.holidays
      FOR UPDATE
      USING (account_id IN (SELECT id FROM public.accounts WHERE auth_user_id = auth.uid()))
      WITH CHECK (account_id IN (SELECT id FROM public.accounts WHERE auth_user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'holidays'
      AND policyname = 'holidays_delete_own_account'
  ) THEN
    CREATE POLICY holidays_delete_own_account ON public.holidays
      FOR DELETE
      USING (account_id IN (SELECT id FROM public.accounts WHERE auth_user_id = auth.uid()));
  END IF;
END $$;

-- 3. Verifikasi setelah Run (jalankan terpisah, hanya membaca):
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'holidays';
-- SELECT policyname, cmd
--   FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'holidays';
