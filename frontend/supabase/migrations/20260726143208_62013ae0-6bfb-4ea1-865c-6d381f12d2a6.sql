CREATE TABLE public.order_create_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  ip text,
  accommodation_id uuid,
  order_number text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.order_create_attempts TO service_role;

ALTER TABLE public.order_create_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages order create attempts"
  ON public.order_create_attempts FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_order_create_attempts_email_created
  ON public.order_create_attempts (lower(email), created_at DESC);
CREATE INDEX idx_order_create_attempts_ip_created
  ON public.order_create_attempts (ip, created_at DESC);
CREATE INDEX idx_order_create_attempts_created
  ON public.order_create_attempts (created_at);