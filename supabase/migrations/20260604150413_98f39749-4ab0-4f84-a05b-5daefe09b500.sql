-- 1. Data migration: rename existing 'franchise' to 'franchise_internal'
UPDATE public.user_roles SET role = 'franchise_internal'::app_role WHERE role = 'franchise'::app_role;

-- 2. Update RLS policies: replace 'franchise' with 'franchise_internal' + add 'franchise_external'

-- order_meta_insert
DROP POLICY IF EXISTS "order_meta_insert" ON public.order_meta;
CREATE POLICY "order_meta_insert" ON public.order_meta
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'closer'::app_role)
    OR public.user_has_team_role(auth.uid(), 'scout'::app_role)
    OR public.user_has_team_role(auth.uid(), 'video'::app_role)
    OR public.user_has_team_role(auth.uid(), 'franchise_internal'::app_role)
    OR public.user_has_team_role(auth.uid(), 'franchise_external'::app_role)
  );

-- franchise_orders_insert
DROP POLICY IF EXISTS "franchise_orders_insert" ON public.franchise_orders;
CREATE POLICY "franchise_orders_insert" ON public.franchise_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'franchise_internal'::app_role)
    OR public.user_has_team_role(auth.uid(), 'franchise_external'::app_role)
  );

-- franchise_orders_update
DROP POLICY IF EXISTS "franchise_orders_update" ON public.franchise_orders;
CREATE POLICY "franchise_orders_update" ON public.franchise_orders
  FOR UPDATE TO authenticated
  USING (
    public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
    OR (public.user_has_team_role(auth.uid(), 'franchise_internal'::app_role) AND sold_by = auth.uid())
    OR (public.user_has_team_role(auth.uid(), 'franchise_external'::app_role) AND sold_by = auth.uid())
  )
  WITH CHECK (
    public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
    OR (public.user_has_team_role(auth.uid(), 'franchise_internal'::app_role) AND sold_by = auth.uid())
    OR (public.user_has_team_role(auth.uid(), 'franchise_external'::app_role) AND sold_by = auth.uid())
  );

-- franchise_projects "franchise role can read"
DROP POLICY IF EXISTS "franchise role can read" ON public.franchise_projects;
CREATE POLICY "franchise role can read" ON public.franchise_projects
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY[
          'admin'::app_role,
          'super_admin'::app_role,
          'franchise_manager'::app_role,
          'franchise_internal'::app_role,
          'franchise_external'::app_role
        ])
    )
  );

-- franchise_team_settings franchise_team_update
DROP POLICY IF EXISTS "franchise_team_update" ON public.franchise_team_settings;
CREATE POLICY "franchise_team_update" ON public.franchise_team_settings
  FOR UPDATE TO authenticated
  USING (
    public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
    OR (
      public.user_has_team_role(auth.uid(), 'franchise_internal'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.team_member_profiles p
        WHERE p.id = franchise_team_settings.member_id AND p.user_id = auth.uid()
      )
    )
    OR (
      public.user_has_team_role(auth.uid(), 'franchise_external'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.team_member_profiles p
        WHERE p.id = franchise_team_settings.member_id AND p.user_id = auth.uid()
      )
    )
  );

-- 3. franchise_orders new SELECT policies for role-scoped visibility
DROP POLICY IF EXISTS "franchise_internal can view internal sales" ON public.franchise_orders;
CREATE POLICY "franchise_internal can view internal sales" ON public.franchise_orders
  FOR SELECT TO authenticated
  USING (
    public.user_has_team_role(auth.uid(), 'franchise_internal'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = franchise_orders.sold_by
        AND ur.role = 'franchise_internal'::app_role
    )
  );

DROP POLICY IF EXISTS "franchise_external can view external sales" ON public.franchise_orders;
CREATE POLICY "franchise_external can view external sales" ON public.franchise_orders
  FOR SELECT TO authenticated
  USING (
    public.user_has_team_role(auth.uid(), 'franchise_external'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = franchise_orders.sold_by
        AND ur.role = 'franchise_external'::app_role
    )
  );