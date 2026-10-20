-- rollback 20261026090000_pricing_v2_batch1：移除本批所有物件；方案單日價的展開列（season／day_tier）一併刪除，手動列不動
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

DROP TRIGGER IF EXISTS trg_single_inventory_channel ON public.accommodation_owlting_config;
DROP TRIGGER IF EXISTS trg_single_inventory_channel ON public.accommodation_hotelnabe_config;
DROP TRIGGER IF EXISTS trg_pricing_v2_package_price_change ON public.accommodation_packages;
DROP TRIGGER IF EXISTS trg_pricing_v2_holiday_ins ON public.public_holidays;
DROP TRIGGER IF EXISTS trg_pricing_v2_holiday_upd ON public.public_holidays;
DROP TRIGGER IF EXISTS trg_pricing_v2_holiday_del ON public.public_holidays;
DROP TRIGGER IF EXISTS trg_pdp_mark_manual ON public.package_date_prices;

DELETE FROM public.package_date_prices WHERE source <> 'manual';

DROP FUNCTION IF EXISTS public.set_discount_code_template_groups(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.set_pricing_template_group_members(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.delete_pricing_template_group(uuid);
DROP FUNCTION IF EXISTS public.save_pricing_template_group(uuid, uuid, text);
DROP TABLE IF EXISTS public.discount_code_group_synced_templates;
DROP TABLE IF EXISTS public.discount_code_template_groups;
DROP TABLE IF EXISTS public.pricing_template_group_members;
DROP TABLE IF EXISTS public.pricing_template_groups;
DROP FUNCTION IF EXISTS public.pricing_v2_on_code_link_change();
DROP FUNCTION IF EXISTS public.pricing_v2_on_group_member_stmt();
DROP FUNCTION IF EXISTS public.pricing_v2_on_group_member_change();
DROP FUNCTION IF EXISTS public.pricing_v2_recompute_code_scope(uuid);

DROP FUNCTION IF EXISTS public.rebuild_package_date_prices(uuid, date, date);
DROP FUNCTION IF EXISTS public.set_day_tier_overrides(uuid, date[], text, uuid);
DROP FUNCTION IF EXISTS public.delete_package_season(uuid);
DROP FUNCTION IF EXISTS public.save_package_season(uuid, uuid, text, date, date, jsonb);
DROP FUNCTION IF EXISTS public.pricing_v2_on_holiday_insert();
DROP FUNCTION IF EXISTS public.pricing_v2_on_holiday_change();
DROP FUNCTION IF EXISTS public.pricing_v2_on_package_price_change();
DROP FUNCTION IF EXISTS public.pricing_v2_rebuild_pdp(uuid, uuid[], date, date, boolean);
DROP FUNCTION IF EXISTS public.pricing_v2_clean_season_tiers(uuid, jsonb);
DROP FUNCTION IF EXISTS public.pricing_v2_assert_can_edit(uuid, text);
DROP FUNCTION IF EXISTS public.assert_single_inventory_channel();

ALTER TABLE public.package_date_prices
  DROP CONSTRAINT IF EXISTS package_date_prices_applied_tier_check,
  DROP CONSTRAINT IF EXISTS package_date_prices_source_check,
  DROP COLUMN IF EXISTS applied_tier,
  DROP COLUMN IF EXISTS season_id,
  DROP COLUMN IF EXISTS source;
DROP FUNCTION IF EXISTS public.pdp_mark_manual();
DROP TABLE IF EXISTS public.accommodation_day_tier_overrides;
DROP TABLE IF EXISTS public.package_seasons;

COMMIT;
