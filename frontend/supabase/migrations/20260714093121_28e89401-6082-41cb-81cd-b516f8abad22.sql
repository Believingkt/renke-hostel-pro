CREATE TABLE public.member_recent_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES public.platform_members(id) ON DELETE CASCADE,
  accommodation_id UUID NOT NULL,
  name TEXT,
  region TEXT,
  image_url TEXT,
  path TEXT,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (member_id, accommodation_id)
);

CREATE INDEX idx_member_recent_views_member_viewed ON public.member_recent_views (member_id, viewed_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_recent_views TO authenticated;
GRANT ALL ON public.member_recent_views TO service_role;

ALTER TABLE public.member_recent_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage own recent views"
  ON public.member_recent_views
  FOR ALL
  USING (member_id IN (SELECT id FROM public.platform_members WHERE user_id = auth.uid()))
  WITH CHECK (member_id IN (SELECT id FROM public.platform_members WHERE user_id = auth.uid()));
