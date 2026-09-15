CREATE OR REPLACE FUNCTION public.enforce_order_meta_commission_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid;
  is_privileged boolean;
  can_force boolean;
  is_closer_role boolean;
  is_self_owner boolean;
  price_changed boolean;
  rate_changed boolean;
  force_changed boolean;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RETURN NEW; -- service_role / backend jobs
  END IF;

  is_privileged :=
    public.user_has_team_role(uid,'super_admin'::app_role)
    OR public.user_has_team_role(uid,'admin'::app_role)
    OR public.user_has_team_role(uid,'finance'::app_role);

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  can_force := public.user_has_team_role(uid,'closer_manager'::app_role);
  is_closer_role :=
    public.user_has_team_role(uid,'closer'::app_role)
    OR public.user_has_team_role(uid,'closer_manager'::app_role);

  IF TG_OP = 'INSERT' THEN
    is_self_owner := is_closer_role AND NEW.closer_id IS NOT NULL AND NEW.closer_id = uid;

    -- 欄位預設值（scout 0.05 / closer 0）視為「未設定」，不算越權
    rate_changed := COALESCE(NEW.scout_commission_rate, 0.05) IS DISTINCT FROM 0.05
      OR COALESCE(NEW.closer_commission_rate, 0) IS DISTINCT FROM 0;
    price_changed := NEW.team_commission_price IS NOT NULL
      OR COALESCE(NEW.team_commission_price_is_manual, false)
      OR NEW.commission_price_confirmed_by IS NOT NULL
      OR NEW.commission_price_confirmed_at IS NOT NULL;
    force_changed := COALESCE(NEW.force_commission_eligible, false)
      OR NEW.force_commission_reason IS NOT NULL
      OR NEW.force_commission_by IS NOT NULL
      OR NEW.force_commission_at IS NOT NULL;
  ELSE
    is_self_owner := is_closer_role
      AND OLD.closer_id IS NOT NULL AND OLD.closer_id = uid
      AND NEW.closer_id IS NOT NULL AND NEW.closer_id = uid;

    rate_changed := NEW.scout_commission_rate IS DISTINCT FROM OLD.scout_commission_rate
      OR NEW.closer_commission_rate IS DISTINCT FROM OLD.closer_commission_rate;
    price_changed := NEW.team_commission_price IS DISTINCT FROM OLD.team_commission_price
      OR COALESCE(NEW.team_commission_price_is_manual,false) IS DISTINCT FROM COALESCE(OLD.team_commission_price_is_manual,false)
      OR NEW.commission_price_confirmed_by IS DISTINCT FROM OLD.commission_price_confirmed_by
      OR NEW.commission_price_confirmed_at IS DISTINCT FROM OLD.commission_price_confirmed_at;
    force_changed := COALESCE(NEW.force_commission_eligible,false) IS DISTINCT FROM COALESCE(OLD.force_commission_eligible,false)
      OR NEW.force_commission_reason IS DISTINCT FROM OLD.force_commission_reason
      OR NEW.force_commission_by IS DISTINCT FROM OLD.force_commission_by
      OR NEW.force_commission_at IS DISTINCT FROM OLD.force_commission_at;
  END IF;

  IF rate_changed THEN
    RAISE EXCEPTION 'Not authorized to modify commission rate fields'
      USING ERRCODE = '42501';
  END IF;

  IF force_changed AND NOT can_force THEN
    RAISE EXCEPTION 'Not authorized to modify commission force-eligible fields'
      USING ERRCODE = '42501';
  END IF;

  IF price_changed AND NOT is_self_owner THEN
    RAISE EXCEPTION 'Not authorized to modify commission pricing fields'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;