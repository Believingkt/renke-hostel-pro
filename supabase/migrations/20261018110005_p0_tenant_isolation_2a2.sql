-- ============================================================
-- 2a-2：P0 7 張表跨館修正（只改 policy 條件，不修改任何函式）
--   trip_products、order_attributions：is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id)
--   owlting_fillup_tokens、line_sessions、referral_records（管理 policy）：只限 is_super_admin(auth.uid())
--   kol_referrals：is_admin_or_super() 換成 (is_super_admin OR user_has_team_role(admin))，is_sales_role 保留
--   line_binding_tokens：super_admin、全域 admin；am／am_manager 只能處理自己的成員資料（TeamLineOA 成員頁）
--   公開讀取、會員本人、本館成員讀取等其他 policy 不動
--   範圍：11 條 policy，7 張表：kol_referrals, line_binding_tokens, line_sessions, order_attributions, owlting_fillup_tokens, referral_records, trip_products
-- ============================================================

BEGIN;
-- PRECHECK：每條 policy 的條件必須和預期文字完全一致（比對前去掉 \r）
DO $$
DECLARE r record; v_n int;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('kol_referrals', $q$Admins can delete kol referrals$q$, $q$is_admin_or_super()$q$, NULL),
    ('kol_referrals', $q$Admins can update kol referrals$q$, $q$is_admin_or_super()$q$, $q$is_admin_or_super()$q$),
    ('kol_referrals', $q$Internal staff can insert kol referrals$q$, NULL, $q$(is_admin_or_super() OR is_sales_role(auth.uid()))$q$),
    ('kol_referrals', $q$Internal staff can view kol referrals$q$, $q$(is_admin_or_super() OR is_sales_role(auth.uid()))$q$, NULL),
    ('line_binding_tokens', $q$admins manage line_binding_tokens$q$, $q$is_admin_or_super()$q$, $q$is_admin_or_super()$q$),
    ('line_sessions', $q$Admins can view line sessions$q$, $q$is_admin_or_super()$q$, NULL),
    ('order_attributions', $q$order_attributions_select_admin$q$, $q$is_admin_or_super()$q$, NULL),
    ('order_attributions', $q$order_attributions_update_admin$q$, $q$is_admin_or_super()$q$, $q$is_admin_or_super()$q$),
    ('owlting_fillup_tokens', $q$Admins manage fillup tokens$q$, $q$is_admin_or_super()$q$, $q$is_admin_or_super()$q$),
    ('referral_records', $q$Admins manage referral records$q$, $q$is_admin_or_super()$q$, $q$is_admin_or_super()$q$),
    ('trip_products', $q$Admins and owners can manage trip products$q$, $q$(is_admin_or_super() OR is_super_admin(auth.uid()))$q$, $q$(is_admin_or_super() OR is_super_admin(auth.uid()))$q$)
  ) AS x(t, p, q, w) LOOP
    SELECT count(*) INTO v_n FROM pg_policies
    WHERE schemaname = 'public' AND tablename = r.t AND policyname = r.p
      AND replace(qual, E'\r', '') IS NOT DISTINCT FROM replace(r.q, E'\r', '') AND replace(with_check, E'\r', '') IS NOT DISTINCT FROM replace(r.w, E'\r', '');
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'PRECHECK 失敗：%.% 的條件和預期不一致（或 policy 不存在），全部不修改', r.t, r.p;
    END IF;
  END LOOP;
END $$;
CREATE TEMP TABLE _m1_targets ON COMMIT DROP AS SELECT * FROM (VALUES
  ('kol_referrals', $q$Admins can delete kol referrals$q$),
  ('kol_referrals', $q$Admins can update kol referrals$q$),
  ('kol_referrals', $q$Internal staff can insert kol referrals$q$),
  ('kol_referrals', $q$Internal staff can view kol referrals$q$),
  ('line_binding_tokens', $q$admins manage line_binding_tokens$q$),
  ('line_sessions', $q$Admins can view line sessions$q$),
  ('order_attributions', $q$order_attributions_select_admin$q$),
  ('order_attributions', $q$order_attributions_update_admin$q$),
  ('owlting_fillup_tokens', $q$Admins manage fillup tokens$q$),
  ('referral_records', $q$Admins manage referral records$q$),
  ('trip_products', $q$Admins and owners can manage trip products$q$)
) AS x(t, p);
CREATE TEMP TABLE _m1_other_policies ON COMMIT DROP AS
SELECT tablename, policyname, md5(cmd || '|' || array_to_string(roles, ',') || '|' || permissive || '|' || coalesce(qual, '<null>') || '|' || coalesce(with_check, '<null>')) AS h
FROM pg_policies
WHERE schemaname = 'public' AND (tablename, policyname) NOT IN (SELECT t, p FROM _m1_targets);

ALTER POLICY "Admins can delete kol referrals" ON public.kol_referrals
  USING ((is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role)));
ALTER POLICY "Admins can update kol referrals" ON public.kol_referrals
  USING ((is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK ((is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role)));
ALTER POLICY "Internal staff can insert kol referrals" ON public.kol_referrals
  WITH CHECK ((is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role) OR is_sales_role(auth.uid())));
ALTER POLICY "Internal staff can view kol referrals" ON public.kol_referrals
  USING ((is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role) OR is_sales_role(auth.uid())));
ALTER POLICY "admins manage line_binding_tokens" ON public.line_binding_tokens
  USING ((is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role) OR ((user_has_team_role(auth.uid(), 'am'::app_role) OR user_has_team_role(auth.uid(), 'am_manager'::app_role)) AND (EXISTS ( SELECT 1
   FROM team_member_profiles tmp
  WHERE ((tmp.id = line_binding_tokens.team_member_id) AND (tmp.user_id = auth.uid())))))))
  WITH CHECK ((is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role) OR ((user_has_team_role(auth.uid(), 'am'::app_role) OR user_has_team_role(auth.uid(), 'am_manager'::app_role)) AND (EXISTS ( SELECT 1
   FROM team_member_profiles tmp
  WHERE ((tmp.id = line_binding_tokens.team_member_id) AND (tmp.user_id = auth.uid())))))));
ALTER POLICY "Admins can view line sessions" ON public.line_sessions
  USING (is_super_admin(auth.uid()));
ALTER POLICY "order_attributions_select_admin" ON public.order_attributions
  USING ((is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id)));
ALTER POLICY "order_attributions_update_admin" ON public.order_attributions
  USING ((is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id)))
  WITH CHECK ((is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id)));
ALTER POLICY "Admins manage fillup tokens" ON public.owlting_fillup_tokens
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "Admins manage referral records" ON public.referral_records
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
ALTER POLICY "Admins and owners can manage trip products" ON public.trip_products
  USING ((is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id)))
  WITH CHECK ((is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id)));

-- POSTCHECK：修改後條件完全符合預期、不含 is_admin_or_super()；其他 policy 的 md5 完全未變
DO $$
DECLARE r record; v_n int;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('kol_referrals', $q$Admins can delete kol referrals$q$, $q$(is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role))$q$, NULL),
    ('kol_referrals', $q$Admins can update kol referrals$q$, $q$(is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role))$q$, $q$(is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role))$q$),
    ('kol_referrals', $q$Internal staff can insert kol referrals$q$, NULL, $q$(is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role) OR is_sales_role(auth.uid()))$q$),
    ('kol_referrals', $q$Internal staff can view kol referrals$q$, $q$(is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role) OR is_sales_role(auth.uid()))$q$, NULL),
    ('line_binding_tokens', $q$admins manage line_binding_tokens$q$, $q$(is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role) OR ((user_has_team_role(auth.uid(), 'am'::app_role) OR user_has_team_role(auth.uid(), 'am_manager'::app_role)) AND (EXISTS ( SELECT 1
   FROM team_member_profiles tmp
  WHERE ((tmp.id = line_binding_tokens.team_member_id) AND (tmp.user_id = auth.uid()))))))$q$, $q$(is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role) OR ((user_has_team_role(auth.uid(), 'am'::app_role) OR user_has_team_role(auth.uid(), 'am_manager'::app_role)) AND (EXISTS ( SELECT 1
   FROM team_member_profiles tmp
  WHERE ((tmp.id = line_binding_tokens.team_member_id) AND (tmp.user_id = auth.uid()))))))$q$),
    ('line_sessions', $q$Admins can view line sessions$q$, $q$is_super_admin(auth.uid())$q$, NULL),
    ('order_attributions', $q$order_attributions_select_admin$q$, $q$(is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id))$q$, NULL),
    ('order_attributions', $q$order_attributions_update_admin$q$, $q$(is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id))$q$, $q$(is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id))$q$),
    ('owlting_fillup_tokens', $q$Admins manage fillup tokens$q$, $q$is_super_admin(auth.uid())$q$, $q$is_super_admin(auth.uid())$q$),
    ('referral_records', $q$Admins manage referral records$q$, $q$is_super_admin(auth.uid())$q$, $q$is_super_admin(auth.uid())$q$),
    ('trip_products', $q$Admins and owners can manage trip products$q$, $q$(is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id))$q$, $q$(is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id))$q$)
  ) AS x(t, p, q, w) LOOP
    SELECT count(*) INTO v_n FROM pg_policies
    WHERE schemaname = 'public' AND tablename = r.t AND policyname = r.p
      AND replace(qual, E'\r', '') IS NOT DISTINCT FROM replace(r.q, E'\r', '') AND replace(with_check, E'\r', '') IS NOT DISTINCT FROM replace(r.w, E'\r', '');
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
