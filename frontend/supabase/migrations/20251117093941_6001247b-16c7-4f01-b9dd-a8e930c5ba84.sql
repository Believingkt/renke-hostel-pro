-- 為 accommodation_photos 表添加文字樣式欄位
ALTER TABLE accommodation_photos
ADD COLUMN text_color TEXT DEFAULT 'white',
ADD COLUMN text_size TEXT DEFAULT 'medium',
ADD COLUMN text_position_x TEXT DEFAULT 'center',
ADD COLUMN text_position_y TEXT DEFAULT 'center';