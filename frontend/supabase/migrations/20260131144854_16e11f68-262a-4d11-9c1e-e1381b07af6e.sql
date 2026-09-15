-- 為 pricing_templates 添加直接的價格欄位（一個模板 = 一個專案）
ALTER TABLE public.pricing_templates 
ADD COLUMN IF NOT EXISTS weekday_price integer,
ADD COLUMN IF NOT EXISTS weekend_price integer;

-- 添加欄位註解
COMMENT ON COLUMN public.pricing_templates.weekday_price IS '平日價格';
COMMENT ON COLUMN public.pricing_templates.weekend_price IS '假日價格';
COMMENT ON COLUMN public.pricing_templates.project_name IS '專案名稱';
COMMENT ON COLUMN public.pricing_templates.project_description IS '專案說明';