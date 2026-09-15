CREATE TABLE public.trip_generations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scenario TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'line',
  line_user_id TEXT,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '30 days')
);
CREATE INDEX idx_trip_generations_created_at ON public.trip_generations (created_at DESC);
GRANT SELECT ON public.trip_generations TO anon;
GRANT SELECT ON public.trip_generations TO authenticated;
GRANT ALL ON public.trip_generations TO service_role;
ALTER TABLE public.trip_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone with the link can read unexpired trip snapshots"
  ON public.trip_generations FOR SELECT
  USING (expires_at > now());