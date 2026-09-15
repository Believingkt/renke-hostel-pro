ALTER TABLE public.public_holidays ADD COLUMN IF NOT EXISTS is_custom boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_public_holidays_is_custom ON public.public_holidays (is_custom);