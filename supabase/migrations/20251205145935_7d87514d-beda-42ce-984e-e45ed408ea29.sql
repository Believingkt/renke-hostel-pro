-- 移除 pricing_templates 表中的舊版價格欄位
-- 這些欄位已被 meal_plans JSON 欄位取代

ALTER TABLE public.pricing_templates 
  DROP COLUMN IF EXISTS weekday_price,
  DROP COLUMN IF EXISTS weekend_price,
  DROP COLUMN IF EXISTS weekday_2_meals_price,
  DROP COLUMN IF EXISTS weekday_3_meals_price,
  DROP COLUMN IF EXISTS weekend_2_meals_price,
  DROP COLUMN IF EXISTS weekend_3_meals_price;