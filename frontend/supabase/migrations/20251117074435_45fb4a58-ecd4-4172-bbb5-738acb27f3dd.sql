-- 創建 og-images storage bucket 用於社群分享縮圖
INSERT INTO storage.buckets (id, name, public) 
VALUES ('og-images', 'og-images', true)
ON CONFLICT (id) DO NOTHING;

-- 為 og-images bucket 創建 RLS 策略
CREATE POLICY "Public can view OG images"
ON storage.objects FOR SELECT
USING (bucket_id = 'og-images');

CREATE POLICY "Authenticated users can upload OG images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'og-images' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can update OG images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'og-images' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can delete OG images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'og-images' 
  AND auth.role() = 'authenticated'
);