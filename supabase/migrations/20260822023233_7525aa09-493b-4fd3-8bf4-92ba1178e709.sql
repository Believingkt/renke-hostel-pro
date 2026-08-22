ALTER TABLE public.group_buy_campaign_packages ADD COLUMN IF NOT EXISTS max_guests integer;

COMMENT ON COLUMN public.group_buy_campaign_packages.max_guests IS '團購方案最多入住人數；NULL 代表沿用房型原本人數上限';