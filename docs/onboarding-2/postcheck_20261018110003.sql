-- postcheck（唯讀）：2a M1。每列都要 matches = true；第 2 段要 0 列
SELECT x.t, x.p, (p.policyname IS NOT NULL) AS matches FROM (VALUES
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
) AS x(t, p, q, w)
LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = x.t AND p.policyname = x.p
  AND p.qual IS NOT DISTINCT FROM x.q AND p.with_check IS NOT DISTINCT FROM x.w
ORDER BY 3, 1, 2;
SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('group_buy_campaign_notification_settings', 'group_buy_campaign_packages', 'group_buy_campaigns', 'group_buy_venue_intros', 'order_manual_review_tasks', 'owlting_email_property_alias', 'owlting_email_room_alias', 'owlting_room_type_rate_plans', 'referral_campaigns')
  AND (coalesce(qual, '') || coalesce(with_check, '')) ~ '(is_admin_or_super\(\)|role = ANY \(ARRAY\[''super_admin'')';
