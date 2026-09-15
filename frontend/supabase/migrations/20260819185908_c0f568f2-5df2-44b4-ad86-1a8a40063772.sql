ALTER TABLE public.order_meta
  ADD COLUMN IF NOT EXISTS force_commission_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS force_commission_reason text,
  ADD COLUMN IF NOT EXISTS force_commission_by uuid,
  ADD COLUMN IF NOT EXISTS force_commission_at timestamptz;

COMMENT ON COLUMN public.order_meta.force_commission_eligible IS '例外：即使訂單來源屬於免抽成清單，仍計入成交組獎金（KOL 自費等情況）';

CREATE OR REPLACE FUNCTION public.enforce_order_meta_commission_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_privileged boolean;
  can_force boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service_role / backend jobs
  END IF;

  is_privileged :=
    public.user_has_team_role(auth.uid(),'super_admin'::app_role)
    OR public.user_has_team_role(auth.uid(),'admin'::app_role)
    OR public.user_has_team_role(auth.uid(),'finance'::app_role);

  -- 例外旗標：另外開放成交組主管
  can_force := is_privileged
    OR public.user_has_team_role(auth.uid(),'closer_manager'::app_role);

  IF NOT can_force THEN
    IF TG_OP = 'INSERT' THEN
      NEW.force_commission_eligible := false;
      NEW.force_commission_reason := NULL;
      NEW.force_commission_by := NULL;
      NEW.force_commission_at := NULL;
    ELSE
      NEW.force_commission_eligible := OLD.force_commission_eligible;
      NEW.force_commission_reason := OLD.force_commission_reason;
      NEW.force_commission_by := OLD.force_commission_by;
      NEW.force_commission_at := OLD.force_commission_at;
    END IF;
  END IF;

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
$function$;