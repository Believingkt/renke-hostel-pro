ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS room_charge_status text,
  ADD COLUMN IF NOT EXISTS room_charge_scheduled_date date,
  ADD COLUMN IF NOT EXISTS room_charge_at timestamptz,
  ADD COLUMN IF NOT EXISTS room_charge_rec_trade_id text,
  ADD COLUMN IF NOT EXISTS room_charge_error text,
  ADD COLUMN IF NOT EXISTS cancellation_fee_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_fee_percent integer,
  ADD COLUMN IF NOT EXISTS refunded_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE public.deposit_card_tokens
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'deposit';

CREATE INDEX IF NOT EXISTS idx_orders_room_charge_due
  ON public.orders (room_charge_scheduled_date)
  WHERE room_charge_status = 'card_bound';

CREATE INDEX IF NOT EXISTS idx_deposit_card_tokens_order_purpose
  ON public.deposit_card_tokens (order_id, purpose, is_active);