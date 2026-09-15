ALTER TABLE public.order_meta ADD COLUMN IF NOT EXISTS trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_order_meta_trip_id ON public.order_meta(trip_id);

CREATE OR REPLACE FUNCTION public.consume_trip_product_stock(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  v_id uuid;
  v_qty integer;
  v_stock integer;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RETURN jsonb_build_object('ok', true, 'consumed', 0);
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_id := NULLIF(item->>'product_id', '')::uuid;
    v_qty := GREATEST(0, COALESCE((item->>'count')::int, 0));
    IF v_id IS NULL OR v_qty = 0 THEN CONTINUE; END IF;

    SELECT stock INTO v_stock FROM public.trip_products WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'product_not_found', 'product_id', v_id);
    END IF;
    IF v_stock IS NULL THEN CONTINUE; END IF;
    IF v_stock < v_qty THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'out_of_stock', 'product_id', v_id, 'stock', v_stock);
    END IF;
    UPDATE public.trip_products SET stock = stock - v_qty, updated_at = now() WHERE id = v_id;
  END LOOP;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_trip_product_stock(jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_trip_product_stock(jsonb) TO service_role;