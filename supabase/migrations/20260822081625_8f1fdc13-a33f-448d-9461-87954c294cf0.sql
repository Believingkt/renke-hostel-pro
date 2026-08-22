ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS group_buy_booking_notice_snapshot jsonb;

COMMENT ON COLUMN public.orders.group_buy_booking_notice_snapshot IS
  '團購訂單建立當下的訂房須知快照（immutable，僅建單時寫入一次；含 booking_notice 與 post_booking_notice）';