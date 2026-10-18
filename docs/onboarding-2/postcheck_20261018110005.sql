-- postcheck（唯讀；比對前先去掉 \r，Windows 貼上也適用）：2a-2。每列都要 matches = true；第 2 段要 0 列
SELECT x.t, x.p, (p.policyname IS NOT NULL) AS matches FROM (VALUES
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
) AS x(t, p, q, w)
LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = x.t AND p.policyname = x.p
  AND replace(p.qual, E'\r', '') IS NOT DISTINCT FROM replace(x.q, E'\r', '') AND replace(p.with_check, E'\r', '') IS NOT DISTINCT FROM replace(x.w, E'\r', '')
ORDER BY 3, 1, 2;
SELECT tablename, policyname FROM pg_policies p WHERE schemaname = 'public' AND (tablename, policyname) IN (VALUES ('kol_referrals', $q$Admins can delete kol referrals$q$), ('kol_referrals', $q$Admins can update kol referrals$q$), ('kol_referrals', $q$Internal staff can insert kol referrals$q$), ('kol_referrals', $q$Internal staff can view kol referrals$q$), ('line_binding_tokens', $q$admins manage line_binding_tokens$q$), ('line_sessions', $q$Admins can view line sessions$q$), ('order_attributions', $q$order_attributions_select_admin$q$), ('order_attributions', $q$order_attributions_update_admin$q$), ('owlting_fillup_tokens', $q$Admins manage fillup tokens$q$), ('referral_records', $q$Admins manage referral records$q$), ('trip_products', $q$Admins and owners can manage trip products$q$))
  AND (coalesce(qual, '') || coalesce(with_check, '')) ~ 'is_admin_or_super\(\)';
