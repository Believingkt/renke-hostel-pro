DROP POLICY IF EXISTS "manager can manage kol_venues" ON public.kol_venues;
CREATE POLICY "manager can manage kol_venues"
ON public.kol_venues
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role, 'hotel_admin'::app_role, 'scout_manager'::app_role])))
WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role, 'hotel_admin'::app_role, 'scout_manager'::app_role])));