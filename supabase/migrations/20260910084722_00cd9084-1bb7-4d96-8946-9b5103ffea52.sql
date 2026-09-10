ALTER POLICY "franchise_external can view external orders"
ON public.franchise_external_orders
USING (
  user_has_team_role(auth.uid(), 'franchise_external'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.team_member_profiles p
    WHERE p.user_id = auth.uid()
      AND p.id IN (
        franchise_external_orders.sales_member_id,
        franchise_external_orders.co_sales_member_id,
        franchise_external_orders.co_sales_member_id2
      )
  )
);

ALTER POLICY "franchise_external can view external sales"
ON public.franchise_orders
USING (
  user_has_team_role(auth.uid(), 'franchise_external'::app_role)
  AND franchise_orders.sold_by = auth.uid()
);