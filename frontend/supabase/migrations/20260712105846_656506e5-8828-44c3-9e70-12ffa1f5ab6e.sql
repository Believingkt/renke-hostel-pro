
DROP POLICY IF EXISTS "Public can insert order rooms for recent bookings" ON public.order_rooms;
DROP POLICY IF EXISTS "Public can view recent order rooms" ON public.order_rooms;

DROP POLICY IF EXISTS consulting_fee_settings_insert ON public.consulting_fee_settings;
CREATE POLICY consulting_fee_settings_insert
  ON public.consulting_fee_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'super_admin'::app_role
    )
    OR (
      accommodation_id IS NOT NULL
      AND public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    )
  );
