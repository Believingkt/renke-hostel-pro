
CREATE POLICY "franchise_orders_update"
ON public.franchise_orders
FOR UPDATE
USING (
  user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
  OR (user_has_team_role(auth.uid(), 'franchise'::app_role) AND sold_by = auth.uid())
)
WITH CHECK (
  user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
  OR (user_has_team_role(auth.uid(), 'franchise'::app_role) AND sold_by = auth.uid())
);

CREATE POLICY "franchise_orders_delete"
ON public.franchise_orders
FOR DELETE
USING (
  user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
);
