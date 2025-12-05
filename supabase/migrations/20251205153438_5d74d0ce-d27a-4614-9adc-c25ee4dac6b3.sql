-- Drop the public SELECT policy on discount_codes to prevent exposure of api_key and commission_rate columns
-- Public validation should use the validate_discount_code() RPC function instead

DROP POLICY IF EXISTS "Public can validate specific discount codes" ON discount_codes;