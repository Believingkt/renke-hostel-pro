-- 為 about_section 表的 accommodation_id 添加唯一約束
-- 確保每個旅宿只能有一個特色說明區塊

-- 首先刪除重複的記錄（保留最新的）
DELETE FROM about_section a
USING about_section b
WHERE a.accommodation_id = b.accommodation_id
  AND a.created_at < b.created_at;

-- 添加唯一約束
ALTER TABLE about_section
ADD CONSTRAINT about_section_accommodation_id_unique 
UNIQUE (accommodation_id);