
DROP POLICY IF EXISTS "commission_settings_write" ON public.accommodation_commission_settings;
CREATE POLICY "commission_settings_write" ON public.accommodation_commission_settings
FOR ALL TO authenticated
USING (
  public.user_has_team_role(auth.uid(),'super_admin'::app_role)
  OR public.user_has_team_role(auth.uid(),'admin'::app_role)
  OR public.user_has_team_role(auth.uid(),'hotel_admin'::app_role)
)
WITH CHECK (
  public.user_has_team_role(auth.uid(),'super_admin'::app_role)
  OR public.user_has_team_role(auth.uid(),'admin'::app_role)
  OR public.user_has_team_role(auth.uid(),'hotel_admin'::app_role)
);

DROP POLICY IF EXISTS "order_meta_insert" ON public.order_meta;
CREATE POLICY "order_meta_insert" ON public.order_meta
FOR INSERT TO authenticated
WITH CHECK (
  public.user_has_team_role(auth.uid(),'super_admin'::app_role)
  OR public.user_has_team_role(auth.uid(),'admin'::app_role)
  OR public.user_has_team_role(auth.uid(),'finance'::app_role)
  OR (
    (
      public.user_has_team_role(auth.uid(),'closer'::app_role)
      OR public.user_has_team_role(auth.uid(),'closer_manager'::app_role)
      OR public.user_has_team_role(auth.uid(),'scout'::app_role)
      OR public.user_has_team_role(auth.uid(),'scout_manager'::app_role)
      OR public.user_has_team_role(auth.uid(),'franchise_internal'::app_role)
      OR public.user_has_team_role(auth.uid(),'franchise_external'::app_role)
    )
    AND (
      accommodation_id IS NULL
      OR public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
      OR public.user_has_team_role(auth.uid(),'closer'::app_role)
      OR public.user_has_team_role(auth.uid(),'closer_manager'::app_role)
      OR public.user_has_team_role(auth.uid(),'scout'::app_role)
      OR public.user_has_team_role(auth.uid(),'scout_manager'::app_role)
    )
  )
);

CREATE OR REPLACE FUNCTION public.enforce_order_meta_commission_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service_role / backend jobs
  END IF;

  is_privileged :=
    public.user_has_team_role(auth.uid(),'super_admin'::app_role)
    OR public.user_has_team_role(auth.uid(),'admin'::app_role)
    OR public.user_has_team_role(auth.uid(),'finance'::app_role);

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.scout_commission_rate := NULL;
    NEW.closer_commission_rate := NULL;
    NEW.team_commission_price := NULL;
    NEW.team_commission_price_is_manual := false;
  ELSE
    NEW.scout_commission_rate := OLD.scout_commission_rate;
    NEW.closer_commission_rate := OLD.closer_commission_rate;
    NEW.team_commission_price := OLD.team_commission_price;
    NEW.team_commission_price_is_manual := OLD.team_commission_price_is_manual;
    NEW.commission_price_confirmed_by := OLD.commission_price_confirmed_by;
    NEW.commission_price_confirmed_at := OLD.commission_price_confirmed_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_meta_commission_fields ON public.order_meta;
CREATE TRIGGER trg_enforce_order_meta_commission_fields
BEFORE INSERT OR UPDATE ON public.order_meta
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_meta_commission_fields();
