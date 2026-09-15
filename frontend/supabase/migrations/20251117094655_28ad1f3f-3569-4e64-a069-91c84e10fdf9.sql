-- 為 accommodation_photos 表添加背景遮罩透明度欄位
ALTER TABLE accommodation_photos
ADD COLUMN overlay_opacity INTEGER DEFAULT 40 CHECK (overlay_opacity >= 0 AND overlay_opacity <= 100);