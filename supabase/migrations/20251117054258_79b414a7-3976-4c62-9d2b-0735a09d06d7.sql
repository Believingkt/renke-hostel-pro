-- 在 accommodation_info 表中新增 og_image_url 欄位，用於社群分享縮圖
ALTER TABLE public.accommodation_info 
ADD COLUMN og_image_url TEXT;