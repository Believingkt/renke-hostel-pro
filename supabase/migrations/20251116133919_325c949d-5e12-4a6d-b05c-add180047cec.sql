-- 為 accommodation_photos 表添加文字欄位
ALTER TABLE public.accommodation_photos 
ADD COLUMN IF NOT EXISTS title text,
ADD COLUMN IF NOT EXISTS subtitle text,
ADD COLUMN IF NOT EXISTS cta_text text,
ADD COLUMN IF NOT EXISTS cta_link text;

-- 添加註釋說明
COMMENT ON COLUMN public.accommodation_photos.title IS '輪播圖標題';
COMMENT ON COLUMN public.accommodation_photos.subtitle IS '輪播圖副標題';
COMMENT ON COLUMN public.accommodation_photos.cta_text IS 'CTA按鈕文字';
COMMENT ON COLUMN public.accommodation_photos.cta_link IS 'CTA按鈕連結';