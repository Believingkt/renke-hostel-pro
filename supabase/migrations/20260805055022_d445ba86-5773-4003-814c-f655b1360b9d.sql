ALTER TABLE public.team_member_profiles
  ADD COLUMN IF NOT EXISTS am_managed_accommodation_ids uuid[];

CREATE OR REPLACE FUNCTION public.enforce_am_managed_accommodations()
RETURNS TRIGGER
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

  IF NOT (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION '只有管理員可以設定 AM 管理場域';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_am_managed_accommodations ON public.team_member_profiles;
CREATE TRIGGER trg_enforce_am_managed_accommodations
  BEFORE INSERT OR UPDATE ON public.team_member_profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_am_managed_accommodations();