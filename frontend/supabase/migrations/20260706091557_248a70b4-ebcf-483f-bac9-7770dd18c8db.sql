CREATE OR REPLACE FUNCTION public.bulk_upsert_room_inventory_pricing(p_rows jsonb, p_source text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r jsonb;
  v_room_type_id uuid;
  v_date date;
  v_template_id uuid;
  v_has_price boolean;
  v_has_avail boolean;
  v_has_is_avail boolean;
  v_price numeric;
  v_avail int;
  v_is_avail boolean;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_room_type_id := (r->>'room_type_id')::uuid;
    v_date := (r->>'date')::date;
    v_template_id := NULLIF(r->>'pricing_template_id', '')::uuid;

    v_has_price    := (r ? 'price')           AND (r->>'price')           IS NOT NULL;
    v_has_avail    := (r ? 'available_rooms') AND (r->>'available_rooms') IS NOT NULL;
    v_has_is_avail := (r ? 'is_available')    AND (r->>'is_available')    IS NOT NULL;

    v_price    := CASE WHEN v_has_price    THEN (r->>'price')::numeric        ELSE NULL END;
    v_avail    := CASE WHEN v_has_avail    THEN (r->>'available_rooms')::int  ELSE NULL END;
    v_is_avail := CASE WHEN v_has_is_avail THEN (r->>'is_available')::boolean ELSE NULL END;

    IF v_template_id IS NULL THEN
      IF NOT v_has_price THEN
        SELECT COALESCE(base_price, 0) INTO v_price FROM room_types WHERE id = v_room_type_id;
      END IF;

      INSERT INTO room_inventory_pricing (
        room_type_id, date, price, available_rooms, is_available, pricing_template_id, last_change_source
      ) VALUES (
        v_room_type_id, v_date, COALESCE(v_price, 0), v_avail, v_is_avail, NULL, p_source
      )
      ON CONFLICT (room_type_id, date) WHERE pricing_template_id IS NULL
      DO UPDATE SET
        price              = CASE WHEN v_has_price    THEN v_price    ELSE room_inventory_pricing.price END,
        available_rooms    = CASE WHEN v_has_avail    THEN v_avail    ELSE room_inventory_pricing.available_rooms END,
        is_available       = CASE WHEN v_has_is_avail THEN v_is_avail ELSE room_inventory_pricing.is_available END,
        last_change_source = COALESCE(p_source, room_inventory_pricing.last_change_source),
        updated_at = now();
    ELSE
      INSERT INTO room_inventory_pricing (
        room_type_id, date, price, available_rooms, is_available, pricing_template_id, last_change_source
      ) VALUES (
        v_room_type_id, v_date, COALESCE(v_price, 0), v_avail, v_is_avail, v_template_id, p_source
      )
      ON CONFLICT (room_type_id, date, pricing_template_id) WHERE pricing_template_id IS NOT NULL
      DO UPDATE SET
        price              = CASE WHEN v_has_price    THEN v_price    ELSE room_inventory_pricing.price END,
        available_rooms    = CASE WHEN v_has_avail    THEN v_avail    ELSE room_inventory_pricing.available_rooms END,
        is_available       = CASE WHEN v_has_is_avail THEN v_is_avail ELSE room_inventory_pricing.is_available END,
        last_change_source = COALESCE(p_source, room_inventory_pricing.last_change_source),
        updated_at = now();
    END IF;
  END LOOP;
END;
$function$;