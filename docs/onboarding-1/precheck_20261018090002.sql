-- precheck（唯讀）：20261018090002_auto_template_price_fallback.sql
-- 套用前在正式庫執行：md5 應等於 abc30714c0f7ffdaf4a4fbd58d2f2f56（= 20261018090001 版本）；不同請先停下回報
SELECT md5(pg_get_functiondef('public.packages_auto_template_on_insert()'::regprocedure)) AS md5_now,
       md5(pg_get_functiondef('public.packages_auto_template_on_insert()'::regprocedure)) = 'abc30714c0f7ffdaf4a4fbd58d2f2f56' AS is_0001_version;

SELECT tgname, tgenabled, tgfoid::regprocedure AS func
FROM pg_trigger
WHERE tgrelid = 'public.accommodation_packages'::regclass AND tgname = 'trg_packages_auto_template_ins';

-- 參考：目前分日價出現 0 的方案（使用者已查過只有測試館 1 筆）
SELECT p.accommodation_id, p.id, p.name, p.sale_price, p.original_price, p.tier_prices
FROM public.accommodation_packages p
WHERE EXISTS (
  SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(p.tier_prices) = 'object' THEN p.tier_prices ELSE '{}'::jsonb END) e
  WHERE (e.value ->> 'sale') = '0' OR (e.value ->> 'original') = '0'
);
