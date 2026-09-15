-- 為 accommodation_photos 表添加自動播放時間欄位
ALTER TABLE accommodation_photos
ADD COLUMN autoplay_delay INTEGER DEFAULT 8 CHECK (autoplay_delay >= 2 AND autoplay_delay <= 20);