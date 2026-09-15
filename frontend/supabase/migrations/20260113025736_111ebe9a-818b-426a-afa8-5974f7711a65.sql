-- 修復 Security Definer View 問題
-- 將視圖改為普通視圖，並添加 RLS 政策來控制訪問

-- 刪除舊的安全視圖
DROP VIEW IF EXISTS public.discount_codes_safe;

-- 創建普通視圖（不使用 SECURITY DEFINER）
CREATE VIEW public.discount_codes_safe 
WITH (security_invoker = true) AS
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
  -- 排除敏感欄位：api_key, webhook_url, webhook_secret, webhook_enabled
FROM public.discount_codes;