-- 為 accommodation_info 表添加輪播圖主標題和副標題欄位
ALTER TABLE accommodation_info
ADD COLUMN hero_main_title TEXT,
ADD COLUMN hero_subtitle TEXT;

-- 添加註解說明
COMMENT ON COLUMN accommodation_info.hero_main_title IS '首頁主視覺輪播圖主標題';
COMMENT ON COLUMN accommodation_info.hero_subtitle IS '首頁主視覺輪播圖副標題';