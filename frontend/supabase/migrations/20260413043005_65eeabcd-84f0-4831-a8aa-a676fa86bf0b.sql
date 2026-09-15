
-- Create function to sync discount code used_count based on actual non-cancelled orders
CREATE OR REPLACE FUNCTION public.sync_discount_code_used_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old_code text;
  v_new_code text;
  v_accommodation_id uuid;
BEGIN
  -- Determine old and new discount codes
  IF TG_OP = 'DELETE' THEN
    v_old_code := OLD.discount_code;
    v_new_code := NULL;
    v_accommodation_id := OLD.accommodation_id;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_code := NULL;
    v_new_code := NEW.discount_code;
    v_accommodation_id := NEW.accommodation_id;
  ELSE -- UPDATE
    v_old_code := OLD.discount_code;
    v_new_code := NEW.discount_code;
    v_accommodation_id := NEW.accommodation_id;
  END IF;

  -- Update old discount code count (if code changed or order cancelled/deleted)
  IF v_old_code IS NOT NULL AND (v_old_code IS DISTINCT FROM v_new_code OR 
     (TG_OP = 'UPDATE' AND OLD.order_status IS DISTINCT FROM NEW.order_status)) THEN
    UPDATE public.discount_codes
    SET used_count = (
      SELECT COUNT(*) FROM public.orders
      WHERE discount_code = v_old_code
        AND accommodation_id = (SELECT accommodation_id FROM public.discount_codes WHERE code = v_old_code LIMIT 1)
        AND order_status != 'cancelled'
    )
    WHERE code = v_old_code;
  END IF;

  -- Update new discount code count
  IF v_new_code IS NOT NULL AND (v_new_code IS DISTINCT FROM v_old_code OR 
     (TG_OP = 'UPDATE' AND OLD.order_status IS DISTINCT FROM NEW.order_status)) THEN
    UPDATE public.discount_codes
    SET used_count = (
      SELECT COUNT(*) FROM public.orders
      WHERE discount_code = v_new_code
        AND accommodation_id = (SELECT accommodation_id FROM public.discount_codes WHERE code = v_new_code LIMIT 1)
        AND order_status != 'cancelled'
    )
    WHERE code = v_new_code;
  END IF;

  -- For same code, same status (e.g. new insert with a code)
  IF TG_OP = 'INSERT' AND v_new_code IS NOT NULL THEN
    UPDATE public.discount_codes
    SET used_count = (
      SELECT COUNT(*) FROM public.orders
      WHERE discount_code = v_new_code
        AND accommodation_id = (SELECT accommodation_id FROM public.discount_codes WHERE code = v_new_code LIMIT 1)
        AND order_status != 'cancelled'
    )
    WHERE code = v_new_code;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on orders table
DROP TRIGGER IF EXISTS sync_discount_used_count_trigger ON public.orders;
CREATE TRIGGER sync_discount_used_count_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_discount_code_used_count();
