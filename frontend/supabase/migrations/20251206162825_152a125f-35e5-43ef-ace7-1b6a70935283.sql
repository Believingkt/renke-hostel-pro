
-- 修復 Security Definer View 問題
-- 將視圖改為使用 SECURITY INVOKER（預設行為）

-- 刪除並重建視圖，明確使用 SECURITY INVOKER
DROP VIEW IF EXISTS public.discount_codes_safe;

CREATE VIEW public.discount_codes_safe 
WITH (security_invoker = true)
AS
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
  -- 故意排除 api_key 欄位
FROM public.discount_codes;

-- 重新授權
GRANT SELECT ON public.discount_codes_safe TO authenticated;

-- 添加說明
COMMENT ON VIEW public.discount_codes_safe IS '安全視圖 - 排除敏感的 api_key 欄位，使用查詢者的權限';
