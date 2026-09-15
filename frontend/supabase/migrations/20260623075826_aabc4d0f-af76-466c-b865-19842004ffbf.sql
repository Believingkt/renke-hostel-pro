-- 1) 在 orders 加一個「整棟保留／包棟」旗標
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS lock_whole_building boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orders.lock_whole_building IS
  '若為 true,該訂單入住期間整間民宿其他房型全部視為不可售（用於奧莉薇雅等沒有設定包棟房型、但仍需鎖整棟的情境）';

CREATE INDEX IF NOT EXISTS idx_orders_lock_whole_building
  ON public.orders (accommodation_id, check_in_date, check_out_date)
  WHERE lock_whole_building = true;

-- 2) 擴充 get_adjusted_room_inventory_batch：若同民宿同日有任何 lock_whole_building 訂單,該日所有房型直接鎖
CREATE OR REPLACE FUNCTION public.get_adjusted_room_inventory_batch(p_room_type_id uuid, p_dates text[], p_accommodation_id uuid)
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
  v_whole_building_locked boolean;
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

    -- 新增：整棟保留/包棟旗標檢查（任何房型都會被鎖）
    SELECT EXISTS (
      SELECT 1 FROM orders o
      WHERE o.accommodation_id = p_accommodation_id
        AND o.order_status NOT IN ('cancelled')
        AND COALESCE(o.lock_whole_building, false) = true
        AND v_date::date >= o.check_in_date
        AND v_date::date < o.check_out_date
    ) INTO v_whole_building_locked;

    IF v_whole_building_locked THEN
      v_blocking_name := '包棟（整棟保留）';
    END IF;

    -- 散客房型 (is_bound_to_exclusive=true, is_exclusive_package=false)
    IF v_blocking_name IS NULL AND v_room_type.is_bound_to_exclusive = true AND COALESCE(v_room_type.is_exclusive_package, false) = false THEN
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

    ELSIF v_blocking_name IS NULL AND v_room_type.is_exclusive_package = true AND v_room_type.is_bound_to_exclusive = true THEN
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