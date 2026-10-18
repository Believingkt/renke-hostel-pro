-- rollback：2a M1，還原成原本的條件（會恢復跨館漏洞，只在緊急時使用）
BEGIN;
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
      RAISE EXCEPTION 'ROLLBACK PRECHECK 失敗：%.% 的條件和預期不一致（或 policy 不存在），全部不修改', r.t, r.p;
    END IF;
  END LOOP;
END $$;

ALTER POLICY "Managers can delete campaign notification settings" ON public.group_buy_campaign_notification_settings
  USING ((is_admin_or_super() OR (EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_notification_settings.campaign_id) AND is_hotel_admin_of(c.accommodation_id))))));
ALTER POLICY "Managers can insert campaign notification settings" ON public.group_buy_campaign_notification_settings
  WITH CHECK ((is_admin_or_super() OR (EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_notification_settings.campaign_id) AND is_hotel_admin_of(c.accommodation_id))))));
ALTER POLICY "Managers can update campaign notification settings" ON public.group_buy_campaign_notification_settings
  USING ((is_admin_or_super() OR (EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_notification_settings.campaign_id) AND is_hotel_admin_of(c.accommodation_id))))))
  WITH CHECK ((is_admin_or_super() OR (EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_notification_settings.campaign_id) AND is_hotel_admin_of(c.accommodation_id))))));
ALTER POLICY "Managers can view campaign notification settings" ON public.group_buy_campaign_notification_settings
  USING ((is_admin_or_super() OR (EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_notification_settings.campaign_id) AND is_hotel_admin_of(c.accommodation_id))))));
ALTER POLICY "Managers can manage campaign packages" ON public.group_buy_campaign_packages
  USING ((EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_packages.campaign_id) AND (is_admin_or_super() OR is_hotel_admin_of(c.accommodation_id))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM group_buy_campaigns c
  WHERE ((c.id = group_buy_campaign_packages.campaign_id) AND (is_admin_or_super() OR is_hotel_admin_of(c.accommodation_id))))));
ALTER POLICY "Managers can delete campaigns" ON public.group_buy_campaigns
  USING ((is_admin_or_super() OR is_hotel_admin_of(accommodation_id)));
ALTER POLICY "Managers can insert campaigns" ON public.group_buy_campaigns
  WITH CHECK ((is_admin_or_super() OR is_hotel_admin_of(accommodation_id)));
ALTER POLICY "Managers can update campaigns" ON public.group_buy_campaigns
  USING ((is_admin_or_super() OR is_hotel_admin_of(accommodation_id)))
  WITH CHECK ((is_admin_or_super() OR is_hotel_admin_of(accommodation_id)));
ALTER POLICY "Managers can view own campaigns" ON public.group_buy_campaigns
  USING ((is_admin_or_super() OR is_hotel_admin_of(accommodation_id)));
ALTER POLICY "Admins can manage group buy venue intros" ON public.group_buy_venue_intros
  USING ((is_admin_or_super() OR is_hotel_admin_of(accommodation_id)))
  WITH CHECK ((is_admin_or_super() OR is_hotel_admin_of(accommodation_id)));
ALTER POLICY "Admins can delete review tasks" ON public.order_manual_review_tasks
  USING ((is_admin_or_super() OR is_hotel_admin_of(accommodation_id)));
ALTER POLICY "Admins can insert review tasks" ON public.order_manual_review_tasks
  WITH CHECK ((is_admin_or_super() OR is_hotel_admin_of(accommodation_id) OR staff_can_edit_module(accommodation_id, 'orders'::text)));
ALTER POLICY "Staff can update review tasks" ON public.order_manual_review_tasks
  USING ((is_admin_or_super() OR is_hotel_admin_of(accommodation_id) OR staff_can_edit_module(accommodation_id, 'orders'::text)))
  WITH CHECK ((is_admin_or_super() OR is_hotel_admin_of(accommodation_id) OR staff_can_edit_module(accommodation_id, 'orders'::text)));
ALTER POLICY "Staff can view review tasks" ON public.order_manual_review_tasks
  USING ((is_admin_or_super() OR is_hotel_admin_of(accommodation_id) OR staff_can_view_module(accommodation_id, 'orders'::text)));
ALTER POLICY "owlting_property_alias_admin_all" ON public.owlting_email_property_alias
  USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['super_admin'::app_role, 'hotel_admin'::app_role]))))));
ALTER POLICY "owlting_room_alias_admin_all" ON public.owlting_email_room_alias
  USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['super_admin'::app_role, 'hotel_admin'::app_role]))))));
ALTER POLICY "Admins manage owlting room type rate plans" ON public.owlting_room_type_rate_plans
  USING ((is_admin_or_super() OR is_hotel_admin_of(accommodation_id)))
  WITH CHECK ((is_admin_or_super() OR is_hotel_admin_of(accommodation_id)));
ALTER POLICY "Admins manage campaigns" ON public.referral_campaigns
  USING ((is_admin_or_super() OR ((accommodation_id IS NOT NULL) AND is_hotel_admin_of(accommodation_id))))
  WITH CHECK ((is_admin_or_super() OR ((accommodation_id IS NOT NULL) AND is_hotel_admin_of(accommodation_id))));

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
      RAISE EXCEPTION 'ROLLBACK 驗證失敗：%.% 的條件和預期不一致（或 policy 不存在），全部不修改', r.t, r.p;
    END IF;
  END LOOP;
END $$;
COMMIT;
