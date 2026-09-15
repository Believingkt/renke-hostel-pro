-- Add a single price field to pricing_templates
ALTER TABLE public.pricing_templates ADD COLUMN IF NOT EXISTS price integer;

-- Migrate existing data: use weekday_price as the default price
UPDATE public.pricing_templates 
SET price = COALESCE(weekday_price, weekend_price)
WHERE price IS NULL;