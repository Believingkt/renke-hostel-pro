
ALTER TABLE public.franchise_orders
  ADD COLUMN IF NOT EXISTS card_status text,
  ADD COLUMN IF NOT EXISTS voucher_count integer,
  ADD COLUMN IF NOT EXISTS voucher_batch text,
  ADD COLUMN IF NOT EXISTS voucher_serial_start integer,
  ADD COLUMN IF NOT EXISTS voucher_serial_end integer,
  ADD COLUMN IF NOT EXISTS voucher_status text,
  ADD COLUMN IF NOT EXISTS voucher_handler text,
  ADD COLUMN IF NOT EXISTS voucher_start_date date,
  ADD COLUMN IF NOT EXISTS voucher_note text,
  ADD COLUMN IF NOT EXISTS voucher_address text;
