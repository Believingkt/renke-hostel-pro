-- 添加社群媒體分享標題和描述欄位
ALTER TABLE public.accommodation_info
ADD COLUMN IF NOT EXISTS og_title TEXT,
ADD COLUMN IF NOT EXISTS og_description TEXT;

-- 添加註解說明欄位用途
COMMENT ON COLUMN public.accommodation_info.og_title IS '社群媒體分享標題 (Open Graph title)';
COMMENT ON COLUMN public.accommodation_info.og_description IS '社群媒體分享描述 (Open Graph description)';