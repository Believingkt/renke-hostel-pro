CREATE OR REPLACE FUNCTION public.sync_order_payment_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  canonical_method text;
BEGIN
  IF current_setting('app.bypass_inventory_check', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_status IS NOT NULL AND NEW.payment_status NOT IN (
    'unpaid','paid','deposit_paid','refunded','partial_refunded','pending_payment','cancelled'
  ) THEN
    RAISE EXCEPTION '付款狀態「%」無效，請重新選擇付款狀態', NEW.payment_status USING ERRCODE = 'P0001';
  END IF;

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

  IF NEW.payment_status = 'paid' AND (NEW.deposit_status IS NULL OR NEW.deposit_status = 'unpaid') THEN
    NEW.deposit_status := 'paid';
  END IF;

  RETURN NEW;
END;
$$;