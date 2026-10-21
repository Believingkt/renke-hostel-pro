-- 20261104090000 單館訂單來源覆蓋：生效日只能是某月 1 日、只能新增／修改本月或之後（台北時間），擋下補登過去月份
-- 前置：20261103090000_venue_bonus_flags_source_overrides.sql
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

DO $pre$
BEGIN
  IF to_regclass('public.teamcommission_venue_revenue_source_overrides') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：缺 teamcommission_venue_revenue_source_overrides（請先套用 20261103090000）';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_source_overrides_month_start') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：已套用過';
  END IF;
  IF EXISTS (SELECT 1 FROM public.teamcommission_venue_revenue_source_overrides WHERE EXTRACT(day FROM effective_from) <> 1) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：已有生效日不是 1 日的版本，請先處理（見 precheck 第 3 項）';
  END IF;
  IF (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.teamcommission_venue_revenue_source_overrides'::regclass
      AND polname IN ('venue_source_overrides_insert', 'venue_source_overrides_update', 'venue_source_overrides_delete')) <> 3 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：寫入政策與預期不符';
  END IF;
END
$pre$;

ALTER TABLE public.teamcommission_venue_revenue_source_overrides
  ADD CONSTRAINT venue_source_overrides_month_start CHECK (EXTRACT(day FROM effective_from) = 1);

DROP POLICY venue_source_overrides_insert ON public.teamcommission_venue_revenue_source_overrides;
DROP POLICY venue_source_overrides_update ON public.teamcommission_venue_revenue_source_overrides;
DROP POLICY venue_source_overrides_delete ON public.teamcommission_venue_revenue_source_overrides;

CREATE POLICY venue_source_overrides_insert ON public.teamcommission_venue_revenue_source_overrides FOR INSERT TO authenticated
  WITH CHECK (effective_from >= date_trunc('month', now() AT TIME ZONE 'Asia/Taipei')::date AND (public.is_super_admin(auth.uid()) OR public.user_has_team_role(auth.uid(), 'am_manager'::public.app_role)));
CREATE POLICY venue_source_overrides_update ON public.teamcommission_venue_revenue_source_overrides FOR UPDATE TO authenticated
  USING (effective_from >= date_trunc('month', now() AT TIME ZONE 'Asia/Taipei')::date AND (public.is_super_admin(auth.uid()) OR public.user_has_team_role(auth.uid(), 'am_manager'::public.app_role)))
  WITH CHECK (effective_from >= date_trunc('month', now() AT TIME ZONE 'Asia/Taipei')::date AND (public.is_super_admin(auth.uid()) OR public.user_has_team_role(auth.uid(), 'am_manager'::public.app_role)));
CREATE POLICY venue_source_overrides_delete ON public.teamcommission_venue_revenue_source_overrides FOR DELETE TO authenticated
  USING (effective_from > (now() AT TIME ZONE 'Asia/Taipei')::date AND (public.is_super_admin(auth.uid()) OR public.user_has_team_role(auth.uid(), 'am_manager'::public.app_role)));

COMMIT;
