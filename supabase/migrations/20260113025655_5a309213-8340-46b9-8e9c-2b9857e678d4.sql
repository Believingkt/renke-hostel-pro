-- =====================================================
-- 安全性強化遷移：保護敏感資料
-- =====================================================

-- 1. 為 discount_codes 創建一個安全視圖，排除敏感欄位
-- 已存在 discount_codes_safe 視圖，確認其排除敏感欄位
DROP VIEW IF EXISTS public.discount_codes_safe;

CREATE VIEW public.discount_codes_safe AS
SELECT 
  id,
  accommodation_id,
  name,
  code,
  discount_type,
  discount_value,
  usage_limit,
  used_count,
  valid_from,
  valid_until,
  is_active,
  min_order_amount,
  applicable_room_types,
  applicable_date_from,
  applicable_date_to,
  display_order,
  commission_rate,
  created_at,
  updated_at
  -- 注意：排除 api_key, webhook_url, webhook_secret, webhook_enabled
FROM public.discount_codes;

-- 2. 為 orders 表增加額外的驗證
-- 創建一個函數來驗證訂單插入的合法性（防止垃圾訂單）
CREATE OR REPLACE FUNCTION public.validate_order_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 確保 accommodation_id 存在且有效
  IF NOT EXISTS (
    SELECT 1 FROM public.accommodation_info 
    WHERE id = NEW.accommodation_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Invalid accommodation_id';
  END IF;
  
  -- 確保 room_type_id 存在且屬於該 accommodation（如果有提供）
  IF NEW.room_type_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.room_types 
    WHERE id = NEW.room_type_id AND accommodation_id = NEW.accommodation_id
  ) THEN
    RAISE EXCEPTION 'Invalid room_type_id';
  END IF;
  
  -- 確保必要欄位不為空
  IF NEW.guest_name IS NULL OR NEW.guest_name = '' THEN
    RAISE EXCEPTION 'Guest name is required';
  END IF;
  
  IF NEW.guest_phone IS NULL OR NEW.guest_phone = '' THEN
    RAISE EXCEPTION 'Guest phone is required';
  END IF;
  
  -- 確保日期邏輯正確
  IF NEW.check_out_date <= NEW.check_in_date THEN
    RAISE EXCEPTION 'Check-out date must be after check-in date';
  END IF;
  
  -- 確保價格合理
  IF NEW.total_price < 0 OR NEW.final_price < 0 THEN
    RAISE EXCEPTION 'Price cannot be negative';
  END IF;
  
  RETURN NEW;
END;
$$;

-- 創建觸發器
DROP TRIGGER IF EXISTS validate_order_before_insert ON public.orders;
CREATE TRIGGER validate_order_before_insert
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_order_insert();

-- 3. 創建一個只返回非敏感欄位的函數，供前端使用折扣碼驗證
CREATE OR REPLACE FUNCTION public.get_public_discount_code_info(
  p_accommodation_id uuid,
  p_code text
)
RETURNS TABLE(
  code text,
  discount_type text,
  discount_value integer,
  min_order_amount integer,
  applicable_date_from date,
  applicable_date_to date,
  applicable_room_types jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    dc.code,
    dc.discount_type,
    dc.discount_value,
    dc.min_order_amount,
    dc.applicable_date_from,
    dc.applicable_date_to,
    dc.applicable_room_types
  FROM public.discount_codes dc
  WHERE dc.accommodation_id = p_accommodation_id
    AND dc.code = p_code
    AND dc.is_active = true
    AND dc.valid_from <= now()
    AND (dc.valid_until IS NULL OR dc.valid_until >= now())
    AND (dc.usage_limit = 0 OR dc.used_count < dc.usage_limit);
$$;