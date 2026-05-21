CREATE TABLE IF NOT EXISTS public.kol_prospects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT,
  ig_handle       TEXT,
  ig_url          TEXT,
  scout_id        UUID REFERENCES public.team_member_profiles(user_id),
  contacted_at    DATE,
  collab_type     TEXT,
  fee_quote       NUMERIC,
  tags            TEXT[],
  notes           TEXT,
  screenshot_url  TEXT,
  status          TEXT DEFAULT '洽談中',
  converted_to_kol_id UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.kol_prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prospects_select"
ON public.kol_prospects FOR SELECT TO authenticated
USING (true);

CREATE POLICY "prospects_insert"
ON public.kol_prospects FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "prospects_update"
ON public.kol_prospects FOR UPDATE TO authenticated
USING (
  scout_id = auth.uid()
  OR public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'scout_manager'::app_role)
);