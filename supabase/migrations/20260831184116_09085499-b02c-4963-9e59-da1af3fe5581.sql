CREATE OR REPLACE FUNCTION public.guard_accommodation_gbp_credentials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_service boolean;
  is_priv boolean;
  client_id_changed boolean := false;
BEGIN
  is_service := (auth.uid() IS NULL) OR (auth.role() = 'service_role');

  IF TG_OP = 'UPDATE' AND NEW.accommodation_id IS DISTINCT FROM OLD.accommodation_id THEN
    RAISE EXCEPTION 'GBP_ACCOMMODATION_REBIND_DENIED';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    client_id_changed := NEW.oauth_client_id IS DISTINCT FROM OLD.oauth_client_id;
  END IF;

  IF is_service THEN
    IF client_id_changed THEN
      NEW.client_secret_configured := false;
    END IF;
    RETURN NEW;
  END IF;

  is_priv := public.is_super_admin(auth.uid())
             OR public.is_hotel_admin_of(NEW.accommodation_id);

  IF TG_OP = 'INSERT' THEN
    IF NEW.client_secret_configured IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'GBP_SECRET_STATE_SERVER_ONLY';
    END IF;
    IF NOT is_priv THEN
      IF NEW.project_id IS NOT NULL
         OR NEW.project_number IS NOT NULL
         OR NEW.oauth_client_id IS NOT NULL
         OR NEW.application_status IS DISTINCT FROM 'NOT_STARTED' THEN
        RAISE EXCEPTION 'GBP_CREDENTIAL_METADATA_DENIED';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.client_secret_configured IS DISTINCT FROM OLD.client_secret_configured THEN
    RAISE EXCEPTION 'GBP_SECRET_STATE_SERVER_ONLY';
  END IF;

  IF NOT is_priv THEN
    IF NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.project_number IS DISTINCT FROM OLD.project_number
       OR NEW.oauth_client_id IS DISTINCT FROM OLD.oauth_client_id
       OR NEW.application_status IS DISTINCT FROM OLD.application_status THEN
      RAISE EXCEPTION 'GBP_CREDENTIAL_METADATA_DENIED';
    END IF;
  END IF;

  IF client_id_changed THEN
    NEW.client_secret_configured := false;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.gbp_save_accommodation_oauth_client_secret(
  p_accommodation_id uuid,
  p_client_secret text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault', 'extensions'
AS $function$
DECLARE
  v_client_id text;
  v_name text;
  v_id uuid;
  v_rows int;
BEGIN
  IF p_client_secret IS NULL OR btrim(p_client_secret) = '' THEN
    RAISE EXCEPTION 'GBP_CLIENT_SECRET_REQUIRED';
  END IF;

  SELECT oauth_client_id INTO v_client_id
  FROM public.accommodation_google_business_profile
  WHERE accommodation_id = p_accommodation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GBP_SETTINGS_ROW_NOT_FOUND';
  END IF;
  IF v_client_id IS NULL OR btrim(v_client_id) = '' THEN
    RAISE EXCEPTION 'GBP_OAUTH_CLIENT_ID_REQUIRED';
  END IF;

  v_name := 'google_business_profile_oauth_client_secret_' || p_accommodation_id::text;

  SELECT id INTO v_id FROM vault.secrets WHERE name = v_name;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_client_secret, v_name, 'GBP per-accommodation OAuth client secret');
  ELSE
    PERFORM vault.update_secret(v_id, p_client_secret, v_name, 'GBP per-accommodation OAuth client secret');
  END IF;

  UPDATE public.accommodation_google_business_profile
  SET client_secret_configured = true,
      updated_at = now()
  WHERE accommodation_id = p_accommodation_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'GBP_SECRET_STATE_UPDATE_FAILED';
  END IF;

  RETURN jsonb_build_object('accommodation_id', p_accommodation_id, 'configured', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.gbp_save_accommodation_oauth_client_secret(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gbp_save_accommodation_oauth_client_secret(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.gbp_save_accommodation_oauth_client_secret(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gbp_save_accommodation_oauth_client_secret(uuid, text) TO service_role;