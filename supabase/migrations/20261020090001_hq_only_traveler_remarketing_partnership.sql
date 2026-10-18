-- ============================================================
-- 2a 第三部分（已核准）：全平台旅客／再行銷／合作期間 跨館修正
--   traveler_profiles、remarketing_campaigns、remarketing_sends 沒有館別欄位 → 只限總部：
--     is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin')（全域 admin，accommodation_id IS NULL）
--   accommodation_partnership_periods：寫入只限 super_admin；讀取把 is_admin_or_super() 換成 is_super_admin()，
--     保留 finance/am/am_manager 與「本館 hotel_admin/owner」條件
--   policy 名稱、cmd、roles 不變；不修改 is_admin_or_super() 函式
-- ============================================================

BEGIN;
DO $$
DECLARE r record; v_n int;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('accommodation_partnership_periods', $q$partnership_periods_select_scoped$q$, $q$(is_admin_or_super() OR (EXISTS ( SELECT 1
   FROM user_roles ur2
  WHERE ((ur2.user_id = auth.uid()) AND (ur2.role = ANY (ARRAY['finance'::app_role, 'am'::app_role, 'am_manager'::app_role]))))) OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.accommodation_id = accommodation_partnership_periods.accommodation_id) AND (ur.role = ANY (ARRAY['hotel_admin'::app_role, 'owner'::app_role]))))))$q$, NULL),
    ('accommodation_partnership_periods', $q$partnership_periods_write_admin$q$, $q$is_admin_or_super()$q$, $q$is_admin_or_super()$q$),
    ('remarketing_campaigns', $q$Admins manage remarketing campaigns$q$, $q$(is_admin_or_super() OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['owner'::app_role, 'hotel_admin'::app_role, 'super_admin'::app_role, 'admin'::app_role]))))))$q$, $q$(is_admin_or_super() OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['owner'::app_role, 'hotel_admin'::app_role, 'super_admin'::app_role, 'admin'::app_role]))))))$q$),
    ('remarketing_sends', $q$Admins manage remarketing sends$q$, $q$(is_admin_or_super() OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['owner'::app_role, 'hotel_admin'::app_role, 'super_admin'::app_role, 'admin'::app_role]))))))$q$, $q$(is_admin_or_super() OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['owner'::app_role, 'hotel_admin'::app_role, 'super_admin'::app_role, 'admin'::app_role]))))))$q$),
    ('traveler_profiles', $q$Admins can delete traveler profiles$q$, $q$is_admin_or_super()$q$, NULL),
    ('traveler_profiles', $q$Admins can insert traveler profiles$q$, NULL, $q$is_admin_or_super()$q$),
    ('traveler_profiles', $q$Admins can update traveler profiles$q$, $q$is_admin_or_super()$q$, $q$is_admin_or_super()$q$),
    ('traveler_profiles', $q$Admins can view traveler profiles$q$, $q$(is_admin_or_super() OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['owner'::app_role, 'hotel_admin'::app_role, 'super_admin'::app_role, 'admin'::app_role]))))))$q$, NULL)
  ) AS x(t, p, q, w) LOOP
    SELECT count(*) INTO v_n FROM pg_policies
    WHERE schemaname = 'public' AND tablename = r.t AND policyname = r.p
      AND qual IS NOT DISTINCT FROM r.q AND with_check IS NOT DISTINCT FROM r.w;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'PRECHECK 失敗：%.% 的條件和預期不一致（或 policy 不存在），全部不修改', r.t, r.p;
    END IF;
  END LOOP;
END $$;
CREATE TEMP TABLE _m1_targets ON COMMIT DROP AS SELECT * FROM (VALUES
  ('accommodation_partnership_periods', $q$partnership_periods_select_scoped$q$),
  ('accommodation_partnership_periods', $q$partnership_periods_write_admin$q$),
  ('remarketing_campaigns', $q$Admins manage remarketing campaigns$q$),
  ('remarketing_sends', $q$Admins manage remarketing sends$q$),
  ('traveler_profiles', $q$Admins can delete traveler profiles$q$),
  ('traveler_profiles', $q$Admins can insert traveler profiles$q$),
  ('traveler_profiles', $q$Admins can update traveler profiles$q$),
  ('traveler_profiles', $q$Admins can view traveler profiles$q$)
) AS x(t, p);
CREATE TEMP TABLE _m1_other_policies ON COMMIT DROP AS
SELECT tablename, policyname, md5(cmd || '|' || array_to_string(roles, ',') || '|' || permissive || '|' || coalesce(qual, '<null>') || '|' || coalesce(with_check, '<null>')) AS h
FROM pg_policies
WHERE schemaname = 'public' AND (tablename, policyname) NOT IN (SELECT t, p FROM _m1_targets);

ALTER POLICY "partnership_periods_select_scoped" ON public.accommodation_partnership_periods
  USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM user_roles ur2
  WHERE ((ur2.user_id = auth.uid()) AND (ur2.role = ANY (ARRAY['finance'::app_role, 'am'::app_role, 'am_manager'::app_role]))))) OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.accommodation_id = accommodation_partnership_periods.accommodation_id) AND (ur.role = ANY (ARRAY['hotel_admin'::app_role, 'owner'::app_role])))))));
ALTER POLICY "partnership_periods_write_admin" ON public.accommodation_partnership_periods
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "Admins manage remarketing campaigns" ON public.remarketing_campaigns
  USING ((is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK ((is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role)));
ALTER POLICY "Admins manage remarketing sends" ON public.remarketing_sends
  USING ((is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK ((is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role)));
ALTER POLICY "Admins can delete traveler profiles" ON public.traveler_profiles
  USING ((is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role)));
ALTER POLICY "Admins can insert traveler profiles" ON public.traveler_profiles
  WITH CHECK ((is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role)));
ALTER POLICY "Admins can update traveler profiles" ON public.traveler_profiles
  USING ((is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK ((is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role)));
ALTER POLICY "Admins can view traveler profiles" ON public.traveler_profiles
  USING ((is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role)));

DO $$
DECLARE r record; v_n int;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('accommodation_partnership_periods', $q$partnership_periods_select_scoped$q$, $q$(is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM user_roles ur2
  WHERE ((ur2.user_id = auth.uid()) AND (ur2.role = ANY (ARRAY['finance'::app_role, 'am'::app_role, 'am_manager'::app_role]))))) OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.accommodation_id = accommodation_partnership_periods.accommodation_id) AND (ur.role = ANY (ARRAY['hotel_admin'::app_role, 'owner'::app_role]))))))$q$, NULL),
    ('accommodation_partnership_periods', $q$partnership_periods_write_admin$q$, $q$is_super_admin(auth.uid())$q$, $q$is_super_admin(auth.uid())$q$),
    ('remarketing_campaigns', $q$Admins manage remarketing campaigns$q$, $q$(is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role))$q$, $q$(is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role))$q$),
    ('remarketing_sends', $q$Admins manage remarketing sends$q$, $q$(is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role))$q$, $q$(is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role))$q$),
    ('traveler_profiles', $q$Admins can delete traveler profiles$q$, $q$(is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role))$q$, NULL),
    ('traveler_profiles', $q$Admins can insert traveler profiles$q$, NULL, $q$(is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role))$q$),
    ('traveler_profiles', $q$Admins can update traveler profiles$q$, $q$(is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role))$q$, $q$(is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role))$q$),
    ('traveler_profiles', $q$Admins can view traveler profiles$q$, $q$(is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role))$q$, NULL)
  ) AS x(t, p, q, w) LOOP
    SELECT count(*) INTO v_n FROM pg_policies
    WHERE schemaname = 'public' AND tablename = r.t AND policyname = r.p
      AND qual IS NOT DISTINCT FROM r.q AND with_check IS NOT DISTINCT FROM r.w;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'POSTCHECK 失敗：%.% 的條件和預期不一致（或 policy 不存在），全部不修改', r.t, r.p;
    END IF;
  END LOOP;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies p JOIN _m1_targets t ON t.t = p.tablename AND t.p = p.policyname
             WHERE p.schemaname = 'public' AND (coalesce(p.qual, '') || coalesce(p.with_check, '')) ~ 'is_admin_or_super\(\)') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：仍有跨館條件';
  END IF;
END $$;
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad FROM (
    (SELECT * FROM _m1_other_policies EXCEPT
     SELECT tablename, policyname, md5(cmd || '|' || array_to_string(roles, ',') || '|' || permissive || '|' || coalesce(qual, '<null>') || '|' || coalesce(with_check, '<null>'))
     FROM pg_policies WHERE schemaname = 'public' AND (tablename, policyname) NOT IN (SELECT t, p FROM _m1_targets))
    UNION ALL
    (SELECT tablename, policyname, md5(cmd || '|' || array_to_string(roles, ',') || '|' || permissive || '|' || coalesce(qual, '<null>') || '|' || coalesce(with_check, '<null>'))
     FROM pg_policies WHERE schemaname = 'public' AND (tablename, policyname) NOT IN (SELECT t, p FROM _m1_targets)
     EXCEPT SELECT * FROM _m1_other_policies)
  ) d;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：有 % 條不在修正範圍內的 policy 被改到', v_bad;
  END IF;
END $$;
COMMIT;
