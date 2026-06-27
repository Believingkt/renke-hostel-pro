DROP POLICY IF EXISTS commission_settings_write ON public.accommodation_commission_settings;

CREATE POLICY commission_settings_write ON public.accommodation_commission_settings
FOR ALL
USING (
  public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'hotel_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'closer'::app_role)
)
WITH CHECK (
  public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'hotel_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'closer'::app_role)
);