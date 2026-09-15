CREATE TABLE IF NOT EXISTS public.member_push_badges (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  unread_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.member_push_badges TO authenticated;
GRANT ALL ON public.member_push_badges TO service_role;

ALTER TABLE public.member_push_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own badge select" ON public.member_push_badges;
CREATE POLICY "own badge select" ON public.member_push_badges
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own badge insert" ON public.member_push_badges;
CREATE POLICY "own badge insert" ON public.member_push_badges
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own badge update" ON public.member_push_badges;
CREATE POLICY "own badge update" ON public.member_push_badges
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.increment_member_push_badge(_user_id uuid, _delta integer DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.member_push_badges (user_id, unread_count, updated_at)
  VALUES (_user_id, GREATEST(0, _delta), now())
  ON CONFLICT (user_id) DO UPDATE
    SET unread_count = GREATEST(0, public.member_push_badges.unread_count + _delta),
        updated_at = now()
  RETURNING unread_count INTO v_count;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_member_push_badge(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.increment_member_push_badge(uuid, integer) TO service_role;