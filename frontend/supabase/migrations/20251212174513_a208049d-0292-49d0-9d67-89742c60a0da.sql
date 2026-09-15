-- Fix storage bucket security: Add accommodation-based access control
-- This migration updates RLS policies for room-photos, logos, and og-images buckets
-- to validate that users can only access files for accommodations they have roles in

-- First, create a security definer function to check storage access
CREATE OR REPLACE FUNCTION public.user_has_storage_access(file_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND (
        -- Check if user has access to the accommodation in the file path
        accommodation_id::text = split_part(file_path, '/', 1)
        -- Or user is super_admin (can access all)
        OR role = 'super_admin'
      )
  );
$$;

-- Drop existing policies for room-photos bucket
DROP POLICY IF EXISTS "Authenticated users can upload room photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update room photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete room photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to room photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read room photos" ON storage.objects;

-- Drop existing policies for logos bucket
DROP POLICY IF EXISTS "Allow authenticated users to upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to logos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read logos" ON storage.objects;

-- Drop existing policies for og-images bucket
DROP POLICY IF EXISTS "Authenticated users can upload og-images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update og-images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete og-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to og-images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read og-images" ON storage.objects;
DROP POLICY IF EXISTS "Public can view og-images" ON storage.objects;

-- Create new secure policies for room-photos bucket
-- Public read access (these are public images for the website)
CREATE POLICY "room_photos_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'room-photos');

-- Insert: Only users with access to the accommodation
CREATE POLICY "room_photos_insert_with_access"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'room-photos' AND
  public.user_has_storage_access(name)
);

-- Update: Only users with access to the accommodation
CREATE POLICY "room_photos_update_with_access"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'room-photos' AND
  public.user_has_storage_access(name)
);

-- Delete: Only users with access to the accommodation
CREATE POLICY "room_photos_delete_with_access"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'room-photos' AND
  public.user_has_storage_access(name)
);

-- Create new secure policies for logos bucket
-- Public read access (logos are displayed on public website)
CREATE POLICY "logos_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'logos');

-- Insert: Only users with access to the accommodation
CREATE POLICY "logos_insert_with_access"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'logos' AND
  public.user_has_storage_access(name)
);

-- Update: Only users with access to the accommodation
CREATE POLICY "logos_update_with_access"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'logos' AND
  public.user_has_storage_access(name)
);

-- Delete: Only users with access to the accommodation
CREATE POLICY "logos_delete_with_access"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'logos' AND
  public.user_has_storage_access(name)
);

-- Create new secure policies for og-images bucket
-- Public read access (OG images are used for social sharing)
CREATE POLICY "og_images_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'og-images');

-- Insert: Only users with access to the accommodation
CREATE POLICY "og_images_insert_with_access"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'og-images' AND
  public.user_has_storage_access(name)
);

-- Update: Only users with access to the accommodation
CREATE POLICY "og_images_update_with_access"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'og-images' AND
  public.user_has_storage_access(name)
);

-- Delete: Only users with access to the accommodation
CREATE POLICY "og_images_delete_with_access"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'og-images' AND
  public.user_has_storage_access(name)
);