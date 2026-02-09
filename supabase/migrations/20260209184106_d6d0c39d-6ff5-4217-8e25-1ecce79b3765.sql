
-- Fix 1: Revoke anonymous access to profiles_safe view
REVOKE SELECT ON public.profiles_safe FROM anon;

-- Fix 2: Revoke anonymous access to discount_codes_safe view
REVOKE SELECT ON public.discount_codes_safe FROM anon;

-- Recreate profiles_safe as SECURITY INVOKER to respect underlying RLS
DROP VIEW IF EXISTS public.profiles_safe;
CREATE VIEW public.profiles_safe 
WITH (security_invoker = true)
AS
SELECT 
  id,
  name,
  CASE
    WHEN (auth.uid() = id) THEN email
    WHEN is_super_admin(auth.uid()) THEN email
    ELSE NULL::text
  END AS email,
  force_password_change,
  created_at,
  updated_at,
  last_sign_in_at
FROM profiles;

-- Grant only to authenticated role
GRANT SELECT ON public.profiles_safe TO authenticated;
REVOKE ALL ON public.profiles_safe FROM anon;

-- Also recreate discount_codes_safe as SECURITY INVOKER
DROP VIEW IF EXISTS public.discount_codes_safe;
CREATE VIEW public.discount_codes_safe
WITH (security_invoker = true)
AS
SELECT 
  id,
  accommodation_id,
  name,
  code,
  discount_type,
  discount_value,
  usage_limit,
  used_count,
  valid_from,
  valid_until,
  is_active,
  min_order_amount,
  applicable_room_types,
  applicable_date_from,
  applicable_date_to,
  display_order,
  commission_rate,
  created_at,
  updated_at
FROM discount_codes;

-- Grant only to authenticated role
GRANT SELECT ON public.discount_codes_safe TO authenticated;
REVOKE ALL ON public.discount_codes_safe FROM anon;
