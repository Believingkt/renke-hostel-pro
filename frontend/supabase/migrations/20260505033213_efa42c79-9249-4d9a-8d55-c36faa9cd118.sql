
-- 1. orders 新增 OwlTing 對應欄位
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS owlting_reservation_id TEXT,
  ADD COLUMN IF NOT EXISTS ota_channel TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_owlting_res_id
  ON public.orders(owlting_reservation_id)
  WHERE owlting_reservation_id IS NOT NULL;

-- 2. 方案鎖
CREATE TABLE IF NOT EXISTS public.pricing_template_availability (
  template_id UUID NOT NULL REFERENCES public.pricing_templates(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, date)
);

ALTER TABLE public.pricing_template_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view template availability"
  ON public.pricing_template_availability FOR SELECT
  USING (true);

CREATE POLICY "Admins manage template availability"
  ON public.pricing_template_availability FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pricing_templates pt
      WHERE pt.id = template_id
        AND (
          public.user_has_role(auth.uid(), pt.accommodation_id, 'super_admin'::app_role)
          OR public.user_has_role(auth.uid(), pt.accommodation_id, 'hotel_admin'::app_role)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pricing_templates pt
      WHERE pt.id = template_id
        AND (
          public.user_has_role(auth.uid(), pt.accommodation_id, 'super_admin'::app_role)
          OR public.user_has_role(auth.uid(), pt.accommodation_id, 'hotel_admin'::app_role)
        )
    )
  );

-- 3. CM 通訊紀錄
CREATE TABLE IF NOT EXISTS public.owlting_cm_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  api_method TEXT NOT NULL,
  hotel_code TEXT,
  accommodation_id UUID,
  echo_token TEXT,
  request_payload TEXT,
  response_payload TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owlting_logs_acc ON public.owlting_cm_logs(accommodation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_owlting_logs_method ON public.owlting_cm_logs(api_method, created_at DESC);

ALTER TABLE public.owlting_cm_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read owlting logs"
  ON public.owlting_cm_logs FOR SELECT
  TO authenticated
  USING (
    accommodation_id IS NULL
    OR public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );
