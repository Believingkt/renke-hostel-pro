DROP POLICY IF EXISTS commission_settings_write ON public.accommodation_commission_settings;

CREATE POLICY commission_settings_write
ON public.accommodation_commission_settings
FOR ALL
TO authenticated
USING (
  user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
  OR user_has_team_role(auth.uid(), 'hotel_admin'::app_role)
)
WITH CHECK (
  user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
  OR user_has_team_role(auth.uid(), 'hotel_admin'::app_role)
);