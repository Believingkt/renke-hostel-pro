ALTER TABLE public.package_date_prices
  ALTER COLUMN sale_price DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS is_available boolean;