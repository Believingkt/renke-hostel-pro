-- ============================================
-- OwlTing Email Inbound Tables
-- ============================================

-- 1. Raw email payloads
CREATE TABLE public.owlting_email_orders_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  from_email text,
  from_domain text,
  to_email text,
  subject text,
  text_body text,
  html_body text,
  envelope jsonb,
  charsets jsonb,
  attachments jsonb,
  spam_score numeric,
  spam_report text,
  dkim text,
  spf text,
  sender_ip text,
  raw_payload jsonb NOT NULL,
  -- Parsed metadata
  message_type text,  -- 'new_order' | 'modified' | 'cancelled' | 'unknown'
  obe_number text,    -- OwlTing OBE order number
  accommodation_name text,
  -- Processing status
  status text NOT NULL DEFAULT 'received',  -- 'received' | 'parsed' | 'matched' | 'failed' | 'ignored'
  processed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_owlting_email_raw_received_at ON public.owlting_email_orders_raw (received_at DESC);
CREATE INDEX idx_owlting_email_raw_status ON public.owlting_email_orders_raw (status);
CREATE INDEX idx_owlting_email_raw_obe ON public.owlting_email_orders_raw (obe_number);
CREATE INDEX idx_owlting_email_raw_message_type ON public.owlting_email_orders_raw (message_type);

ALTER TABLE public.owlting_email_orders_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owlting_email_raw_admin_select"
  ON public.owlting_email_orders_raw FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin'::app_role, 'hotel_admin'::app_role)
    )
  );

CREATE POLICY "owlting_email_raw_admin_write"
  ON public.owlting_email_orders_raw FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin'::app_role, 'hotel_admin'::app_role)
    )
  );


-- 2. Parse failure quarantine
CREATE TABLE public.owlting_email_parse_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_email_id uuid REFERENCES public.owlting_email_orders_raw(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  from_email text,
  subject text,
  failure_reason text NOT NULL,
  failure_stage text,  -- 'envelope_check' | 'subject_parse' | 'body_parse' | 'matching'
  raw_payload jsonb,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_owlting_email_failures_received ON public.owlting_email_parse_failures (received_at DESC);
CREATE INDEX idx_owlting_email_failures_resolved ON public.owlting_email_parse_failures (resolved);

ALTER TABLE public.owlting_email_parse_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owlting_email_failures_admin_all"
  ON public.owlting_email_parse_failures FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin'::app_role, 'hotel_admin'::app_role)
    )
  );


-- 3. Room name alias mapping
CREATE TABLE public.owlting_email_room_alias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  owlting_room_name text NOT NULL,
  room_type_id uuid REFERENCES public.room_types(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (accommodation_id, owlting_room_name)
);

CREATE INDEX idx_owlting_room_alias_acc ON public.owlting_email_room_alias (accommodation_id);

ALTER TABLE public.owlting_email_room_alias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owlting_room_alias_admin_all"
  ON public.owlting_email_room_alias FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin'::app_role, 'hotel_admin'::app_role)
    )
  );

CREATE TRIGGER trg_owlting_room_alias_updated_at
  BEFORE UPDATE ON public.owlting_email_room_alias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 4. Property name alias mapping
CREATE TABLE public.owlting_email_property_alias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owlting_property_name text NOT NULL UNIQUE,
  accommodation_id uuid REFERENCES public.accommodation_info(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_owlting_property_alias_acc ON public.owlting_email_property_alias (accommodation_id);

ALTER TABLE public.owlting_email_property_alias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owlting_property_alias_admin_all"
  ON public.owlting_email_property_alias FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin'::app_role, 'hotel_admin'::app_role)
    )
  );

CREATE TRIGGER trg_owlting_property_alias_updated_at
  BEFORE UPDATE ON public.owlting_email_property_alias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
