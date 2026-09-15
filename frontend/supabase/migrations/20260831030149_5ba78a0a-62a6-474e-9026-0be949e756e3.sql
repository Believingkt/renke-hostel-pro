DROP POLICY "kol_profiles_select" ON public.kol_profiles;

CREATE POLICY "kol_profiles_select"
ON public.kol_profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'::app_role
  )
  OR user_has_team_role(auth.uid(), 'scout'::app_role)
  OR user_has_team_role(auth.uid(), 'scout_manager'::app_role)
  OR (accommodation_id IS NOT NULL AND is_hotel_admin_of(accommodation_id))
  OR (
    (EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'venue_manager'::app_role
    ))
    AND venue_name IN (
      SELECT unnest(tmp.managed_venue) FROM public.team_member_profiles tmp
      WHERE tmp.user_id = auth.uid()
    )
  )
);