
-- Allow global permission templates (accommodation_id IS NULL means applies to all properties)
ALTER TABLE public.permission_templates ALTER COLUMN accommodation_id DROP NOT NULL;

-- Refresh RLS policies to include global templates
DROP POLICY IF EXISTS "Admins manage permission templates" ON public.permission_templates;
DROP POLICY IF EXISTS "Staff can view templates in their accommodation" ON public.permission_templates;

-- Anyone with any admin role (or any accommodation access for reads) can view global + their accommodation templates
CREATE POLICY "View templates: global or accommodation access"
ON public.permission_templates
FOR SELECT
TO authenticated
USING (
  accommodation_id IS NULL
  OR public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
);

-- Only super_admin (of any accommodation) can manage global templates; admins of an accommodation manage their own
CREATE POLICY "Manage permission templates"
ON public.permission_templates
FOR ALL
TO authenticated
USING (
  CASE
    WHEN accommodation_id IS NULL THEN EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
    ELSE (
      public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::public.app_role)
      OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::public.app_role)
    )
  END
)
WITH CHECK (
  CASE
    WHEN accommodation_id IS NULL THEN EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
    ELSE (
      public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::public.app_role)
      OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::public.app_role)
    )
  END
);
