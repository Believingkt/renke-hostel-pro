CREATE POLICY "franchise_manager can view all franchise orders"
ON public.franchise_orders
FOR SELECT
USING (user_has_team_role(auth.uid(), 'franchise_manager'::app_role));

CREATE POLICY "franchise_manager can view all external orders"
ON public.franchise_external_orders
FOR SELECT
USING (user_has_team_role(auth.uid(), 'franchise_manager'::app_role));