-- 為 accommodation_info 表添加輪播圖說明文字欄位
ALTER TABLE accommodation_info
ADD COLUMN hero_description TEXT;

-- 添加註解說明
COMMENT ON COLUMN accommodation_info.hero_description IS '首頁主視覺輪播圖說明文字';