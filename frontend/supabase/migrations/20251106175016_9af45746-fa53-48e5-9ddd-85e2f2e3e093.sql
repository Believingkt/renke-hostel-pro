-- Create storage bucket for room photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('room-photos', 'room-photos', true);

-- Allow authenticated users to upload room photos
CREATE POLICY "Authenticated users can upload room photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'room-photos');

-- Allow authenticated users to update their room photos
CREATE POLICY "Authenticated users can update room photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'room-photos');

-- Allow authenticated users to delete room photos
CREATE POLICY "Authenticated users can delete room photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'room-photos');

-- Allow public to view room photos
CREATE POLICY "Public can view room photos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'room-photos');