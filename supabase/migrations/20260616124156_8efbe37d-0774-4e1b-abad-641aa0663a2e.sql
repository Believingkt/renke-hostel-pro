
ALTER TABLE public.line_oa_channels
  ADD COLUMN IF NOT EXISTS line_oa_id text;

CREATE TABLE IF NOT EXISTS public.line_binding_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL REFERENCES public.team_member_profiles(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_line_binding_tokens_token ON public.line_binding_tokens(token);
CREATE INDEX IF NOT EXISTS idx_line_binding_tokens_member ON public.line_binding_tokens(team_member_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.line_binding_tokens TO authenticated;
GRANT ALL ON public.line_binding_tokens TO service_role;

ALTER TABLE public.line_binding_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage line_binding_tokens"
  ON public.line_binding_tokens
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_super())
  WITH CHECK (public.is_admin_or_super());
