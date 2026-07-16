CREATE POLICY "kol_reciprocal_quota_scout_manager_select"
  ON public.kol_reciprocal_monthly_quotas FOR SELECT
  USING (public.user_has_team_role(auth.uid(), 'scout_manager'));

CREATE POLICY "kol_reciprocal_quota_scout_manager_insert"
  ON public.kol_reciprocal_monthly_quotas FOR INSERT
  WITH CHECK (public.user_has_team_role(auth.uid(), 'scout_manager'));

CREATE POLICY "kol_reciprocal_quota_scout_manager_update"
  ON public.kol_reciprocal_monthly_quotas FOR UPDATE
  USING (public.user_has_team_role(auth.uid(), 'scout_manager'))
  WITH CHECK (public.user_has_team_role(auth.uid(), 'scout_manager'));

CREATE POLICY "kol_reciprocal_quota_scout_manager_delete"
  ON public.kol_reciprocal_monthly_quotas FOR DELETE
  USING (public.user_has_team_role(auth.uid(), 'scout_manager'));