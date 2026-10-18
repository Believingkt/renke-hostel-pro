-- postcheck（唯讀）：每列 matches = true
SELECT x.t, x.p, (p.policyname IS NOT NULL) AS matches FROM (VALUES
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
) AS x(t, p, q, w)
LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = x.t AND p.policyname = x.p
  AND p.qual IS NOT DISTINCT FROM x.q AND p.with_check IS NOT DISTINCT FROM x.w ORDER BY 3, 1, 2;
