DROP POLICY IF EXISTS "Guests can upload receipts to active accommodation folder" ON storage.objects;

CREATE POLICY "Guests upload receipts to own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'transfer-receipts'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.accommodation_info ai
    WHERE ai.id::text = (storage.foldername(name))[1] AND ai.is_active = true
  )
);