-- 1) Credentials OwlTing uses to authenticate to OUR endpoints
CREATE TABLE public.owlting_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID NOT NULL UNIQUE,
  hotel_code TEXT NOT NULL,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_owlting_creds_username ON public.owlting_credentials(username);
ALTER TABLE public.owlting_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read owlting credentials"
ON public.owlting_credentials FOR SELECT TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);
CREATE POLICY "Admins insert owlting credentials"
ON public.owlting_credentials FOR INSERT TO authenticated
WITH CHECK (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);
CREATE POLICY "Admins update owlting credentials"
ON public.owlting_credentials FOR UPDATE TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);
CREATE POLICY "Admins delete owlting credentials"
ON public.owlting_credentials FOR DELETE TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

CREATE TRIGGER update_owlting_creds_updated_at
BEFORE UPDATE ON public.owlting_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) OwlTing endpoint we PUSH ARI to
CREATE TABLE public.owlting_ari_endpoints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID NOT NULL UNIQUE,
  endpoint_url TEXT NOT NULL,
  remote_username TEXT,
  remote_password TEXT,
  environment TEXT NOT NULL DEFAULT 'test',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_pushed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.owlting_ari_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read owlting endpoints"
ON public.owlting_ari_endpoints FOR SELECT TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);
CREATE POLICY "Admins insert owlting endpoints"
ON public.owlting_ari_endpoints FOR INSERT TO authenticated
WITH CHECK (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);
CREATE POLICY "Admins update owlting endpoints"
ON public.owlting_ari_endpoints FOR UPDATE TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);
CREATE POLICY "Admins delete owlting endpoints"
ON public.owlting_ari_endpoints FOR DELETE TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

CREATE TRIGGER update_owlting_endpoints_updated_at
BEFORE UPDATE ON public.owlting_ari_endpoints
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Message logs
CREATE TABLE public.owlting_message_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID,
  direction TEXT NOT NULL,
  message_type TEXT,
  http_status INTEGER,
  request_body TEXT,
  response_body TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_owlting_logs_acc_created ON public.owlting_message_logs(accommodation_id, created_at DESC);
ALTER TABLE public.owlting_message_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read owlting logs"
ON public.owlting_message_logs FOR SELECT TO authenticated
USING (
  accommodation_id IS NULL
  OR user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);