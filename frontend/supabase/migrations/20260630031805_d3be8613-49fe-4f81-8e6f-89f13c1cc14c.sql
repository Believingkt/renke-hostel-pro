CREATE TABLE public.hotelnabe_retrieve_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  accommodation_id uuid REFERENCES public.accommodation_info(id) ON DELETE SET NULL,
  hotel_code text,
  echo_token text,
  request_xml text,
  response_xml text,
  http_status integer,
  report jsonb,
  success boolean,
  error_message text
);

GRANT SELECT ON public.hotelnabe_retrieve_log TO authenticated;
GRANT ALL ON public.hotelnabe_retrieve_log TO service_role;

ALTER TABLE public.hotelnabe_retrieve_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view hotelnabe retrieve logs"
ON public.hotelnabe_retrieve_log FOR SELECT
TO authenticated
USING (
  public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

CREATE INDEX idx_hotelnabe_retrieve_log_created ON public.hotelnabe_retrieve_log (created_at DESC);
CREATE INDEX idx_hotelnabe_retrieve_log_accom ON public.hotelnabe_retrieve_log (accommodation_id, created_at DESC);