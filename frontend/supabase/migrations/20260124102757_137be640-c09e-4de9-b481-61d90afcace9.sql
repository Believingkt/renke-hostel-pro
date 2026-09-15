-- Fix the SECURITY DEFINER view issue by converting to SECURITY INVOKER
-- Drop and recreate the view without SECURITY DEFINER

DROP VIEW IF EXISTS public.profiles_safe;

-- Create the view as SECURITY INVOKER (default) 
-- The email masking is done via the is_super_admin function which is already SECURITY DEFINER
CREATE VIEW public.profiles_safe WITH (security_invoker = true) AS
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