ALTER TABLE public.accommodation_packages
ADD COLUMN IF NOT EXISTS tier_prices jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.accommodation_packages.tier_prices IS
'Per-tier price overrides. Shape: { weekday?: {original?: number|null, sale: number}, friday_sunday?: {...}, weekend?: {...} }. Missing tier falls back to top-level original_price/sale_price.';