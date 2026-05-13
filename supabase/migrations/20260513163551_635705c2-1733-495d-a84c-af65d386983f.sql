
-- Ensure pgcrypto is available
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================
-- 1) owlting_service_accounts: password -> password_hash
-- ============================================================
ALTER TABLE public.owlting_service_accounts
  ADD COLUMN IF NOT EXISTS password_hash text;

UPDATE public.owlting_service_accounts
SET password_hash = encode(extensions.digest(password, 'sha256'), 'hex')
WHERE password_hash IS NULL AND password IS NOT NULL;

ALTER TABLE public.owlting_service_accounts
  ALTER COLUMN password_hash SET NOT NULL;

ALTER TABLE public.owlting_service_accounts
  DROP COLUMN IF EXISTS password;

-- Update RPC to compare hashes
CREATE OR REPLACE FUNCTION public.verify_owlting_service_account(p_username text, p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_match boolean := false;
  v_hash text;
BEGIN
  IF p_username IS NULL OR p_password IS NULL THEN
    RETURN false;
  END IF;

  v_hash := encode(extensions.digest(p_password, 'sha256'), 'hex');

  SELECT true INTO v_match
  FROM public.owlting_service_accounts
  WHERE username = p_username
    AND password_hash = v_hash
    AND is_active = true
  LIMIT 1;

  IF v_match THEN
    UPDATE public.owlting_service_accounts
       SET last_used_at = now()
     WHERE username = p_username;
  END IF;

  RETURN COALESCE(v_match, false);
END
$function$;

-- ============================================================
-- 2) points_platform_partners: api_key -> api_key_hash + api_key_prefix
-- ============================================================
ALTER TABLE public.points_platform_partners
  ADD COLUMN IF NOT EXISTS api_key_hash text,
  ADD COLUMN IF NOT EXISTS api_key_prefix text;

UPDATE public.points_platform_partners
SET api_key_hash = encode(extensions.digest(api_key, 'sha256'), 'hex'),
    api_key_prefix = left(api_key, 8)
WHERE api_key_hash IS NULL AND api_key IS NOT NULL;

ALTER TABLE public.points_platform_partners
  ALTER COLUMN api_key_hash SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS points_platform_partners_api_key_hash_key
  ON public.points_platform_partners(api_key_hash);

ALTER TABLE public.points_platform_partners
  DROP COLUMN IF EXISTS api_key;

-- ============================================================
-- 3) discount_code_secrets: api_key -> api_key_hash + api_key_prefix
-- ============================================================
ALTER TABLE public.discount_code_secrets
  ADD COLUMN IF NOT EXISTS api_key_hash text,
  ADD COLUMN IF NOT EXISTS api_key_prefix text;

UPDATE public.discount_code_secrets
SET api_key_hash = encode(extensions.digest(api_key, 'sha256'), 'hex'),
    api_key_prefix = left(api_key, 8)
WHERE api_key_hash IS NULL AND api_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS discount_code_secrets_api_key_hash_idx
  ON public.discount_code_secrets(api_key_hash);

ALTER TABLE public.discount_code_secrets
  DROP COLUMN IF EXISTS api_key;
