CREATE OR REPLACE FUNCTION public.sync_accommodation_partnership_start_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _acc uuid;
BEGIN
  _acc := COALESCE(NEW.accommodation_id, OLD.accommodation_id);
  IF _acc IS NOT NULL THEN
    UPDATE public.accommodation_info ai
       SET partnership_start_date = (
             SELECT MIN(p.start_date)
               FROM public.accommodation_partnership_periods p
              WHERE p.accommodation_id = _acc
           )
     WHERE ai.id = _acc
       AND ai.partnership_start_date IS DISTINCT FROM (
             SELECT MIN(p.start_date)
               FROM public.accommodation_partnership_periods p
              WHERE p.accommodation_id = _acc
           );
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.accommodation_id IS DISTINCT FROM NEW.accommodation_id
     AND OLD.accommodation_id IS NOT NULL THEN
    UPDATE public.accommodation_info ai
       SET partnership_start_date = (
             SELECT MIN(p.start_date)
               FROM public.accommodation_partnership_periods p
              WHERE p.accommodation_id = OLD.accommodation_id
           )
     WHERE ai.id = OLD.accommodation_id;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_partnership_start_date ON public.accommodation_partnership_periods;

CREATE TRIGGER trg_sync_partnership_start_date
AFTER INSERT OR UPDATE OF start_date, accommodation_id OR DELETE
ON public.accommodation_partnership_periods
FOR EACH ROW
EXECUTE FUNCTION public.sync_accommodation_partnership_start_date();