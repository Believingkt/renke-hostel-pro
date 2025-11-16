-- Add applicable conditions columns to discount_codes table
ALTER TABLE public.discount_codes
ADD COLUMN min_order_amount INTEGER DEFAULT 0,
ADD COLUMN applicable_room_types JSONB DEFAULT '[]'::JSONB,
ADD COLUMN applicable_date_from DATE,
ADD COLUMN applicable_date_to DATE;

-- Add comment for clarity
COMMENT ON COLUMN public.discount_codes.min_order_amount IS 'Minimum order amount required to use this discount code (0 means no minimum)';
COMMENT ON COLUMN public.discount_codes.applicable_room_types IS 'Array of room_type_ids that this discount applies to (empty array means all room types)';
COMMENT ON COLUMN public.discount_codes.applicable_date_from IS 'Start date for applicable booking dates (null means no restriction)';
COMMENT ON COLUMN public.discount_codes.applicable_date_to IS 'End date for applicable booking dates (null means no restriction)';

-- Update validate_discount_code function to check new conditions
CREATE OR REPLACE FUNCTION public.validate_discount_code(
  p_code TEXT,
  p_accommodation_id UUID,
  p_order_amount INTEGER DEFAULT 0,
  p_room_type_id UUID DEFAULT NULL,
  p_check_in_date DATE DEFAULT NULL
)
RETURNS TABLE(
  is_valid BOOLEAN,
  discount_type TEXT,
  discount_value INTEGER,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_discount_code public.discount_codes;
  v_applicable_room_types JSONB;
BEGIN
  -- Find discount code
  SELECT * INTO v_discount_code
  FROM public.discount_codes
  WHERE code = UPPER(p_code)
    AND accommodation_id = p_accommodation_id
    AND is_active = true;
  
  -- Check if exists
  IF v_discount_code.id IS NULL THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '折扣碼不存在或已停用'::TEXT;
    RETURN;
  END IF;
  
  -- Check if expired
  IF v_discount_code.valid_until IS NOT NULL AND v_discount_code.valid_until < NOW() THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '折扣碼已過期'::TEXT;
    RETURN;
  END IF;
  
  -- Check if not yet valid
  IF v_discount_code.valid_from > NOW() THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '折扣碼尚未生效'::TEXT;
    RETURN;
  END IF;
  
  -- Check usage count
  IF v_discount_code.used_count >= v_discount_code.usage_limit THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '折扣碼使用次數已達上限'::TEXT;
    RETURN;
  END IF;
  
  -- Check minimum order amount
  IF v_discount_code.min_order_amount > 0 AND p_order_amount > 0 AND p_order_amount < v_discount_code.min_order_amount THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '訂單金額未達最低消費 NT$ ' || v_discount_code.min_order_amount::TEXT;
    RETURN;
  END IF;
  
  -- Check applicable room types
  v_applicable_room_types := v_discount_code.applicable_room_types;
  IF v_applicable_room_types IS NOT NULL 
     AND jsonb_array_length(v_applicable_room_types) > 0 
     AND p_room_type_id IS NOT NULL THEN
    IF NOT (v_applicable_room_types @> to_jsonb(p_room_type_id::TEXT)) THEN
      RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '此折扣碼不適用於所選房型'::TEXT;
      RETURN;
    END IF;
  END IF;
  
  -- Check applicable date range
  IF p_check_in_date IS NOT NULL THEN
    IF v_discount_code.applicable_date_from IS NOT NULL AND p_check_in_date < v_discount_code.applicable_date_from THEN
      RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '此折扣碼不適用於所選入住日期'::TEXT;
      RETURN;
    END IF;
    
    IF v_discount_code.applicable_date_to IS NOT NULL AND p_check_in_date > v_discount_code.applicable_date_to THEN
      RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '此折扣碼不適用於所選入住日期'::TEXT;
      RETURN;
    END IF;
  END IF;
  
  -- Valid
  RETURN QUERY SELECT 
    true, 
    v_discount_code.discount_type, 
    v_discount_code.discount_value,
    '折扣碼有效'::TEXT;
END;
$$;