
-- 1) accommodation_info: revoke column-level read on registration_number from anon
REVOKE SELECT (registration_number) ON public.accommodation_info FROM anon;

-- 2) platform_coupons: require authenticated to read
DROP POLICY IF EXISTS "Anyone can read active coupons" ON public.platform_coupons;
CREATE POLICY "Authenticated users can read active coupons"
ON public.platform_coupons
FOR SELECT
TO authenticated
USING (is_active = true);

-- 3) starlink_plan_settings: require authenticated team role to read
DROP POLICY IF EXISTS "starlink_plan_select" ON public.starlink_plan_settings;
CREATE POLICY "Team members can read starlink plans"
ON public.starlink_plan_settings
FOR SELECT
TO authenticated
USING (public.user_has_any_team_role(auth.uid()));

-- 4) Storage: OG images write policies — restrict to accommodation admins
DROP POLICY IF EXISTS "Authenticated users can upload OG images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update OG images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete OG images" ON storage.objects;

CREATE POLICY "Accommodation admins can upload OG images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'og-images' AND public.user_has_storage_access(name));

CREATE POLICY "Accommodation admins can update OG images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'og-images' AND public.user_has_storage_access(name));

CREATE POLICY "Accommodation admins can delete OG images"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'og-images' AND public.user_has_storage_access(name));
