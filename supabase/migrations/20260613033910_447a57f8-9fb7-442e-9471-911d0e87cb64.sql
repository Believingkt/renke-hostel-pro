CREATE POLICY "franchise_manager can manage external orders"
ON public.franchise_external_orders
FOR ALL
TO authenticated
USING (public.user_has_team_role(auth.uid(), 'franchise_manager'::app_role))
WITH CHECK (public.user_has_team_role(auth.uid(), 'franchise_manager'::app_role));