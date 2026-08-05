CREATE TABLE public.teamcommission_bonus_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bonus_type text NOT NULL,
  member_id uuid NOT NULL REFERENCES public.team_member_profiles(id),
  snapshot_month text NOT NULL,
  payout_month text NOT NULL,
  base_revenue numeric,
  rate numeric,
  fixed_amount numeric,
  venue_count integer,
  amount numeric NOT NULL,
  settings_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teamcommission_bonus_snapshots_bonus_type_check CHECK (bonus_type IN (
    'am_performance','am_venue_bonus','closer_performance','am_manager',
    'closer_manager','kol_commission','kol_monthly','venue_closing'
  )),
  CONSTRAINT teamcommission_bonus_snapshots_month_format_check CHECK (
    snapshot_month ~ '^\d{4}-\d{2}$' AND payout_month ~ '^\d{4}-\d{2}$'
  ),
  CONSTRAINT teamcommission_bonus_snapshots_unique UNIQUE (bonus_type, member_id, snapshot_month)
);

GRANT SELECT, INSERT ON public.teamcommission_bonus_snapshots TO authenticated;
GRANT ALL ON public.teamcommission_bonus_snapshots TO service_role;

ALTER TABLE public.teamcommission_bonus_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team can read teamcommission_bonus_snapshots"
ON public.teamcommission_bonus_snapshots
FOR SELECT
TO authenticated
USING (public.user_has_any_team_role(auth.uid()));

CREATE POLICY "super_admin can insert teamcommission_bonus_snapshots"
ON public.teamcommission_bonus_snapshots
FOR INSERT
TO authenticated
WITH CHECK (public.user_has_team_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_teamcommission_bonus_snapshots_member_payout
  ON public.teamcommission_bonus_snapshots (member_id, payout_month);

CREATE INDEX idx_teamcommission_bonus_snapshots_snapshot_month
  ON public.teamcommission_bonus_snapshots (snapshot_month);