
-- Fix infinite recursion in user_roles RLS by routing self-referencing checks through SECURITY DEFINER functions.

CREATE OR REPLACE FUNCTION public.is_hotel_admin_of(_accommodation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND accommodation_id = _accommodation_id
      AND role IN ('super_admin'::app_role, 'hotel_admin'::app_role)
  );
$$;

-- Drop the recursive policies
DROP POLICY IF EXISTS "Admins can update roles restricted" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles restricted" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles restricted" ON public.user_roles;

-- Recreate using SECURITY DEFINER helpers (no self-reference)
CREATE POLICY "Admins can update roles restricted"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.is_hotel_admin_of(accommodation_id)
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    role IN ('staff'::app_role, 'hotel_admin'::app_role)
    AND public.is_hotel_admin_of(accommodation_id)
  )
);

CREATE POLICY "Admins can insert roles restricted"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    role IN ('staff'::app_role, 'hotel_admin'::app_role)
    AND public.is_hotel_admin_of(accommodation_id)
  )
);

CREATE POLICY "Admins can delete roles restricted"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    role IN ('staff'::app_role, 'hotel_admin'::app_role)
    AND public.is_hotel_admin_of(accommodation_id)
  )
);
