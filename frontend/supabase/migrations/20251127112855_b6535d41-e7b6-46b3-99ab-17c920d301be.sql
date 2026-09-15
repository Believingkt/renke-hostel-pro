-- 創建房間庫存價格表
CREATE TABLE IF NOT EXISTS public.room_inventory_pricing (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_type_id UUID NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  price INTEGER NOT NULL,
  available_rooms INTEGER NOT NULL DEFAULT 0,
  min_nights INTEGER DEFAULT 1,
  max_nights INTEGER DEFAULT 30,
  is_available BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(room_type_id, date)
);

-- 創建索引以提升查詢效能
CREATE INDEX idx_room_inventory_pricing_room_type ON public.room_inventory_pricing(room_type_id);
CREATE INDEX idx_room_inventory_pricing_date ON public.room_inventory_pricing(date);
CREATE INDEX idx_room_inventory_pricing_date_range ON public.room_inventory_pricing(room_type_id, date);

-- 啟用 RLS
ALTER TABLE public.room_inventory_pricing ENABLE ROW LEVEL SECURITY;

-- RLS 政策：公開讀取
CREATE POLICY "Public can view room inventory pricing"
  ON public.room_inventory_pricing
  FOR SELECT
  USING (true);

-- RLS 政策：只有管理員可以新增
CREATE POLICY "Only admins can insert room inventory pricing"
  ON public.room_inventory_pricing
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM room_types rt
      WHERE rt.id = room_inventory_pricing.room_type_id
      AND (
        user_has_role(auth.uid(), rt.accommodation_id, 'super_admin') 
        OR user_has_role(auth.uid(), rt.accommodation_id, 'hotel_admin')
      )
    )
  );

-- RLS 政策：只有管理員可以更新
CREATE POLICY "Only admins can update room inventory pricing"
  ON public.room_inventory_pricing
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM room_types rt
      WHERE rt.id = room_inventory_pricing.room_type_id
      AND (
        user_has_role(auth.uid(), rt.accommodation_id, 'super_admin') 
        OR user_has_role(auth.uid(), rt.accommodation_id, 'hotel_admin')
      )
    )
  );

-- RLS 政策：只有管理員可以刪除
CREATE POLICY "Only admins can delete room inventory pricing"
  ON public.room_inventory_pricing
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM room_types rt
      WHERE rt.id = room_inventory_pricing.room_type_id
      AND (
        user_has_role(auth.uid(), rt.accommodation_id, 'super_admin') 
        OR user_has_role(auth.uid(), rt.accommodation_id, 'hotel_admin')
      )
    )
  );

-- 創建更新 updated_at 的函數（如果不存在）
CREATE OR REPLACE FUNCTION public.update_room_inventory_pricing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 創建觸發器
CREATE TRIGGER update_room_inventory_pricing_updated_at_trigger
  BEFORE UPDATE ON public.room_inventory_pricing
  FOR EACH ROW
  EXECUTE FUNCTION public.update_room_inventory_pricing_updated_at();