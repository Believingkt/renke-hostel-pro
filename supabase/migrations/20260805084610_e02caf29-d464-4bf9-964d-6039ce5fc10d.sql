CREATE TABLE public.teamcommission_venue_closing_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id),
  member_id uuid NOT NULL REFERENCES public.team_member_profiles(id),
  effective_from date NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.teamcommission_venue_closing_assignments TO authenticated;
GRANT ALL ON public.teamcommission_venue_closing_assignments TO service_role;

ALTER TABLE public.teamcommission_venue_closing_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tc_venue_closing_assignments_select
  ON public.teamcommission_venue_closing_assignments
  FOR SELECT TO authenticated
  USING (user_has_any_team_role(auth.uid()));

CREATE POLICY tc_venue_closing_assignments_insert
  ON public.teamcommission_venue_closing_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR user_has_team_role(auth.uid(), 'admin'::app_role)
  );

CREATE INDEX idx_tc_venue_closing_assignments_lookup
  ON public.teamcommission_venue_closing_assignments (accommodation_id, effective_from DESC, created_at DESC);