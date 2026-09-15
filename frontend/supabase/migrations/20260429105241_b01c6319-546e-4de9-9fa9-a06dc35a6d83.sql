
CREATE OR REPLACE FUNCTION public.get_adjusted_room_inventory_batch(p_room_type_id uuid, p_dates text[], p_accommodation_id uuid)
 RETURNS TABLE(date_value date, available_rooms integer, is_blocked boolean, blocked_by_room_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_room_type record;
  v_date text;
  v_booking_info record;
  v_original_available integer;
  v_booked_room record;
  v_self_booked_count integer;
BEGIN
  SELECT * INTO v_room_type
  FROM room_types
  WHERE id = p_room_type_id;
  
  FOREACH v_date IN ARRAY p_dates
  LOOP
    SELECT COALESCE(rip.available_rooms, 0)
    INTO v_original_available
    FROM room_inventory_pricing rip 
    WHERE rip.room_type_id = p_room_type_id AND rip.date = v_date::date;
    
    IF v_original_available IS NULL THEN
      v_original_available := 0;
    END IF;
    
    -- 計算當前房型於該日已被訂房的總間數
    -- 優先使用 order_rooms（多房）；若訂單無 order_rooms 才用 orders.room_type_id 視為 1 間
    SELECT COALESCE(SUM(cnt), 0)::int INTO v_self_booked_count
    FROM (
      -- order_rooms 明細
      SELECT orr.quantity AS cnt
      FROM order_rooms orr
      JOIN orders o ON orr.order_id = o.id
      WHERE o.accommodation_id = p_accommodation_id
        AND o.order_status NOT IN ('cancelled')
        AND v_date::date >= o.check_in_date
        AND v_date::date < o.check_out_date
        AND orr.room_type_id = p_room_type_id
      UNION ALL
      -- 沒有 order_rooms 的訂單，回退用 orders.room_type_id (1 間)
      SELECT 1 AS cnt
      FROM orders o
      WHERE o.accommodation_id = p_accommodation_id
        AND o.order_status NOT IN ('cancelled')
        AND v_date::date >= o.check_in_date
        AND v_date::date < o.check_out_date
        AND o.room_type_id = p_room_type_id
        AND NOT EXISTS (SELECT 1 FROM order_rooms orr2 WHERE orr2.order_id = o.id)
    ) t;
    
    IF v_room_type.is_exclusive_package = true OR v_room_type.is_bound_to_exclusive = true THEN
      SELECT * INTO v_booking_info
      FROM check_exclusive_room_booking(p_accommodation_id, v_date::date);
      
      IF v_booking_info.has_booking THEN
        SELECT is_exclusive_package, is_bound_to_exclusive, name
        INTO v_booked_room
        FROM room_types WHERE id = v_booking_info.booked_room_type_id;
        
        -- 已訂的是「包區」→ 所有互斥房型一律封鎖（自己也是 0）
        IF v_booked_room.is_exclusive_package = true THEN
          IF v_booking_info.booked_room_type_id = p_room_type_id THEN
            -- 自己是被訂的包區，扣掉真實已訂數
            date_value := v_date::date;
            available_rooms := GREATEST(v_original_available - v_self_booked_count, 0);
            is_blocked := false;
            blocked_by_room_name := NULL;
            RETURN NEXT;
            CONTINUE;
          ELSE
            date_value := v_date::date;
            available_rooms := 0;
            is_blocked := true;
            blocked_by_room_name := v_booking_info.booked_room_type_name;
            RETURN NEXT;
            CONTINUE;
          END IF;
        ELSIF v_booked_room.is_bound_to_exclusive = true THEN
          -- 已訂的是綁定包區的散客房：只封鎖「包區房型」
          IF v_room_type.is_exclusive_package = true THEN
            date_value := v_date::date;
            available_rooms := 0;
            is_blocked := true;
            blocked_by_room_name := v_booking_info.booked_room_type_name;
            RETURN NEXT;
            CONTINUE;
          END IF;
          -- 否則散客房之間互不鎖，跑到下方一般扣除邏輯
        END IF;
      END IF;
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
