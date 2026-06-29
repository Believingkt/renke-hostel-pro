-- 1) Allow NULL on room_inventory_pricing.available_rooms so price-only rows
--    don't get forced to 0. Existing rows that already have 0 are kept as-is
--    (only rows updated explicitly will become NULL).
ALTER TABLE public.room_inventory_pricing
  ALTER COLUMN available_rooms DROP NOT NULL,
  ALTER COLUMN available_rooms DROP DEFAULT;

-- 2) Rewrite bulk_upsert_room_inventory_pricing so:
--    - INSERTs only populate fields the caller actually provided.
--      Price push -> price only; available_rooms / is_available stay NULL.
--      Avail push -> available_rooms / is_available; price defaults to 0
--      (price is still NOT NULL on the table).
--    - UPDATEs continue to be partial (only fields the caller provided).
CREATE OR REPLACE FUNCTION public.bulk_upsert_room_inventory_pricing(p_rows jsonb)
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

    v_price    := CASE WHEN v_has_price    THEN (r->>'price')::numeric            ELSE NULL END;
    v_avail    := CASE WHEN v_has_avail    THEN (r->>'available_rooms')::int      ELSE NULL END;
    v_is_avail := CASE WHEN v_has_is_avail THEN (r->>'is_available')::boolean     ELSE NULL END;

    IF v_template_id IS NULL THEN
      -- price is NOT NULL on table; fall back to room_types.base_price when missing
      IF NOT v_has_price THEN
        SELECT COALESCE(base_price, 0) INTO v_price FROM room_types WHERE id = v_room_type_id;
      END IF;

      INSERT INTO room_inventory_pricing (
        room_type_id, date, price, available_rooms, is_available, pricing_template_id
      ) VALUES (
        v_room_type_id, v_date, COALESCE(v_price, 0), v_avail, v_is_avail, NULL
      )
      ON CONFLICT (room_type_id, date) WHERE pricing_template_id IS NULL
      DO UPDATE SET
        price           = CASE WHEN v_has_price    THEN v_price    ELSE room_inventory_pricing.price END,
        available_rooms = CASE WHEN v_has_avail    THEN v_avail    ELSE room_inventory_pricing.available_rooms END,
        is_available    = CASE WHEN v_has_is_avail THEN v_is_avail ELSE room_inventory_pricing.is_available END,
        updated_at = now();
    ELSE
      INSERT INTO room_inventory_pricing (
        room_type_id, date, price, available_rooms, is_available, pricing_template_id
      ) VALUES (
        v_room_type_id, v_date, COALESCE(v_price, 0), v_avail, v_is_avail, v_template_id
      )
      ON CONFLICT (room_type_id, date, pricing_template_id) WHERE pricing_template_id IS NOT NULL
      DO UPDATE SET
        price           = CASE WHEN v_has_price    THEN v_price    ELSE room_inventory_pricing.price END,
        available_rooms = CASE WHEN v_has_avail    THEN v_avail    ELSE room_inventory_pricing.available_rooms END,
        is_available    = CASE WHEN v_has_is_avail THEN v_is_avail ELSE room_inventory_pricing.is_available END,
        updated_at = now();
    END IF;
  END LOOP;
END;
$function$;

-- 3) Cleanup: SENSAN price-only rows 2026-09-27..10-01 wrongly initialised to 0.
--    Affected rows = template-specific rows (pricing_template_id IS NOT NULL)
--    last updated at the 2026-06-29 price push with available_rooms = 0.
UPDATE public.room_inventory_pricing rip
SET available_rooms = NULL,
    updated_at = now()
FROM public.room_types rt,
     public.accommodation_owlting_config c
WHERE rip.room_type_id = rt.id
  AND rt.accommodation_id = c.accommodation_id
  AND c.owlting_hotel_code = 'SENSAN'
  AND rip.pricing_template_id IS NOT NULL
  AND rip.date BETWEEN '2026-09-27' AND '2026-10-01'
  AND rip.available_rooms = 0
  AND rip.updated_at >= '2026-06-29'::date
  AND rip.updated_at <  '2026-06-30'::date;