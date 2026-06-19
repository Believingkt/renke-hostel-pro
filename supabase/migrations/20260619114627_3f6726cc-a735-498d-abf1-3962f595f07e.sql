
CREATE OR REPLACE FUNCTION public.get_adjusted_room_inventory_batch(
  p_room_type_id uuid,
  p_dates text[],
  p_accommodation_id uuid
)
RETURNS TABLE(date_value date, available_rooms integer, is_blocked boolean, blocked_by_room_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_room_type record;
  v_date text;
  v_original_available integer;
  v_self_booked_count integer;
  v_blocking_name text;
BEGIN
  SELECT * INTO v_room_type FROM room_types WHERE id = p_room_type_id;

  FOREACH v_date IN ARRAY p_dates
  LOOP
    SELECT COALESCE(rip.available_rooms, 0)
    INTO v_original_available
    FROM room_inventory_pricing rip
    WHERE rip.room_type_id = p_room_type_id AND rip.date = v_date::date;

    IF v_original_available IS NULL THEN
      v_original_available := 0;
    END IF;

    SELECT COALESCE(SUM(cnt), 0)::int INTO v_self_booked_count
    FROM (
      SELECT orr.quantity AS cnt
      FROM order_rooms orr
      JOIN orders o ON orr.order_id = o.id
      WHERE o.accommodation_id = p_accommodation_id
        AND o.order_status NOT IN ('cancelled')
        AND v_date::date >= o.check_in_date
        AND v_date::date < o.check_out_date
        AND orr.room_type_id = p_room_type_id
      UNION ALL
      SELECT 1 AS cnt
      FROM orders o
      WHERE o.accommodation_id = p_accommodation_id
        AND o.order_status NOT IN ('cancelled')
        AND v_date::date >= o.check_in_date
        AND v_date::date < o.check_out_date
        AND o.room_type_id = p_room_type_id
        AND NOT EXISTS (SELECT 1 FROM order_rooms orr2 WHERE orr2.order_id = o.id)
    ) t;

    v_blocking_name := NULL;

    -- 散客房型 (is_bound_to_exclusive=true, is_exclusive_package=false)
    -- 被它所綁定的「共用包棟」訂單鎖。bound_exclusive_ids 為 null/空 → 視為綁定全部共用包棟。
    IF v_room_type.is_bound_to_exclusive = true AND COALESCE(v_room_type.is_exclusive_package, false) = false THEN
      SELECT rt.name INTO v_blocking_name
      FROM (
        SELECT orr.room_type_id
        FROM order_rooms orr
        JOIN orders o ON orr.order_id = o.id
        WHERE o.accommodation_id = p_accommodation_id
          AND o.order_status NOT IN ('cancelled')
          AND v_date::date >= o.check_in_date
          AND v_date::date < o.check_out_date
        UNION
        SELECT o.room_type_id
        FROM orders o
        WHERE o.accommodation_id = p_accommodation_id
          AND o.order_status NOT IN ('cancelled')
          AND v_date::date >= o.check_in_date
          AND v_date::date < o.check_out_date
          AND NOT EXISTS (SELECT 1 FROM order_rooms orr2 WHERE orr2.order_id = o.id)
      ) booked
      JOIN room_types rt ON rt.id = booked.room_type_id
      WHERE rt.is_exclusive_package = true
        AND rt.is_bound_to_exclusive = true
        AND (
          v_room_type.bound_exclusive_ids IS NULL
          OR array_length(v_room_type.bound_exclusive_ids, 1) IS NULL
          OR rt.id = ANY(v_room_type.bound_exclusive_ids)
        )
      LIMIT 1;

    -- 共用包棟 (is_exclusive_package=true, is_bound_to_exclusive=true)
    -- 被其他共用包棟訂單鎖,或被綁定到它的散客房型訂單鎖。
    ELSIF v_room_type.is_exclusive_package = true AND v_room_type.is_bound_to_exclusive = true THEN
      -- 先檢查是否有其他共用包棟訂單
      SELECT rt.name INTO v_blocking_name
      FROM (
        SELECT orr.room_type_id
        FROM order_rooms orr
        JOIN orders o ON orr.order_id = o.id
        WHERE o.accommodation_id = p_accommodation_id
          AND o.order_status NOT IN ('cancelled')
          AND v_date::date >= o.check_in_date
          AND v_date::date < o.check_out_date
          AND orr.room_type_id <> p_room_type_id
        UNION
        SELECT o.room_type_id
        FROM orders o
        WHERE o.accommodation_id = p_accommodation_id
          AND o.order_status NOT IN ('cancelled')
          AND v_date::date >= o.check_in_date
          AND v_date::date < o.check_out_date
          AND o.room_type_id <> p_room_type_id
          AND NOT EXISTS (SELECT 1 FROM order_rooms orr2 WHERE orr2.order_id = o.id)
      ) booked
      JOIN room_types rt ON rt.id = booked.room_type_id
      WHERE rt.is_exclusive_package = true
        AND rt.is_bound_to_exclusive = true
      LIMIT 1;

      -- 若未被其他包棟鎖,再檢查是否被綁定的散客房型訂單鎖
      IF v_blocking_name IS NULL THEN
        SELECT rt.name INTO v_blocking_name
        FROM (
          SELECT orr.room_type_id
          FROM order_rooms orr
          JOIN orders o ON orr.order_id = o.id
          WHERE o.accommodation_id = p_accommodation_id
            AND o.order_status NOT IN ('cancelled')
            AND v_date::date >= o.check_in_date
            AND v_date::date < o.check_out_date
          UNION
          SELECT o.room_type_id
          FROM orders o
          WHERE o.accommodation_id = p_accommodation_id
            AND o.order_status NOT IN ('cancelled')
            AND v_date::date >= o.check_in_date
            AND v_date::date < o.check_out_date
            AND NOT EXISTS (SELECT 1 FROM order_rooms orr2 WHERE orr2.order_id = o.id)
        ) booked
        JOIN room_types rt ON rt.id = booked.room_type_id
        WHERE rt.is_bound_to_exclusive = true
          AND COALESCE(rt.is_exclusive_package, false) = false
          AND (
            rt.bound_exclusive_ids IS NULL
            OR array_length(rt.bound_exclusive_ids, 1) IS NULL
            OR p_room_type_id = ANY(rt.bound_exclusive_ids)
          )
        LIMIT 1;
      END IF;
    END IF;

    IF v_blocking_name IS NOT NULL THEN
      date_value := v_date::date;
      available_rooms := 0;
      is_blocked := true;
      blocked_by_room_name := v_blocking_name;
      RETURN NEXT;
      CONTINUE;
    END IF;

    date_value := v_date::date;
    available_rooms := GREATEST(v_original_available - v_self_booked_count, 0);
    is_blocked := false;
    blocked_by_room_name := NULL;
    RETURN NEXT;
  END LOOP;
END;
$function$;
