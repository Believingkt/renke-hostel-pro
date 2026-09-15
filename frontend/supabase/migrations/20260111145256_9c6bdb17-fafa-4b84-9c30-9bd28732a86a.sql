-- 新增自訂網域欄位到 accommodation_info 表
ALTER TABLE public.accommodation_info 
ADD COLUMN IF NOT EXISTS custom_domain TEXT UNIQUE;

-- 建立索引以加速網域查詢
CREATE INDEX IF NOT EXISTS idx_accommodation_custom_domain 
ON public.accommodation_info(custom_domain) 
WHERE custom_domain IS NOT NULL;

-- 新增註解說明
COMMENT ON COLUMN public.accommodation_info.custom_domain IS '民宿的自訂網域，例如 sensaninn.com';