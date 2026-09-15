
-- Fix: Allow anonymous uploads to transfer-receipts with path validation
-- Guests (unauthenticated) need to upload receipts during booking
DROP POLICY IF EXISTS "Authenticated users upload transfer receipts" ON storage.objects;

-- Allow uploads only to paths matching {uuid}/{filename} pattern
-- This prevents arbitrary path abuse while allowing guest uploads
CREATE POLICY "Upload transfer receipts with valid path"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'transfer-receipts'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.accommodation_info
    WHERE id::text = (storage.foldername(name))[1]
    AND is_active = true
  )
);
