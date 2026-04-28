-- 1) 新增 pricing_template_id 欄位
ALTER TABLE public.room_inventory_pricing
  ADD COLUMN IF NOT EXISTS pricing_template_id uuid NULL
  REFERENCES public.pricing_templates(id) ON DELETE CASCADE;

-- 2) 移除舊的 (room_type_id, date) 唯一約束
ALTER TABLE public.room_inventory_pricing
  DROP CONSTRAINT IF EXISTS room_inventory_pricing_room_type_id_date_key;

-- 3) 加上 partial unique index：未綁定專案的列只能有一筆（庫存/基礎價）
CREATE UNIQUE INDEX IF NOT EXISTS room_inventory_pricing_room_date_null_template_uidx
  ON public.room_inventory_pricing (room_type_id, date)
  WHERE pricing_template_id IS NULL;

-- 4) 加上 partial unique index：同房型同日期同專案只能有一筆（專案覆寫價）
CREATE UNIQUE INDEX IF NOT EXISTS room_inventory_pricing_room_date_template_uidx
  ON public.room_inventory_pricing (room_type_id, date, pricing_template_id)
  WHERE pricing_template_id IS NOT NULL;

-- 5) 索引加速：依 template 查詢
CREATE INDEX IF NOT EXISTS idx_room_inventory_pricing_template
  ON public.room_inventory_pricing (pricing_template_id)
  WHERE pricing_template_id IS NOT NULL;

COMMENT ON COLUMN public.room_inventory_pricing.pricing_template_id IS
  '當為 NULL 時，此列代表該房型該日的「庫存與基礎價」設定；當有值時，此列代表該日期該專案的「覆寫售價」（只更新 price，其餘欄位將被忽略）。';