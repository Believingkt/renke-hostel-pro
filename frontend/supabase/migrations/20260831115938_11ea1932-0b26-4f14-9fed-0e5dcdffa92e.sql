-- 1. Global platform OAuth config (super_admin only, no secrets)
CREATE TABLE public.google_business_profile_platform_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NULL,
  project_number text NULL,
  oauth_client_id text NULL,
  api_access_status text NOT NULL DEFAULT 'NOT_CONFIGURED'
    CHECK (api_access_status IN ('NOT_CONFIGURED','NOT_STARTED','PENDING','APPROVED','REJECTED')),
  client_secret_configured boolean NOT NULL DEFAULT false,
  redirect_uri text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_business_profile_platform_config TO authenticated;
GRANT ALL ON public.google_business_profile_platform_config TO service_role;

ALTER TABLE public.google_business_profile_platform_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gbp_platform_select_super_admin" ON public.google_business_profile_platform_config
  FOR SELECT TO authenticated USING (is_super_admin(auth.uid()));
CREATE POLICY "gbp_platform_insert_super_admin" ON public.google_business_profile_platform_config
  FOR INSERT TO authenticated WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "gbp_platform_update_super_admin" ON public.google_business_profile_platform_config
  FOR UPDATE TO authenticated USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "gbp_platform_delete_super_admin" ON public.google_business_profile_platform_config
  FOR DELETE TO authenticated USING (is_super_admin(auth.uid()));

CREATE TRIGGER trg_gbp_platform_updated_at
BEFORE UPDATE ON public.google_business_profile_platform_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Per-accommodation metadata (no secrets)
ALTER TABLE public.accommodation_google_business_profile
  ADD COLUMN IF NOT EXISTS oauth_connected_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS selected_account_name text NULL,
  ADD COLUMN IF NOT EXISTS selected_location_name text NULL,
  ADD COLUMN IF NOT EXISTS selected_location_title text NULL,
  ADD COLUMN IF NOT EXISTS sync_target text NOT NULL DEFAULT '50',
  ADD COLUMN IF NOT EXISTS last_business_profile_sync_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_business_profile_sync_status text NULL,
  ADD COLUMN IF NOT EXISTS last_business_profile_sync_error text NULL,
  ADD COLUMN IF NOT EXISTS candidate_review_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_source text NOT NULL DEFAULT 'PLACES';

ALTER TABLE public.accommodation_google_business_profile
  ADD CONSTRAINT gbp_review_source_chk CHECK (review_source IN ('PLACES','BUSINESS_PROFILE'));
ALTER TABLE public.accommodation_google_business_profile
  ADD CONSTRAINT gbp_sync_target_chk CHECK (sync_target IN ('20','50','ALL'));

-- 3. OAuth state table (service-role only, RLS enabled with no policies)
CREATE TABLE public.google_business_profile_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL,
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  code_verifier text NULL,
  return_path text NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.google_business_profile_oauth_states TO service_role;
ALTER TABLE public.google_business_profile_oauth_states ENABLE ROW LEVEL SECURITY;

-- 4. Candidate reviews table
CREATE TABLE public.accommodation_google_business_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  review_name text NOT NULL,
  review_id text NULL,
  account_name text NULL,
  location_name text NULL,
  reviewer_name text NULL,
  reviewer_photo_url text NULL,
  star_rating integer NULL,
  comment text NULL,
  create_time timestamptz NULL,
  update_time timestamptz NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  raw_metadata jsonb NULL,
  UNIQUE (accommodation_id, review_name)
);
CREATE INDEX idx_gbp_reviews_acc_time ON public.accommodation_google_business_reviews (accommodation_id, create_time DESC);

GRANT SELECT ON public.accommodation_google_business_reviews TO authenticated;
GRANT ALL ON public.accommodation_google_business_reviews TO service_role;

ALTER TABLE public.accommodation_google_business_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gbp_reviews_select_scoped" ON public.accommodation_google_business_reviews
  FOR SELECT TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR is_hotel_admin_of(accommodation_id)
    OR staff_can_view_module(accommodation_id, 'website_content'::text)
  );
-- no INSERT/UPDATE/DELETE policies: writes are service-role only

-- 5. Vault access wrappers (service_role only)
CREATE OR REPLACE FUNCTION public.gbp_vault_set(p_name text, p_value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = p_name;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_value, p_name, 'Google Business Profile integration secret');
  ELSE
    PERFORM vault.update_secret(v_id, p_value, p_name, 'Google Business Profile integration secret');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.gbp_vault_get(p_name text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = p_name LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.gbp_vault_delete(p_name text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
  DELETE FROM vault.secrets WHERE name = p_name;
$$;

REVOKE ALL ON FUNCTION public.gbp_vault_set(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gbp_vault_get(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gbp_vault_delete(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gbp_vault_set(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gbp_vault_get(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gbp_vault_delete(text) TO service_role;