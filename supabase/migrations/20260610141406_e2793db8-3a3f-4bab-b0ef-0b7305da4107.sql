ALTER TABLE public.order_meta
  ADD COLUMN IF NOT EXISTS nickname text,
  ADD COLUMN IF NOT EXISTS deposit_confirm_date date;