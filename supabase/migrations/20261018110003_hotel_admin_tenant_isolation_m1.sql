-- ============================================================
-- 2a M1：PMS 營運表跨館修正（hotel_admin 只能存取自己館）
--   is_admin_or_super() 不看館別，任何館的 hotel_admin 都能讀寫所有館。
--   只把條件中的 is_admin_or_super() 換成 is_super_admin(auth.uid())，其餘條件、policy 名稱、cmd、roles 不變；
--   owlting_email_property_alias／owlting_email_room_alias 的「任一列 super_admin/hotel_admin」改為
--   is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id)。不修改 is_admin_or_super() 函式。
--   範圍：18 條 policy，9 張表：group_buy_campaign_notification_settings, group_buy_campaign_packages, group_buy_campaigns, group_buy_venue_intros, order_manual_review_tasks, owlting_email_property_alias, owlting_email_room_alias, owlting_room_type_rate_plans, referral_campaigns
-- ============================================================

BEGIN;
-- PRECHECK：每條 policy 的條件必須和預期文字完全一致
DO $$
DECLARE r record; v_n int;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('group_buy_campaign_notification_settings', $q$Managers can delete campaign notification settings$q$, $q$(is_admin_or_super() OR (EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_notification_settings.campaign_id) AND is_hotel_admin_of(c.accommodation_id)))))$q$, NULL),
    ('group_buy_campaign_notification_settings', $q$Managers can insert campaign notification settings$q$, NULL, $q$(is_admin_or_super() OR (EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_notification_settings.campaign_id) AND is_hotel_admin_of(c.accommodation_id)))))$q$),
    ('group_buy_campaign_notification_settings', $q$Managers can update campaign notification settings$q$, $q$(is_admin_or_super() OR (EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_notification_settings.campaign_id) AND is_hotel_admin_of(c.accommodation_id)))))$q$, $q$(is_admin_or_super() OR (EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_notification_settings.campaign_id) AND is_hotel_admin_of(c.accommodation_id)))))$q$),
    ('group_buy_campaign_notification_settings', $q$Managers can view campaign notification settings$q$, $q$(is_admin_or_super() OR (EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_notification_settings.campaign_id) AND is_hotel_admin_of(c.accommodation_id)))))$q$, NULL),
    ('group_buy_campaign_packages', $q$Managers can manage campaign packages$q$, $q$(EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_packages.campaign_id) AND (is_admin_or_super() OR is_hotel_admin_of(c.accommodation_id)))))$q$, $q$(EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_packages.campaign_id) AND (is_admin_or_super() OR is_hotel_admin_of(c.accommodation_id)))))$q$),
    ('group_buy_campaigns', $q$Managers can delete campaigns$q$, $q$(is_admin_or_super() OR is_hotel_admin_of(accommodation_id))$q$, NULL),
    ('group_buy_campaigns', $q$Managers can insert campaigns$q$, NULL, $q$(is_admin_or_super() OR is_hotel_admin_of(accommodation_id))$q$),
    ('group_buy_campaigns', $q$Managers can update campaigns$q$, $q$(is_admin_or_super() OR is_hotel_admin_of(accommodation_id))$q$, $q$(is_admin_or_super() OR is_hotel_admin_of(accommodation_id))$q$),
    ('group_buy_campaigns', $q$Managers can view own campaigns$q$, $q$(is_admin_or_super() OR is_hotel_admin_of(accommodation_id))$q$, NULL),
    ('group_buy_venue_intros', $q$Admins can manage group buy venue intros$q$, $q$(is_admin_or_super() OR is_hotel_admin_of(accommodation_id))$q$, $q$(is_admin_or_super() OR is_hotel_admin_of(accommodation_id))$q$),
    ('order_manual_review_tasks', $q$Admins can delete review tasks$q$, $q$(is_admin_or_super() OR is_hotel_admin_of(accommodation_id))$q$, NULL),
    ('order_manual_review_tasks', $q$Admins can insert review tasks$q$, NULL, $q$(is_admin_or_super() OR is_hotel_admin_of(accommodation_id) OR staff_can_edit_module(accommodation_id, 'orders'::text))$q$),
    ('order_manual_review_tasks', $q$Staff can update review tasks$q$, $q$(is_admin_or_super() OR is_hotel_admin_of(accommodation_id) OR staff_can_edit_module(accommodation_id, 'orders'::text))$q$, $q$(is_admin_or_super() OR is_hotel_admin_of(accommodation_id) OR staff_can_edit_module(accommodation_id, 'orders'::text))$q$),
    ('order_manual_review_tasks', $q$Staff can view review tasks$q$, $q$(is_admin_or_super() OR is_hotel_admin_of(accommodation_id) OR staff_can_view_module(accommodation_id, 'orders'::text))$q$, NULL),
    ('owlting_email_property_alias', $q$owlting_property_alias_admin_all$q$, $q$(EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['super_admin'::app_role, 'hotel_admin'::app_role])))))$q$, NULL),
    ('owlting_email_room_alias', $q$owlting_room_alias_admin_all$q$, $q$(EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['super_admin'::app_role, 'hotel_admin'::app_role])))))$q$, NULL),
    ('owlting_room_type_rate_plans', $q$Admins manage owlting room type rate plans$q$, $q$(is_admin_or_super() OR is_hotel_admin_of(accommodation_id))$q$, $q$(is_admin_or_super() OR is_hotel_admin_of(accommodation_id))$q$),
    ('referral_campaigns', $q$Admins manage campaigns$q$, $q$(is_admin_or_super() OR ((accommodation_id IS NOT NULL) AND is_hotel_admin_of(accommodation_id)))$q$, $q$(is_admin_or_super() OR ((accommodation_id IS NOT NULL) AND is_hotel_admin_of(accommodation_id)))$q$)
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
  ('group_buy_campaign_notification_settings', $q$Managers can delete campaign notification settings$q$),
  ('group_buy_campaign_notification_settings', $q$Managers can insert campaign notification settings$q$),
  ('group_buy_campaign_notification_settings', $q$Managers can update campaign notification settings$q$),
  ('group_buy_campaign_notification_settings', $q$Managers can view campaign notification settings$q$),
  ('group_buy_campaign_packages', $q$Managers can manage campaign packages$q$),
  ('group_buy_campaigns', $q$Managers can delete campaigns$q$),
  ('group_buy_campaigns', $q$Managers can insert campaigns$q$),
  ('group_buy_campaigns', $q$Managers can update campaigns$q$),
  ('group_buy_campaigns', $q$Managers can view own campaigns$q$),
  ('group_buy_venue_intros', $q$Admins can manage group buy venue intros$q$),
  ('order_manual_review_tasks', $q$Admins can delete review tasks$q$),
  ('order_manual_review_tasks', $q$Admins can insert review tasks$q$),
  ('order_manual_review_tasks', $q$Staff can update review tasks$q$),
  ('order_manual_review_tasks', $q$Staff can view review tasks$q$),
  ('owlting_email_property_alias', $q$owlting_property_alias_admin_all$q$),
  ('owlting_email_room_alias', $q$owlting_room_alias_admin_all$q$),
  ('owlting_room_type_rate_plans', $q$Admins manage owlting room type rate plans$q$),
  ('referral_campaigns', $q$Admins manage campaigns$q$)
) AS x(t, p);
CREATE TEMP TABLE _m1_other_policies ON COMMIT DROP AS
SELECT tablename, policyname, md5(cmd || '|' || array_to_string(roles, ',') || '|' || permissive || '|' || coalesce(qual, '<null>') || '|' || coalesce(with_check, '<null>')) AS h
FROM pg_policies
WHERE schemaname = 'public' AND (tablename, policyname) NOT IN (SELECT t, p FROM _m1_targets);

ALTER POLICY "Managers can delete campaign notification settings" ON public.group_buy_campaign_notification_settings
  USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_notification_settings.campaign_id) AND is_hotel_admin_of(c.accommodation_id))))));
ALTER POLICY "Managers can insert campaign notification settings" ON public.group_buy_campaign_notification_settings
  WITH CHECK ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_notification_settings.campaign_id) AND is_hotel_admin_of(c.accommodation_id))))));
ALTER POLICY "Managers can update campaign notification settings" ON public.group_buy_campaign_notification_settings
  USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_notification_settings.campaign_id) AND is_hotel_admin_of(c.accommodation_id))))))
  WITH CHECK ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_notification_settings.campaign_id) AND is_hotel_admin_of(c.accommodation_id))))));
ALTER POLICY "Managers can view campaign notification settings" ON public.group_buy_campaign_notification_settings
  USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_notification_settings.campaign_id) AND is_hotel_admin_of(c.accommodation_id))))));
ALTER POLICY "Managers can manage campaign packages" ON public.group_buy_campaign_packages
  USING ((EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_packages.campaign_id) AND (is_super_admin(auth.uid()) OR is_hotel_admin_of(c.accommodation_id))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_packages.campaign_id) AND (is_super_admin(auth.uid()) OR is_hotel_admin_of(c.accommodation_id))))));
ALTER POLICY "Managers can delete campaigns" ON public.group_buy_campaigns
  USING ((is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id)));
ALTER POLICY "Managers can insert campaigns" ON public.group_buy_campaigns
  WITH CHECK ((is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id)));
ALTER POLICY "Managers can update campaigns" ON public.group_buy_campaigns
  USING ((is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id)))
  WITH CHECK ((is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id)));
ALTER POLICY "Managers can view own campaigns" ON public.group_buy_campaigns
  USING ((is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id)));
ALTER POLICY "Admins can manage group buy venue intros" ON public.group_buy_venue_intros
  USING ((is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id)))
  WITH CHECK ((is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id)));
ALTER POLICY "Admins can delete review tasks" ON public.order_manual_review_tasks
  USING ((is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id)));
ALTER POLICY "Admins can insert review tasks" ON public.order_manual_review_tasks
  WITH CHECK ((is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id) OR staff_can_edit_module(accommodation_id, 'orders'::text)));
ALTER POLICY "Staff can update review tasks" ON public.order_manual_review_tasks
  USING ((is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id) OR staff_can_edit_module(accommodation_id, 'orders'::text)))
  WITH CHECK ((is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id) OR staff_can_edit_module(accommodation_id, 'orders'::text)));
ALTER POLICY "Staff can view review tasks" ON public.order_manual_review_tasks
  USING ((is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id) OR staff_can_view_module(accommodation_id, 'orders'::text)));
ALTER POLICY "owlting_property_alias_admin_all" ON public.owlting_email_property_alias
  USING ((is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id)));
ALTER POLICY "owlting_room_alias_admin_all" ON public.owlting_email_room_alias
  USING ((is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id)));
ALTER POLICY "Admins manage owlting room type rate plans" ON public.owlting_room_type_rate_plans
  USING ((is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id)))
  WITH CHECK ((is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id)));
ALTER POLICY "Admins manage campaigns" ON public.referral_campaigns
  USING ((is_super_admin(auth.uid()) OR ((accommodation_id IS NOT NULL) AND is_hotel_admin_of(accommodation_id))))
  WITH CHECK ((is_super_admin(auth.uid()) OR ((accommodation_id IS NOT NULL) AND is_hotel_admin_of(accommodation_id))));

-- POSTCHECK：修改後條件完全符合預期、不含跨館條件；其他 policy 的 md5 完全未變
DO $$
DECLARE r record; v_n int;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('group_buy_campaign_notification_settings', $q$Managers can delete campaign notification settings$q$, $q$(is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_notification_settings.campaign_id) AND is_hotel_admin_of(c.accommodation_id)))))$q$, NULL),
    ('group_buy_campaign_notification_settings', $q$Managers can insert campaign notification settings$q$, NULL, $q$(is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_notification_settings.campaign_id) AND is_hotel_admin_of(c.accommodation_id)))))$q$),
    ('group_buy_campaign_notification_settings', $q$Managers can update campaign notification settings$q$, $q$(is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_notification_settings.campaign_id) AND is_hotel_admin_of(c.accommodation_id)))))$q$, $q$(is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_notification_settings.campaign_id) AND is_hotel_admin_of(c.accommodation_id)))))$q$),
    ('group_buy_campaign_notification_settings', $q$Managers can view campaign notification settings$q$, $q$(is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_notification_settings.campaign_id) AND is_hotel_admin_of(c.accommodation_id)))))$q$, NULL),
    ('group_buy_campaign_packages', $q$Managers can manage campaign packages$q$, $q$(EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_packages.campaign_id) AND (is_super_admin(auth.uid()) OR is_hotel_admin_of(c.accommodation_id)))))$q$, $q$(EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_packages.campaign_id) AND (is_super_admin(auth.uid()) OR is_hotel_admin_of(c.accommodation_id)))))$q$),
    ('group_buy_campaigns', $q$Managers can delete campaigns$q$, $q$(is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id))$q$, NULL),
    ('group_buy_campaigns', $q$Managers can insert campaigns$q$, NULL, $q$(is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id))$q$),
    ('group_buy_campaigns', $q$Managers can update campaigns$q$, $q$(is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id))$q$, $q$(is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id))$q$),
    ('group_buy_campaigns', $q$Managers can view own campaigns$q$, $q$(is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id))$q$, NULL),
    ('group_buy_venue_intros', $q$Admins can manage group buy venue intros$q$, $q$(is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id))$q$, $q$(is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id))$q$),
    ('order_manual_review_tasks', $q$Admins can delete review tasks$q$, $q$(is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id))$q$, NULL),
    ('order_manual_review_tasks', $q$Admins can insert review tasks$q$, NULL, $q$(is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id) OR staff_can_edit_module(accommodation_id, 'orders'::text))$q$),
    ('order_manual_review_tasks', $q$Staff can update review tasks$q$, $q$(is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id) OR staff_can_edit_module(accommodation_id, 'orders'::text))$q$, $q$(is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id) OR staff_can_edit_module(accommodation_id, 'orders'::text))$q$),
    ('order_manual_review_tasks', $q$Staff can view review tasks$q$, $q$(is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id) OR staff_can_view_module(accommodation_id, 'orders'::text))$q$, NULL),
    ('owlting_email_property_alias', $q$owlting_property_alias_admin_all$q$, $q$(is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id))$q$, NULL),
    ('owlting_email_room_alias', $q$owlting_room_alias_admin_all$q$, $q$(is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id))$q$, NULL),
    ('owlting_room_type_rate_plans', $q$Admins manage owlting room type rate plans$q$, $q$(is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id))$q$, $q$(is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id))$q$),
    ('referral_campaigns', $q$Admins manage campaigns$q$, $q$(is_super_admin(auth.uid()) OR ((accommodation_id IS NOT NULL) AND is_hotel_admin_of(accommodation_id)))$q$, $q$(is_super_admin(auth.uid()) OR ((accommodation_id IS NOT NULL) AND is_hotel_admin_of(accommodation_id)))$q$)
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
             WHERE p.schemaname = 'public'
               AND (coalesce(p.qual, '') || coalesce(p.with_check, '')) ~ '(is_admin_or_super\(\)|role = ANY \(ARRAY\[''super_admin'')') THEN
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
