
-- 更新 check_exclusive_room_booking：也檢查綁定包區的訂單（散客房）
-- 當 is_bound_to_exclusive 房型被訂時，也視為「該日已有獨佔型訂單」，封鎖其他互斥房型
CREATE OR REPLACE FUNCTION public.check_exclusive_room_booking(p_accommodation_id uuid, p_date date)
 RETURNS TABLE(has_booking boolean, booked_room_type_id uuid, booked_room_type_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- 1) 先檢查 orders.room_type_id 上的訂單
  RETURN QUERY
  SELECT
    true as has_booking,
    o.room_type_id as booked_room_type_id,
    rt.name as booked_room_type_name
  FROM orders o
  JOIN room_types rt ON o.room_type_id = rt.id
  WHERE o.accommodation_id = p_accommodation_id
    AND o.order_status NOT IN ('cancelled')
    AND p_date >= o.check_in_date
    AND p_date < o.check_out_date
    AND (rt.is_exclusive_package = true OR rt.is_bound_to_exclusive = true)
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  -- 2) 檢查 order_rooms 多房訂單
  RETURN QUERY
  SELECT
    true as has_booking,
    orr.room_type_id as booked_room_type_id,
    rt.name as booked_room_type_name
  FROM order_rooms orr
  JOIN orders o ON orr.order_id = o.id
  JOIN room_types rt ON orr.room_type_id = rt.id
  WHERE o.accommodation_id = p_accommodation_id
    AND o.order_status NOT IN ('cancelled')
    AND p_date >= o.check_in_date
    AND p_date < o.check_out_date
    AND (rt.is_exclusive_package = true OR rt.is_bound_to_exclusive = true)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text;
  END IF;
END;
$function$;

-- 更新 get_adjusted_room_inventory_batch：
-- 當該日有「散客房（is_bound_to_exclusive=true 且 is_exclusive_package=false）」訂單時，
-- 包區房型（is_exclusive_package=true）必須顯示為 0 並標記為 blocked
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
    
    IF v_room_type.is_exclusive_package = true OR v_room_type.is_bound_to_exclusive = true THEN
      SELECT * INTO v_booking_info
      FROM check_exclusive_room_booking(p_accommodation_id, v_date::date);
      
      IF v_booking_info.has_booking THEN
        -- 取得已訂房型的屬性
        SELECT is_exclusive_package, is_bound_to_exclusive, name
        INTO v_booked_room
        FROM room_types WHERE id = v_booking_info.booked_room_type_id;
        
        IF v_booking_info.booked_room_type_id = p_room_type_id THEN
          -- 自己被訂，扣 1
          date_value := v_date::date;
          available_rooms := GREATEST(v_original_available - 1, 0);
          is_blocked := false;
          blocked_by_room_name := NULL;
          RETURN NEXT;
          CONTINUE;
        ELSE
          -- 規則：
          -- (a) 已訂的是 包區（is_exclusive_package=true）→ 封鎖所有其他互斥房型
          -- (b) 已訂的是 綁定包區的散客房（is_bound_to_exclusive=true 且非包區）
          --     → 只封鎖「包區房型」(is_exclusive_package=true)，
          --       其他散客房不互鎖（仍可繼續售）
          IF v_booked_room.is_exclusive_package = true THEN
            date_value := v_date::date;
            available_rooms := 0;
            is_blocked := true;
            blocked_by_room_name := v_booking_info.booked_room_type_name;
            RETURN NEXT;
            CONTINUE;
          ELSIF v_booked_room.is_bound_to_exclusive = true 
                AND v_room_type.is_exclusive_package = true THEN
            date_value := v_date::date;
            available_rooms := 0;
            is_blocked := true;
            blocked_by_room_name := v_booking_info.booked_room_type_name;
            RETURN NEXT;
            CONTINUE;
          END IF;
        END IF;
      END IF;
    END IF;
    
    date_value := v_date::date;
    available_rooms := v_original_available;
    is_blocked := false;
    blocked_by_room_name := NULL;
    RETURN NEXT;
  END LOOP;
END;
$function$;
