
-- Fix: exclusive packages should NOT block other exclusive packages (different buildings)
-- Each exclusive only blocks itself + its bound common rooms (via bound_exclusive_ids).

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
  v_blocking record;
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

    -- 自身已訂數
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

    -- 互斥檢查：只在「查詢的房型與其他互斥房型有實際綁定關係」時才封鎖
    -- 規則：
    -- A) 若查詢的是「散客房」(is_bound_to_exclusive)，當其綁定的某個包區當日有訂單 → 封鎖
    -- B) 若查詢的是「包區」(is_exclusive_package)，當其旗下任一綁定散客房當日有訂單 → 封鎖
    -- 不同包區（不同棟）之間互不封鎖。
    v_blocking := NULL;

    IF v_room_type.is_bound_to_exclusive = true 
       AND v_room_type.bound_exclusive_ids IS NOT NULL 
       AND array_length(v_room_type.bound_exclusive_ids, 1) > 0 THEN
      -- 散客房：檢查其綁定的包區是否有訂單
      SELECT rt.name AS booked_room_type_name INTO v_blocking
      FROM (
        SELECT orr.room_type_id
        FROM order_rooms orr
        JOIN orders o ON orr.order_id = o.id
        WHERE o.accommodation_id = p_accommodation_id
          AND o.order_status NOT IN ('cancelled')
          AND v_date::date >= o.check_in_date
          AND v_date::date < o.check_out_date
          AND orr.room_type_id = ANY(v_room_type.bound_exclusive_ids)
        UNION
        SELECT o.room_type_id
        FROM orders o
        WHERE o.accommodation_id = p_accommodation_id
          AND o.order_status NOT IN ('cancelled')
          AND v_date::date >= o.check_in_date
          AND v_date::date < o.check_out_date
          AND o.room_type_id = ANY(v_room_type.bound_exclusive_ids)
          AND NOT EXISTS (SELECT 1 FROM order_rooms orr2 WHERE orr2.order_id = o.id)
      ) booked
      JOIN room_types rt ON rt.id = booked.room_type_id
      LIMIT 1;
    ELSIF v_room_type.is_exclusive_package = true THEN
      -- 包區：檢查綁定到自己的散客房是否有訂單
      SELECT rt.name AS booked_room_type_name INTO v_blocking
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
        AND rt.bound_exclusive_ids IS NOT NULL
        AND p_room_type_id = ANY(rt.bound_exclusive_ids)
      LIMIT 1;
    END IF;

    IF v_blocking IS NOT NULL AND v_blocking.booked_room_type_name IS NOT NULL THEN
      date_value := v_date::date;
      available_rooms := 0;
      is_blocked := true;
      blocked_by_room_name := v_blocking.booked_room_type_name;
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- 一般邏輯：原始庫存 - 已訂數
    date_value := v_date::date;
    available_rooms := GREATEST(v_original_available - v_self_booked_count, 0);
    is_blocked := false;
    blocked_by_room_name := NULL;
    RETURN NEXT;
  END LOOP;
END;
$function$;
