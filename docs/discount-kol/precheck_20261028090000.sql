SELECT '1. validate_discount_code 存在' AS 項目, to_regprocedure('public.validate_discount_code(text, uuid, integer, uuid, date, uuid)') IS NOT NULL AS 結果
UNION ALL SELECT '2. 尚未套用：evaluate_discount_code 不存在', to_regprocedure('public.evaluate_discount_code(text, uuid, integer, uuid, date, uuid)') IS NULL
UNION ALL SELECT '3. sync_discount_code_used_count 存在', to_regprocedure('public.sync_discount_code_used_count()') IS NOT NULL
UNION ALL SELECT '4. 使用次數觸發器掛在 orders 上', EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgname = 'sync_discount_used_count_trigger' AND t.tgrelid = 'public.orders'::regclass AND NOT t.tgisinternal)
UNION ALL SELECT '5. 尚未套用：使用次數函式還沒有折扣金額條件', (SELECT replace(p.prosrc, E'\r', '') NOT LIKE '%discount_amount%' FROM pg_proc p WHERE p.oid = to_regprocedure('public.sync_discount_code_used_count()'))
UNION ALL SELECT '6. 依賴欄位齊全（6 個）', (SELECT count(*) FROM information_schema.columns c WHERE c.table_schema = 'public' AND ((c.table_name = 'discount_codes' AND c.column_name IN ('used_count', 'applicable_pricing_template_ids', 'applicable_room_types')) OR (c.table_name = 'accommodation_info' AND c.column_name = 'discount_scope_mode') OR (c.table_name = 'orders' AND c.column_name IN ('discount_code', 'discount_amount')))) = 6;

SELECT count(*) AS 折扣碼筆數, md5(string_agg(dc.id::text || ':' || COALESCE(dc.used_count::text, ''), ',' ORDER BY dc.id)) AS 使用次數指紋,
       (SELECT md5(replace(p.prosrc, E'\r', '')) FROM pg_proc p WHERE p.oid = to_regprocedure('public.validate_discount_code(text, uuid, integer, uuid, date, uuid)')) AS validate_discount_code指紋
FROM public.discount_codes dc;
