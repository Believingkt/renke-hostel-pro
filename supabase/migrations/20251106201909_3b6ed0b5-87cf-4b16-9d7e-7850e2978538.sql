-- Simplify RLS to allow authenticated users to view all roles temporarily for debugging
DROP POLICY IF EXISTS "Super admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view roles in same accommodation" ON public.user_roles;

-- Create a simple policy that allows all authenticated users to view all roles
CREATE POLICY "Authenticated users can view all user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (true);