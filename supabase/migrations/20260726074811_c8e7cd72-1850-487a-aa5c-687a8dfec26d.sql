CREATE TABLE public.otp_send_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.otp_send_attempts TO service_role;

ALTER TABLE public.otp_send_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "otp_send_attempts_service_only"
ON public.otp_send_attempts FOR ALL
TO service_role
USING (true) WITH CHECK (true);

CREATE INDEX idx_otp_send_attempts_email_created ON public.otp_send_attempts (email, created_at DESC);
CREATE INDEX idx_otp_send_attempts_ip_created ON public.otp_send_attempts (ip, created_at DESC);