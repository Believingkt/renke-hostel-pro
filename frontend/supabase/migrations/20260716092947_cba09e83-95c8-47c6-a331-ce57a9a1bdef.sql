ALTER TABLE public.consulting_fee_settings
  ADD COLUMN IF NOT EXISTS revenue_threshold numeric DEFAULT 0;

UPDATE public.consulting_fee_settings SET revenue_threshold = 0 WHERE revenue_threshold IS NULL;

COMMENT ON COLUMN public.consulting_fee_settings.revenue_threshold IS '業績門檻（元）。0 或 NULL = 不設門檻直接抽；> 0 = 當月住房營收未達此金額則費率為 0%，達到或超過才套用 rate';