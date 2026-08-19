
DROP POLICY IF EXISTS "meta_ads_select" ON public.meta_ads;
CREATE POLICY "meta_ads_select" ON public.meta_ads FOR SELECT TO authenticated
USING (public.user_has_team_role(auth.uid(),'super_admin'::app_role) OR public.user_has_team_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS "meta_ad_weekly_select" ON public.meta_ad_weekly;
CREATE POLICY "meta_ad_weekly_select" ON public.meta_ad_weekly FOR SELECT TO authenticated
USING (public.user_has_team_role(auth.uid(),'super_admin'::app_role) OR public.user_has_team_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS "meta_ad_insights_daily_select" ON public.meta_ad_insights_daily;
CREATE POLICY "meta_ad_insights_daily_select" ON public.meta_ad_insights_daily FOR SELECT TO authenticated
USING (public.user_has_team_role(auth.uid(),'super_admin'::app_role) OR public.user_has_team_role(auth.uid(),'admin'::app_role));
