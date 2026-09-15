CREATE POLICY "Guests can upload receipts to active accommodation folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'transfer-receipts'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.accommodation_info ai
    WHERE ai.id::text = (storage.foldername(name))[1] AND ai.is_active = true
  )
);

CREATE POLICY "Uploaders can view their own transfer receipts"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'transfer-receipts' AND owner = auth.uid());
