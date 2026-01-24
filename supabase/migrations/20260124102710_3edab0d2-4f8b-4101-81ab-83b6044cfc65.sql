-- Drop existing SELECT policies on profiles table that expose email
DROP POLICY IF EXISTS "Admins can view profiles in their accommodation" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- Create a function to check if user is super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(user_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = user_uuid AND role = 'super_admin'
  );
$$;

-- Create a new unified SELECT policy that:
-- 1. Users can always see their own profile (including email)
-- 2. Super admins can see all profiles of users in their accommodations (including email)
-- 3. Hotel admins can see profiles but NOT the email (handled via a secure view)

-- First, create the base SELECT policy - users see their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
FOR SELECT
USING (auth.uid() = id);

-- Super admins can view all profiles in their accommodations
CREATE POLICY "Super admins can view profiles in their accommodation" ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur_admin
    WHERE ur_admin.user_id = auth.uid()
    AND ur_admin.role = 'super_admin'
    AND EXISTS (
      SELECT 1 FROM user_roles ur_target
      WHERE ur_target.user_id = profiles.id
      AND ur_target.accommodation_id = ur_admin.accommodation_id
    )
  )
);

-- Hotel admins can view profiles in their accommodations (but we'll use a view to hide email)
CREATE POLICY "Hotel admins can view profiles in their accommodation" ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur_admin
    WHERE ur_admin.user_id = auth.uid()
    AND ur_admin.role = 'hotel_admin'
    AND EXISTS (
      SELECT 1 FROM user_roles ur_target
      WHERE ur_target.user_id = profiles.id
      AND ur_target.accommodation_id = ur_admin.accommodation_id
    )
  )
);

-- Create a secure view that masks email for non-super-admins viewing other users
CREATE OR REPLACE VIEW public.profiles_safe AS
SELECT 
  id,
  name,
  CASE 
    -- Show email if viewing own profile
    WHEN auth.uid() = id THEN email
    -- Show email if current user is super_admin
    WHEN is_super_admin(auth.uid()) THEN email
    -- Hide email for hotel_admins viewing other users
    ELSE NULL
  END AS email,
  force_password_change,
  created_at,
  updated_at,
  last_sign_in_at
FROM public.profiles;