DROP POLICY IF EXISTS "Members can read avatars" ON storage.objects;
CREATE POLICY "Members can read own avatars"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'member-avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);