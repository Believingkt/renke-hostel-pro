-- rollback：20261018110001_kol_profiles_other_links_search.sql
-- 只刪搜尋用欄位與函式，other_links 資料不受影響。前端需先回到不搜尋 other_links_text 的版本。
BEGIN;
ALTER TABLE public.kol_profiles DROP COLUMN IF EXISTS other_links_text;
DROP FUNCTION IF EXISTS public.kol_links_search_text(text[]);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'kol_profiles' AND column_name = 'other_links_text'
  ) OR to_regprocedure('public.kol_links_search_text(text[])') IS NOT NULL THEN
    RAISE EXCEPTION 'ROLLBACK 驗證失敗：other_links_text 或函式仍存在';
  END IF;
END $$;
COMMIT;
