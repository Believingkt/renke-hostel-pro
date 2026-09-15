
CREATE TABLE IF NOT EXISTS public.ai_ab_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_a integer NOT NULL,
  version_b integer NOT NULL,
  traffic_split integer NOT NULL DEFAULT 50 CHECK (traffic_split BETWEEN 0 AND 100),
  is_active boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_ab_tests_active_idx ON public.ai_ab_tests(is_active) WHERE is_active = true;

ALTER TABLE public.ai_ab_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_ab_tests admin all" ON public.ai_ab_tests;
CREATE POLICY "ai_ab_tests admin all" ON public.ai_ab_tests
  FOR ALL USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());
