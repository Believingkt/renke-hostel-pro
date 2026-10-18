-- 20261018120002 套用後唯讀檢查：每列都應為 true
SELECT 'guard 含 first_activated_at 與 wizard_precheck_core' AS item, position('first_activated_at' IN replace(pg_get_functiondef('public.accommodation_info_guard_is_active()'::regprocedure), E'\r', '')) > 0 AND position('wizard_precheck_core' IN replace(pg_get_functiondef('public.accommodation_info_guard_is_active()'::regprocedure), E'\r', '')) > 0 AS ok
UNION ALL SELECT 'guard 仍含 only_super_admin_can_change_is_active', position('only_super_admin_can_change_is_active' IN replace(pg_get_functiondef('public.accommodation_info_guard_is_active()'::regprocedure), E'\r', '')) > 0
UNION ALL SELECT 'trigger 仍存在且未變', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_accommodation_info_guard_is_active' AND tgrelid='public.accommodation_info'::regclass AND tgenabled='O')
UNION ALL SELECT '會被硬擋的既有館只有測試館', NOT EXISTS (SELECT 1 FROM public.accommodation_info WHERE first_activated_at IS NULL AND id <> 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5');
