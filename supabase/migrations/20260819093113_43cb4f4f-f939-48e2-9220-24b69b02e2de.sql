ALTER TABLE public.group_buy_campaign_packages
  ADD COLUMN IF NOT EXISTS weekday_price numeric,
  ADD COLUMN IF NOT EXISTS peak_price numeric,
  ADD COLUMN IF NOT EXISTS holiday_price numeric,
  ADD COLUMN IF NOT EXISTS excluded_dates date[] NOT NULL DEFAULT '{}'::date[];

ALTER TABLE public.group_buy_campaign_packages
  ADD CONSTRAINT gb_pkg_weekday_price_positive CHECK (weekday_price IS NULL OR weekday_price > 0),
  ADD CONSTRAINT gb_pkg_peak_price_positive CHECK (peak_price IS NULL OR peak_price > 0),
  ADD CONSTRAINT gb_pkg_holiday_price_positive CHECK (holiday_price IS NULL OR holiday_price > 0);

ALTER TABLE public.group_buy_commissions
  ADD COLUMN IF NOT EXISTS price_snapshot jsonb;