-- ============================================================
-- KOL 正式邀約：搜尋框也能搜到「其他平台連結」
--   PostgREST 不能對 text[] 做 ilike，新增自動產生的文字欄 other_links_text（連結以空白串接），
--   前端搜尋多加 other_links_text.ilike 條件。需先套 20261018110000（other_links）。
-- precheck：docs/kol-1/precheck_20261018110001.sql
-- postcheck：docs/kol-1/postcheck_20261018110001.sql
-- rollback：docs/kol-1/rollback_20261018110001.sql
-- ============================================================

-- ============================= PRECHECK =============================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'kol_profiles' AND column_name = 'other_links'
  ) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：請先套用 20261018110000（kol_profiles.other_links 不存在）';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'kol_profiles' AND column_name = 'other_links_text'
  ) OR to_regprocedure('public.kol_links_search_text(text[])') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：other_links_text 或 kol_links_search_text 已存在，請先檢查';
  END IF;
END $$;

-- ============================= CHANGE =============================
CREATE FUNCTION public.kol_links_search_text(links text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT pg_catalog.array_to_string(links, ' ') $$;

ALTER TABLE public.kol_profiles
  ADD COLUMN other_links_text text GENERATED ALWAYS AS (public.kol_links_search_text(other_links)) STORED;

COMMENT ON COLUMN public.kol_profiles.other_links_text IS '搜尋用：other_links 以空白串接（自動產生，不可直接寫入）';

-- ============================= POSTCHECK =============================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'kol_profiles' AND column_name = 'other_links_text'
      AND is_generated = 'ALWAYS'
  ) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：other_links_text 未建立為自動產生欄位';
  END IF;
  IF public.kol_links_search_text(ARRAY['https://a.com/x', 'https://b.com/y']) <> 'https://a.com/x https://b.com/y'
     OR public.kol_links_search_text('{}'::text[]) <> '' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：kol_links_search_text 結果不符';
  END IF;
END $$;
