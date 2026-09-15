-- 創建函數：檢查特定日期是否已有互斥房型的訂單
CREATE OR REPLACE FUNCTION check_exclusive_room_booking(
  p_accommodation_id uuid,
  p_date date
)
RETURNS TABLE(
  has_booking boolean,
  booked_room_type_id uuid,
  booked_room_type_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
    AND rt.name IN ('12人包區', '14人包區', '16人包區', '18人包區')
  LIMIT 1;
  
  -- 如果沒有找到訂單，返回 false
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text;
  END IF;
END;
$$;

-- 創建函數：獲取調整後的庫存（考慮互斥邏輯）
CREATE OR REPLACE FUNCTION get_adjusted_room_inventory(
  p_room_type_id uuid,
  p_date date,
  p_accommodation_id uuid
)
RETURNS TABLE(
  available_rooms integer,
  is_blocked boolean,
  blocked_by_room_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_name text;
  v_original_available integer;
  v_booking_info record;
BEGIN
  -- 獲取房型名稱和原始庫存
  SELECT rt.name, COALESCE(rip.available_rooms, 0)
  INTO v_room_name, v_original_available
  FROM room_types rt
  LEFT JOIN room_inventory_pricing rip 
    ON rip.room_type_id = rt.id AND rip.date = p_date
  WHERE rt.id = p_room_type_id;
  
  -- 檢查是否為互斥房型
  IF v_room_name IN ('12人包區', '14人包區', '16人包區', '18人包區') THEN
    -- 檢查該日期是否已有其他互斥房型的訂單
    SELECT * INTO v_booking_info
    FROM check_exclusive_room_booking(p_accommodation_id, p_date);
    
    IF v_booking_info.has_booking THEN
      -- 檢查是否是當前房型被預訂
      IF v_booking_info.booked_room_type_id = p_room_type_id THEN
        -- 當前房型被預訂，返回原始庫存減1
        RETURN QUERY SELECT 
          GREATEST(v_original_available - 1, 0),
          false,
          NULL::text;
      ELSE
        -- 其他互斥房型被預訂，庫存設為0
        RETURN QUERY SELECT 
          0,
          true,
          v_booking_info.booked_room_type_name;
      END IF;
      RETURN;
    END IF;
  END IF;
  
  -- 不是互斥房型或沒有互斥訂單，返回原始庫存
  RETURN QUERY SELECT 
    v_original_available,
    false,
    NULL::text;
END;
$$;

COMMENT ON FUNCTION check_exclusive_room_booking IS '檢查特定日期是否已有12人、14人、16人或18人包區的訂單';
COMMENT ON FUNCTION get_adjusted_room_inventory IS '獲取考慮互斥邏輯後的房間庫存';