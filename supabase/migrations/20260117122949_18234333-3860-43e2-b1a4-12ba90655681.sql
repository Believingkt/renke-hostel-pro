-- 為 accommodation_info 表新增排序欄位
ALTER TABLE public.accommodation_info 
ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;

-- 根據現有資料設定初始排序值（按建立時間）
WITH ordered_accommodations AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as new_order
  FROM public.accommodation_info
)
UPDATE public.accommodation_info 
SET display_order = ordered_accommodations.new_order
FROM ordered_accommodations
WHERE public.accommodation_info.id = ordered_accommodations.id;

-- 建立索引以加速排序查詢
CREATE INDEX IF NOT EXISTS idx_accommodation_info_display_order 
ON public.accommodation_info(display_order);