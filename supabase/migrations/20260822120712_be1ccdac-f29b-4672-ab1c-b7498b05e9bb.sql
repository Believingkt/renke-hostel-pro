DO $$
DECLARE oid uuid;
BEGIN
  SELECT id INTO oid FROM public.orders WHERE order_number = 'KX7T27N8';
  IF oid IS NOT NULL THEN
    DELETE FROM public.group_buy_commissions WHERE order_id = oid;
    DELETE FROM public.group_buy_payment_events WHERE order_id = oid;
    DELETE FROM public.order_rooms WHERE order_id = oid;
    DELETE FROM public.booking_email_log WHERE order_id = oid;
    DELETE FROM public.order_status_change_events WHERE order_id = oid;
    DELETE FROM public.orders WHERE id = oid;
  END IF;
END $$;

UPDATE public.group_buy_campaigns SET commission_rate = 5 WHERE slug = 'ma';