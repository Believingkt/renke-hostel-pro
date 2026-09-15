-- Add peak_price column to pricing_templates for the new 3-tier pricing model
-- 平日 (weekday) = 週一至週四
-- 旺日 (peak)   = 週五及週日
-- 假日 (weekend) = 週六及國定假日
ALTER TABLE public.pricing_templates
  ADD COLUMN IF NOT EXISTS peak_price integer NULL;

COMMENT ON COLUMN public.pricing_templates.weekday_price IS '平日價格（週一至週四）';
COMMENT ON COLUMN public.pricing_templates.peak_price IS '旺日價格（週五及週日）';
COMMENT ON COLUMN public.pricing_templates.weekend_price IS '假日價格（週六及國定假日）';