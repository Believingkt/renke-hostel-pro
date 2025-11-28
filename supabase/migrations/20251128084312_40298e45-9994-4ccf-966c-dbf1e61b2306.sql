-- 為 pricing_template_applications 表新增國定假日統計欄位
ALTER TABLE public.pricing_template_applications
ADD COLUMN holiday_affected_count integer DEFAULT 0,
ADD COLUMN work_on_weekend_count integer DEFAULT 0;

COMMENT ON COLUMN public.pricing_template_applications.holiday_affected_count IS '受國定假日和補休日影響而使用假日價格的日期數量';
COMMENT ON COLUMN public.pricing_template_applications.work_on_weekend_count IS '補班日而使用平日價格的日期數量';