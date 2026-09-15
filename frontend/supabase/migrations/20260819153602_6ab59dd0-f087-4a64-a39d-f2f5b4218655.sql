CREATE OR REPLACE FUNCTION public.sync_deposit_confirm_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_status = 'deposit_paid'
     AND (TG_OP = 'INSERT' OR OLD.payment_status IS DISTINCT FROM NEW.payment_status) THEN
    INSERT INTO public.order_meta (order_id, deposit_confirm_date, deposit_confirm_date_verified)
    VALUES (NEW.id, (now() AT TIME ZONE 'Asia/Taipei')::date, false)
    ON CONFLICT (order_id) DO UPDATE
      SET deposit_confirm_date = COALESCE(public.order_meta.deposit_confirm_date, EXCLUDED.deposit_confirm_date);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_deposit_confirm_date ON public.orders;
CREATE TRIGGER trg_sync_deposit_confirm_date
AFTER INSERT OR UPDATE OF payment_status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_deposit_confirm_date();