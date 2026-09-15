-- Remove duplicate sensitive columns from discount_codes table
-- These credentials are now stored securely in discount_code_secrets table
-- with super_admin-only access (moved in migration 20260120133609)

-- First, verify data exists in the secrets table (informational)
-- The kol-webhook and kol-api edge functions already read from discount_code_secrets

-- Drop the redundant columns from discount_codes
ALTER TABLE public.discount_codes
  DROP COLUMN IF EXISTS api_key,
  DROP COLUMN IF EXISTS webhook_url,
  DROP COLUMN IF EXISTS webhook_secret,
  DROP COLUMN IF EXISTS webhook_enabled;