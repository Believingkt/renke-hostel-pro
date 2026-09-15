-- 1. Add 3 columns to order_meta
ALTER TABLE public.order_meta
  ADD COLUMN IF NOT EXISTS team_commission_price numeric,
  ADD COLUMN IF NOT EXISTS commission_price_confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commission_price_confirmed_at timestamptz;

-- 2. Backfill existing rows: set team_commission_price = orders.final_price when null
UPDATE public.order_meta om
SET team_commission_price = o.final_price
FROM public.orders o
WHERE om.order_id = o.id
  AND om.team_commission_price IS NULL;

-- 3. Trigger: when an order_meta row is inserted without team_commission_price,
--    auto-fill from orders.final_price.
CREATE OR REPLACE FUNCTION public.set_default_team_commission_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_final_price numeric;
BEGIN
  IF NEW.team_commission_price IS NULL AND NEW.order_id IS NOT NULL THEN
    SELECT final_price INTO v_final_price
    FROM public.orders
    WHERE id = NEW.order_id;
    NEW.team_commission_price := v_final_price;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_meta_default_team_commission_price ON public.order_meta;
CREATE TRIGGER trg_order_meta_default_team_commission_price
BEFORE INSERT ON public.order_meta
FOR EACH ROW
EXECUTE FUNCTION public.set_default_team_commission_price();

-- 4. Trigger: when an order is created and no order_meta exists yet,
--    ensure that later inserts default correctly (handled above).
--    Additionally, when an order is INSERTED, we don't auto-create order_meta
--    (existing flow creates it on demand), so the BEFORE INSERT on order_meta
--    above already covers the "default to current final_price" requirement.