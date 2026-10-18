-- precheck（唯讀）：20261018110000_kol_profiles_other_links.sql
-- 預期：第 1 段 0 列（欄位尚未存在）
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'kol_profiles' AND column_name = 'other_links';

-- 參考：主欄位塞了多個網址的舊資料筆數（本 migration 不處理，之後另寫清理腳本）
SELECT count(*) AS n_multi_link_rows
FROM public.kol_profiles
WHERE (length(coalesce(ig_handle, '')) - length(replace(lower(coalesce(ig_handle, '')), 'http', ''))) / 4 >= 2;
