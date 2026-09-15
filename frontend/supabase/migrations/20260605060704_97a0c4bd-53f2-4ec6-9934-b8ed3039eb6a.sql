ALTER TABLE public.order_meta
  ADD COLUMN IF NOT EXISTS inquiry_date date,
  ADD COLUMN IF NOT EXISTS voucher_used boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS addon_note text,
  ADD COLUMN IF NOT EXISTS addon_amount numeric DEFAULT 0;