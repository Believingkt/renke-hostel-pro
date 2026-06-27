
ALTER TABLE public.order_meta
  ADD COLUMN IF NOT EXISTS last_confirmed_commission_price numeric;

UPDATE public.order_meta
SET last_confirmed_commission_price = team_commission_price
WHERE commission_price_confirmed_by IS NOT NULL
  AND last_confirmed_commission_price IS NULL;
