CREATE POLICY "Scout can view orders with discount code"
ON public.orders FOR SELECT TO authenticated
USING (
  user_has_any_team_role(auth.uid())
  AND discount_code IS NOT NULL
);