ALTER TABLE public.franchise_orders ADD COLUMN IF NOT EXISTS early_payout_month text;
ALTER TABLE public.franchise_external_orders ADD COLUMN IF NOT EXISTS early_payout_month text;
ALTER TABLE public.franchise_orders ADD CONSTRAINT franchise_orders_early_payout_month_fmt CHECK (early_payout_month IS NULL OR early_payout_month ~ '^\d{4}-\d{2}$');
ALTER TABLE public.franchise_external_orders ADD CONSTRAINT franchise_external_orders_early_payout_month_fmt CHECK (early_payout_month IS NULL OR early_payout_month ~ '^\d{4}-\d{2}$');