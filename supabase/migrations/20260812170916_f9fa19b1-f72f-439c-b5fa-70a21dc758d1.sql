DELETE FROM public.group_buy_commissions WHERE order_id IN (SELECT id FROM public.orders WHERE order_number = 'ML4A47A7');
DELETE FROM public.group_buy_payment_events WHERE order_id IN (SELECT id FROM public.orders WHERE order_number = 'ML4A47A7');
DELETE FROM public.orders WHERE order_number = 'ML4A47A7';