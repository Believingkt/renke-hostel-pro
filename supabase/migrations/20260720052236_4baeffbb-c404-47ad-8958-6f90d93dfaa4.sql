
-- 1. payment_status_history
CREATE TABLE public.payment_status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  paid_amount NUMERIC,
  final_price NUMERIC,
  source TEXT NOT NULL DEFAULT 'system',
  changed_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_status_history_order_id ON public.payment_status_history(order_id, created_at DESC);

GRANT SELECT, INSERT ON public.payment_status_history TO authenticated;
GRANT ALL ON public.payment_status_history TO service_role;

ALTER TABLE public.payment_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view payment history for their accommodation"
  ON public.payment_status_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = payment_status_history.order_id
        AND public.user_has_access_to_accommodation(auth.uid(), o.accommodation_id)
    )
  );

CREATE POLICY "Service role manages payment history"
  ON public.payment_status_history
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2. booking_email_log
CREATE TABLE public.booking_email_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  order_number TEXT,
  email_type TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT,
  status TEXT NOT NULL,
  resend_id TEXT,
  error_message TEXT,
  triggered_by UUID,
  trigger_source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_email_log_order_id ON public.booking_email_log(order_id, created_at DESC);
CREATE INDEX idx_booking_email_log_order_number ON public.booking_email_log(order_number);

-- 冪等鎖：同一訂單的「尾款已收到」信只能成功寄一次（避免 webhook 重試重寄）
CREATE UNIQUE INDEX uniq_final_payment_email_sent
  ON public.booking_email_log(order_id)
  WHERE email_type = 'final_payment_received' AND status = 'sent';

GRANT SELECT, INSERT ON public.booking_email_log TO authenticated;
GRANT ALL ON public.booking_email_log TO service_role;

ALTER TABLE public.booking_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view email log for their accommodation"
  ON public.booking_email_log
  FOR SELECT TO authenticated
  USING (
    order_id IS NULL OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = booking_email_log.order_id
        AND public.user_has_access_to_accommodation(auth.uid(), o.accommodation_id)
    )
  );

CREATE POLICY "Service role manages email log"
  ON public.booking_email_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 3. trigger：訂單付款狀態變動自動記錄
CREATE OR REPLACE FUNCTION public.log_payment_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source TEXT;
BEGIN
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    BEGIN
      v_source := current_setting('app.change_source', true);
    EXCEPTION WHEN OTHERS THEN
      v_source := NULL;
    END;

    INSERT INTO public.payment_status_history (
      order_id, from_status, to_status, paid_amount, final_price, source, changed_by
    ) VALUES (
      NEW.id,
      OLD.payment_status,
      NEW.payment_status,
      NEW.paid_amount,
      NEW.final_price,
      COALESCE(NULLIF(v_source, ''), 'system'),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_payment_status_change ON public.orders;
CREATE TRIGGER trg_log_payment_status_change
  AFTER UPDATE OF payment_status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.log_payment_status_change();
