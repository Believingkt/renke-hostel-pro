ALTER TABLE public.order_meta
  ADD COLUMN IF NOT EXISTS deposit_confirm_date_verified boolean NOT NULL DEFAULT false;