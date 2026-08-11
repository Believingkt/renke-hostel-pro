ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS refund_rec_trade_id text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_status text NOT NULL DEFAULT 'none';

COMMENT ON COLUMN public.orders.refund_status IS 'none | refunded | partial_refunded | pending_manual | failed';