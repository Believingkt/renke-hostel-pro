CREATE OR REPLACE FUNCTION public.enforce_am_managed_accommodations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.am_managed_accommodation_ids IS NOT DISTINCT FROM OLD.am_managed_accommodation_ids THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.am_managed_accommodation_ids IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT (public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
       OR public.user_has_team_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION '只有管理員可以設定 AM 管理場域';
  END IF;

  RETURN NEW;
END;
$$;