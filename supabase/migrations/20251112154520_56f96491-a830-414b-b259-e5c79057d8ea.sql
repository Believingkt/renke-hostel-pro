-- 為訂單表添加加購方案相關欄位
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS pet_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS pet_plan_price integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS meal_plan_details jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS meal_plan_total integer DEFAULT 0;

-- 添加註解
COMMENT ON COLUMN public.orders.pet_count IS '寵物數量';
COMMENT ON COLUMN public.orders.pet_plan_price IS '寵物方案總價';
COMMENT ON COLUMN public.orders.meal_plan_details IS '餐食方案明細（JSON格式：[{date, count, pricePerUnit, price}]）';
COMMENT ON COLUMN public.orders.meal_plan_total IS '餐食方案總價';