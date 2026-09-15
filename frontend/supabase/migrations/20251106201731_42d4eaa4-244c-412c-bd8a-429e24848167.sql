-- Temporarily make user_roles readable by authenticated users to debug
-- This will help us see what's blocking the query

-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Staff can view accommodation roles" ON public.user_roles;

-- Create a simple policy that allows super_admins to see everything
CREATE POLICY "Super admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'super_admin'
      LIMIT 1
  )
);

-- Also allow viewing roles in same accommodation
CREATE POLICY "Users can view roles in same accommodation"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  accommodation_id IN (
    SELECT accommodation_id
    FROM public.user_roles
    WHERE user_id = auth.uid()
  )
);