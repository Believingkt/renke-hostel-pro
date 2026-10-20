-- 唯讀：20261026090000_pricing_v2_batch1 套用前檢查（每列「結果」應為 t）
SELECT '尚未套用：沒有 package_seasons' AS 項目, to_regclass('public.package_seasons') IS NULL AS 結果
UNION ALL SELECT '尚未套用：沒有 pricing_template_groups', to_regclass('public.pricing_template_groups') IS NULL
UNION ALL SELECT '尚未套用：package_date_prices 沒有 source 欄', NOT EXISTS (
  SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'package_date_prices' AND column_name = 'source')
UNION ALL SELECT '依賴函式 staff_can_edit_module／staff_can_view_module／classify_day_tier／user_has_role 存在',
  to_regprocedure('public.staff_can_edit_module(uuid, text)') IS NOT NULL
  AND to_regprocedure('public.staff_can_view_module(uuid, text)') IS NOT NULL
  AND to_regprocedure('public.classify_day_tier(date, uuid)') IS NOT NULL
  AND to_regprocedure('public.user_has_role(uuid, uuid, public.app_role)') IS NOT NULL
UNION ALL SELECT '依賴欄位齊全（5 個）', (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'
  AND ((table_name = 'accommodation_info_flags' AND column_name = 'new_price_ui_enabled')
    OR (table_name = 'accommodation_owlting_config' AND column_name = 'sync_enabled')
    OR (table_name = 'accommodation_hotelnabe_config' AND column_name = 'sync_enabled')
    OR (table_name = 'discount_codes' AND column_name = 'applicable_pricing_template_ids')
    OR (table_name = 'accommodation_packages' AND column_name = 'tier_prices'))) = 5
UNION ALL SELECT '沒有館同時開奧丁丁與旭海同步', NOT EXISTS (
  SELECT 1 FROM public.accommodation_owlting_config o JOIN public.accommodation_hotelnabe_config h ON h.accommodation_id = o.accommodation_id
  WHERE o.sync_enabled AND h.sync_enabled)
UNION ALL SELECT '方案單日價 (package_id, date) 唯一鍵存在', EXISTS (
  SELECT 1 FROM pg_constraint c WHERE c.conrelid = 'public.package_date_prices'::regclass AND c.contype = 'u'
    AND (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)) = ARRAY['date', 'package_id'])
UNION ALL SELECT '折扣碼適用專案欄位全部是陣列', NOT EXISTS (
  SELECT 1 FROM public.discount_codes WHERE jsonb_typeof(applicable_pricing_template_ids) IS DISTINCT FROM 'array')
UNION ALL SELECT '目前方案單日價筆數（參考值，postcheck 比對）', (SELECT count(*) FROM public.package_date_prices) >= 0;

SELECT count(*) AS 套用前方案單日價筆數, md5(string_agg(id::text || ':' || COALESCE(sale_price::text, '') || ':' || COALESCE(original_price::text, '') || ':' || COALESCE(is_available::text, ''), ',' ORDER BY id)) AS 內容指紋
FROM public.package_date_prices;
