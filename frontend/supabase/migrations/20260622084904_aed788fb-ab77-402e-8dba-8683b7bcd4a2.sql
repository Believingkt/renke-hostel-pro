ALTER TABLE public.accommodation_packages
  ADD COLUMN IF NOT EXISTS room_type_allocation jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.accommodation_packages.room_type_allocation IS
  '房型分配 [{room_type_id: uuid, qty: int}]。前台用以顯示包區方案對應的房型縮圖與數量。';