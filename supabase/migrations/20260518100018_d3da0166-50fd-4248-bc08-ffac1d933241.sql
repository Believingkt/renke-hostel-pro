
-- Allow legacy 'deposit_paid' status to coexist with new 'paid' (full-payment) flow
CREATE OR REPLACE FUNCTION public.sync_order_payment_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  canonical_method text;
BEGIN
  -- Validate payment_status (now includes legacy 'deposit_paid')
  IF NEW.payment_status IS NOT NULL AND NEW.payment_status NOT IN (
    'unpaid','paid','deposit_paid','refunded','partial_refunded','pending_payment'
  ) THEN
    RAISE EXCEPTION 'Invalid payment_status: %', NEW.payment_status;
  END IF;

  -- Resolve canonical method: payment_method > balance_payment_method > deposit_payment_method
  canonical_method := COALESCE(
    NULLIF(NEW.payment_method, ''),
    NULLIF(NEW.balance_payment_method, ''),
    NULLIF(NEW.deposit_payment_method, '')
  );

  IF canonical_method IS NOT NULL THEN
    NEW.payment_method := canonical_method;
    NEW.balance_payment_method := canonical_method;
    NEW.deposit_payment_method := canonical_method;
  END IF;

  -- Align deposit_status when fully paid
  IF NEW.payment_status = 'paid' AND (NEW.deposit_status IS NULL OR NEW.deposit_status = 'unpaid') THEN
    NEW.deposit_status := 'paid';
  END IF;

  RETURN NEW;
END;
$$;

-- Restore legacy deposit_paid status for orders that were partially paid
UPDATE public.orders
SET payment_status = 'deposit_paid'
WHERE payment_status = 'paid'
  AND deposit_amount > 0
  AND deposit_amount < final_price
  AND paid_amount < final_price;
