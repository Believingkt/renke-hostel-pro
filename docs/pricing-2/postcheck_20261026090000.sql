-- 唯讀：20261026090000_pricing_v2_batch1 套用後檢查（每列「結果」應為 t）
WITH expected_fns(sig) AS (VALUES
  ('public.pdp_mark_manual()'), ('public.pricing_v2_assert_can_edit(uuid, text)'),
  ('public.pricing_v2_clean_season_tiers(uuid, jsonb)'), ('public.pricing_v2_rebuild_pdp(uuid, uuid[], date, date, boolean)'),
  ('public.save_package_season(uuid, uuid, text, date, date, jsonb)'), ('public.delete_package_season(uuid)'),
  ('public.set_day_tier_overrides(uuid, date[], text, uuid)'), ('public.rebuild_package_date_prices(uuid, date, date)'),
  ('public.pricing_v2_on_package_price_change()'), ('public.pricing_v2_on_holiday_change()'), ('public.pricing_v2_on_holiday_insert()'),
  ('public.pricing_v2_recompute_code_scope(uuid)'), ('public.pricing_v2_on_group_member_change()'),
  ('public.pricing_v2_on_group_member_stmt()'), ('public.pricing_v2_on_code_link_change()'),
  ('public.save_pricing_template_group(uuid, uuid, text)'), ('public.delete_pricing_template_group(uuid)'),
  ('public.set_pricing_template_group_members(uuid, uuid[])'), ('public.set_discount_code_template_groups(uuid, uuid[])'),
  ('public.assert_single_inventory_channel()')
),
rpc(sig) AS (VALUES
  ('public.save_package_season(uuid, uuid, text, date, date, jsonb)'), ('public.delete_package_season(uuid)'),
  ('public.set_day_tier_overrides(uuid, date[], text, uuid)'), ('public.rebuild_package_date_prices(uuid, date, date)'),
  ('public.save_pricing_template_group(uuid, uuid, text)'), ('public.delete_pricing_template_group(uuid)'),
  ('public.set_pricing_template_group_members(uuid, uuid[])'), ('public.set_discount_code_template_groups(uuid, uuid[])')
)
SELECT '20 個函式都存在' AS 項目, (SELECT bool_and(to_regprocedure(sig) IS NOT NULL) FROM expected_fns) AS 結果
UNION ALL SELECT '8 個 RPC：authenticated 可執行、anon 不可', (SELECT bool_and(has_function_privilege('authenticated', sig, 'EXECUTE')
  AND NOT has_function_privilege('anon', sig, 'EXECUTE')) FROM rpc)
UNION ALL SELECT '內部函式：authenticated、anon 都不可執行', (SELECT bool_and(NOT has_function_privilege('authenticated', sig, 'EXECUTE')
  AND NOT has_function_privilege('anon', sig, 'EXECUTE')) FROM expected_fns WHERE sig NOT IN (SELECT sig FROM rpc))
UNION ALL SELECT 'RPC 都是 SECURITY DEFINER 且固定 search_path', (SELECT bool_and(p.prosecdef AND array_to_string(p.proconfig, ',') LIKE '%search_path=public%')
  FROM rpc JOIN pg_proc p ON p.oid = to_regprocedure(rpc.sig))
UNION ALL SELECT '6 張新表存在且開啟 RLS', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relrowsecurity AND c.relname IN ('package_seasons', 'accommodation_day_tier_overrides',
    'pricing_template_groups', 'pricing_template_group_members', 'discount_code_template_groups', 'discount_code_group_synced_templates')) = 6
UNION ALL SELECT '新表 authenticated 不能直接寫入', NOT EXISTS (SELECT 1 FROM unnest(ARRAY['package_seasons', 'accommodation_day_tier_overrides',
    'pricing_template_groups', 'pricing_template_group_members', 'discount_code_template_groups', 'discount_code_group_synced_templates']) t
  WHERE has_table_privilege('authenticated', 'public.' || t, 'INSERT') OR has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
     OR has_table_privilege('authenticated', 'public.' || t, 'DELETE') OR has_table_privilege('anon', 'public.' || t, 'SELECT'))
UNION ALL SELECT 'package_date_prices 新欄位 3 個', (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'
  AND table_name = 'package_date_prices' AND column_name IN ('source', 'season_id', 'applied_tier')) = 3
UNION ALL SELECT '既有方案單日價全部是 manual', NOT EXISTS (SELECT 1 FROM public.package_date_prices WHERE source <> 'manual')
UNION ALL SELECT '觸發器 9 個都存在', (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN (
  'trg_pdp_mark_manual', 'trg_pricing_v2_package_price_change', 'trg_pricing_v2_holiday_ins', 'trg_pricing_v2_holiday_upd',
  'trg_pricing_v2_holiday_del', 'trg_ptg_members_ins', 'trg_ptg_members_upd', 'trg_ptg_members_del', 'trg_dctg_change')) = 9
UNION ALL SELECT '奧丁丁、旭海兩張表都有互斥觸發器', (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'trg_single_inventory_channel'
  AND tgrelid IN ('public.accommodation_owlting_config'::regclass, 'public.accommodation_hotelnabe_config'::regclass)) = 2
UNION ALL SELECT '沒有館同時開奧丁丁與旭海同步', NOT EXISTS (
  SELECT 1 FROM public.accommodation_owlting_config o JOIN public.accommodation_hotelnabe_config h ON h.accommodation_id = o.accommodation_id
  WHERE o.sync_enabled AND h.sync_enabled)
UNION ALL SELECT '新 RPC 內容含權限與開關檢查（去除 \r 後比對）', (SELECT bool_and(replace(pg_get_functiondef(to_regprocedure(sig)), E'\r', '') LIKE '%pricing_v2_assert_can_edit%')
  FROM rpc);

SELECT count(*) AS 套用後方案單日價筆數, md5(string_agg(id::text || ':' || COALESCE(sale_price::text, '') || ':' || COALESCE(original_price::text, '') || ':' || COALESCE(is_available::text, ''), ',' ORDER BY id)) AS 內容指紋
FROM public.package_date_prices;
