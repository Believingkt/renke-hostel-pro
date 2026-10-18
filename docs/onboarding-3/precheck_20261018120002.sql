-- 20261018120002 套用前唯讀檢查：每列都應為 true
SELECT 'guard 函式為 090000 版本（不含 first_activated_at）' AS item, position('first_activated_at' IN replace(pg_get_functiondef('public.accommodation_info_guard_is_active()'::regprocedure), E'\r', '')) = 0 AS ok
UNION ALL SELECT 'guard 函式含 only_super_admin_can_change_is_active', position('only_super_admin_can_change_is_active' IN replace(pg_get_functiondef('public.accommodation_info_guard_is_active()'::regprocedure), E'\r', '')) > 0
UNION ALL SELECT 'trigger 存在', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_accommodation_info_guard_is_active' AND tgrelid='public.accommodation_info'::regclass)
UNION ALL SELECT '已套用 120001', to_regprocedure('public.wizard_precheck_core(uuid)') IS NOT NULL;
