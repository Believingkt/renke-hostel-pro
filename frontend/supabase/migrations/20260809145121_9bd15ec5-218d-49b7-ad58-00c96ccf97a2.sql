CREATE TABLE public.line_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id text NOT NULL UNIQUE,
  member_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name text,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_intent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.line_sessions TO authenticated;
GRANT ALL ON public.line_sessions TO service_role;
ALTER TABLE public.line_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view line sessions"
ON public.line_sessions FOR SELECT TO authenticated
USING (public.is_admin_or_super());

CREATE TABLE public.trip_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  line_user_id text,
  ref_type text NOT NULL CHECK (ref_type IN ('trip','room','product')),
  ref_id uuid NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX trip_favorites_user_ref_uniq ON public.trip_favorites (user_id, ref_type, ref_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX trip_favorites_line_ref_uniq ON public.trip_favorites (line_user_id, ref_type, ref_id) WHERE user_id IS NULL AND line_user_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_favorites TO authenticated;
GRANT ALL ON public.trip_favorites TO service_role;
ALTER TABLE public.trip_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own favorites"
ON public.trip_favorites FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view favorites"
ON public.trip_favorites FOR SELECT TO authenticated
USING (public.is_admin_or_super());

CREATE TRIGGER update_line_sessions_updated_at
BEFORE UPDATE ON public.line_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.order_meta ADD COLUMN IF NOT EXISTS line_user_id text;
CREATE INDEX IF NOT EXISTS order_meta_line_user_id_idx ON public.order_meta (line_user_id) WHERE line_user_id IS NOT NULL;