ALTER TABLE public.franchise_external_orders
  ADD COLUMN IF NOT EXISTS card_status text DEFAULT '未完成',
  ADD COLUMN IF NOT EXISTS voucher_count integer,
  ADD COLUMN IF NOT EXISTS voucher_batch text,
  ADD COLUMN IF NOT EXISTS voucher_serial_start integer,
  ADD COLUMN IF NOT EXISTS voucher_serial_end integer,
  ADD COLUMN IF NOT EXISTS voucher_status text DEFAULT '未寄出',
  ADD COLUMN IF NOT EXISTS voucher_handler text,
  ADD COLUMN IF NOT EXISTS voucher_start_date date,
  ADD COLUMN IF NOT EXISTS voucher_note text,
  ADD COLUMN IF NOT EXISTS voucher_address text;