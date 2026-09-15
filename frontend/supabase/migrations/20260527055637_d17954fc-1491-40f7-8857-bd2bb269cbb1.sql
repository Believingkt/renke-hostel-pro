DROP POLICY IF EXISTS tier_settings_write ON public.scout_tier_settings;
CREATE POLICY tier_settings_write ON public.scout_tier_settings
  FOR ALL
  USING (
    user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR user_has_team_role(auth.uid(), 'admin'::app_role)
    OR user_has_team_role(auth.uid(), 'scout_manager'::app_role)
  )
  WITH CHECK (
    user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR user_has_team_role(auth.uid(), 'admin'::app_role)
    OR user_has_team_role(auth.uid(), 'scout_manager'::app_role)
  );

DROP POLICY IF EXISTS salary_settings_write ON public.scout_salary_settings;
CREATE POLICY salary_settings_write ON public.scout_salary_settings
  FOR ALL
  USING (
    user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR user_has_team_role(auth.uid(), 'admin'::app_role)
    OR user_has_team_role(auth.uid(), 'scout_manager'::app_role)
  )
  WITH CHECK (
    user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR user_has_team_role(auth.uid(), 'admin'::app_role)
    OR user_has_team_role(auth.uid(), 'scout_manager'::app_role)
  );