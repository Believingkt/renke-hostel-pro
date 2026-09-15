-- 為 accommodation_photos 表添加 photo_type 字段用於區分圖片類型
ALTER TABLE public.accommodation_photos 
ADD COLUMN IF NOT EXISTS photo_type text DEFAULT 'gallery';

-- 添加註釋說明
COMMENT ON COLUMN public.accommodation_photos.photo_type IS 'Photo type: hero (首頁輪播), gallery (相簿)';

-- 創建索引以提高查詢效率
CREATE INDEX IF NOT EXISTS idx_accommodation_photos_type 
ON public.accommodation_photos(accommodation_id, photo_type);