-- 為 accommodation_facilities 表添加 INSERT、UPDATE、DELETE 政策
-- 允許所有人進行 CRUD 操作（後台管理功能）

CREATE POLICY "Allow public to insert facilities"
ON accommodation_facilities
FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Allow public to update facilities"
ON accommodation_facilities
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public to delete facilities"
ON accommodation_facilities
FOR DELETE
TO public
USING (true);