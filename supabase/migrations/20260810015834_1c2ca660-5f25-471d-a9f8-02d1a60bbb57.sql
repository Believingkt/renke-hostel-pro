ALTER TABLE public.teamcommission_bonus_snapshots
  ADD COLUMN IF NOT EXISTS payout_basis_used text,
  ADD COLUMN IF NOT EXISTS multiplier_used numeric,
  ADD COLUMN IF NOT EXISTS multiplier_source text,
  ADD COLUMN IF NOT EXISTS active_days integer,
  ADD COLUMN IF NOT EXISTS period_days integer,
  ADD COLUMN IF NOT EXISTS prorate_ratio numeric;

ALTER TABLE public.closer_commission_snapshots
  ADD COLUMN IF NOT EXISTS multiplier_used numeric,
  ADD COLUMN IF NOT EXISTS multiplier_source text,
  ADD COLUMN IF NOT EXISTS active_days integer,
  ADD COLUMN IF NOT EXISTS period_days integer,
  ADD COLUMN IF NOT EXISTS prorate_ratio numeric;