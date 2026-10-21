-- 20261106090000 postcheck（唯讀）
-- Q1 剩下的殘留：只應剩「valid_left = 0」的列（預期四季山宿 3 筆專案；方案 9a74a709 若原本只綁已刪房型也會留在這裡）
SELECT 'accommodation_packages' AS tbl, p.id, p.accommodation_id, p.name AS row_name, x AS missing_room_type_id, (SELECT count(*) FROM unnest(p.room_type_ids) AS y WHERE EXISTS (SELECT 1 FROM public.room_types r WHERE r.id = y)) AS valid_left FROM public.accommodation_packages p CROSS JOIN LATERAL unnest(p.room_type_ids) AS x WHERE NOT EXISTS (SELECT 1 FROM public.room_types r WHERE r.id = x)
UNION ALL
SELECT 'pricing_templates', t.id, t.accommodation_id, t.template_name, x, (SELECT count(*) FROM unnest(t.room_type_ids) AS y WHERE EXISTS (SELECT 1 FROM public.room_types r WHERE r.id = y)) FROM public.pricing_templates t CROSS JOIN LATERAL unnest(t.room_type_ids) AS x WHERE NOT EXISTS (SELECT 1 FROM public.room_types r WHERE r.id = x)
ORDER BY 1, 2;

-- Q2 這次實際清理了哪些列（備份表）：0 或 1 列（方案 9a74a709）；new_room_type_ids 不含 e5eff54d…、且不是空陣列
SELECT b.tbl, b.row_id, b.old_room_type_ids, b.new_room_type_ids, b.old_single_room_type_id, b.backed_up_at FROM public.room_type_ids_cleanup_backup_20261106 b ORDER BY 1, 2;

-- Q3 方案 9a74a709 現值
SELECT p.id, p.name, p.primary_room_type_id, p.room_type_ids FROM public.accommodation_packages p WHERE p.id = '9a74a709-f83b-4a53-a39a-efda917d4802';

-- Q4 觸發器與函式：tgenabled = O、prosecdef = true、proconfig 含 search_path=public、proacl 不含 anon／authenticated
SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS def FROM pg_trigger t WHERE t.tgrelid = 'public.room_types'::regclass AND t.tgname = 'trg_room_types_detach_from_plans';
SELECT p.proname, p.prosecdef, p.proconfig, p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'room_types_detach_from_plans_before_delete';

-- Q5 備份表：rls = true；第二段查詢應 0 列（anon／authenticated 沒有任何權限）
SELECT c.relname, c.relrowsecurity AS rls FROM pg_class c WHERE c.oid = to_regclass('public.room_type_ids_cleanup_backup_20261106');
SELECT g.grantee, g.privilege_type FROM information_schema.role_table_grants g WHERE g.table_schema = 'public' AND g.table_name = 'room_type_ids_cleanup_backup_20261106' AND g.grantee IN ('anon', 'authenticated', 'PUBLIC');
