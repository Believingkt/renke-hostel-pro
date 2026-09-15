CREATE OR REPLACE FUNCTION public.orders_set_cancelled_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.order_status = 'cancelled' AND NEW.cancelled_at IS NULL THEN
    NEW.cancelled_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_set_cancelled_at_trg ON public.orders;
CREATE TRIGGER orders_set_cancelled_at_trg
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_set_cancelled_at();

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF coalesce(current_setting('app.skip_updated_at', true), '') = 'on' THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.updated_at = OLD.updated_at;
      RETURN NEW;
    END IF;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;