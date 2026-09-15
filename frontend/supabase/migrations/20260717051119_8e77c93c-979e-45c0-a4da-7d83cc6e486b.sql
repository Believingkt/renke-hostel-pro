
DROP POLICY IF EXISTS "Read owlting_room_type_sync" ON public.owlting_room_type_sync;
CREATE POLICY "Staff read owlting_room_type_sync"
  ON public.owlting_room_type_sync
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
  );

DROP POLICY IF EXISTS "Authenticated can view system settings" ON public.system_settings;
CREATE POLICY "Staff can view system settings"
  ON public.system_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
    )
  );
