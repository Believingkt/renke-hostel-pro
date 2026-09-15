
ALTER TABLE public.scout_monthly_payouts
  ADD COLUMN IF NOT EXISTS period smallint NOT NULL DEFAULT 25
  CHECK (period IN (10, 25));

ALTER TABLE public.scout_monthly_payouts
  DROP CONSTRAINT IF EXISTS scout_monthly_payouts_year_month_scout_id_key;

ALTER TABLE public.scout_monthly_payouts
  ADD CONSTRAINT scout_monthly_payouts_year_month_period_scout_id_key
  UNIQUE (year, month, period, scout_id);
