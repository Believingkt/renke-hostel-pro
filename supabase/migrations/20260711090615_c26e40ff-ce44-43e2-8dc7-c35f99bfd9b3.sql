DROP POLICY IF EXISTS franchise_orders_update ON public.franchise_orders;

CREATE POLICY franchise_orders_update ON public.franchise_orders
FOR UPDATE
TO authenticated
USING (
  user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
  OR user_has_team_role(auth.uid(), 'franchise_manager'::app_role)
  OR (user_has_team_role(auth.uid(), 'franchise_internal'::app_role) AND sold_by = auth.uid())
  OR (user_has_team_role(auth.uid(), 'franchise_external'::app_role) AND sold_by = auth.uid())
)
WITH CHECK (
  user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
  OR user_has_team_role(auth.uid(), 'franchise_manager'::app_role)
  OR (user_has_team_role(auth.uid(), 'franchise_internal'::app_role) AND sold_by = auth.uid())
  OR (user_has_team_role(auth.uid(), 'franchise_external'::app_role) AND sold_by = auth.uid())
);