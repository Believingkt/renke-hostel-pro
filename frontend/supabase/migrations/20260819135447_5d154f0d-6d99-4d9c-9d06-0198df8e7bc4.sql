
DROP POLICY IF EXISTS "kol_profiles_select" ON public.kol_profiles;
CREATE POLICY "kol_profiles_select" ON public.kol_profiles
FOR SELECT TO authenticated
USING (
  public.is_admin_or_super()
  OR public.user_has_team_role(auth.uid(), 'scout'::app_role)
  OR public.user_has_team_role(auth.uid(), 'scout_manager'::app_role)
  OR public.user_has_team_role(auth.uid(), 'hotel_admin'::app_role)
  OR (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'venue_manager'::app_role
    )
    AND venue_name IN (
      SELECT unnest(tmp.managed_venue) FROM public.team_member_profiles tmp WHERE tmp.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Orders visible to staff finance scout and owning member" ON public.orders;
CREATE POLICY "Orders visible to staff finance scout and owning member" ON public.orders
FOR SELECT TO authenticated
USING (
  (accommodation_id IN (SELECT public.current_user_accommodation_ids()))
  OR (SELECT public.user_has_team_role(auth.uid(), 'finance'::app_role))
  OR (
    member_id IS NOT NULL
    AND member_id IN (SELECT pm.id FROM public.platform_members pm WHERE pm.user_id = auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.order_meta om
    WHERE om.order_id = orders.id
      AND (om.scout_id = auth.uid() OR om.closer_id = auth.uid())
  )
);
