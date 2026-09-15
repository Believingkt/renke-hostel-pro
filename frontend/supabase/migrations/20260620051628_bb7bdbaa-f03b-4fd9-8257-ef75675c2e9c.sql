-- Restrict SELECT on these 6 tables to team-role users only
DROP POLICY IF EXISTS "accommodation_flags_select" ON public.accommodation_info_flags;
CREATE POLICY "accommodation_flags_select" ON public.accommodation_info_flags
  FOR SELECT USING (public.user_has_any_team_role(auth.uid()));

DROP POLICY IF EXISTS "kol_settings_select" ON public.accommodation_kol_settings;
CREATE POLICY "kol_settings_select" ON public.accommodation_kol_settings
  FOR SELECT USING (public.user_has_any_team_role(auth.uid()));

DROP POLICY IF EXISTS "authenticated can read closer_commission_adjustments" ON public.closer_commission_adjustments;
CREATE POLICY "team can read closer_commission_adjustments" ON public.closer_commission_adjustments
  FOR SELECT USING (public.user_has_any_team_role(auth.uid()));

DROP POLICY IF EXISTS "authenticated can read closer_commission_snapshots" ON public.closer_commission_snapshots;
CREATE POLICY "team can read closer_commission_snapshots" ON public.closer_commission_snapshots
  FOR SELECT USING (public.user_has_any_team_role(auth.uid()));

DROP POLICY IF EXISTS "kol_commission_settings_select" ON public.kol_commission_settings;
CREATE POLICY "kol_commission_settings_select" ON public.kol_commission_settings
  FOR SELECT USING (public.user_has_any_team_role(auth.uid()));

DROP POLICY IF EXISTS "authenticated can read scout_fulltime_targets" ON public.scout_fulltime_targets;
CREATE POLICY "team can read scout_fulltime_targets" ON public.scout_fulltime_targets
  FOR SELECT USING (public.user_has_any_team_role(auth.uid()));