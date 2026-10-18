-- rollback：2a 第三部分，還原原條件
BEGIN;
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
      RAISE EXCEPTION 'ROLLBACK PRECHECK 失敗：%.% 的條件和預期不一致（或 policy 不存在），全部不修改', r.t, r.p;
    END IF;
  END LOOP;
END $$;

ALTER POLICY "partnership_periods_select_scoped" ON public.accommodation_partnership_periods
  USING ((is_admin_or_super() OR (EXISTS ( SELECT 1
   FROM user_roles ur2
  WHERE ((ur2.user_id = auth.uid()) AND (ur2.role = ANY (ARRAY['finance'::app_role, 'am'::app_role, 'am_manager'::app_role]))))) OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.accommodation_id = accommodation_partnership_periods.accommodation_id) AND (ur.role = ANY (ARRAY['hotel_admin'::app_role, 'owner'::app_role])))))));
ALTER POLICY "partnership_periods_write_admin" ON public.accommodation_partnership_periods
  USING (is_admin_or_super())
  WITH CHECK (is_admin_or_super());
ALTER POLICY "Admins manage remarketing campaigns" ON public.remarketing_campaigns
  USING ((is_admin_or_super() OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['owner'::app_role, 'hotel_admin'::app_role, 'super_admin'::app_role, 'admin'::app_role])))))))
  WITH CHECK ((is_admin_or_super() OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['owner'::app_role, 'hotel_admin'::app_role, 'super_admin'::app_role, 'admin'::app_role])))))));
ALTER POLICY "Admins manage remarketing sends" ON public.remarketing_sends
  USING ((is_admin_or_super() OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['owner'::app_role, 'hotel_admin'::app_role, 'super_admin'::app_role, 'admin'::app_role])))))))
  WITH CHECK ((is_admin_or_super() OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['owner'::app_role, 'hotel_admin'::app_role, 'super_admin'::app_role, 'admin'::app_role])))))));
ALTER POLICY "Admins can delete traveler profiles" ON public.traveler_profiles
  USING (is_admin_or_super());
ALTER POLICY "Admins can insert traveler profiles" ON public.traveler_profiles
  WITH CHECK (is_admin_or_super());
ALTER POLICY "Admins can update traveler profiles" ON public.traveler_profiles
  USING (is_admin_or_super())
  WITH CHECK (is_admin_or_super());
ALTER POLICY "Admins can view traveler profiles" ON public.traveler_profiles
  USING ((is_admin_or_super() OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['owner'::app_role, 'hotel_admin'::app_role, 'super_admin'::app_role, 'admin'::app_role])))))));

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
      RAISE EXCEPTION 'ROLLBACK 驗證失敗：%.% 的條件和預期不一致（或 policy 不存在），全部不修改', r.t, r.p;
    END IF;
  END LOOP;
END $$;
COMMIT;
