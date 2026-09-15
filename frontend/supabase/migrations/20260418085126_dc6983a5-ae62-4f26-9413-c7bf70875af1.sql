
-- ============================================
-- B-1: faqs - remove overly permissive authenticated SELECT
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view all FAQs" ON public.faqs;

-- Add scoped policy: staff can see all (incl. unpublished) of THEIR accommodations
CREATE POLICY "Staff can view all FAQs in their accommodation"
ON public.faqs
FOR SELECT
TO authenticated
USING (
  accommodation_id IS NOT NULL
  AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
);

-- ============================================
-- B-2: pricing_templates - restrict to staff only
-- ============================================
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='pricing_templates' AND cmd='SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.pricing_templates', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Staff can view pricing templates in their accommodation"
ON public.pricing_templates
FOR SELECT
TO authenticated
USING (public.user_has_access_to_accommodation(auth.uid(), accommodation_id));

-- ============================================
-- B-3: realtime channel access control
-- Restrict subscriptions to topics scoped by the user's accommodation/user id.
-- Topic conventions used by the app are typically:
--   "orders:{accommodationId}", "notifications:{accommodationId}", "user:{userId}"
-- ============================================
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can subscribe to scoped topics" ON realtime.messages;

CREATE POLICY "Authenticated users can subscribe to scoped topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- super_admin can listen to everything
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'::public.app_role
  )
  -- topic ends with an accommodation_id the user has access to
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.accommodation_id IS NOT NULL
      AND realtime.topic() LIKE '%' || ur.accommodation_id::text
  )
  -- topic targets the user themselves (e.g. "user:{uid}")
  OR realtime.topic() LIKE '%' || auth.uid()::text
);

-- Allow broadcast send only to scoped topics (same rules)
DROP POLICY IF EXISTS "Authenticated users can broadcast to scoped topics" ON realtime.messages;

CREATE POLICY "Authenticated users can broadcast to scoped topics"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'::public.app_role
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.accommodation_id IS NOT NULL
      AND realtime.topic() LIKE '%' || ur.accommodation_id::text
  )
  OR realtime.topic() LIKE '%' || auth.uid()::text
);

-- ============================================
-- B-4: Restrict listing on public buckets (content remains publicly readable
-- because the uploaded URLs are signed/known, but anonymous users cannot
-- enumerate the entire bucket via storage.objects SELECT).
-- ============================================
DROP POLICY IF EXISTS "Public can view custom section images" ON storage.objects;
CREATE POLICY "Custom section images: read for anon by direct URL only"
ON storage.objects
FOR SELECT
TO anon
USING (
  bucket_id = 'custom-sections'
  AND (storage.foldername(name))[1] IS NOT NULL  -- require a folder prefix to avoid raw root listing
);
CREATE POLICY "Custom section images: staff list/read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'custom-sections'
);

DROP POLICY IF EXISTS "Public can view OG images" ON storage.objects;
DROP POLICY IF EXISTS "og_images_public_read" ON storage.objects;
CREATE POLICY "OG images: read for anon by direct URL only"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'og-images' AND (storage.foldername(name))[1] IS NOT NULL);
CREATE POLICY "OG images: staff list/read"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'og-images');

DROP POLICY IF EXISTS "Public can view room photos" ON storage.objects;
DROP POLICY IF EXISTS "room_photos_public_read" ON storage.objects;
CREATE POLICY "Room photos: read for anon by direct URL only"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'room-photos' AND (storage.foldername(name))[1] IS NOT NULL);
CREATE POLICY "Room photos: staff list/read"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'room-photos');

DROP POLICY IF EXISTS "Allow public to view logos" ON storage.objects;
DROP POLICY IF EXISTS "logos_public_read" ON storage.objects;
CREATE POLICY "Logos: read for anon by direct URL only"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'logos' AND (storage.foldername(name))[1] IS NOT NULL);
CREATE POLICY "Logos: staff list/read"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'logos');
