CREATE TABLE IF NOT EXISTS public.bonus_multiplier_settings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bonus_type        TEXT NOT NULL,
  multiplier        NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  reason            TEXT,
  is_active         BOOLEAN DEFAULT true,
  created_by        UUID REFERENCES public.team_member_profiles(user_id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  CHECK (multiplier >= 1.0),
  CHECK (end_date >= start_date)
);

ALTER TABLE public.bonus_multiplier_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bonus_multiplier_select_all"
ON public.bonus_multiplier_settings FOR SELECT TO authenticated
USING (true);

CREATE POLICY "bonus_multiplier_write_admin"
ON public.bonus_multiplier_settings FOR ALL TO authenticated
USING (
  public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
);