
-- Sync payment method fields and normalize payment status on orders
CREATE OR REPLACE FUNCTION public.sync_order_payment_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_method text;
  v_allowed_status text[] := ARRAY['unpaid','paid','refunded','partial_refunded','pending_payment'];
  v_allowed_method text[] := ARRAY['cash','credit_card','bank_transfer','line_pay','jko_pay','atm','other'];
BEGIN
  -- 1. Normalize legacy payment_status 'deposit_paid' -> 'paid'
  IF NEW.payment_status = 'deposit_paid' THEN
    NEW.payment_status := 'paid';
  END IF;

  -- 2. Validate payment_status if provided
  IF NEW.payment_status IS NOT NULL
     AND NEW.payment_status <> ''
     AND NOT (NEW.payment_status = ANY(v_allowed_status)) THEN
    RAISE EXCEPTION 'Invalid payment_status: %', NEW.payment_status;
  END IF;

  -- 3. Resolve canonical method: prefer payment_method, then balance, then deposit
  v_method := COALESCE(
    NULLIF(NEW.payment_method, ''),
    NULLIF(NEW.balance_payment_method, ''),
    NULLIF(NEW.deposit_payment_method, '')
  );

  -- 4. Validate canonical method
  IF v_method IS NOT NULL AND NOT (v_method = ANY(v_allowed_method)) THEN
    RAISE EXCEPTION 'Invalid payment method: %', v_method;
  END IF;

  -- 5. Sync all three method fields when a canonical method exists
  IF v_method IS NOT NULL THEN
    NEW.payment_method := v_method;
    NEW.balance_payment_method := v_method;
    NEW.deposit_payment_method := v_method;
  END IF;

  -- 6. Keep deposit_status aligned for paid orders (legacy field)
  IF NEW.payment_status = 'paid' AND (NEW.deposit_status IS NULL OR NEW.deposit_status = 'unpaid') THEN
    NEW.deposit_status := 'paid';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_payment_fields ON public.orders;
CREATE TRIGGER trg_sync_order_payment_fields
BEFORE INSERT OR UPDATE OF payment_status, payment_method, balance_payment_method, deposit_payment_method
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_payment_fields();
