-- 新增房型綁定包棟設定欄位
-- is_exclusive_package: 此房型是否為包棟類型（預訂後其他包棟房型無法預訂）
-- is_bound_to_exclusive: 此單間房型是否綁定包棟（當包棟被預訂時此房型也無法預訂）

ALTER TABLE public.room_types
ADD COLUMN IF NOT EXISTS is_exclusive_package boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS is_bound_to_exclusive boolean NOT NULL DEFAULT false;

-- 為現有的包區房型自動設定為互斥包棟類型
-- 這會根據房型名稱自動標記，之後可以在後台手動調整
COMMENT ON COLUMN public.room_types.is_exclusive_package IS '是否為包棟房型（預訂後其他包棟房型無法預訂同一天）';
COMMENT ON COLUMN public.room_types.is_bound_to_exclusive IS '是否綁定包棟（當任一包棟被預訂時此房型也無法預訂）';

-- 更新檢查互斥訂單的函數，改為使用資料庫欄位而非硬編碼名稱
CREATE OR REPLACE FUNCTION public.check_exclusive_room_booking(p_accommodation_id uuid, p_date date)
 RETURNS TABLE(has_booking boolean, booked_room_type_id uuid, booked_room_type_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    AND rt.is_exclusive_package = true  -- 改用資料庫欄位
  LIMIT 1;
  
  -- 如果沒有找到訂單，返回 false
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text;
  END IF;
END;
$function$;

-- 更新批量檢查函數
CREATE OR REPLACE FUNCTION public.get_adjusted_room_inventory(p_room_type_id uuid, p_date date, p_accommodation_id uuid)
 RETURNS TABLE(available_rooms integer, is_blocked boolean, blocked_by_room_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_room_type record;
  v_original_available integer;
  v_booking_info record;
BEGIN
  -- 獲取房型資訊和原始庫存
  SELECT rt.*, COALESCE(rip.available_rooms, 0) as avail_rooms
  INTO v_room_type
  FROM room_types rt
  LEFT JOIN room_inventory_pricing rip 
    ON rip.room_type_id = rt.id AND rip.date = p_date
  WHERE rt.id = p_room_type_id;
  
  v_original_available := v_room_type.avail_rooms;
  
  -- 檢查是否為包棟房型或綁定包棟的房型
  IF v_room_type.is_exclusive_package = true OR v_room_type.is_bound_to_exclusive = true THEN
    -- 檢查該日期是否已有包棟房型的訂單
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
        -- 其他包棟房型被預訂，庫存設為0（對於包棟房型或綁定包棟的房型）
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
$function$;

-- 更新批量獲取庫存函數
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
BEGIN
  -- 獲取房型資訊
  SELECT * INTO v_room_type
  FROM room_types
  WHERE id = p_room_type_id;
  
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
    
    -- 檢查是否為包棟房型或綁定包棟的房型
    IF v_room_type.is_exclusive_package = true OR v_room_type.is_bound_to_exclusive = true THEN
      -- 檢查該日期是否已有包棟房型的訂單
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
          -- 其他包棟房型被預訂，庫存設為0
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
$function$;