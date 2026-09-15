ALTER TABLE public.accommodation_info
  ADD COLUMN IF NOT EXISTS villa_trust_badges jsonb,
  ADD COLUMN IF NOT EXISTS villa_overview_labels jsonb;

COMMENT ON COLUMN public.accommodation_info.villa_trust_badges IS '包棟頁信任標籤陣列：[{icon: string, label: string}]，icon 對應 lucide 圖示名（shield-check / clock / car / wifi 等）';
COMMENT ON COLUMN public.accommodation_info.villa_overview_labels IS '包棟總覽四格標籤覆寫：{rooms, capacity, size, region}，未設定則使用預設文案';