CREATE TABLE public.accommodation_google_business_profile (
  accommodation_id uuid PRIMARY KEY REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  project_id text,
  oauth_client_id text,
  account_id text,
  location_id text,
  connection_status text NOT NULL DEFAULT 'NOT_CONFIGURED',
  application_status text NOT NULL DEFAULT 'NOT_STARTED',
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accommodation_gbp_connection_status_check CHECK (connection_status IN ('NOT_CONFIGURED','APPLICATION_PENDING','READY_FOR_OAUTH','CONNECTED','TOKEN_EXPIRED','ERROR')),
  CONSTRAINT accommodation_gbp_application_status_check CHECK (application_status IN ('NOT_STARTED','PENDING','APPROVED','REJECTED'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accommodation_google_business_profile TO authenticated;
GRANT ALL ON public.accommodation_google_business_profile TO service_role;

ALTER TABLE public.accommodation_google_business_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gbp_select_scoped" ON public.accommodation_google_business_profile
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.is_hotel_admin_of(accommodation_id)
  OR public.staff_can_view_module(accommodation_id, 'website_content')
);

CREATE POLICY "gbp_insert_scoped" ON public.accommodation_google_business_profile
FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.is_hotel_admin_of(accommodation_id)
  OR public.staff_can_edit_module(accommodation_id, 'website_content')
);

CREATE POLICY "gbp_update_scoped" ON public.accommodation_google_business_profile
FOR UPDATE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.is_hotel_admin_of(accommodation_id)
  OR public.staff_can_edit_module(accommodation_id, 'website_content')
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.is_hotel_admin_of(accommodation_id)
  OR public.staff_can_edit_module(accommodation_id, 'website_content')
);

CREATE POLICY "gbp_delete_scoped" ON public.accommodation_google_business_profile
FOR DELETE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.is_hotel_admin_of(accommodation_id)
  OR public.staff_can_edit_module(accommodation_id, 'website_content')
);

CREATE TRIGGER trg_accommodation_gbp_updated_at
BEFORE UPDATE ON public.accommodation_google_business_profile
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();