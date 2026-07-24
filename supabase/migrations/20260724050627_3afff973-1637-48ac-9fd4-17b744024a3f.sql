CREATE POLICY "Members can view their own orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  member_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.platform_members pm
    WHERE pm.id = orders.member_id AND pm.user_id = auth.uid()
  )
);