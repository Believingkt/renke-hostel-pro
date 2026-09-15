CREATE OR REPLACE FUNCTION public.set_updated_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_updated_by() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_by() TO service_role;

ALTER TABLE public.order_meta ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.kol_profiles ADD COLUMN IF NOT EXISTS updated_by uuid;

CREATE TRIGGER trg_order_meta_zz_set_updated_by
BEFORE INSERT OR UPDATE ON public.order_meta
FOR EACH ROW EXECUTE FUNCTION public.set_updated_by();

CREATE TRIGGER trg_kol_profiles_zz_set_updated_by
BEFORE INSERT OR UPDATE ON public.kol_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_by();