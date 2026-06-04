CREATE POLICY "franchise_external can view external orders"
ON public.franchise_external_orders
FOR SELECT
USING (user_has_team_role(auth.uid(), 'franchise_external'::app_role));

CREATE POLICY "finance can view external orders"
ON public.franchise_external_orders
FOR SELECT
USING (user_has_team_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "admin can view external orders"
ON public.franchise_external_orders
FOR SELECT
USING (
  user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
);