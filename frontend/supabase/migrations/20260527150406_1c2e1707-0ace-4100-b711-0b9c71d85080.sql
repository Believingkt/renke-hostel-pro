ALTER TABLE public.team_member_profiles
  ADD COLUMN IF NOT EXISTS managed_venue text;

DROP POLICY IF EXISTS kol_profiles_select ON public.kol_profiles;
CREATE POLICY kol_profiles_select ON public.kol_profiles FOR SELECT
USING (
  user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
  OR user_has_team_role(auth.uid(), 'scout_manager'::app_role)
  OR user_has_team_role(auth.uid(), 'scout'::app_role)
  OR auth.uid() IN (
    SELECT user_id FROM public.user_roles
    WHERE role IN ('hotel_admin'::app_role, 'super_admin'::app_role)
  )
  OR (
    auth.uid() IN (
      SELECT user_id FROM public.user_roles WHERE role = 'venue_manager'::app_role
    )
    AND venue_name = (
      SELECT managed_venue FROM public.team_member_profiles WHERE user_id = auth.uid()
    )
  )
);