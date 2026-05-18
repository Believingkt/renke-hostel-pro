
CREATE OR REPLACE FUNCTION public.sync_order_payment_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_method text;
  v_allowed_status text[] := ARRAY['unpaid','paid','refunded','partial_refunded','pending_payment'];
BEGIN
  IF NEW.payment_status = 'deposit_paid' THEN
    NEW.payment_status := 'paid';
  END IF;

  IF NEW.payment_status IS NOT NULL
     AND NEW.payment_status <> ''
     AND NOT (NEW.payment_status = ANY(v_allowed_status)) THEN
    RAISE EXCEPTION 'Invalid payment_status: %', NEW.payment_status;
  END IF;

  v_method := COALESCE(
    NULLIF(NEW.payment_method, ''),
    NULLIF(NEW.balance_payment_method, ''),
    NULLIF(NEW.deposit_payment_method, '')
  );

  IF v_method IS NOT NULL THEN
    NEW.payment_method := v_method;
    NEW.balance_payment_method := v_method;
    NEW.deposit_payment_method := v_method;
  END IF;

  IF NEW.payment_status = 'paid' AND (NEW.deposit_status IS NULL OR NEW.deposit_status = 'unpaid') THEN
    NEW.deposit_status := 'paid';
  END IF;

  RETURN NEW;
END;
$$;
