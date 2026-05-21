CREATE TABLE IF NOT EXISTS public.kol_blocked_dates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id  UUID NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  blocked_date      DATE NOT NULL,
  reason            TEXT,
  created_by        UUID REFERENCES public.team_member_profiles(user_id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(accommodation_id, blocked_date)
);

ALTER TABLE public.kol_blocked_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blocked_dates_select"
ON public.kol_blocked_dates FOR SELECT TO authenticated
USING (true);

CREATE POLICY "blocked_dates_write"
ON public.kol_blocked_dates FOR ALL TO authenticated
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

CREATE TABLE IF NOT EXISTS public.taiwan_holidays (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date DATE NOT NULL,
  name         TEXT,
  year         INTEGER NOT NULL,
  synced_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(holiday_date)
);

ALTER TABLE public.taiwan_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holidays_select"
ON public.taiwan_holidays FOR SELECT TO authenticated
USING (true);

CREATE POLICY "holidays_write"
ON public.taiwan_holidays FOR ALL TO authenticated
USING (
  public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
);