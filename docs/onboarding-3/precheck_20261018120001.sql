-- 20261018120001 套用前唯讀檢查：每列都應為 true
SELECT '12 支精靈函式尚不存在' AS item, NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('wizard_assert_access','wizard_save_room_type','wizard_clean_tier_prices','wizard_save_package','wizard_season_plan','wizard_preview_season_prices','wizard_apply_season_prices','wizard_open_inventory','wizard_precheck_core','wizard_precheck','wizard_submit','wizard_return')) AS ok
UNION ALL SELECT '已套用 120000', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='accommodation_onboarding_steps' AND column_name='return_reason')
UNION ALL SELECT 'auto_template_enabled 存在', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='accommodation_info_flags' AND column_name='auto_template_enabled')
UNION ALL SELECT '自動建專案 trigger 存在', to_regprocedure('public.packages_auto_template_on_insert()') IS NOT NULL
UNION ALL SELECT 'save_package_tier_prices 存在（不修改）', to_regprocedure('public.save_package_tier_prices(uuid, jsonb)') IS NOT NULL;
