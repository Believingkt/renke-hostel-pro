UPDATE public.orders
SET order_status = 'cancelled', updated_at = now()
WHERE order_number IN ('HT5D43Q9', 'TY7R74P2', 'WD9Z38L4')
  AND order_status = 'pending';

DELETE FROM public.group_buy_campaigns
WHERE id = '00000000-0000-4000-8000-0000000000a1';