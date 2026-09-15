DROP POLICY IF EXISTS "Managers can view accommodation notification settings" ON public.accommodation_notification_settings;
CREATE POLICY "Managers can view accommodation notification settings"
ON public.accommodation_notification_settings
FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.is_hotel_admin_of(accommodation_id));

DROP POLICY IF EXISTS "Managers can insert accommodation notification settings" ON public.accommodation_notification_settings;
CREATE POLICY "Managers can insert accommodation notification settings"
ON public.accommodation_notification_settings
FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_hotel_admin_of(accommodation_id));

DROP POLICY IF EXISTS "Managers can update accommodation notification settings" ON public.accommodation_notification_settings;
CREATE POLICY "Managers can update accommodation notification settings"
ON public.accommodation_notification_settings
FOR UPDATE TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.is_hotel_admin_of(accommodation_id))
WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_hotel_admin_of(accommodation_id));

DROP POLICY IF EXISTS "Managers can delete accommodation notification settings" ON public.accommodation_notification_settings;
CREATE POLICY "Managers can delete accommodation notification settings"
ON public.accommodation_notification_settings
FOR DELETE TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.is_hotel_admin_of(accommodation_id));