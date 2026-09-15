ALTER TABLE public.franchise_external_orders
  ADD COLUMN IF NOT EXISTS payout_status text NOT NULL DEFAULT '待結算',
  ADD COLUMN IF NOT EXISTS payout_date date;