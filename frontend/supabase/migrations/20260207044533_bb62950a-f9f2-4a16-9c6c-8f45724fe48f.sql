-- 建立自訂區塊表格（用於首頁展示自訂圖片）
CREATE TABLE public.custom_sections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  title TEXT,
  subtitle TEXT,
  image_url TEXT NOT NULL,
  mobile_image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  link_url TEXT,
  link_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 建立索引
CREATE INDEX idx_custom_sections_accommodation ON public.custom_sections(accommodation_id);
CREATE INDEX idx_custom_sections_order ON public.custom_sections(accommodation_id, display_order);

-- 啟用 RLS
ALTER TABLE public.custom_sections ENABLE ROW LEVEL SECURITY;

-- 公開讀取啟用的區塊
CREATE POLICY "Public can view enabled custom sections"
  ON public.custom_sections
  FOR SELECT
  USING (is_enabled = true);

-- 管理員可完整管理
CREATE POLICY "Admins can manage custom sections"
  ON public.custom_sections
  FOR ALL
  USING (
    public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
  )
  WITH CHECK (
    public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
  );

-- 更新時間觸發器
CREATE TRIGGER update_custom_sections_updated_at
  BEFORE UPDATE ON public.custom_sections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 建立 storage bucket 用於自訂區塊圖片
INSERT INTO storage.buckets (id, name, public)
VALUES ('custom-sections', 'custom-sections', true)
ON CONFLICT (id) DO NOTHING;

-- Storage 政策：公開讀取
CREATE POLICY "Public can view custom section images"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'custom-sections');

-- Storage 政策：管理員可上傳
CREATE POLICY "Admins can upload custom section images"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'custom-sections' 
    AND public.user_has_storage_access(name)
  );

-- Storage 政策：管理員可刪除
CREATE POLICY "Admins can delete custom section images"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'custom-sections' 
    AND public.user_has_storage_access(name)
  );