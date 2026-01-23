-- 在 accommodation_info 表中新增 meta_keywords 欄位，用於 SEO 關鍵字設定
ALTER TABLE public.accommodation_info 
ADD COLUMN meta_keywords TEXT;