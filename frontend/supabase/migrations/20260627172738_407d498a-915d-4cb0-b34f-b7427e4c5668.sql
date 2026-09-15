CREATE TABLE public.line_push_dedup_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  target_id text NOT NULL,
  message_hash text NOT NULL,
  minute_bucket text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT line_push_dedup_log_uniq UNIQUE (target_id, message_hash, minute_bucket)
);

GRANT ALL ON public.line_push_dedup_log TO service_role;

ALTER TABLE public.line_push_dedup_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role manage line_push_dedup_log"
ON public.line_push_dedup_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX idx_line_push_dedup_log_created_at ON public.line_push_dedup_log (created_at DESC);