-- precheck（唯讀）：20261018090000_accommodation_is_active_guard.sql
-- 套用前在正式庫執行，結果應為：is_active 欄位存在、is_super_admin 存在、guard 尚未存在
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'accommodation_info' AND column_name = 'is_active';

SELECT to_regprocedure('public.is_super_admin(uuid)') IS NOT NULL AS has_is_super_admin,
       to_regprocedure('public.accommodation_info_guard_is_active()') IS NOT NULL AS guard_already_exists;

SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS def
FROM pg_trigger
WHERE tgrelid = 'public.accommodation_info'::regclass AND NOT tgisinternal
ORDER BY tgname;

SELECT count(*) AS n_all, count(*) FILTER (WHERE is_active) AS n_active,
       string_agg(name, '、' ORDER BY name) FILTER (WHERE NOT is_active) AS inactive_names
FROM public.accommodation_info;
