-- 更新檢查互斥訂單的函數，實現雙向鎖定邏輯
-- 當 is_exclusive_package 或 is_bound_to_exclusive 的房型被預訂時，
-- 所有 is_exclusive_package 或 is_bound_to_exclusive 的房型都會被鎖定

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
    AND (rt.is_exclusive_package = true OR rt.is_bound_to_exclusive = true)  -- 雙向鎖定：包棟或綁定包棟的房型都會觸發互斥
  LIMIT 1;
  
  -- 如果沒有找到訂單，返回 false
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.check_exclusive_room_booking IS '檢查特定日期是否已有包棟或綁定包棟房型的訂單（雙向鎖定邏輯）';