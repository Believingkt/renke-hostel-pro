-- Remove overly permissive SELECT policy on user_roles table
-- This policy allows ANY authenticated user to view all roles for all accommodations
-- More restrictive policies already exist for proper access control

DROP POLICY IF EXISTS "Authenticated users can view all user roles" ON public.user_roles;

-- Add comment explaining the access control model
COMMENT ON TABLE public.user_roles IS 'User role assignments. Access controlled via RLS: users can view their own roles, admins can view roles for their accommodations, super_admins can view all roles.';