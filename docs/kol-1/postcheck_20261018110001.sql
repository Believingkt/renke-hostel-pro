-- postcheck（唯讀）：20261018110001_kol_profiles_other_links_search.sql
-- 預期：other_links_text is_generated = ALWAYS；n_mismatch = 0
SELECT column_name, data_type, is_generated
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'kol_profiles' AND column_name = 'other_links_text';

SELECT count(*) FILTER (WHERE other_links_text IS DISTINCT FROM array_to_string(other_links, ' ')) AS n_mismatch,
       count(*) AS n_total
FROM public.kol_profiles;
