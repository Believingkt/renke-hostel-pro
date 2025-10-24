-- 為 booking_settings 表添加更新權限
CREATE POLICY "Authenticated users can update booking settings"
ON booking_settings
FOR UPDATE
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- 為 accommodation_info 表添加更新權限
CREATE POLICY "Authenticated users can update accommodation info"
ON accommodation_info
FOR UPDATE
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);