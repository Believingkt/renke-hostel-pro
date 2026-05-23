
CREATE POLICY starlink_orders_update ON public.starlink_orders
FOR UPDATE
USING (
  sold_by = auth.uid()
  OR user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  sold_by = auth.uid()
  OR user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY starlink_orders_delete ON public.starlink_orders
FOR DELETE
USING (
  user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
);
