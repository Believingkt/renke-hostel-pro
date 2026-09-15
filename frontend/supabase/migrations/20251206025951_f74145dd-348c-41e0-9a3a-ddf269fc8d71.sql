-- Create a batch version of get_adjusted_room_inventory for better performance
CREATE OR REPLACE FUNCTION public.get_adjusted_room_inventory_batch(
  p_room_type_id uuid,
  p_dates text[],
  p_accommodation_id uuid
)
RETURNS TABLE (
  date_value date,
  available_rooms integer,
  is_blocked boolean,
  blocked_by_room_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_name text;
  v_date text;
  v_booking_info record;
  v_original_available integer;
BEGIN
  -- 獲取房型名稱
  SELECT rt.name INTO v_room_name
  FROM room_types rt
  WHERE rt.id = p_room_type_id;
  
  -- 對每個日期進行處理
  FOREACH v_date IN ARRAY p_dates
  LOOP
    -- 獲取原始庫存
    SELECT COALESCE(rip.available_rooms, 0)
    INTO v_original_available
    FROM room_inventory_pricing rip 
    WHERE rip.room_type_id = p_room_type_id AND rip.date = v_date::date;
    
    IF v_original_available IS NULL THEN
      v_original_available := 0;
    END IF;
    
    -- 檢查是否為互斥房型
    IF v_room_name IN ('12人包區', '14人包區', '16人包區', '18人包區') THEN
      -- 檢查該日期是否已有其他互斥房型的訂單
      SELECT * INTO v_booking_info
      FROM check_exclusive_room_booking(p_accommodation_id, v_date::date);
      
      IF v_booking_info.has_booking THEN
        -- 檢查是否是當前房型被預訂
        IF v_booking_info.booked_room_type_id = p_room_type_id THEN
          -- 當前房型被預訂，返回原始庫存減1
          date_value := v_date::date;
          available_rooms := GREATEST(v_original_available - 1, 0);
          is_blocked := false;
          blocked_by_room_name := NULL;
          RETURN NEXT;
          CONTINUE;
        ELSE
          -- 其他互斥房型被預訂，庫存設為0
          date_value := v_date::date;
          available_rooms := 0;
          is_blocked := true;
          blocked_by_room_name := v_booking_info.booked_room_type_name;
          RETURN NEXT;
          CONTINUE;
        END IF;
      END IF;
    END IF;
    
    -- 不是互斥房型或沒有互斥訂單，返回原始庫存
    date_value := v_date::date;
    available_rooms := v_original_available;
    is_blocked := false;
    blocked_by_room_name := NULL;
    RETURN NEXT;
  END LOOP;
END;
$$;