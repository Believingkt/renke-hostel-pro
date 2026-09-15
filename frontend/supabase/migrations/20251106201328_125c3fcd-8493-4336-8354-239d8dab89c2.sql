-- Drop the problematic policy
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

-- Create a security definer function to check admin with same accommodation
CREATE OR REPLACE FUNCTION public.can_view_user_roles(_accommodation_id uuid)
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
      AND accommodation_id = _accommodation_id
      AND role IN ('super_admin', 'hotel_admin', 'staff')
  ) OR EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'super_admin'
  );
$$;

-- Create new policy for viewing user roles in same accommodation
CREATE POLICY "Users can view roles in their accommodation"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  can_view_user_roles(accommodation_id)
);

-- Create policy for admins to manage roles
CREATE POLICY "Admins can manage user roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ur.role IN ('super_admin', 'hotel_admin')
        OR (ur.role = 'super_admin')
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ur.role IN ('super_admin', 'hotel_admin')
        OR (ur.role = 'super_admin')
      )
  )
);