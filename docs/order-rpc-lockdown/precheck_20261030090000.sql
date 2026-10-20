SELECT '1. update_order_with_context（8 參數）存在' AS 項目, to_regprocedure('public.update_order_with_context(uuid, jsonb, text, text, text, text, jsonb, jsonb)') IS NOT NULL AS 結果
UNION ALL SELECT '2. change_order_dates（6 參數）存在', to_regprocedure('public.change_order_dates(uuid, date, date, text, text, text)') IS NOT NULL
UNION ALL SELECT '3. 兩支函式都沒有其他同名多載', (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('update_order_with_context', 'change_order_dates')) = 2
UNION ALL SELECT '4. service_role 目前可執行 update_order_with_context', has_function_privilege('service_role', to_regprocedure('public.update_order_with_context(uuid, jsonb, text, text, text, text, jsonb, jsonb)'), 'EXECUTE')
UNION ALL SELECT '5. 資料庫內呼叫 update_order_with_context 的函式全部是 SECURITY DEFINER', NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.prosrc ILIKE '%update_order_with_context%' AND p.proname <> 'update_order_with_context' AND NOT p.prosecdef)
UNION ALL SELECT '6. 沒有觸發器函式呼叫 update_order_with_context', NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid WHERE p.prosrc ILIKE '%update_order_with_context%')
UNION ALL SELECT '7. 這些內部呼叫函式的擁有者都能執行 update_order_with_context', NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.prosrc ILIKE '%update_order_with_context%' AND p.proname <> 'update_order_with_context' AND NOT has_function_privilege(p.proowner, to_regprocedure('public.update_order_with_context(uuid, jsonb, text, text, text, text, jsonb, jsonb)'), 'EXECUTE'));

SELECT p.oid::regprocedure::text AS 函式, COALESCE(p.proacl::text, '(NULL＝預設 PUBLIC 可執行)') AS 目前授權, p.prosecdef AS security_definer, pg_get_userbyid(p.proowner) AS 擁有者,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon可執行, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated可執行, has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role可執行,
       md5(replace(p.prosrc, E'\r', '')) AS 指紋
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('update_order_with_context', 'change_order_dates')
ORDER BY 1;

SELECT p.proname AS 內部呼叫者, p.prosecdef AS security_definer, pg_get_userbyid(p.proowner) AS 擁有者, COALESCE(p.proacl::text, '(NULL)') AS 授權
FROM pg_proc p
WHERE p.prosrc ILIKE '%update_order_with_context%' AND p.proname <> 'update_order_with_context'
ORDER BY 1;
