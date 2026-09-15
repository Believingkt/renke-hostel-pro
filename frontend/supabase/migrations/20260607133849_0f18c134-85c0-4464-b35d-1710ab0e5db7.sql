-- 1. starlink_orders: starlink role can view all starlink orders
DROP POLICY IF EXISTS starlink_orders_select ON public.starlink_orders;
CREATE POLICY starlink_orders_select ON public.starlink_orders
  FOR SELECT TO authenticated
  USING (
    sold_by = auth.uid()
    OR user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR user_has_team_role(auth.uid(), 'admin'::app_role)
    OR user_has_team_role(auth.uid(), 'starlink'::app_role)
  );

-- 2. starlink_plan_settings: allow starlink role to insert/update/delete plans
CREATE POLICY starlink_plan_insert_starlink ON public.starlink_plan_settings
  FOR INSERT TO authenticated
  WITH CHECK (user_has_team_role(auth.uid(), 'starlink'::app_role));

CREATE POLICY starlink_plan_update_starlink ON public.starlink_plan_settings
  FOR UPDATE TO authenticated
  USING (user_has_team_role(auth.uid(), 'starlink'::app_role))
  WITH CHECK (user_has_team_role(auth.uid(), 'starlink'::app_role));

CREATE POLICY starlink_plan_delete_starlink ON public.starlink_plan_settings
  FOR DELETE TO authenticated
  USING (user_has_team_role(auth.uid(), 'starlink'::app_role));