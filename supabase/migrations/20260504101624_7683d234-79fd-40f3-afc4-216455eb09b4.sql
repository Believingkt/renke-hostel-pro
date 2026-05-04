-- RPC to upsert OwlTing credentials with server-side SHA-256 password hashing
CREATE OR REPLACE FUNCTION public.upsert_owlting_credentials(
  p_accommodation_id uuid,
  p_hotel_code text,
  p_username text,
  p_password text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
  v_hash text;
BEGIN
  IF NOT (
    public.user_has_role(auth.uid(), p_accommodation_id, 'super_admin'::app_role)
    OR public.user_has_role(auth.uid(), p_accommodation_id, 'hotel_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF p_hotel_code IS NULL OR length(trim(p_hotel_code)) = 0 THEN
    RAISE EXCEPTION 'hotel_code is required';
  END IF;
  IF p_username IS NULL OR length(trim(p_username)) < 4 THEN
    RAISE EXCEPTION 'username must be at least 4 characters';
  END IF;
  IF p_password IS NULL OR length(p_password) < 8 THEN
    RAISE EXCEPTION 'password must be at least 8 characters';
  END IF;

  v_hash := encode(extensions.digest(p_password, 'sha256'), 'hex');

  INSERT INTO public.owlting_credentials (accommodation_id, hotel_code, username, password_hash, is_active)
  VALUES (p_accommodation_id, trim(p_hotel_code), trim(p_username), v_hash, true)
  ON CONFLICT (accommodation_id) DO UPDATE
    SET hotel_code = EXCLUDED.hotel_code,
        username = EXCLUDED.username,
        password_hash = EXCLUDED.password_hash,
        is_active = true,
        updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Make sure pgcrypto extension is available for digest()
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

GRANT EXECUTE ON FUNCTION public.upsert_owlting_credentials(uuid, text, text, text) TO authenticated;