DROP POLICY IF EXISTS kol_profiles_select ON public.kol_profiles;
CREATE POLICY kol_profiles_select ON public.kol_profiles FOR SELECT
USING (
  user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
  OR user_has_team_role(auth.uid(), 'scout_manager'::app_role)
  OR user_has_team_role(auth.uid(), 'scout'::app_role)
  OR user_has_team_role(auth.uid(), 'venue_manager'::app_role)
);

DROP POLICY IF EXISTS kol_profiles_update ON public.kol_profiles;
CREATE POLICY kol_profiles_update ON public.kol_profiles FOR UPDATE
USING (
  (created_by = auth.uid())
  OR user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
  OR user_has_team_role(auth.uid(), 'scout_manager'::app_role)
  OR user_has_team_role(auth.uid(), 'venue_manager'::app_role)
);