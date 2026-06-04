DROP POLICY IF EXISTS "franchise_internal can view internal sales" ON public.franchise_orders;

CREATE POLICY "franchise_internal can view internal sales"
ON public.franchise_orders
FOR SELECT
USING (user_has_team_role(auth.uid(), 'franchise_internal'::app_role));