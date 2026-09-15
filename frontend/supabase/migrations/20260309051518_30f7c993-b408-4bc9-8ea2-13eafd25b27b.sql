
-- Fix transfer-receipts bucket: make it private and restrict policies
-- Step 1: Update bucket to private
UPDATE storage.buckets SET public = false WHERE id = 'transfer-receipts';

-- Step 2: Drop existing overly permissive policies
DROP POLICY IF EXISTS "Allow public upload transfer receipts" ON storage.objects;
DROP POLICY IF EXISTS "Allow public view transfer receipts" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload transfer receipts" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view transfer receipts" ON storage.objects;

-- Step 3: Create restricted policies - only authenticated users can upload to their accommodation's folder
CREATE POLICY "Authenticated users upload transfer receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'transfer-receipts'
  AND public.user_has_storage_access(name)
);

-- Step 4: Only staff with accommodation access can view receipts
CREATE POLICY "Staff can view transfer receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'transfer-receipts'
  AND public.user_has_storage_access(name)
);
