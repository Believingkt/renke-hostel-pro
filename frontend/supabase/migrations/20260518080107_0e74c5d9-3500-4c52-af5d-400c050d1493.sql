CREATE OR REPLACE FUNCTION public.bulk_upsert_room_inventory_pricing(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
  v_room_type_id uuid;
  v_date date;
  v_template_id uuid;
  v_base_price numeric;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_room_type_id := (r->>'room_type_id')::uuid;
    v_date := (r->>'date')::date;
    v_template_id := NULLIF(r->>'pricing_template_id', '')::uuid;

    IF v_template_id IS NULL THEN
      -- price NOT NULL: fall back to base_price when caller didn't supply
      IF (r ? 'price') AND (r->>'price') IS NOT NULL THEN
        v_base_price := (r->>'price')::numeric;
      ELSE
        SELECT COALESCE(base_price, 0) INTO v_base_price FROM room_types WHERE id = v_room_type_id;
      END IF;

      INSERT INTO room_inventory_pricing (
        room_type_id, date, price, available_rooms, is_available, pricing_template_id
      ) VALUES (
        v_room_type_id, v_date, COALESCE(v_base_price, 0),
        COALESCE((r->>'available_rooms')::int, 0),
        COALESCE((r->>'is_available')::boolean, true),
        NULL
      )
      ON CONFLICT (room_type_id, date) WHERE pricing_template_id IS NULL
      DO UPDATE SET
        price = CASE WHEN (r ? 'price') AND (r->>'price') IS NOT NULL
                     THEN (r->>'price')::numeric
                     ELSE room_inventory_pricing.price END,
        available_rooms = CASE WHEN (r ? 'available_rooms') AND (r->>'available_rooms') IS NOT NULL
                               THEN (r->>'available_rooms')::int
                               ELSE room_inventory_pricing.available_rooms END,
        is_available = CASE WHEN (r ? 'is_available') AND (r->>'is_available') IS NOT NULL
                            THEN (r->>'is_available')::boolean
                            ELSE room_inventory_pricing.is_available END,
        updated_at = now();
    ELSE
      INSERT INTO room_inventory_pricing (
        room_type_id, date, price, available_rooms, is_available, pricing_template_id
      ) VALUES (
        v_room_type_id, v_date,
        COALESCE((r->>'price')::numeric, 0),
        COALESCE((r->>'available_rooms')::int, 0),
        COALESCE((r->>'is_available')::boolean, true),
        v_template_id
      )
      ON CONFLICT (room_type_id, date, pricing_template_id) WHERE pricing_template_id IS NOT NULL
      DO UPDATE SET
        price = CASE WHEN (r ? 'price') AND (r->>'price') IS NOT NULL
                     THEN (r->>'price')::numeric
                     ELSE room_inventory_pricing.price END,
        available_rooms = CASE WHEN (r ? 'available_rooms') AND (r->>'available_rooms') IS NOT NULL
                               THEN (r->>'available_rooms')::int
                               ELSE room_inventory_pricing.available_rooms END,
        is_available = CASE WHEN (r ? 'is_available') AND (r->>'is_available') IS NOT NULL
                            THEN (r->>'is_available')::boolean
                            ELSE room_inventory_pricing.is_available END,
        updated_at = now();
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_upsert_room_inventory_pricing(jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.bulk_upsert_room_inventory_pricing(jsonb) FROM anon, authenticated, PUBLIC;