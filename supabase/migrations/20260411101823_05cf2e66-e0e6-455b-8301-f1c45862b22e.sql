
-- =============================================
-- 1. FIX: Privilege escalation in user_roles
-- =============================================

-- Drop the overly permissive INSERT policies
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins insert roles" ON public.user_roles;

-- Drop the overly permissive UPDATE/DELETE policies that use is_user_admin
DROP POLICY IF EXISTS "Admins update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins delete roles" ON public.user_roles;

-- Create restricted INSERT policy: hotel_admins can only assign staff/hotel_admin within their accommodation
CREATE POLICY "Admins can insert roles restricted"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  -- Super admins can insert any role
  EXISTS (
    SELECT 1 FROM public.user_roles me
    WHERE me.user_id = auth.uid() AND me.role = 'super_admin'::public.app_role
  )
  OR
  -- Hotel admins can only assign staff or hotel_admin within their own accommodation
  (
    role IN ('staff'::public.app_role, 'hotel_admin'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.user_roles me
      WHERE me.user_id = auth.uid()
        AND me.role IN ('super_admin'::public.app_role, 'hotel_admin'::public.app_role)
        AND me.accommodation_id = user_roles.accommodation_id
    )
  )
);

-- Create restricted UPDATE policy
CREATE POLICY "Admins can update roles restricted"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles me
    WHERE me.user_id = auth.uid() AND me.role = 'super_admin'::public.app_role
  )
  OR
  EXISTS (
    SELECT 1 FROM public.user_roles me
    WHERE me.user_id = auth.uid()
      AND me.role IN ('super_admin'::public.app_role, 'hotel_admin'::public.app_role)
      AND me.accommodation_id = user_roles.accommodation_id
  )
)
WITH CHECK (
  -- Super admins can set any role
  EXISTS (
    SELECT 1 FROM public.user_roles me
    WHERE me.user_id = auth.uid() AND me.role = 'super_admin'::public.app_role
  )
  OR
  -- Hotel admins can only set staff or hotel_admin
  (
    role IN ('staff'::public.app_role, 'hotel_admin'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.user_roles me
      WHERE me.user_id = auth.uid()
        AND me.role IN ('super_admin'::public.app_role, 'hotel_admin'::public.app_role)
        AND me.accommodation_id = user_roles.accommodation_id
    )
  )
);

-- Create restricted DELETE policy
CREATE POLICY "Admins can delete roles restricted"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles me
    WHERE me.user_id = auth.uid() AND me.role = 'super_admin'::public.app_role
  )
  OR
  (
    -- Hotel admins can only delete staff/hotel_admin within their accommodation
    role IN ('staff'::public.app_role, 'hotel_admin'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.user_roles me
      WHERE me.user_id = auth.uid()
        AND me.role IN ('super_admin'::public.app_role, 'hotel_admin'::public.app_role)
        AND me.accommodation_id = user_roles.accommodation_id
    )
  )
);

-- =============================================
-- 2. FIX: Remove member self-insert points policy
-- =============================================
DROP POLICY IF EXISTS "Members can insert own transactions" ON public.member_point_transactions;

-- =============================================
-- 3. FIX: Transfer-receipts storage upload policy
-- =============================================
DROP POLICY IF EXISTS "Upload transfer receipts with valid path" ON storage.objects;

CREATE POLICY "Upload transfer receipts with valid path"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'transfer-receipts'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.accommodation_info ai
    WHERE ai.id::text = (storage.foldername(name))[1]
      AND ai.is_active = true
  )
);
