-- 在 accommodation_info 表新增主題預設欄位
-- 可選值: 'default' (綠色), 'warm' (橘色/米色), 'ocean' (藍色), 'elegant' (紫灰色)
ALTER TABLE public.accommodation_info 
ADD COLUMN theme_preset TEXT DEFAULT 'default';

-- 為現有的天頌幸福和苑設定 warm 主題
UPDATE public.accommodation_info 
SET theme_preset = 'warm' 
WHERE id = '4ee31aca-5641-4d05-80e2-1c67626be83d';