CREATE INDEX IF NOT EXISTS idx_orders_accommodation_id 
  ON public.orders(accommodation_id);

CREATE INDEX IF NOT EXISTS idx_orders_acc_order_date 
  ON public.orders(accommodation_id, order_date DESC);

CREATE INDEX IF NOT EXISTS idx_orders_acc_checkin 
  ON public.orders(accommodation_id, check_in_date);