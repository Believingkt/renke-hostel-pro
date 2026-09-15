-- Update validate_discount_code functions to use explicit column selection instead of SELECT *

-- Drop existing functions first
DROP FUNCTION IF EXISTS public.validate_discount_code(text, uuid);
DROP FUNCTION IF EXISTS public.validate_discount_code(text, uuid, integer, uuid, date);

-- Recreate the simple version with explicit column selection
CREATE OR REPLACE FUNCTION public.validate_discount_code(p_code text, p_accommodation_id uuid)
 RETURNS TABLE(is_valid boolean, discount_type text, discount_value integer, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_discount_type text;
  v_discount_value integer;
  v_valid_from timestamptz;
  v_valid_until timestamptz;
  v_used_count integer;
  v_usage_limit integer;
  v_is_active boolean;
BEGIN
  -- Query with explicit column selection (excluding api_key and other sensitive fields)
  SELECT 
    dc.id, dc.discount_type, dc.discount_value, 
    dc.valid_from, dc.valid_until, dc.used_count, 
    dc.usage_limit, dc.is_active
  INTO 
    v_id, v_discount_type, v_discount_value,
    v_valid_from, v_valid_until, v_used_count,
    v_usage_limit, v_is_active
  FROM public.discount_codes dc
  WHERE dc.code = UPPER(p_code)
    AND dc.accommodation_id = p_accommodation_id
    AND dc.is_active = true;
  
  -- Check if exists
  IF v_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '折扣碼不存在或已停用'::TEXT;
    RETURN;
  END IF;
  
  -- Check if expired
  IF v_valid_until IS NOT NULL AND v_valid_until < NOW() THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '折扣碼已過期'::TEXT;
    RETURN;
  END IF;
  
  -- Check if not yet valid
  IF v_valid_from > NOW() THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '折扣碼尚未生效'::TEXT;
    RETURN;
  END IF;
  
  -- Check usage count
  IF v_used_count >= v_usage_limit THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '折扣碼使用次數已達上限'::TEXT;
    RETURN;
  END IF;
  
  -- Valid
  RETURN QUERY SELECT 
    true, 
    v_discount_type, 
    v_discount_value,
    '折扣碼有效'::TEXT;
END;
$function$;

-- Recreate the extended version with explicit column selection
CREATE OR REPLACE FUNCTION public.validate_discount_code(p_code text, p_accommodation_id uuid, p_order_amount integer DEFAULT 0, p_room_type_id uuid DEFAULT NULL::uuid, p_check_in_date date DEFAULT NULL::date)
 RETURNS TABLE(is_valid boolean, discount_type text, discount_value integer, message text, applicable_room_names text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_discount_type text;
  v_discount_value integer;
  v_valid_from timestamptz;
  v_valid_until timestamptz;
  v_used_count integer;
  v_usage_limit integer;
  v_min_order_amount integer;
  v_applicable_room_types jsonb;
  v_applicable_date_from date;
  v_applicable_date_to date;
  v_room_names text[];
BEGIN
  -- Query with explicit column selection (excluding api_key and other sensitive fields)
  SELECT 
    dc.id, dc.discount_type, dc.discount_value, 
    dc.valid_from, dc.valid_until, dc.used_count, 
    dc.usage_limit, dc.min_order_amount, dc.applicable_room_types,
    dc.applicable_date_from, dc.applicable_date_to
  INTO 
    v_id, v_discount_type, v_discount_value,
    v_valid_from, v_valid_until, v_used_count,
    v_usage_limit, v_min_order_amount, v_applicable_room_types,
    v_applicable_date_from, v_applicable_date_to
  FROM public.discount_codes dc
  WHERE dc.code = UPPER(p_code)
    AND dc.accommodation_id = p_accommodation_id
    AND dc.is_active = true;
  
  -- Check if exists
  IF v_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '折扣碼不存在或已停用'::TEXT, NULL::text[];
    RETURN;
  END IF;
  
  -- Check if expired
  IF v_valid_until IS NOT NULL AND v_valid_until < NOW() THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '折扣碼已過期'::TEXT, NULL::text[];
    RETURN;
  END IF;
  
  -- Check if not yet valid
  IF v_valid_from > NOW() THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '折扣碼尚未生效'::TEXT, NULL::text[];
    RETURN;
  END IF;
  
  -- Check usage count
  IF v_used_count >= v_usage_limit THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '折扣碼使用次數已達上限'::TEXT, NULL::text[];
    RETURN;
  END IF;
  
  -- Check minimum order amount
  IF v_min_order_amount > 0 AND p_order_amount > 0 AND p_order_amount < v_min_order_amount THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '訂單金額未達最低消費 NT$ ' || v_min_order_amount::TEXT, NULL::text[];
    RETURN;
  END IF;
  
  -- Check applicable room types
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
    IF v_applicable_date_from IS NOT NULL AND p_check_in_date < v_applicable_date_from THEN
      RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '此折扣碼不適用於所選入住日期'::TEXT, NULL::text[];
      RETURN;
    END IF;
    
    IF v_applicable_date_to IS NOT NULL AND p_check_in_date > v_applicable_date_to THEN
      RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '此折扣碼不適用於所選入住日期'::TEXT, NULL::text[];
      RETURN;
    END IF;
  END IF;
  
  -- Valid
  RETURN QUERY SELECT 
    true, 
    v_discount_type, 
    v_discount_value,
    '折扣碼有效'::TEXT,
    NULL::text[];
END;
$function$;