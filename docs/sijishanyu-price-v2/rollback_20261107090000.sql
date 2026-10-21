-- 20261107090000 rollback：四季還原成移轉前（刪新方案 15 個（含停用中的單間 4 個）／新專案 3 個／flags；24人包棟方案、13 專案、3 網紅碼還原）
-- 正常＝COMMIT 成功、無 ROLLBACK 中止訊息；若出現「已有訂單使用新方案或新專案」代表有人已用新方案下單，整段不會執行，需人工處理
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

DO $rb$
BEGIN
  IF to_regclass('public.sijishanyu_price_v2_backup_20261107') IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK 中止：備份表不存在';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.orders o JOIN public.sijishanyu_price_v2_backup_20261107 b
      ON (b.kind = 'new_package' AND o.package_id = b.ref_id) OR (b.kind = 'new_template' AND o.pricing_template_id = b.ref_id)
  ) THEN
    RAISE EXCEPTION 'ROLLBACK 中止：已有訂單使用新方案或新專案，請人工處理';
  END IF;
END
$rb$;

DELETE FROM public.pricing_templates t USING public.sijishanyu_price_v2_backup_20261107 b WHERE b.kind = 'new_template' AND t.id = b.ref_id;
DELETE FROM public.package_date_prices d USING public.sijishanyu_price_v2_backup_20261107 b WHERE b.kind IN ('new_package', 'package') AND d.package_id = b.ref_id AND d.source IS DISTINCT FROM 'manual';
DELETE FROM public.accommodation_packages p USING public.sijishanyu_price_v2_backup_20261107 b WHERE b.kind = 'new_package' AND p.id = b.ref_id;

UPDATE public.accommodation_packages p
SET tier_prices = b.data->'tier_prices', sale_price = (b.data->>'sale_price')::numeric, original_price = (b.data->>'original_price')::numeric,
    applicable_tiers = ARRAY(SELECT jsonb_array_elements_text(b.data->'applicable_tiers')),
    guest_count = (b.data->>'guest_count')::int, included_guest_count = (b.data->>'included_guest_count')::int,
    guest_count_max = (b.data->>'guest_count_max')::int, display_order = (b.data->>'display_order')::int,
    enabled = (b.data->>'enabled')::boolean, updated_at = (b.data->>'updated_at')::timestamptz
FROM public.sijishanyu_price_v2_backup_20261107 b WHERE b.kind = 'package' AND p.id = b.ref_id;

UPDATE public.pricing_templates t
SET default_package_id = NULL,
    weekday_price = (b.data->>'weekday_price')::int, weekday_enabled = (b.data->>'weekday_enabled')::boolean,
    peak_price = (b.data->>'peak_price')::int, peak_enabled = (b.data->>'peak_enabled')::boolean,
    weekend_price = (b.data->>'weekend_price')::int, weekend_enabled = (b.data->>'weekend_enabled')::boolean,
    price = (b.data->>'price')::int, updated_at = (b.data->>'updated_at')::timestamptz
FROM public.sijishanyu_price_v2_backup_20261107 b WHERE b.kind = 'template' AND t.id = b.ref_id;

UPDATE public.discount_codes d
SET applicable_pricing_template_ids = b.data->'applicable_pricing_template_ids'
FROM public.sijishanyu_price_v2_backup_20261107 b WHERE b.kind = 'discount_code' AND d.id = b.ref_id;

DELETE FROM public.accommodation_info_flags f WHERE f.accommodation_id = 'a4bacadc-9b7a-4110-ac04-a1cc6248c822';
DROP TABLE public.sijishanyu_price_v2_backup_20261107;
COMMIT;

-- 驗證（唯讀）：正常＝flags_rows 0、packages 1、enabled_packages 1、templates 13、linked 0、backup_exists false
SELECT (SELECT count(*) FROM public.accommodation_info_flags f WHERE f.accommodation_id = 'a4bacadc-9b7a-4110-ac04-a1cc6248c822') AS flags_rows, (SELECT count(*) FROM public.accommodation_packages p WHERE p.accommodation_id = 'a4bacadc-9b7a-4110-ac04-a1cc6248c822') AS packages, (SELECT count(*) FROM public.accommodation_packages p WHERE p.accommodation_id = 'a4bacadc-9b7a-4110-ac04-a1cc6248c822' AND p.enabled) AS enabled_packages, (SELECT count(*) FROM public.pricing_templates t WHERE t.accommodation_id = 'a4bacadc-9b7a-4110-ac04-a1cc6248c822') AS templates, (SELECT count(*) FROM public.pricing_templates t WHERE t.accommodation_id = 'a4bacadc-9b7a-4110-ac04-a1cc6248c822' AND t.default_package_id IS NOT NULL) AS linked, to_regclass('public.sijishanyu_price_v2_backup_20261107') IS NOT NULL AS backup_exists;
-- 驗證（唯讀）：正常＝3 列，tpl_count 都是 9
SELECT d.code, jsonb_array_length(d.applicable_pricing_template_ids) AS tpl_count FROM public.discount_codes d WHERE d.code IN ('AMILE77', 'KWYTMIO', 'MIE20') ORDER BY 1;
-- 驗證（唯讀）：正常＝1 列 24人包棟 enabled true、sale_price 46300、original_price 61800
SELECT p.name, p.enabled, p.sale_price, p.original_price, p.tier_prices FROM public.accommodation_packages p WHERE p.id = '90df31ce-c89a-4f73-b5e1-62db8276f2f2';
