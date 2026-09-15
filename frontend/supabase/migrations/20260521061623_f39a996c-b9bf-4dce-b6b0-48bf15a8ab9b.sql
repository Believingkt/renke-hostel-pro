CREATE TABLE IF NOT EXISTS public.franchise_team_settings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id         UUID NOT NULL REFERENCES public.team_member_profiles(user_id) ON DELETE CASCADE,
  direct_leader_id  UUID REFERENCES public.team_member_profiles(user_id),
  title             TEXT,
  system_title      TEXT,
  sub_leader_id     UUID REFERENCES public.team_member_profiles(user_id),
  top_leader_id     UUID REFERENCES public.team_member_profiles(user_id),
  updated_by        UUID REFERENCES public.team_member_profiles(user_id),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(member_id)
);

ALTER TABLE public.franchise_team_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "franchise_team_select_all"
ON public.franchise_team_settings FOR SELECT TO authenticated
USING (true);

CREATE POLICY "franchise_team_update"
ON public.franchise_team_settings FOR UPDATE TO authenticated
USING (
  public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
  OR (
    public.user_has_team_role(auth.uid(), 'franchise'::app_role)
    AND member_id = auth.uid()
  )
);

CREATE POLICY "franchise_team_insert"
ON public.franchise_team_settings FOR INSERT TO authenticated
WITH CHECK (
  public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
);