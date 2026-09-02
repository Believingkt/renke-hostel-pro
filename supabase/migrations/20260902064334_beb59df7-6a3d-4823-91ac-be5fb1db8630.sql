ALTER POLICY "Admins can view system settings" ON public.system_settings
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'super_admin'::app_role
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid()
      AND r.role = 'hotel_admin'::app_role
      AND r.accommodation_id IS NOT NULL
      AND public.system_settings.setting_key = 'owner_settlement_config:' || r.accommodation_id::text
  )
);