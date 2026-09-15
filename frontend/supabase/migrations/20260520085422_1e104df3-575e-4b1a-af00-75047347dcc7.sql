
INSERT INTO storage.buckets (id, name, public)
VALUES ('ai-assets', 'ai-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Public read
CREATE POLICY "ai-assets public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'ai-assets');

-- Admins can upload/update/delete
CREATE POLICY "ai-assets admin insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'ai-assets' AND public.is_admin_or_super());

CREATE POLICY "ai-assets admin update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'ai-assets' AND public.is_admin_or_super());

CREATE POLICY "ai-assets admin delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'ai-assets' AND public.is_admin_or_super());
