CREATE TABLE IF NOT EXISTS public.accommodation_kol_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id      UUID NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  kol_enabled           BOOLEAN DEFAULT true,
  booking_type          TEXT DEFAULT 'discount_code',
  short_url_prefix      TEXT,
  original_booking_url  TEXT,
  task_pre_stay         BOOLEAN DEFAULT true,
  task_post_story       BOOLEAN DEFAULT true,
  task_ig_collab        BOOLEAN DEFAULT false,
  kpi_eligible_months   INTEGER DEFAULT 3,
  updated_by            UUID REFERENCES public.team_member_profiles(user_id),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(accommodation_id)
);

ALTER TABLE public.accommodation_kol_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kol_settings_select"
ON public.accommodation_kol_settings FOR SELECT TO authenticated
USING (true);

CREATE POLICY "kol_settings_write"
ON public.accommodation_kol_settings FOR ALL TO authenticated
USING (
  public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'scout_manager'::app_role)
)
WITH CHECK (
  public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'scout_manager'::app_role)
);