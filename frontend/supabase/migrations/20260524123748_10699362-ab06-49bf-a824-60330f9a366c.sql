CREATE POLICY "kol_profiles_delete"
ON public.kol_profiles
FOR DELETE
TO authenticated
USING (
  user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
  OR user_has_team_role(auth.uid(), 'scout_manager'::app_role)
);