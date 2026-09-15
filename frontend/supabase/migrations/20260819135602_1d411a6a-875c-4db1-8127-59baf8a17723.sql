
DROP POLICY IF EXISTS "bonus_settings_select_authenticated" ON public.closer_team_bonus_settings;
CREATE POLICY "bonus_settings_select_authenticated" ON public.closer_team_bonus_settings
FOR SELECT TO authenticated
USING (public.user_has_any_team_role(auth.uid()));
