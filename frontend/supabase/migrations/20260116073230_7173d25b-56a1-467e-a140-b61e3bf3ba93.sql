-- 修改 payment_status 約束，新增 refunded 和 partial_refunded 狀態
ALTER TABLE public.orders DROP CONSTRAINT orders_payment_status_check;

ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check 
  CHECK (payment_status IN ('unpaid', 'deposit_paid', 'paid', 'overdue', 'refunded', 'partial_refunded'));