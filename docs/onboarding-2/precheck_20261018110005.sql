-- precheck（唯讀；比對前先去掉 \r，Windows 貼上也適用）：2a-2。第 1 段每列都要 matches = true；第 2 段應剛好是報告列出的 5 條「不動」policy
SELECT x.t, x.p, (p.policyname IS NOT NULL) AS matches FROM (VALUES
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
) AS x(t, p, q, w)
LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = x.t AND p.policyname = x.p
  AND replace(p.qual, E'\r', '') IS NOT DISTINCT FROM replace(x.q, E'\r', '') AND replace(p.with_check, E'\r', '') IS NOT DISTINCT FROM replace(x.w, E'\r', '')
ORDER BY 3, 1, 2;
SELECT tablename, policyname, cmd, array_to_string(roles, ',') AS roles, replace(coalesce(qual, '<null>'), E'\r', '') AS qual, replace(coalesce(with_check, '<null>'), E'\r', '') AS with_check
FROM pg_policies WHERE schemaname = 'public'
  AND tablename IN ('kol_referrals', 'line_binding_tokens', 'line_sessions', 'order_attributions', 'owlting_fillup_tokens', 'referral_records', 'trip_products')
  AND (tablename, policyname) NOT IN (VALUES ('kol_referrals', 'Admins can delete kol referrals'), ('kol_referrals', 'Admins can update kol referrals'),
    ('kol_referrals', 'Internal staff can insert kol referrals'), ('kol_referrals', 'Internal staff can view kol referrals'),
    ('line_binding_tokens', 'admins manage line_binding_tokens'), ('line_sessions', 'Admins can view line sessions'),
    ('order_attributions', 'order_attributions_select_admin'), ('order_attributions', 'order_attributions_update_admin'),
    ('owlting_fillup_tokens', 'Admins manage fillup tokens'), ('referral_records', 'Admins manage referral records'),
    ('trip_products', 'Admins and owners can manage trip products'))
ORDER BY 1, 2;
