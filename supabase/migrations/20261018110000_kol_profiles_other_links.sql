-- ============================================================
-- KOL 正式邀約：新增「其他平台連結」欄位
--   主欄位「網紅帳號連結」（ig_handle／ig_url）只放 1 個個人主頁（建議 IG），
--   星探一次貼的 FB／YouTube／TikTok 等連結改存在 other_links。
--   只新增欄位，舊資料不動（多連結舊資料之後另寫清理腳本）。
-- precheck：docs/kol-1/precheck_20261018110000.sql
-- postcheck：docs/kol-1/postcheck_20261018110000.sql
-- rollback：docs/kol-1/rollback_20261018110000.sql
-- ============================================================

-- ============================= PRECHECK =============================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'kol_profiles' AND column_name = 'other_links'
  ) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：kol_profiles.other_links 已存在，請先檢查';
  END IF;
END $$;

-- ============================= CHANGE =============================
ALTER TABLE public.kol_profiles
  ADD COLUMN other_links text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.kol_profiles.other_links IS
  '其他平台連結（FB／YouTube／TikTok／Threads／網站等），主欄位 ig_handle 只放 1 個個人主頁';

-- ============================= POSTCHECK =============================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'kol_profiles' AND column_name = 'other_links'
      AND data_type = 'ARRAY' AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：kol_profiles.other_links 未正確建立';
  END IF;
  IF EXISTS (SELECT 1 FROM public.kol_profiles WHERE other_links IS NULL OR cardinality(other_links) > 0) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：既有資料的 other_links 應全部為空陣列';
  END IF;
END $$;
