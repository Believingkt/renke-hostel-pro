SELECT '1. update_order_with_context：anon 不可執行' AS 項目, NOT has_function_privilege('anon', to_regprocedure('public.update_order_with_context(uuid, jsonb, text, text, text, text, jsonb, jsonb)'), 'EXECUTE') AS 結果
UNION ALL SELECT '2. update_order_with_context：authenticated 不可執行', NOT has_function_privilege('authenticated', to_regprocedure('public.update_order_with_context(uuid, jsonb, text, text, text, text, jsonb, jsonb)'), 'EXECUTE')
UNION ALL SELECT '3. update_order_with_context：service_role 可執行', has_function_privilege('service_role', to_regprocedure('public.update_order_with_context(uuid, jsonb, text, text, text, text, jsonb, jsonb)'), 'EXECUTE')
UNION ALL SELECT '4. update_order_with_context：授權清單沒有 PUBLIC、anon、authenticated', (SELECT p.proacl IS NOT NULL AND NOT EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 OR a.grantee IN (SELECT r.oid FROM pg_roles r WHERE r.rolname IN ('anon', 'authenticated'))) FROM pg_proc p WHERE p.oid = to_regprocedure('public.update_order_with_context(uuid, jsonb, text, text, text, text, jsonb, jsonb)'))
UNION ALL SELECT '5. change_order_dates：anon 不可執行', NOT has_function_privilege('anon', to_regprocedure('public.change_order_dates(uuid, date, date, text, text, text)'), 'EXECUTE')
UNION ALL SELECT '6. change_order_dates：授權清單沒有 PUBLIC、anon', (SELECT p.proacl IS NOT NULL AND NOT EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 OR a.grantee IN (SELECT r.oid FROM pg_roles r WHERE r.rolname = 'anon')) FROM pg_proc p WHERE p.oid = to_regprocedure('public.change_order_dates(uuid, date, date, text, text, text)'))
UNION ALL SELECT '7. change_order_dates：authenticated 可執行', has_function_privilege('authenticated', to_regprocedure('public.change_order_dates(uuid, date, date, text, text, text)'), 'EXECUTE')
UNION ALL SELECT '8. change_order_dates：service_role 可執行', has_function_privilege('service_role', to_regprocedure('public.change_order_dates(uuid, date, date, text, text, text)'), 'EXECUTE')
UNION ALL SELECT '9. update_order_with_context 指紋未變', (SELECT md5(replace(p.prosrc, E'\r', '')) = '892e4b288fa45361989c8b7494093bc6' FROM pg_proc p WHERE p.oid = to_regprocedure('public.update_order_with_context(uuid, jsonb, text, text, text, text, jsonb, jsonb)'))
UNION ALL SELECT '10. change_order_dates 指紋未變', (SELECT md5(replace(p.prosrc, E'\r', '')) = 'c929d74bdf8f6fa763c1e29f76eeb70f' FROM pg_proc p WHERE p.oid = to_regprocedure('public.change_order_dates(uuid, date, date, text, text, text)'))
UNION ALL SELECT '11. 內部呼叫者（SECURITY DEFINER）的擁有者仍可執行 update_order_with_context', NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.prosrc ILIKE '%update_order_with_context%' AND p.proname <> 'update_order_with_context' AND (NOT p.prosecdef OR NOT has_function_privilege(p.proowner, to_regprocedure('public.update_order_with_context(uuid, jsonb, text, text, text, text, jsonb, jsonb)'), 'EXECUTE')));

SELECT p.oid::regprocedure::text AS 函式, COALESCE(p.proacl::text, '(NULL)') AS 套用後授權, md5(replace(p.prosrc, E'\r', '')) AS 指紋
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('update_order_with_context', 'change_order_dates')
ORDER BY 1;
