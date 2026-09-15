-- 性能優化：為常用查詢添加資料庫索引

-- 訂單表索引優化
CREATE INDEX IF NOT EXISTS idx_orders_accommodation_check_in 
ON orders(accommodation_id, check_in_date);

CREATE INDEX IF NOT EXISTS idx_orders_accommodation_check_out 
ON orders(accommodation_id, check_out_date);

CREATE INDEX IF NOT EXISTS idx_orders_accommodation_status 
ON orders(accommodation_id, order_status);

CREATE INDEX IF NOT EXISTS idx_orders_customer 
ON orders(customer_id);

CREATE INDEX IF NOT EXISTS idx_orders_room_type 
ON orders(room_type_id);

-- 客戶表索引
CREATE INDEX IF NOT EXISTS idx_customers_accommodation 
ON customers(accommodation_id);

CREATE INDEX IF NOT EXISTS idx_customers_phone 
ON customers(phone);

CREATE INDEX IF NOT EXISTS idx_customers_email 
ON customers(email);

-- 折扣碼表索引
CREATE INDEX IF NOT EXISTS idx_discount_codes_accommodation_active 
ON discount_codes(accommodation_id, is_active);

CREATE INDEX IF NOT EXISTS idx_discount_codes_code 
ON discount_codes(code);

-- 房型表索引
CREATE INDEX IF NOT EXISTS idx_room_types_accommodation_order 
ON room_types(accommodation_id, display_order);

-- 照片表索引
CREATE INDEX IF NOT EXISTS idx_accommodation_photos_accommodation_type 
ON accommodation_photos(accommodation_id, photo_type, display_order);

CREATE INDEX IF NOT EXISTS idx_room_photos_room_type 
ON room_photos(room_type_id, display_order);

-- 特色區塊索引
CREATE INDEX IF NOT EXISTS idx_about_features_accommodation_order 
ON about_features(accommodation_id, display_order);

-- 通知表索引
CREATE INDEX IF NOT EXISTS idx_notifications_accommodation_read 
ON notifications(accommodation_id, is_read, created_at DESC);

-- 公共假日索引
CREATE INDEX IF NOT EXISTS idx_public_holidays_accommodation_date 
ON public_holidays(accommodation_id, holiday_date);