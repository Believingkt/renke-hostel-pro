DROP POLICY IF EXISTS bonus_settings_insert_admin ON public.closer_team_bonus_settings;

CREATE POLICY bonus_settings_insert_admin ON public.closer_team_bonus_settings
  FOR INSERT
  WITH CHECK (public.is_admin_or_super());

CREATE POLICY bonus_settings_update_admin ON public.closer_team_bonus_settings
  FOR UPDATE
  USING (public.is_admin_or_super())
  WITH CHECK (public.is_admin_or_super());

CREATE POLICY bonus_settings_delete_admin ON public.closer_team_bonus_settings
  FOR DELETE
  USING (public.is_admin_or_super());