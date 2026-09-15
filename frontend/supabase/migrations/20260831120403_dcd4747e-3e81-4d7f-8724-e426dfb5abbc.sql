-- Lets non-super-admin managers know whether the platform OAuth app is ready,
-- without exposing any platform configuration values.
CREATE OR REPLACE FUNCTION public.gbp_platform_ready()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT c.oauth_client_id IS NOT NULL
       AND length(btrim(c.oauth_client_id)) > 0
       AND c.client_secret_configured
       AND c.api_access_status <> 'REJECTED'
    FROM public.google_business_profile_platform_config c
    ORDER BY c.created_at ASC
    LIMIT 1
  ), false);
$$;

REVOKE ALL ON FUNCTION public.gbp_platform_ready() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gbp_platform_ready() TO authenticated, service_role;