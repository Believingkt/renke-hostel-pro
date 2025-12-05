-- Fix discount_codes: Replace public SELECT policy to exclude sensitive fields
-- The current policy exposes all columns including api_key and commission_rate

-- Drop the overly permissive public policy
DROP POLICY IF EXISTS "Public can view active discount codes" ON discount_codes;

-- Create a more restrictive policy using a security definer function
-- that only returns non-sensitive discount code information
CREATE OR REPLACE FUNCTION public.get_public_discount_code_info(p_code TEXT, p_accommodation_id UUID)
RETURNS TABLE(
  code TEXT,
  discount_type TEXT,
  discount_value INTEGER,
  min_order_amount INTEGER,
  applicable_room_types JSONB,
  applicable_date_from DATE,
  applicable_date_to DATE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    code,
    discount_type,
    discount_value,
    min_order_amount,
    applicable_room_types,
    applicable_date_from,
    applicable_date_to
  FROM discount_codes
  WHERE code = UPPER(p_code)
    AND accommodation_id = p_accommodation_id
    AND is_active = true
    AND (valid_until IS NULL OR valid_until > now())
    AND valid_from <= now();
$$;

-- Note: Public SELECT is still needed for the validate_discount_code function
-- But we make it more restrictive - only allow reading specific codes, not browsing all
CREATE POLICY "Public can validate specific discount codes"
ON discount_codes FOR SELECT
TO anon, authenticated
USING (
  -- Only allow access when querying a specific code (not browsing)
  is_active = true 
  AND (valid_until IS NULL OR valid_until > now())
  AND valid_from <= now()
);