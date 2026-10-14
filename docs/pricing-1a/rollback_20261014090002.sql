-- rollback for 20261014090002_yunxiu_tier_price_conversion.sql
-- 由備份表還原雲岫方案與專案的價格相關欄位，並把雲岫 flags 改回預設；備份表保留供稽核
DO $$
DECLARE
  c_acc constant uuid := '7690a606-6bac-4cd5-a3e7-2fa754b318e8';
  v_n int;
BEGIN
  IF to_regclass('public.backup_20261014_yunxiu_packages') IS NULL
     OR to_regclass('public.backup_20261014_yunxiu_templates') IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK 中止：備份表不存在';
  END IF;

  UPDATE public.accommodation_packages p
  SET tier_prices = b.tier_prices,
      sale_price = b.sale_price,
      original_price = b.original_price,
      applicable_tiers = b.applicable_tiers
  FROM public.backup_20261014_yunxiu_packages b
  WHERE p.id = b.id AND p.accommodation_id = c_acc;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'ROLLBACK：還原方案 % 筆', v_n;

  UPDATE public.pricing_templates t
  SET price = b.price,
      weekday_price = b.weekday_price,
      peak_price = b.peak_price,
      weekend_price = b.weekend_price,
      weekday_enabled = b.weekday_enabled,
      peak_enabled = b.peak_enabled,
      weekend_enabled = b.weekend_enabled
  FROM public.backup_20261014_yunxiu_templates b
  WHERE t.id = b.id AND t.accommodation_id = c_acc;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'ROLLBACK：還原專案 % 筆', v_n;

  UPDATE public.accommodation_info_flags
  SET new_price_ui_enabled = false,
      price_sync_mode = 'no_sync',
      updated_at = now()
  WHERE accommodation_id = c_acc;

  IF EXISTS (
    SELECT 1 FROM public.accommodation_packages p
    JOIN public.backup_20261014_yunxiu_packages b ON b.id = p.id
    WHERE p.tier_prices IS DISTINCT FROM b.tier_prices
       OR p.sale_price IS DISTINCT FROM b.sale_price
       OR p.original_price IS DISTINCT FROM b.original_price
       OR p.applicable_tiers IS DISTINCT FROM b.applicable_tiers
  ) OR EXISTS (
    SELECT 1 FROM public.pricing_templates t
    JOIN public.backup_20261014_yunxiu_templates b ON b.id = t.id
    WHERE t.price IS DISTINCT FROM b.price
       OR t.weekday_price IS DISTINCT FROM b.weekday_price
       OR t.peak_price IS DISTINCT FROM b.peak_price
       OR t.weekend_price IS DISTINCT FROM b.weekend_price
       OR t.weekday_enabled IS DISTINCT FROM b.weekday_enabled
       OR t.peak_enabled IS DISTINCT FROM b.peak_enabled
       OR t.weekend_enabled IS DISTINCT FROM b.weekend_enabled
  ) THEN
    RAISE EXCEPTION 'ROLLBACK 驗證失敗：還原後與備份不一致';
  END IF;
END $$;
