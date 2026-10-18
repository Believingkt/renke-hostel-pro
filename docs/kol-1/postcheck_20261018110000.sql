-- postcheck（唯讀）：20261018110000_kol_profiles_other_links.sql
-- 預期：1 列，data_type = ARRAY、is_nullable = NO、column_default = '{}'::text[]
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'kol_profiles' AND column_name = 'other_links';

-- 預期：n_non_empty = 0（上線前不應有資料）
SELECT count(*) FILTER (WHERE cardinality(other_links) > 0) AS n_non_empty, count(*) AS n_total
FROM public.kol_profiles;
