ALTER TABLE public.accommodation_info
  ADD COLUMN IF NOT EXISTS secondary_currency text,
  ADD COLUMN IF NOT EXISTS secondary_currency_rate numeric;

COMMENT ON COLUMN public.accommodation_info.secondary_currency IS 'Display-only secondary currency code (e.g., JPY). NULL = disabled. Does not affect TWD settlement.';
COMMENT ON COLUMN public.accommodation_info.secondary_currency_rate IS 'TWD -> secondary currency rate, manually maintained. Display-only.';