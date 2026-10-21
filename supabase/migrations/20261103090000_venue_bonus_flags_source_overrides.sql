-- 20261103090000：館別獎金旗標（取代寫死的「旅行日」館名判斷）＋單館訂單來源覆蓋（共用／KOL 專利）
-- 1. teamcommission_venue_bonus_flags：exclude_from_commission（不列入抽成類獎金，含場域成交獎金）、fixed_merge_group（固定額合併群組；KOL 邀約同群組＝同一份合約）
--    現有 name LIKE '旅行日%' 的館別帶入 exclude=true、group='旅行日系列'，與原本館名判斷結果相同
-- 2. teamcommission_venue_revenue_source_overrides：track shared／kol，effective_from 版本；included_order_sources 為 NULL＝改回全站預設
-- 單館覆蓋版本：當月（含）以後的版本可修改，過去月份只能新增新版本（不可改歷史）；未來版本可刪除
-- 讀取：總部（super_admin／admin）與團隊成員（AM／成交／星探／財務）；寫入：super_admin、AM 總管（am_manager）。edge function 以 service role 讀取
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

DO $pre$
BEGIN
  IF to_regclass('public.teamcommission_venue_bonus_flags') IS NOT NULL OR to_regclass('public.teamcommission_venue_revenue_source_overrides') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：資料表已存在（已套用過）';
  END IF;
  IF to_regprocedure('public.user_has_team_role(uuid, public.app_role)') IS NULL OR to_regprocedure('public.is_super_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：缺 user_has_team_role／is_super_admin';
  END IF;
END
$pre$;

CREATE TABLE public.teamcommission_venue_bonus_flags (
  accommodation_id uuid PRIMARY KEY REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  exclude_from_commission boolean NOT NULL DEFAULT false,
  fixed_merge_group text CHECK (fixed_merge_group IS NULL OR length(btrim(fixed_merge_group)) BETWEEN 1 AND 40),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid()
);

CREATE TABLE public.teamcommission_venue_revenue_source_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  track text NOT NULL CHECK (track IN ('shared', 'kol')),
  included_order_sources text[],
  effective_from date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  UNIQUE (accommodation_id, track, effective_from)
);
CREATE INDEX teamcommission_venue_revenue_source_overrides_track_idx ON public.teamcommission_venue_revenue_source_overrides (track, effective_from);

INSERT INTO public.teamcommission_venue_bonus_flags (accommodation_id, exclude_from_commission, fixed_merge_group, updated_by)
SELECT a.id, true, '旅行日系列', NULL FROM public.accommodation_info a WHERE a.name LIKE '旅行日%';

ALTER TABLE public.teamcommission_venue_bonus_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teamcommission_venue_revenue_source_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY venue_bonus_flags_read ON public.teamcommission_venue_bonus_flags FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_team_role(auth.uid(), 'admin'::public.app_role) OR public.user_has_team_role(auth.uid(), 'am'::public.app_role) OR public.user_has_team_role(auth.uid(), 'am_manager'::public.app_role) OR public.user_has_team_role(auth.uid(), 'closer'::public.app_role) OR public.user_has_team_role(auth.uid(), 'closer_manager'::public.app_role) OR public.user_has_team_role(auth.uid(), 'scout'::public.app_role) OR public.user_has_team_role(auth.uid(), 'scout_manager'::public.app_role) OR public.user_has_team_role(auth.uid(), 'finance'::public.app_role));
CREATE POLICY venue_bonus_flags_write ON public.teamcommission_venue_bonus_flags FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_team_role(auth.uid(), 'am_manager'::public.app_role))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_team_role(auth.uid(), 'am_manager'::public.app_role));

CREATE POLICY venue_source_overrides_read ON public.teamcommission_venue_revenue_source_overrides FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_team_role(auth.uid(), 'admin'::public.app_role) OR public.user_has_team_role(auth.uid(), 'am'::public.app_role) OR public.user_has_team_role(auth.uid(), 'am_manager'::public.app_role) OR public.user_has_team_role(auth.uid(), 'closer'::public.app_role) OR public.user_has_team_role(auth.uid(), 'closer_manager'::public.app_role) OR public.user_has_team_role(auth.uid(), 'scout'::public.app_role) OR public.user_has_team_role(auth.uid(), 'scout_manager'::public.app_role) OR public.user_has_team_role(auth.uid(), 'finance'::public.app_role));
CREATE POLICY venue_source_overrides_insert ON public.teamcommission_venue_revenue_source_overrides FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_team_role(auth.uid(), 'am_manager'::public.app_role));
CREATE POLICY venue_source_overrides_update ON public.teamcommission_venue_revenue_source_overrides FOR UPDATE TO authenticated
  USING (effective_from >= date_trunc('month', CURRENT_DATE)::date AND (public.is_super_admin(auth.uid()) OR public.user_has_team_role(auth.uid(), 'am_manager'::public.app_role)))
  WITH CHECK (effective_from >= date_trunc('month', CURRENT_DATE)::date AND (public.is_super_admin(auth.uid()) OR public.user_has_team_role(auth.uid(), 'am_manager'::public.app_role)));
CREATE POLICY venue_source_overrides_delete ON public.teamcommission_venue_revenue_source_overrides FOR DELETE TO authenticated
  USING (effective_from > CURRENT_DATE AND (public.is_super_admin(auth.uid()) OR public.user_has_team_role(auth.uid(), 'am_manager'::public.app_role)));

REVOKE ALL ON public.teamcommission_venue_bonus_flags, public.teamcommission_venue_revenue_source_overrides FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teamcommission_venue_bonus_flags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teamcommission_venue_revenue_source_overrides TO authenticated;
GRANT ALL ON public.teamcommission_venue_bonus_flags, public.teamcommission_venue_revenue_source_overrides TO service_role;

DO $post$
BEGIN
  IF (SELECT count(*) FROM public.teamcommission_venue_bonus_flags) <> (SELECT count(*) FROM public.accommodation_info WHERE name LIKE '旅行日%') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：旅行日館別帶入筆數不符';
  END IF;
END
$post$;

COMMIT;
