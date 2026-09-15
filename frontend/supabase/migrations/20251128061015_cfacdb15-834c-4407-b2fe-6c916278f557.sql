-- 添加獨立的餐飲方案價格欄位
ALTER TABLE room_inventory_pricing
ADD COLUMN IF NOT EXISTS price_2_meals INTEGER,
ADD COLUMN IF NOT EXISTS price_3_meals INTEGER;

-- 更新註釋說明欄位用途
COMMENT ON COLUMN room_inventory_pricing.price IS '基礎房價（不含餐）';
COMMENT ON COLUMN room_inventory_pricing.price_2_meals IS '一泊二食價格';
COMMENT ON COLUMN room_inventory_pricing.price_3_meals IS '一泊三食價格';