CREATE OR REPLACE FUNCTION public.get_adjusted_room_inventory(p_room_type_id uuid, p_date date, p_accommodation_id uuid)
 RETURNS TABLE(available_rooms integer, is_blocked boolean, blocked_by_room_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_room_type record;
  v_original_available integer;
  v_self_booked_count integer;
  v_booking_info record;
  v_booked_room record;
BEGIN
  SELECT * INTO v_room_type FROM room_types WHERE id = p_room_type_id;

  SELECT COALESCE(rip.available_rooms, 0)
  INTO v_original_available
  FROM room_inventory_pricing rip
  WHERE rip.room_type_id = p_room_type_id AND rip.date = p_date;

  IF v_original_available IS NULL THEN
    v_original_available := 0;
  END IF;

  -- 聚合已訂數（order_rooms.quantity 優先，否則用 orders.room_type_id 視為 1）
  SELECT COALESCE(SUM(cnt), 0)::int INTO v_self_booked_count
  FROM (
    SELECT orr.quantity AS cnt
    FROM order_rooms orr
    JOIN orders o ON orr.order_id = o.id
    WHERE o.accommodation_id = p_accommodation_id
      AND o.order_status NOT IN ('cancelled')
      AND p_date >= o.check_in_date
      AND p_date < o.check_out_date
      AND orr.room_type_id = p_room_type_id
    UNION ALL
    SELECT 1 AS cnt
    FROM orders o
    WHERE o.accommodation_id = p_accommodation_id
      AND o.order_status NOT IN ('cancelled')
      AND p_date >= o.check_in_date
      AND p_date < o.check_out_date
      AND o.room_type_id = p_room_type_id
      AND NOT EXISTS (SELECT 1 FROM order_rooms orr2 WHERE orr2.order_id = o.id)
  ) t;

  IF v_room_type.is_exclusive_package = true OR v_room_type.is_bound_to_exclusive = true THEN
    SELECT * INTO v_booking_info FROM check_exclusive_room_booking(p_accommodation_id, p_date);

    IF v_booking_info.has_booking THEN
      SELECT is_exclusive_package, is_bound_to_exclusive, name
      INTO v_booked_room
      FROM room_types WHERE id = v_booking_info.booked_room_type_id;

      IF v_booked_room.is_exclusive_package = true THEN
        IF v_booking_info.booked_room_type_id = p_room_type_id THEN
          RETURN QUERY SELECT GREATEST(v_original_available - v_self_booked_count, 0), false, NULL::text;
          RETURN;
        ELSE
          RETURN QUERY SELECT 0, true, v_booking_info.booked_room_type_name;
          RETURN;
        END IF;
      ELSIF v_booked_room.is_bound_to_exclusive = true THEN
        IF v_room_type.is_exclusive_package = true THEN
          RETURN QUERY SELECT 0, true, v_booking_info.booked_room_type_name;
          RETURN;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT GREATEST(v_original_available - v_self_booked_count, 0), false, NULL::text;
END;
$function$;