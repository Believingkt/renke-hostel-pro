-- P0-5: Prevent unauthorized changes to immutable order fields
CREATE OR REPLACE FUNCTION public.prevent_immutable_order_fields_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_super_admin_user boolean := false;
BEGIN
  -- Check if current user is super_admin (allowed to override)
  IF auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'::app_role
    ) INTO is_super_admin_user;
  END IF;

  -- Always-immutable fields (even super_admin can't change via normal flow,
  -- but we allow super_admin to override for emergency corrections)
  IF NOT is_super_admin_user THEN
    IF NEW.order_number IS DISTINCT FROM OLD.order_number THEN
      RAISE EXCEPTION 'order_number is immutable and cannot be changed';
    END IF;

    IF NEW.accommodation_id IS DISTINCT FROM OLD.accommodation_id THEN
      RAISE EXCEPTION 'accommodation_id is immutable and cannot be changed';
    END IF;

    IF OLD.idempotency_key IS NOT NULL
       AND NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
      RAISE EXCEPTION 'idempotency_key cannot be changed once set';
    END IF;

    -- Once the order is paid (deposit or fully paid), lock financial fields
    IF OLD.payment_status IN ('deposit_paid', 'fully_paid') THEN
      IF NEW.total_price IS DISTINCT FROM OLD.total_price THEN
        RAISE EXCEPTION 'total_price cannot be changed after payment';
      END IF;
      IF NEW.discount_amount IS DISTINCT FROM OLD.discount_amount THEN
        RAISE EXCEPTION 'discount_amount cannot be changed after payment';
      END IF;
      IF NEW.final_price IS DISTINCT FROM OLD.final_price THEN
        RAISE EXCEPTION 'final_price cannot be changed after payment';
      END IF;
      IF NEW.deposit_amount IS DISTINCT FROM OLD.deposit_amount THEN
        RAISE EXCEPTION 'deposit_amount cannot be changed after payment';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_immutable_order_fields ON public.orders;
CREATE TRIGGER trg_prevent_immutable_order_fields
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_immutable_order_fields_change();