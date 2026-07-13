DROP POLICY IF EXISTS order_meta_update ON public.order_meta;
CREATE POLICY order_meta_update ON public.order_meta
FOR UPDATE
USING (
  filled_by = auth.uid()
  OR user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
  OR user_has_team_role(auth.uid(), 'closer'::app_role)
);