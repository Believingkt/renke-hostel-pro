-- Team-RLS P0: remove role-only unrestricted SELECT exposure on team sales tables.
-- SELECT policies only. No write policies, no helpers, no data.

-- 1) franchise_orders: drop broad role-only SELECT.
-- Own-row access remains via existing policy "franchise_orders_select"
-- (sold_by = auth.uid() OR super_admin OR admin).
DROP POLICY IF EXISTS "franchise_internal can view internal sales" ON public.franchise_orders;

-- 2) starlink_orders: recreate SELECT without the global 'starlink' role branch.
DROP POLICY IF EXISTS "starlink_orders_select" ON public.starlink_orders;

CREATE POLICY "starlink_orders_select"
ON public.starlink_orders
FOR SELECT
TO authenticated
USING (
  (sold_by = auth.uid())
  OR user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
);