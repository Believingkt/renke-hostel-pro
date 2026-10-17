-- precheck（唯讀）：20261018090001_auto_template_for_packages.sql
-- 套用前在正式庫執行
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pricing_templates'
  AND column_name IN ('room_type_id', 'room_type_ids', 'default_package_id', 'weekday_price', 'peak_price',
                      'weekend_price', 'price', 'weekday_enabled', 'peak_enabled', 'weekend_enabled', 'display_order')
ORDER BY column_name;

SELECT conname, confdeltype, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.pricing_templates'::regclass AND contype = 'f'
ORDER BY conname;

SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'pricing_templates'
ORDER BY indexname;

SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'accommodation_info_flags'
ORDER BY ordinal_position;

SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS def
FROM pg_trigger
WHERE tgrelid = 'public.accommodation_packages'::regclass AND NOT tgisinternal
ORDER BY tgname;

SELECT (SELECT count(*) FROM public.accommodation_info_flags) AS n_flags,
       (SELECT count(*) FROM public.pricing_templates) AS n_tpl,
       (SELECT count(*) FROM public.accommodation_packages) AS n_pkg;

-- 刪除檢查所需的引用欄位與 FK 行為（orders_package_id_fkey 應為 ON DELETE SET NULL）
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'orders' AND column_name IN ('package_id', 'pricing_template_id'))
    OR (table_name = 'order_rooms' AND column_name = 'template_id')
    OR (table_name = 'owlting_room_type_group_members' AND column_name = 'rate_plan_template_id'))
ORDER BY table_name, column_name;
SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
WHERE conname IN ('orders_package_id_fkey', 'orders_pricing_template_id_fkey', 'order_rooms_template_id_fkey',
                  'owlting_room_type_group_members_rate_plan_template_id_fkey')
ORDER BY conname;
