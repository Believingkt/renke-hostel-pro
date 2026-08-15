ALTER TABLE public.teamcommission_bonus_snapshots
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'final';

CREATE TABLE IF NOT EXISTS public.teamcommission_bonus_snapshot_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES public.teamcommission_bonus_snapshots(id) ON DELETE CASCADE,
  accommodation_id uuid REFERENCES public.accommodation_info(id) ON DELETE SET NULL,
  accommodation_name text,
  revenue_base numeric,
  revenue_base_incl_owner numeric,
  revenue_base_excl_owner numeric,
  rate_value numeric,
  rate_kind text NOT NULL DEFAULT 'percent',
  multiplier numeric,
  amount numeric NOT NULL DEFAULT 0,
  amount_incl_owner numeric,
  amount_excl_owner numeric,
  split_headcount integer,
  prorate_ratio numeric,
  countable_ranges jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.teamcommission_bonus_snapshot_lines TO authenticated;
GRANT ALL ON public.teamcommission_bonus_snapshot_lines TO service_role;

ALTER TABLE public.teamcommission_bonus_snapshot_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team can read teamcommission_bonus_snapshot_lines"
  ON public.teamcommission_bonus_snapshot_lines
  FOR SELECT TO authenticated
  USING (public.user_has_any_team_role(auth.uid()));

CREATE POLICY "super_admin can write teamcommission_bonus_snapshot_lines"
  ON public.teamcommission_bonus_snapshot_lines
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_tcbs_lines_snapshot ON public.teamcommission_bonus_snapshot_lines(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_tcbs_lines_acc ON public.teamcommission_bonus_snapshot_lines(accommodation_id);
CREATE INDEX IF NOT EXISTS idx_tcbs_month_member ON public.teamcommission_bonus_snapshots(snapshot_month, member_id);