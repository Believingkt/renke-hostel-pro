DROP POLICY IF EXISTS kol_profiles_select ON public.kol_profiles;

CREATE POLICY kol_profiles_select
ON public.kol_profiles
FOR SELECT
TO authenticated
USING (
  public.is_admin_or_super()
  OR public.user_has_any_team_role(auth.uid())
  OR (
    EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'venue_manager'::public.app_role
    )
    AND venue_name IN (
      SELECT unnest(team_member_profiles.managed_venue)
      FROM public.team_member_profiles
      WHERE team_member_profiles.user_id = auth.uid()
    )
  )
);