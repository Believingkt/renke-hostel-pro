CREATE POLICY "bonus_settings_super_admin_select"
ON public.closer_team_bonus_settings
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));