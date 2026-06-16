
-- 1. line_oa_channels
CREATE TABLE public.line_oa_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_name text NOT NULL,
  channel_access_token text NOT NULL DEFAULT '',
  channel_secret text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.line_oa_channels TO authenticated;
GRANT ALL ON public.line_oa_channels TO service_role;

ALTER TABLE public.line_oa_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "line_oa_channels admin read"
  ON public.line_oa_channels FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin'::app_role, 'hotel_admin'::app_role)
    )
  );

CREATE POLICY "line_oa_channels admin write"
  ON public.line_oa_channels FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin'::app_role, 'hotel_admin'::app_role)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin'::app_role, 'hotel_admin'::app_role)
    )
  );

CREATE TRIGGER update_line_oa_channels_updated_at
  BEFORE UPDATE ON public.line_oa_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. line_push_targets
CREATE TABLE public.line_push_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES public.line_oa_channels(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('user', 'group')),
  target_id text NOT NULL,
  display_name text,
  roles text[] NOT NULL DEFAULT '{}',
  team_member_id uuid REFERENCES public.team_member_profiles(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_line_push_targets_channel ON public.line_push_targets(channel_id);
CREATE INDEX idx_line_push_targets_type ON public.line_push_targets(target_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.line_push_targets TO authenticated;
GRANT ALL ON public.line_push_targets TO service_role;

ALTER TABLE public.line_push_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "line_push_targets admin read"
  ON public.line_push_targets FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin'::app_role, 'hotel_admin'::app_role)
    )
  );

CREATE POLICY "line_push_targets admin write"
  ON public.line_push_targets FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin'::app_role, 'hotel_admin'::app_role)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin'::app_role, 'hotel_admin'::app_role)
    )
  );

CREATE TRIGGER update_line_push_targets_updated_at
  BEFORE UPDATE ON public.line_push_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. team_member_profiles add line_user_id
ALTER TABLE public.team_member_profiles
  ADD COLUMN IF NOT EXISTS line_user_id text;
