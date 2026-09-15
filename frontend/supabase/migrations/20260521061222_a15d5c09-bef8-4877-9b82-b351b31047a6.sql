CREATE TABLE IF NOT EXISTS public.team_member_profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name      TEXT NOT NULL,
  commission_rate   NUMERIC(5,4),
  scout_tier        TEXT,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE public.team_member_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_profiles_select_all"
ON public.team_member_profiles FOR SELECT TO authenticated
USING (true);

CREATE POLICY "team_profiles_update_admin"
ON public.team_member_profiles FOR UPDATE TO authenticated
USING (
  public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR (
    public.user_has_team_role(auth.uid(), 'admin'::app_role)
    AND NOT public.user_has_team_role(team_member_profiles.user_id, 'super_admin'::app_role)
  )
);

CREATE POLICY "team_profiles_insert_super_admin"
ON public.team_member_profiles FOR INSERT TO authenticated
WITH CHECK (
  public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
);