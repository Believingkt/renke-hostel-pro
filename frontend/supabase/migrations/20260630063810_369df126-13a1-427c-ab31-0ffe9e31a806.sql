CREATE TABLE public.hotelnabe_push_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID,
  hotel_code TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('dryrun','live')),
  op_type TEXT,
  echo_token TEXT,
  request_xml TEXT,
  response_xml TEXT,
  http_status INT,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hotelnabe_push_log TO authenticated;
GRANT ALL ON public.hotelnabe_push_log TO service_role;
ALTER TABLE public.hotelnabe_push_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin can view push log" ON public.hotelnabe_push_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'));
CREATE INDEX idx_hotelnabe_push_log_created ON public.hotelnabe_push_log (created_at DESC);
CREATE INDEX idx_hotelnabe_push_log_hotel ON public.hotelnabe_push_log (hotel_code, created_at DESC);