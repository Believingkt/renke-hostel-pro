
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS atm_vacc_no text,
  ADD COLUMN IF NOT EXISTS atm_vacc_bank_code text,
  ADD COLUMN IF NOT EXISTS atm_expire_at timestamptz,
  ADD COLUMN IF NOT EXISTS atm_rec_trade_id text,
  ADD COLUMN IF NOT EXISTS atm_bank_transaction_id text;

CREATE INDEX IF NOT EXISTS idx_orders_atm_pending
  ON public.orders (payment_status, atm_expire_at)
  WHERE payment_status = 'pending_payment' AND atm_vacc_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_atm_rec_trade_id
  ON public.orders (atm_rec_trade_id)
  WHERE atm_rec_trade_id IS NOT NULL;
