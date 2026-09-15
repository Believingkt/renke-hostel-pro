
CREATE TABLE public.owlting_email_parsed_staging (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  raw_email_id UUID NOT NULL REFERENCES public.owlting_email_orders_raw(id) ON DELETE CASCADE,
  parser_version TEXT NOT NULL DEFAULT 'html-v1',
  confidence TEXT NOT NULL DEFAULT 'low' CHECK (confidence IN ('low','medium','high')),
  review_status TEXT NOT NULL DEFAULT 'pending_review' CHECK (review_status IN ('pending_review','approved','rejected','ignored')),
  message_type TEXT,
  obe_number TEXT,
  channel_source TEXT,
  accommodation_name TEXT,
  room_type_name TEXT,
  check_in_date DATE,
  check_out_date DATE,
  guest_count INTEGER,
  total_amount NUMERIC(12,2),
  currency TEXT,
  guest_name TEXT,
  guest_phone TEXT,
  guest_email TEXT,
  pii_masked BOOLEAN NOT NULL DEFAULT false,
  addons JSONB,
  extracted_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  parse_warnings JSONB,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_owlting_staging_raw ON public.owlting_email_parsed_staging(raw_email_id);
CREATE INDEX idx_owlting_staging_review ON public.owlting_email_parsed_staging(review_status, created_at DESC);
CREATE INDEX idx_owlting_staging_obe ON public.owlting_email_parsed_staging(obe_number);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.owlting_email_parsed_staging TO authenticated;
GRANT ALL ON public.owlting_email_parsed_staging TO service_role;

ALTER TABLE public.owlting_email_parsed_staging ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owlting_staging_admin_select" ON public.owlting_email_parsed_staging
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('super_admin','hotel_admin')));

CREATE POLICY "owlting_staging_admin_write" ON public.owlting_email_parsed_staging
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('super_admin','hotel_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('super_admin','hotel_admin')));

CREATE TRIGGER set_owlting_staging_updated_at
  BEFORE UPDATE ON public.owlting_email_parsed_staging
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
