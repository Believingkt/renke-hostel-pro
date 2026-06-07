CREATE TABLE public.scout_fulltime_targets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  year integer NOT NULL,
  month integer NOT NULL,
  venue_name text NOT NULL,
  target_count integer NOT NULL DEFAULT 0,
  fulltime_min integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scout_fulltime_targets TO authenticated;
GRANT ALL ON public.scout_fulltime_targets TO service_role;

ALTER TABLE public.scout_fulltime_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read scout_fulltime_targets"
ON public.scout_fulltime_targets FOR SELECT
TO authenticated USING (true);

CREATE POLICY "admin can write scout_fulltime_targets"
ON public.scout_fulltime_targets FOR ALL
TO authenticated
USING (public.user_has_team_role(auth.uid(), 'super_admin') OR public.user_has_team_role(auth.uid(), 'hotel_admin') OR public.user_has_team_role(auth.uid(), 'scout_manager'))
WITH CHECK (public.user_has_team_role(auth.uid(), 'super_admin') OR public.user_has_team_role(auth.uid(), 'hotel_admin') OR public.user_has_team_role(auth.uid(), 'scout_manager'));