-- closer_team_bonus_settings (roles: public, same commands)
DROP POLICY "bonus_settings_insert_admin" ON public.closer_team_bonus_settings;
CREATE POLICY "bonus_settings_insert_admin" ON public.closer_team_bonus_settings
  FOR INSERT TO public WITH CHECK (is_super_admin(auth.uid()));

DROP POLICY "bonus_settings_update_admin" ON public.closer_team_bonus_settings;
CREATE POLICY "bonus_settings_update_admin" ON public.closer_team_bonus_settings
  FOR UPDATE TO public USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

DROP POLICY "bonus_settings_delete_admin" ON public.closer_team_bonus_settings;
CREATE POLICY "bonus_settings_delete_admin" ON public.closer_team_bonus_settings
  FOR DELETE TO public USING (is_super_admin(auth.uid()));

-- closer_team_bonus_distribution
DROP POLICY "bonus_distribution_admin_all" ON public.closer_team_bonus_distribution;
CREATE POLICY "bonus_distribution_admin_all" ON public.closer_team_bonus_distribution
  FOR ALL TO authenticated USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

-- venue_team_bonus_tier_rules
DROP POLICY "hq admins can insert venue tier rules" ON public.venue_team_bonus_tier_rules;
CREATE POLICY "hq admins can insert venue tier rules" ON public.venue_team_bonus_tier_rules
  FOR INSERT TO authenticated WITH CHECK (is_super_admin(auth.uid()));

DROP POLICY "hq admins can update venue tier rules" ON public.venue_team_bonus_tier_rules;
CREATE POLICY "hq admins can update venue tier rules" ON public.venue_team_bonus_tier_rules
  FOR UPDATE TO authenticated USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

DROP POLICY "hq admins can delete venue tier rules" ON public.venue_team_bonus_tier_rules;
CREATE POLICY "hq admins can delete venue tier rules" ON public.venue_team_bonus_tier_rules
  FOR DELETE TO authenticated USING (is_super_admin(auth.uid()));