CREATE OR REPLACE FUNCTION public.check_exclusive_room_booking(p_accommodation_id uuid, p_date date)
 RETURNS TABLE(has_booking boolean, booked_room_type_id uuid, booked_room_type_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- 1) 優先檢查 order_rooms 多房明細（資料最準確）
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
  ORDER BY rt.is_exclusive_package DESC  -- 包區優先於散客房
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  -- 2) 退回檢查 orders.room_type_id（沒有 order_rooms 明細的舊訂單）
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
    AND NOT EXISTS (SELECT 1 FROM order_rooms orr2 WHERE orr2.order_id = o.id)
  ORDER BY rt.is_exclusive_package DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text;
  END IF;
END;
$function$;