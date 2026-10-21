-- 20261104090000 rollback：移除 1 日 CHECK，政策改回 20261103090000 版本（新增不限日期、修改／刪除以 CURRENT_DATE 判斷）
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';
ALTER TABLE public.teamcommission_venue_revenue_source_overrides DROP CONSTRAINT IF EXISTS venue_source_overrides_month_start;
DROP POLICY IF EXISTS venue_source_overrides_insert ON public.teamcommission_venue_revenue_source_overrides;
DROP POLICY IF EXISTS venue_source_overrides_update ON public.teamcommission_venue_revenue_source_overrides;
DROP POLICY IF EXISTS venue_source_overrides_delete ON public.teamcommission_venue_revenue_source_overrides;
CREATE POLICY venue_source_overrides_insert ON public.teamcommission_venue_revenue_source_overrides FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_team_role(auth.uid(), 'am_manager'::public.app_role));
CREATE POLICY venue_source_overrides_update ON public.teamcommission_venue_revenue_source_overrides FOR UPDATE TO authenticated
  USING (effective_from >= date_trunc('month', CURRENT_DATE)::date AND (public.is_super_admin(auth.uid()) OR public.user_has_team_role(auth.uid(), 'am_manager'::public.app_role)))
  WITH CHECK (effective_from >= date_trunc('month', CURRENT_DATE)::date AND (public.is_super_admin(auth.uid()) OR public.user_has_team_role(auth.uid(), 'am_manager'::public.app_role)));
CREATE POLICY venue_source_overrides_delete ON public.teamcommission_venue_revenue_source_overrides FOR DELETE TO authenticated
  USING (effective_from > CURRENT_DATE AND (public.is_super_admin(auth.uid()) OR public.user_has_team_role(auth.uid(), 'am_manager'::public.app_role)));
COMMIT;
