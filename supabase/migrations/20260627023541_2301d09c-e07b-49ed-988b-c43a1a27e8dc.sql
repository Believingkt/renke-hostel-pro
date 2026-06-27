ALTER TABLE public.order_meta ADD COLUMN IF NOT EXISTS last_confirmed_final_price numeric;

UPDATE public.order_meta m
SET last_confirmed_final_price = o.final_price
FROM public.orders o
WHERE m.order_id = o.id
  AND m.commission_price_confirmed_by IS NOT NULL
  AND m.last_confirmed_final_price IS NULL;