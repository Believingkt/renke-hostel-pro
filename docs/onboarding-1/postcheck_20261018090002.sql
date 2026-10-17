-- postcheck（唯讀）：20261018090002_auto_template_price_fallback.sql
-- 套用後在正式庫執行：is_new_version = true、prosecdef = true、trigger enabled = O
SELECT md5(pg_get_functiondef('public.packages_auto_template_on_insert()'::regprocedure)) AS md5_now,
       pg_get_functiondef('public.packages_auto_template_on_insert()'::regprocedure) LIKE '%COALESCE(v_val, v_pkg_orig, v_pkg_sale, 0)%' AS is_new_version,
       (SELECT prosecdef FROM pg_proc WHERE oid = 'public.packages_auto_template_on_insert()'::regprocedure) AS prosecdef;

SELECT tgname, tgenabled, tgfoid::regprocedure AS func
FROM pg_trigger
WHERE tgrelid = 'public.accommodation_packages'::regclass AND tgname = 'trg_packages_auto_template_ins';
