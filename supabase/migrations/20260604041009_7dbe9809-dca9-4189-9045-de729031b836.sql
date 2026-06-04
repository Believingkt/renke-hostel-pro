
-- 1) accommodation_info: public read only for active properties
DROP POLICY IF EXISTS "Public can view accommodation info" ON public.accommodation_info;
CREATE POLICY "Public can view active accommodation info"
ON public.accommodation_info
FOR SELECT
USING (is_active = true);

-- Authenticated users with a role at the accommodation can still read inactive ones
CREATE POLICY "Members can view their accommodation info"
ON public.accommodation_info
FOR SELECT
TO authenticated
USING (
  user_has_access_to_accommodation(auth.uid(), id)
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'super_admin'::app_role
  )
);

-- 2) accommodation_owners: scope to the owner's accommodation
DROP POLICY IF EXISTS "Admins manage accommodation owners" ON public.accommodation_owners;

CREATE POLICY "Super admins manage all accommodation owners"
ON public.accommodation_owners
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'super_admin'::app_role
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'super_admin'::app_role
  )
);

CREATE POLICY "Hotel admins manage owners of their accommodation"
ON public.accommodation_owners
FOR ALL
TO authenticated
USING (user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role))
WITH CHECK (user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role));

-- 3) ai_knowledge: restrict mutations on accommodation-scoped knowledge to admins
DROP POLICY IF EXISTS "Accommodation members manage own knowledge" ON public.ai_knowledge;

CREATE POLICY "Accommodation members read own knowledge"
ON public.ai_knowledge
FOR SELECT
TO authenticated
USING (
  accommodation_id IS NOT NULL
  AND user_has_access_to_accommodation(auth.uid(), accommodation_id)
);

CREATE POLICY "Accommodation admins write own knowledge"
ON public.ai_knowledge
FOR INSERT
TO authenticated
WITH CHECK (
  accommodation_id IS NOT NULL
  AND (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  )
);

CREATE POLICY "Accommodation admins update own knowledge"
ON public.ai_knowledge
FOR UPDATE
TO authenticated
USING (
  accommodation_id IS NOT NULL
  AND (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  )
)
WITH CHECK (
  accommodation_id IS NOT NULL
  AND (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  )
);

CREATE POLICY "Accommodation admins delete own knowledge"
ON public.ai_knowledge
FOR DELETE
TO authenticated
USING (
  accommodation_id IS NOT NULL
  AND (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  )
);

-- 4) backups storage bucket: scope to user's accommodation by path prefix
DROP POLICY IF EXISTS "Only admins can view backups" ON storage.objects;
DROP POLICY IF EXISTS "Only admins can upload backups" ON storage.objects;
DROP POLICY IF EXISTS "Only admins can delete backups" ON storage.objects;

CREATE POLICY "Admins view backups of their accommodation"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'backups'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['super_admin'::app_role, 'hotel_admin'::app_role])
      AND (
        ur.role = 'super_admin'::app_role
        OR ur.accommodation_id::text = (storage.foldername(name))[1]
      )
  )
);

CREATE POLICY "Admins upload backups to their accommodation"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'backups'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['super_admin'::app_role, 'hotel_admin'::app_role])
      AND (
        ur.role = 'super_admin'::app_role
        OR ur.accommodation_id::text = (storage.foldername(name))[1]
      )
  )
);

CREATE POLICY "Admins delete backups of their accommodation"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'backups'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['super_admin'::app_role, 'hotel_admin'::app_role])
      AND (
        ur.role = 'super_admin'::app_role
        OR ur.accommodation_id::text = (storage.foldername(name))[1]
      )
  )
);
