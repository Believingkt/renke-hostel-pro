CREATE TABLE IF NOT EXISTS public.kol_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id    UUID REFERENCES public.accommodation_info(id),
  name                TEXT,
  ig_handle           TEXT,
  ig_url              TEXT,
  rarity              TEXT,
  scout_id            UUID REFERENCES public.team_member_profiles(user_id),
  cid_code            TEXT,
  short_url           TEXT,
  lihi_url            TEXT,
  invited_at          DATE,
  check_in_date       DATE,
  check_out_date      DATE,
  day_of_week         TEXT,
  inventory_status    TEXT,
  booking_status      TEXT DEFAULT '邀約中',
  contract_progress   TEXT DEFAULT '尚未設定',
  contract_file_url   TEXT,
  task_pre_stay       BOOLEAN DEFAULT false,
  task_post_story     BOOLEAN DEFAULT false,
  task_ig_collab      BOOLEAN DEFAULT false,
  publish_url         TEXT,
  publish_date        DATE,
  kol_tags            TEXT[],
  order_id            UUID REFERENCES public.orders(id),
  order_number        TEXT,
  kpi_eligible        BOOLEAN,
  kpi_month           DATE,
  is_error            BOOLEAN DEFAULT false,
  error_note          TEXT,
  corrected_by        UUID REFERENCES public.team_member_profiles(user_id),
  corrected_at        TIMESTAMPTZ,
  inventory_count     INTEGER DEFAULT 1,
  created_by          UUID REFERENCES public.team_member_profiles(user_id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.kol_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kol_profiles_select"
ON public.kol_profiles FOR SELECT TO authenticated
USING (true);

CREATE POLICY "kol_profiles_insert"
ON public.kol_profiles FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "kol_profiles_update"
ON public.kol_profiles FOR UPDATE TO authenticated
USING (
  created_by = auth.uid()
  OR public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'scout_manager'::app_role)
);