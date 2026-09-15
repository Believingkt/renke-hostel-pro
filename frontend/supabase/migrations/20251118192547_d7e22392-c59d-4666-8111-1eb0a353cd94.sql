-- 刪除舊的 validate_discount_code 函數
DROP FUNCTION IF EXISTS public.validate_discount_code(text, uuid, integer, uuid, date);

-- 創建新的 validate_discount_code 函數，返回更詳細的錯誤訊息，包含可使用的房型名稱
CREATE OR REPLACE FUNCTION public.validate_discount_code(
  p_code text, 
  p_accommodation_id uuid, 
  p_order_amount integer DEFAULT 0, 
  p_room_type_id uuid DEFAULT NULL::uuid, 
  p_check_in_date date DEFAULT NULL::date
)
RETURNS TABLE(is_valid boolean, discount_type text, discount_value integer, message text, applicable_room_names text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_discount_code public.discount_codes;
  v_applicable_room_types JSONB;
  v_room_names text[];
BEGIN
  -- Find discount code
  SELECT * INTO v_discount_code
  FROM public.discount_codes
  WHERE code = UPPER(p_code)
    AND accommodation_id = p_accommodation_id
    AND is_active = true;
  
  -- Check if exists
  IF v_discount_code.id IS NULL THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '折扣碼不存在或已停用'::TEXT, NULL::text[];
    RETURN;
  END IF;
  
  -- Check if expired
  IF v_discount_code.valid_until IS NOT NULL AND v_discount_code.valid_until < NOW() THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '折扣碼已過期'::TEXT, NULL::text[];
    RETURN;
  END IF;
  
  -- Check if not yet valid
  IF v_discount_code.valid_from > NOW() THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '折扣碼尚未生效'::TEXT, NULL::text[];
    RETURN;
  END IF;
  
  -- Check usage count
  IF v_discount_code.used_count >= v_discount_code.usage_limit THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '折扣碼使用次數已達上限'::TEXT, NULL::text[];
    RETURN;
  END IF;
  
  -- Check minimum order amount
  IF v_discount_code.min_order_amount > 0 AND p_order_amount > 0 AND p_order_amount < v_discount_code.min_order_amount THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '訂單金額未達最低消費 NT$ ' || v_discount_code.min_order_amount::TEXT, NULL::text[];
    RETURN;
  END IF;
  
  -- Check applicable room types
  v_applicable_room_types := v_discount_code.applicable_room_types;
  IF v_applicable_room_types IS NOT NULL 
     AND jsonb_array_length(v_applicable_room_types) > 0 
     AND p_room_type_id IS NOT NULL THEN
    
    IF NOT (v_applicable_room_types @> to_jsonb(p_room_type_id::TEXT)) THEN
      -- Get room names for applicable room types
      SELECT array_agg(name) INTO v_room_names
      FROM room_types
      WHERE id::text = ANY(
        SELECT jsonb_array_elements_text(v_applicable_room_types)
      );
      
      RETURN QUERY SELECT 
        false, 
        NULL::TEXT, 
        NULL::INTEGER, 
        '此折扣碼不適用於所選房型'::TEXT,
        v_room_names;
      RETURN;
    END IF;
  END IF;
  
  -- Check applicable date range
  IF p_check_in_date IS NOT NULL THEN
    IF v_discount_code.applicable_date_from IS NOT NULL AND p_check_in_date < v_discount_code.applicable_date_from THEN
      RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '此折扣碼不適用於所選入住日期'::TEXT, NULL::text[];
      RETURN;
    END IF;
    
    IF v_discount_code.applicable_date_to IS NOT NULL AND p_check_in_date > v_discount_code.applicable_date_to THEN
      RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '此折扣碼不適用於所選入住日期'::TEXT, NULL::text[];
      RETURN;
    END IF;
  END IF;
  
  -- Valid
  RETURN QUERY SELECT 
    true, 
    v_discount_code.discount_type, 
    v_discount_code.discount_value,
    '折扣碼有效'::TEXT,
    NULL::text[];
END;
$$;