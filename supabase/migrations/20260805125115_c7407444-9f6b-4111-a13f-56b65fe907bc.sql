CREATE POLICY "kol_reciprocal_quota_scout_select"
ON public.kol_reciprocal_monthly_quotas
FOR SELECT
TO authenticated
USING (public.user_has_team_role(auth.uid(), 'scout'::app_role));