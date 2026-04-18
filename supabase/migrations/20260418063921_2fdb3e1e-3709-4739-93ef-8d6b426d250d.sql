-- A1: Add idempotency_key column to orders for de-duplicating paid order creation
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Unique constraint: same idempotency_key cannot be used twice (NULL allowed for legacy/manual orders)
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_unique
  ON public.orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.orders.idempotency_key IS
  'Unique key to prevent duplicate order creation from retried payment requests (TapPay double-submit protection).';
