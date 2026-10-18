-- rollback：20261018110000_kol_profiles_other_links.sql
-- 注意：會刪除 other_links 內已填的連結。請先確認前端已回到不使用 other_links 的版本，
-- 必要時先備份：SELECT id, other_links FROM public.kol_profiles WHERE cardinality(other_links) > 0;
BEGIN;
ALTER TABLE public.kol_profiles DROP COLUMN IF EXISTS other_links;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'kol_profiles' AND column_name = 'other_links'
  ) THEN
    RAISE EXCEPTION 'ROLLBACK 驗證失敗：other_links 仍存在';
  END IF;
END $$;
COMMIT;
