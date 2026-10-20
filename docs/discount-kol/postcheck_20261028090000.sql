SELECT '1. evaluate_discount_code 存在、SECURITY DEFINER、固定 search_path' AS 項目, (SELECT p.prosecdef AND array_to_string(p.proconfig, ',') LIKE '%search_path=public%' FROM pg_proc p WHERE p.oid = to_regprocedure('public.evaluate_discount_code(text, uuid, integer, uuid, date, uuid)')) AS 結果
UNION ALL SELECT '2. anon、authenticated、service_role 都可執行', has_function_privilege('anon', to_regprocedure('public.evaluate_discount_code(text, uuid, integer, uuid, date, uuid)'), 'EXECUTE') AND has_function_privilege('authenticated', to_regprocedure('public.evaluate_discount_code(text, uuid, integer, uuid, date, uuid)'), 'EXECUTE') AND has_function_privilege('service_role', to_regprocedure('public.evaluate_discount_code(text, uuid, integer, uuid, date, uuid)'), 'EXECUTE')
UNION ALL SELECT '3. 使用次數只計折扣 > 0', (SELECT replace(p.prosrc, E'\r', '') LIKE '%COALESCE(o.discount_amount, 0) > 0%' FROM pg_proc p WHERE p.oid = to_regprocedure('public.sync_discount_code_used_count()'))
UNION ALL SELECT '4. 使用次數更新限定館別', (SELECT replace(p.prosrc, E'\r', '') LIKE '%dc.accommodation_id = v_pairs[i] AND dc.code = v_codes[i]%' FROM pg_proc p WHERE p.oid = to_regprocedure('public.sync_discount_code_used_count()'))
UNION ALL SELECT '5. 使用次數觸發器仍掛在 orders 上', EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgname = 'sync_discount_used_count_trigger' AND t.tgrelid = 'public.orders'::regclass AND NOT t.tgisinternal)
UNION ALL SELECT '6. validate_discount_code 仍存在', to_regprocedure('public.validate_discount_code(text, uuid, integer, uuid, date, uuid)') IS NOT NULL
UNION ALL SELECT '7. 無效碼對外只有單一訊息（不分不存在／停用／過期／未生效）', (SELECT replace(p.prosrc, E'\r', '') NOT LIKE '%已過期%' AND replace(p.prosrc, E'\r', '') NOT LIKE '%尚未生效%' AND replace(p.prosrc, E'\r', '') NOT LIKE '%已停用%' FROM pg_proc p WHERE p.oid = to_regprocedure('public.evaluate_discount_code(text, uuid, integer, uuid, date, uuid)'));

SELECT count(*) AS 折扣碼筆數, md5(string_agg(dc.id::text || ':' || COALESCE(dc.used_count::text, ''), ',' ORDER BY dc.id)) AS 使用次數指紋,
       (SELECT md5(replace(p.prosrc, E'\r', '')) FROM pg_proc p WHERE p.oid = to_regprocedure('public.validate_discount_code(text, uuid, integer, uuid, date, uuid)')) AS validate_discount_code指紋
FROM public.discount_codes dc;

SELECT a.name AS 館別, dc.code AS 碼, dc.used_count AS 目前使用次數,
       (SELECT count(*) FROM public.orders o WHERE o.accommodation_id = dc.accommodation_id AND o.discount_code = dc.code AND o.order_status != 'cancelled' AND COALESCE(o.discount_amount, 0) > 0) AS 新規則重算後次數
FROM public.discount_codes dc
JOIN public.accommodation_info a ON a.id = dc.accommodation_id
WHERE dc.used_count IS DISTINCT FROM (SELECT count(*) FROM public.orders o WHERE o.accommodation_id = dc.accommodation_id AND o.discount_code = dc.code AND o.order_status != 'cancelled' AND COALESCE(o.discount_amount, 0) > 0)
ORDER BY a.name, dc.code;
