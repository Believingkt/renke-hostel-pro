-- Drop the problematic policy first
DROP POLICY IF EXISTS "Admins can manage roles" ON user_roles;

-- Create a security definer function to check if user is admin
-- This function bypasses RLS to avoid infinite recursion
CREATE OR REPLACE FUNCTION public.is_admin(user_id_param uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_id = user_id_param
    AND role IN ('super_admin', 'hotel_admin')
  );
END;
$$;

-- Recreate the policy using the security definer function
CREATE POLICY "Admins can manage roles"
ON user_roles
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Update the user_has_access_to_accommodation function to be SECURITY DEFINER
-- Use CREATE OR REPLACE to avoid dependency issues
CREATE OR REPLACE FUNCTION public.user_has_access_to_accommodation(
  _user_id uuid,
  _accommodation_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND accommodation_id = _accommodation_id
  ) OR EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'
  );
$$;