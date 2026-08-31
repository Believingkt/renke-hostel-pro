ALTER TABLE public.accommodation_google_business_profile
  ADD COLUMN IF NOT EXISTS client_secret_configured boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.guard_accommodation_gbp_credentials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_service boolean;
  is_priv boolean;
BEGIN
  -- 專案已驗證的 service-role / backend job 判定方式
  is_service := (auth.uid() IS NULL) OR (auth.role() = 'service_role');

  -- A. 任何情況都不得把設定改綁到另一間民宿
  IF TG_OP = 'UPDATE' AND NEW.accommodation_id IS DISTINCT FROM OLD.accommodation_id THEN
    RAISE EXCEPTION 'GBP_ACCOMMODATION_REBIND_DENIED';
  END IF;

  -- B. service_role：可管理 client_secret_configured 與 credential metadata
  IF is_service THEN
    RETURN NEW;
  END IF;

  -- C/D. super_admin 或該館 hotel_admin：可改 credential metadata，但不可動 secret 狀態
  is_priv := public.is_super_admin(auth.uid())
             OR public.is_hotel_admin_of(NEW.accommodation_id);

  IF TG_OP = 'INSERT' THEN
    IF NEW.client_secret_configured IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'GBP_SECRET_STATE_SERVER_ONLY';
    END IF;
    IF NOT is_priv THEN
      -- E. website_content staff 建立 row 時，credential 欄位必須維持空值／預設
      IF NEW.project_id IS NOT NULL
         OR NEW.project_number IS NOT NULL
         OR NEW.oauth_client_id IS NOT NULL
         OR NEW.application_status IS DISTINCT FROM 'NOT_STARTED' THEN
        RAISE EXCEPTION 'GBP_CREDENTIAL_METADATA_DENIED';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_accommodation_gbp_credentials
  ON public.accommodation_google_business_profile;

CREATE TRIGGER trg_guard_accommodation_gbp_credentials
  BEFORE INSERT OR UPDATE ON public.accommodation_google_business_profile
  FOR EACH ROW EXECUTE FUNCTION public.guard_accommodation_gbp_credentials();