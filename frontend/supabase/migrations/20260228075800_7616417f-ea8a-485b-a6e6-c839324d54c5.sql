
INSERT INTO storage.buckets (id, name, public)
VALUES ('transfer-receipts', 'transfer-receipts', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can upload transfer receipts"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'transfer-receipts');

CREATE POLICY "Anyone can view transfer receipts"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'transfer-receipts');
