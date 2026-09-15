
-- 外部訂房平台對照表：將內部住宿 ID 對應到外部分銷平台的 CID 和飯店代碼
CREATE TABLE public.external_hotel_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id UUID NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  cid_code TEXT NOT NULL,          -- 合作 CID 代號 (e.g. "LakezeEvent")
  hotel_code TEXT,                 -- 外部飯店代碼 (e.g. "H001")，NULL 表示 CID 下只有一家
  api_environment TEXT NOT NULL DEFAULT 'production', -- 'production' or 'uat'
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(accommodation_id, cid_code)
);

-- Enable RLS
ALTER TABLE public.external_hotel_mappings ENABLE ROW LEVEL SECURITY;

-- Only super_admin and hotel_admin can manage mappings
CREATE POLICY "Admins can manage external mappings"
  ON public.external_hotel_mappings
  FOR ALL
  TO authenticated
  USING (
    public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
  )
  WITH CHECK (
    public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
  );

-- Public read for edge functions (anon can read enabled mappings for AI booking)
CREATE POLICY "Public can read enabled mappings"
  ON public.external_hotel_mappings
  FOR SELECT
  TO anon
  USING (is_enabled = true);

-- Auto-update updated_at
CREATE TRIGGER update_external_hotel_mappings_updated_at
  BEFORE UPDATE ON public.external_hotel_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
