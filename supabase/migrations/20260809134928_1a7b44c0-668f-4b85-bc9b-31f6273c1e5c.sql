ALTER TABLE public.accommodation_partnership_periods
  ADD COLUMN IF NOT EXISTS counts_closer_commission boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS counts_team_bonus boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payout_basis text NOT NULL DEFAULT 'exclude_owner_direct';

ALTER TABLE public.accommodation_partnership_periods
  DROP CONSTRAINT IF EXISTS accommodation_partnership_periods_payout_basis_chk;

ALTER TABLE public.accommodation_partnership_periods
  ADD CONSTRAINT accommodation_partnership_periods_payout_basis_chk
  CHECK (payout_basis IN ('include_owner_direct', 'exclude_owner_direct'));

UPDATE public.accommodation_partnership_periods
SET counts_closer_commission = false,
    counts_team_bonus = false
WHERE bonus_policy = 'none';

ALTER TABLE public.teamcommission_bonus_snapshots
  ADD COLUMN IF NOT EXISTS base_revenue_incl_owner numeric,
  ADD COLUMN IF NOT EXISTS base_revenue_excl_owner numeric,
  ADD COLUMN IF NOT EXISTS amount_incl_owner numeric,
  ADD COLUMN IF NOT EXISTS amount_excl_owner numeric;