-- rollback：2a-2，還原成原本的條件（會恢復跨館漏洞，只在緊急時使用）
BEGIN;
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
      RAISE EXCEPTION 'ROLLBACK PRECHECK 失敗：%.% 的條件和預期不一致（或 policy 不存在），全部不修改', r.t, r.p;
    END IF;
  END LOOP;
END $$;

ALTER POLICY "Admins can delete kol referrals" ON public.kol_referrals
  USING (is_admin_or_super());
ALTER POLICY "Admins can update kol referrals" ON public.kol_referrals
  USING (is_admin_or_super())
  WITH CHECK (is_admin_or_super());
ALTER POLICY "Internal staff can insert kol referrals" ON public.kol_referrals
  WITH CHECK ((is_admin_or_super() OR is_sales_role(auth.uid())));
ALTER POLICY "Internal staff can view kol referrals" ON public.kol_referrals
  USING ((is_admin_or_super() OR is_sales_role(auth.uid())));
ALTER POLICY "admins manage line_binding_tokens" ON public.line_binding_tokens
  USING (is_admin_or_super())
  WITH CHECK (is_admin_or_super());
ALTER POLICY "Admins can view line sessions" ON public.line_sessions
  USING (is_admin_or_super());
ALTER POLICY "order_attributions_select_admin" ON public.order_attributions
  USING (is_admin_or_super());
ALTER POLICY "order_attributions_update_admin" ON public.order_attributions
  USING (is_admin_or_super())
  WITH CHECK (is_admin_or_super());
ALTER POLICY "Admins manage fillup tokens" ON public.owlting_fillup_tokens
  USING (is_admin_or_super())
  WITH CHECK (is_admin_or_super());
ALTER POLICY "Admins manage referral records" ON public.referral_records
  USING (is_admin_or_super())
  WITH CHECK (is_admin_or_super());
ALTER POLICY "Admins and owners can manage trip products" ON public.trip_products
  USING ((is_admin_or_super() OR is_super_admin(auth.uid())))
  WITH CHECK ((is_admin_or_super() OR is_super_admin(auth.uid())));

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
      RAISE EXCEPTION 'ROLLBACK 驗證失敗：%.% 的條件和預期不一致（或 policy 不存在），全部不修改', r.t, r.p;
    END IF;
  END LOOP;
END $$;
COMMIT;
