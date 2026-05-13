-- Fix transfer-receipts storage upload policy to reference the storage object path,
-- not accommodation_info.name.
DROP POLICY IF EXISTS "Upload transfer receipts with valid path" ON storage.objects;

CREATE POLICY "Upload transfer receipts with valid path"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'transfer-receipts'
  AND (storage.foldername(storage.objects.name))[1] IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.accommodation_info ai
    WHERE ai.id::text = (storage.foldername(storage.objects.name))[1]
      AND ai.is_active = true
      AND EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND (
            ur.accommodation_id = ai.id
            OR ur.role = 'super_admin'::public.app_role
          )
      )
  )
);

-- Fix NULL accommodation OTA log access for super admins.
DROP POLICY IF EXISTS "Admins read owlting cm logs" ON public.owlting_cm_logs;

CREATE POLICY "Admins read owlting cm logs"
ON public.owlting_cm_logs
FOR SELECT
USING (
  (
    accommodation_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = 'super_admin'::public.app_role
    )
  )
  OR public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::public.app_role)
  OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::public.app_role)
);

-- Prevent authenticated clients from reading stored OTA remote passwords while
-- preserving access to non-sensitive endpoint metadata.
REVOKE SELECT ON public.owlting_ari_endpoints FROM anon, authenticated;
GRANT SELECT (
  id,
  accommodation_id,
  endpoint_url,
  remote_username,
  environment,
  is_active,
  last_pushed_at,
  created_at,
  updated_at
) ON public.owlting_ari_endpoints TO authenticated;

-- Keep endpoint rows role-scoped for the safe columns above.
DROP POLICY IF EXISTS "Admins read owlting endpoints" ON public.owlting_ari_endpoints;

CREATE POLICY "Admins read owlting endpoint metadata"
ON public.owlting_ari_endpoints
FOR SELECT
TO authenticated
USING (
  public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::public.app_role)
  OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::public.app_role)
);