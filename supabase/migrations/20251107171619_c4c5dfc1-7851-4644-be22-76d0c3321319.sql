-- Drop the overly permissive policy that allows all authenticated users to view all profiles
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;

-- Create a properly scoped policy that allows users to:
-- 1. View their own profile
-- 2. View profiles of users in the same accommodation(s)
CREATE POLICY "Users can view profiles in their accommodation"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid() OR
  EXISTS (
    SELECT 1 
    FROM user_roles ur1
    JOIN user_roles ur2 ON ur1.accommodation_id = ur2.accommodation_id
    WHERE ur1.user_id = auth.uid()
      AND ur2.user_id = profiles.id
  )
);