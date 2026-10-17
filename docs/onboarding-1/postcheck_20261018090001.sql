-- postcheck（唯讀）：20261018090001_auto_template_for_packages.sql
-- 套用後在正式庫執行，結果應為：欄位 boolean NOT NULL DEFAULT false、三支 trigger enabled = O、
-- 三個函式 SECURITY DEFINER、所有館 auto_template_enabled = false、列數與 precheck 相同
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'accommodation_info_flags'
  AND column_name = 'auto_template_enabled';

SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS def
FROM pg_trigger
WHERE tgrelid = 'public.accommodation_packages'::regclass
  AND tgname IN ('trg_packages_auto_template_ins', 'trg_packages_auto_template_room', 'trg_packages_auto_template_del')
ORDER BY tgname;

SELECT proname, prosecdef FROM pg_proc
WHERE proname IN ('packages_auto_template_on_insert', 'packages_auto_template_on_primary_room',
                  'packages_auto_template_on_delete')
ORDER BY proname;

-- 刪除檢查：兩欄都應為 true
SELECT pg_get_functiondef('public.packages_auto_template_on_delete()'::regprocedure) LIKE '%o.package_id = OLD.id%' AS checks_order_package,
       pg_get_functiondef('public.packages_auto_template_on_delete()'::regprocedure) LIKE '%23503%' AS raises_23503;

SELECT count(*) FILTER (WHERE auto_template_enabled) AS n_auto_on, count(*) AS n_flags
FROM public.accommodation_info_flags;

SELECT (SELECT count(*) FROM public.pricing_templates) AS n_tpl,
       (SELECT count(*) FROM public.accommodation_packages) AS n_pkg;
