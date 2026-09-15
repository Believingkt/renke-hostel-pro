CREATE TABLE public.venue_team_bonus_tier_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  bonus_type text NOT NULL CHECK (bonus_type IN ('am_performance','am_manager','closer_performance')),
  effective_from date NOT NULL,
  tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (accommodation_id, bonus_type, effective_from)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_team_bonus_tier_rules TO authenticated;
GRANT ALL ON public.venue_team_bonus_tier_rules TO service_role;

ALTER TABLE public.venue_team_bonus_tier_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team members can read venue tier rules"
ON public.venue_team_bonus_tier_rules
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "hq admins can insert venue tier rules"
ON public.venue_team_bonus_tier_rules
FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_super());

CREATE POLICY "hq admins can update venue tier rules"
ON public.venue_team_bonus_tier_rules
FOR UPDATE TO authenticated
USING (public.is_admin_or_super())
WITH CHECK (public.is_admin_or_super());

CREATE POLICY "hq admins can delete venue tier rules"
ON public.venue_team_bonus_tier_rules
FOR DELETE TO authenticated
USING (public.is_admin_or_super());

CREATE TRIGGER update_venue_team_bonus_tier_rules_updated_at
BEFORE UPDATE ON public.venue_team_bonus_tier_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_venue_tier_rules_lookup
ON public.venue_team_bonus_tier_rules (accommodation_id, bonus_type, effective_from DESC);

ALTER TABLE public.teamcommission_bonus_snapshot_lines
  ADD COLUMN IF NOT EXISTS tier_rule_id uuid,
  ADD COLUMN IF NOT EXISTS tier_min_revenue numeric,
  ADD COLUMN IF NOT EXISTS tier_rate numeric;