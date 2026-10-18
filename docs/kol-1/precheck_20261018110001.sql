-- precheck（唯讀）：20261018110001_kol_profiles_other_links_search.sql
-- 預期：other_links 1 列（已套 20261018110000）；other_links_text 0 列；函式為 NULL
SELECT column_name, data_type, is_generated
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'kol_profiles' AND column_name IN ('other_links', 'other_links_text');

SELECT to_regprocedure('public.kol_links_search_text(text[])') AS fn;
